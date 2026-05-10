// api/admin.js — Admin panel API for letto_packages (v7 schema)
// Lists pending packages, handles approve (to public/premium) / reject / edit.
// Protected by ADMIN_TOKEN env variable.
//
// Auth: Bearer ADMIN_TOKEN OR (for /retry-failed-emails) Vercel cron with
// `Authorization: Bearer <CRON_SECRET>` (Vercel injects this header on
// scheduled invocations).

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { sendMixConfirmationEmail, postSlackAlert } from './stripe-webhook.js';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: 'letto-ai',
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
}

const db = getFirestore();
const COLL = 'letto_packages';

function checkAuth(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token && token === process.env.ADMIN_TOKEN) return true;
  // Vercel cron sends Authorization: Bearer ${CRON_SECRET}. Allow that path
  // for /retry-failed-emails so the daily scheduler can invoke without
  // sharing the human admin token.
  if (token && process.env.CRON_SECRET && token === process.env.CRON_SECRET) return true;
  return false;
}

export default async function handler(req, res) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { action, id: packageId, status: statusFilter } = req.query;

  try {
    // LIST packages (default: pending_review; override with ?status=published_public|all)
    if (req.method === 'GET' && !action) {
      const filter = statusFilter || 'pending_review';
      let q = db.collection(COLL);
      if (filter !== 'all') q = q.where('status', '==', filter);
      const snap = await q.limit(100).get();
      const packages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return res.status(200).json({ packages, count: packages.length, filter });
    }

    // APPROVE — target=public|premium determines visibility tier
    if (req.method === 'POST' && action === 'approve' && packageId) {
      const target = req.query.target === 'premium' ? 'published_premium' : 'published_public';
      await db.collection(COLL).doc(packageId).update({
        status: target,
        approvedAt: new Date().toISOString(),
        approvedBy: 'admin'
      });

      if (process.env.N8N_WEBHOOK_URL) {
        fetch(process.env.N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: packageId, target })
        }).catch(err => console.warn('n8n trigger failed:', err.message));
      }

      return res.status(200).json({ success: true, id: packageId, newStatus: target });
    }

    // REJECT
    if (req.method === 'POST' && action === 'reject' && packageId) {
      const { reason } = req.body || {};
      await db.collection(COLL).doc(packageId).update({
        status: 'rejected',
        rejectedAt: new Date().toISOString(),
        rejectionReason: reason || 'No reason provided'
      });
      return res.status(200).json({ success: true, id: packageId });
    }

    // EDIT arbitrary fields (brief supports editing claudeRating, copy, pricing, etc.)
    if (req.method === 'PATCH' && packageId) {
      const updates = req.body || {};
      delete updates.id;
      delete updates.status; // status changes go through approve/reject endpoints
      await db.collection(COLL).doc(packageId).update({
        ...updates,
        editedAt: new Date().toISOString()
      });
      return res.status(200).json({ success: true });
    }

    // UNPUBLISH (pull a live package back to pending for revisions)
    if (req.method === 'POST' && action === 'unpublish' && packageId) {
      await db.collection(COLL).doc(packageId).update({
        status: 'pending_review',
        unpublishedAt: new Date().toISOString()
      });
      return res.status(200).json({ success: true, id: packageId });
    }

    // STATS — package counts per status + subscriber counts
    if (req.method === 'GET' && action === 'stats') {
      const [pending, pubPublic, pubPremium, rejected, subs, premium] = await Promise.all([
        db.collection(COLL).where('status', '==', 'pending_review').count().get(),
        db.collection(COLL).where('status', '==', 'published_public').count().get(),
        db.collection(COLL).where('status', '==', 'published_premium').count().get(),
        db.collection(COLL).where('status', '==', 'rejected').count().get(),
        db.collection('letto_subscribers').count().get(),
        db.collection('letto_subscribers').where('tier', '==', 'premium').count().get()
      ]);
      return res.status(200).json({
        packages: {
          pending: pending.data().count,
          publishedPublic: pubPublic.data().count,
          publishedPremium: pubPremium.data().count,
          rejected: rejected.data().count,
          total: pending.data().count + pubPublic.data().count + pubPremium.data().count + rejected.data().count
        },
        subscribers: {
          total: subs.data().count,
          premium: premium.data().count,
          free: subs.data().count - premium.data().count,
          conversionRate: subs.data().count > 0
            ? ((premium.data().count / subs.data().count) * 100).toFixed(1) + '%'
            : '0%'
        }
      });
    }

    // ENGINE STATS — package mining + event audit summary (last 24h)
    if (req.method === 'GET' && action === 'engine-stats') {
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const [minedSnap, eventSnap] = await Promise.all([
        db.collection(COLL).where('metadata.createdAt', '>=', since).get().catch(() => ({ size: 0, docs: [] })),
        db.collection('letto_engine_events').where('ts', '>=', since).limit(500).get().catch(() => ({ size: 0, docs: [] }))
      ]);

      const mined = minedSnap.size;
      const events = {};
      let lastError = null;
      for (const d of eventSnap.docs) {
        const e = d.data();
        events[e.event] = (events[e.event] || 0) + 1;
        if (e.event === 'engine_error' && (!lastError || e.ts > lastError.ts)) {
          lastError = { ts: e.ts, workflow: e.workflow, detail: e.detail };
        }
      }

      // Approval funnel (24h): pending → published / rejected
      const [pendingSnap, publishedSnap, rejectedSnap] = await Promise.all([
        db.collection(COLL).where('status', '==', 'pending_review').count().get(),
        db.collection(COLL).where('status', 'in', ['published_public', 'published_premium']).count().get().catch(async () => {
          const [a, b] = await Promise.all([
            db.collection(COLL).where('status', '==', 'published_public').count().get(),
            db.collection(COLL).where('status', '==', 'published_premium').count().get()
          ]);
          return { data: () => ({ count: a.data().count + b.data().count }) };
        }),
        db.collection(COLL).where('status', '==', 'rejected').count().get()
      ]);

      const totalQueueSize = pendingSnap.data().count + publishedSnap.data().count + rejectedSnap.data().count;
      const approvalRate = totalQueueSize > 0
        ? ((publishedSnap.data().count / totalQueueSize) * 100).toFixed(1) + '%'
        : 'n/a';

      return res.status(200).json({
        window: '24h',
        mining: { packagesMined: mined, since },
        events,
        lastError,
        approval: {
          pending: pendingSnap.data().count,
          published: publishedSnap.data().count,
          rejected: rejectedSnap.data().count,
          approvalRate
        }
      });
    }

    // SUBSCRIBERS — list letto_subscribers with paywall state for "what happened after the click" view
    if (req.method === 'GET' && action === 'subscribers') {
      const limit = Math.min(parseInt(req.query.limit) || 100, 500);
      // Fetch all + sort in-memory (avoids needing a composite index on multiple optional fields).
      const snap = await db.collection('letto_subscribers').limit(limit).get();
      const rows = snap.docs.map(d => {
        const x = d.data();
        const lastActivity = x.aimixUnlockedAt || x.premiumSince || x.lastPaidAt || x.createdAt || null;
        return {
          email: x.email || d.id,
          tier: x.tier || 'free',
          subscribed: x.subscribed === true,
          aimixUnlocked: x.aimixUnlocked === true,
          aimixUnlockedAt: x.aimixUnlockedAt || null,
          premiumSince: x.premiumSince || null,
          premiumEndedAt: x.premiumEndedAt || null,
          stripeCustomerId: x.stripeCustomerId || null,
          stripeSubscriptionId: x.stripeSubscriptionId || null,
          telegramInviteLink: x.telegramInviteLink ? '<set>' : null,
          source: x.source || null,
          createdAt: x.createdAt || null,
          lastActivity
        };
      });
      // Sort by lastActivity DESC (most recent first)
      rows.sort((a, b) => (b.lastActivity || '').localeCompare(a.lastActivity || ''));

      const counts = {
        total: rows.length,
        premium: rows.filter(r => r.tier === 'premium' && r.subscribed).length,
        aimixUnlocked: rows.filter(r => r.aimixUnlocked).length,
        free: rows.filter(r => r.tier === 'free' && !r.aimixUnlocked).length,
        cancelled: rows.filter(r => !!r.premiumEndedAt && r.tier === 'free').length
      };
      return res.status(200).json({ subscribers: rows, counts });
    }

    // F13 RETRY · scan failed_email_sends and re-attempt delivery for each
    // pending_retry record. Designed to be called by Vercel cron daily AND
    // manually by admin via Bearer ADMIN_TOKEN. Caps total retries per record
    // at 6 (3 from webhook + 3 from this loop) before flagging manual_review.
    if ((req.method === 'POST' || req.method === 'GET') && action === 'retry-failed-emails') {
      const snap = await db.collection('failed_email_sends')
        .where('status', '==', 'pending_retry')
        .limit(50)
        .get();

      const results = { scanned: snap.size, delivered: 0, escalated: 0, errors: [] };
      for (const doc of snap.docs) {
        const rec = doc.data();
        const tripId = rec.tripId;
        try {
          const tripSnap = await db.collection('purchasedMixes').doc(tripId).get();
          if (!tripSnap.exists) {
            await doc.ref.update({
              status: 'manual_review',
              lastAttemptAt: new Date().toISOString(),
              lastError: { reason: 'purchasedMixes_doc_missing' }
            });
            results.escalated++;
            continue;
          }
          const trip = tripSnap.data();
          const send = await sendMixConfirmationEmail(trip);
          if (send.ok) {
            await doc.ref.update({
              status: 'delivered',
              deliveredAt: new Date().toISOString(),
              resendId: send.id || null,
              attempts: (rec.attempts || 0) + (send.attempts || 1)
            });
            results.delivered++;
          } else {
            const totalAttempts = (rec.attempts || 0) + (send.attempts || 3);
            if (totalAttempts >= 6) {
              await doc.ref.update({
                status: 'manual_review',
                lastAttemptAt: new Date().toISOString(),
                attempts: totalAttempts,
                lastError: send.lastError || { reason: 'unknown' }
              });
              results.escalated++;
              await postSlackAlert(
                `🛑 Email send escalated to manual_review · trip=${tripId} · ${trip.userEmail} · ${totalAttempts} attempts. Open Stripe + Resend dashboards.`
              ).catch(() => {});
            } else {
              await doc.ref.update({
                lastAttemptAt: new Date().toISOString(),
                attempts: totalAttempts,
                lastError: send.lastError || { reason: 'unknown' }
              });
            }
          }
        } catch (e) {
          results.errors.push({ tripId, message: e.message });
        }
      }
      return res.status(200).json(results);
    }

    return res.status(400).json({ error: 'Invalid action or method' });
  } catch (err) {
    console.error('Admin API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
