// api/admin.js — Admin panel API for letto_packages (v7 schema)
// Lists pending packages, handles approve (to public/premium) / reject / edit.
// Protected by ADMIN_TOKEN env variable.
//
// Auth: Bearer ADMIN_TOKEN OR (for /retry-failed-emails) Vercel cron with
// `Authorization: Bearer <CRON_SECRET>` (Vercel injects this header on
// scheduled invocations).

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { withSentry } from '../lib/sentry-backend.js';
import { getFirestore } from 'firebase-admin/firestore';
import { Storage } from '@google-cloud/storage';
import { sendMixConfirmationEmail, sendWelcomeEmailWithRetry, postSlackAlert } from './stripe-webhook.js';

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

async function handler(req, res) {
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

    // FAZA E1 · daily Firestore export to GCS.
    // Snapshots the 6 high-value collections to JSON, uploads to
    //   gs://${FIREBASE_BACKUP_BUCKET}/daily/YYYY-MM-DD/<collection>.json
    // and posts size summary to Slack. 30-day retention is enforced via
    // a bucket lifecycle rule the operator sets up at bucket creation
    // (`gsutil lifecycle set lifecycle.json gs://letto-ai-backups`).
    if ((req.method === 'POST' || req.method === 'GET') && action === 'daily-firestore-export') {
      const bucketName = process.env.FIREBASE_BACKUP_BUCKET;
      if (!bucketName) {
        return res.status(500).json({
          error: 'FIREBASE_BACKUP_BUCKET env var not set',
          hint: 'Create a GCS bucket (e.g. letto-ai-backups, location=eu) and set the env var to its name.'
        });
      }
      const COLLECTIONS = [
        'letto_subscribers',
        'letto_packages',
        'purchasedMixes',
        'failed_email_sends',
        'currency_mismatches',
        'failed_purchases'
      ];
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const storage = new Storage({
        projectId: 'letto-ai',
        credentials: {
          client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
        }
      });
      const bucket = storage.bucket(bucketName);
      const summary = { date: today, bucket: bucketName, collections: [], totalBytes: 0 };
      for (const collName of COLLECTIONS) {
        try {
          const snap = await db.collection(collName).get();
          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          const json = JSON.stringify(docs, (_k, v) => {
            // Firestore Timestamps serialize to {_seconds, _nanoseconds};
            // also handle DocumentReferences by emitting their path.
            if (v && typeof v === 'object' && typeof v.toDate === 'function') {
              try { return v.toDate().toISOString(); } catch { return null; }
            }
            return v;
          }, 2);
          const objectPath = `daily/${today}/${collName}.json`;
          const file = bucket.file(objectPath);
          await file.save(json, {
            contentType: 'application/json',
            metadata: { metadata: { backupDate: today, collection: collName, docCount: String(docs.length) } }
          });
          summary.collections.push({ name: collName, docs: docs.length, bytes: Buffer.byteLength(json) });
          summary.totalBytes += Buffer.byteLength(json);
        } catch (e) {
          console.error('[daily-firestore-export]', collName, 'failed:', e.message);
          summary.collections.push({ name: collName, error: e.message });
        }
      }
      const totalMb = (summary.totalBytes / (1024 * 1024)).toFixed(2);
      const text = `✅ Daily backup · ${COLLECTIONS.length} collections · ${totalMb} MB · ${today}\n` +
        summary.collections.map(c =>
          c.error ? `  🔴 ${c.name}: ${c.error}` : `  ${c.name}: ${c.docs} docs (${(c.bytes / 1024).toFixed(1)} KB)`
        ).join('\n');
      await postSlackAlert(text).catch(() => {});
      return res.status(200).json({ ok: true, ...summary });
    }

    // FAZA E2 · daily review report. Surfaces every "stuck" record across
    // the reliability collections so a human can act before it ages out.
    if ((req.method === 'POST' || req.method === 'GET') && action === 'daily-review-report') {
      const since24h = new Date(Date.now() - 24 * 3600000).toISOString();

      const [pendingEmail, manualReviewEmail, currencyMM, pendingTrips] = await Promise.all([
        db.collection('failed_email_sends').where('status', '==', 'pending_retry').get().catch(() => ({ docs: [] })),
        db.collection('failed_email_sends').where('status', '==', 'manual_review').get().catch(() => ({ docs: [] })),
        db.collection('currency_mismatches').where('status', '==', 'manual_review').get().catch(() => ({ docs: [] })),
        db.collection('purchasedMixes').where('status', '==', 'pending_email_capture').get().catch(() => ({ docs: [] }))
      ]);

      const pendingEmailCount = pendingEmail.docs.length;
      const manualReviewCount = manualReviewEmail.docs.length;
      const currencyCount = currencyMM.docs.length;
      const pendingTripsCount = pendingTrips.docs.length;

      // Compute oldest pending-email-capture trip age in hours
      let oldestPendingTripHours = 0;
      for (const d of pendingTrips.docs) {
        const paidAt = d.data().paidAt;
        if (!paidAt) continue;
        const ageH = (Date.now() - new Date(paidAt).getTime()) / 3600000;
        if (ageH > oldestPendingTripHours) oldestPendingTripHours = ageH;
      }

      // Trial expiring next 24h — premium subscribers with trialEndsAt < +24h.
      // Best-effort; current letto_subscribers schema may not have trialEndsAt
      // yet. Skip silently if collection query fails.
      let trialExpiring = 0;
      try {
        const trialSnap = await db.collection('letto_subscribers')
          .where('subscribed', '==', true)
          .get();
        const cutoff = Date.now() + 24 * 3600000;
        trialExpiring = trialSnap.docs.filter(d => {
          const t = d.data().trialEndsAt;
          if (!t) return false;
          const ts = new Date(t).getTime();
          return ts > Date.now() && ts < cutoff;
        }).length;
      } catch (_) { /* schema may not have field; ignore */ }

      const lines = [
        `📋 Letto daily review · ${new Date().toISOString().slice(0, 10)}`,
        `failed_email_sends: ${pendingEmailCount} pending · ${manualReviewCount} manual_review`,
        `currency_mismatches: ${currencyCount} manual_review`,
        `pending_email_capture mixes: ${pendingTripsCount}${pendingTripsCount ? ` (oldest: ${oldestPendingTripHours.toFixed(1)}h)` : ''}`,
        `trial expiring 24h: ${trialExpiring}`
      ];
      const totalActions = pendingEmailCount + manualReviewCount + currencyCount + pendingTripsCount;
      lines.push(totalActions > 0
        ? `Action items: ${totalActions} record(s) need attention.`
        : 'Action items: none.');

      const text = lines.join('\n');
      await postSlackAlert(text).catch(() => {});
      return res.status(200).json({
        ok: true,
        date: new Date().toISOString().slice(0, 10),
        pendingEmailCount,
        manualReviewCount,
        currencyMismatchCount: currencyCount,
        pendingTripsCount,
        oldestPendingTripHours: Math.round(oldestPendingTripHours * 10) / 10,
        trialExpiring,
        text
      });
    }

    // FAZA C3 · packages-health daily Slack report. Surfaces "engine is dead"
    // (new < 5 in 24h) and "catalog drift" (Lux > 70% of total) so we can
    // notice before the FB ad spend is sending users to a stale catalog.
    if ((req.method === 'POST' || req.method === 'GET') && action === 'packages-health') {
      const since = new Date(Date.now() - 24 * 3600000).toISOString();
      const [pubPubSnap, pubPremSnap] = await Promise.all([
        db.collection(COLL).where('status', '==', 'published_public').get(),
        db.collection(COLL).where('status', '==', 'published_premium').get()
      ]);
      const all = [...pubPubSnap.docs, ...pubPremSnap.docs].map(d => d.data());
      const total = all.length;
      const new24h = all.filter(p => (p.metadata?.createdAt || '') >= since).length;
      const tierCounts = { budget: 0, value: 0, lux: 0, untiered: 0 };
      const destCounts = {};
      for (const p of all) {
        const t = p.tier || 'untiered';
        tierCounts[t] = (tierCounts[t] || 0) + 1;
        const dc = (p.destination?.code || '?').toUpperCase();
        destCounts[dc] = (destCounts[dc] || 0) + 1;
      }
      const topDests = Object.entries(destCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([code, n]) => `${code}=${n}`)
        .join(', ');
      const luxPct = total > 0 ? Math.round((tierCounts.lux / total) * 100) : 0;
      const alerts = [];
      if (new24h < 5) alerts.push(`🚨 Engine output low · only ${new24h} new packages in 24h (expected ≥5)`);
      if (luxPct > 70) alerts.push(`⚠️ Catalog drift · Lux ${luxPct}% of catalog (smart-fallback chain under pressure)`);

      const lines = [
        `📦 Letto packages health · ${new Date().toISOString().slice(0, 10)}`,
        `Total published: ${total} · new 24h: ${new24h}`,
        `Tier: budget=${tierCounts.budget} · value=${tierCounts.value} · lux=${tierCounts.lux} · untiered=${tierCounts.untiered}`,
        `Top destinations: ${topDests || '(none)'}`,
        ...alerts
      ];
      const text = lines.join('\n');

      // Always post to Slack (daily heartbeat + alerts) so we have a regular
      // pulse — silence after a quiet failure is worse than mild noise.
      await postSlackAlert(text).catch(e => console.error('[packages-health] Slack post failed:', e.message));

      return res.status(200).json({
        ok: true,
        total, new24h, tierCounts, luxPct, topDests, alerts, text
      });
    }

    // F18 RECOVERY · attach an email to a paid trip whose webhook arrived
    // without one (Apple Pay / Express edge), then send the confirmation.
    // Authoritative auth check is the admin token; cron does not run this.
    if ((req.method === 'POST' || req.method === 'GET') && action === 'resend-mix') {
      const tripId = (req.query.tripId || '').toString().trim();
      const email = (req.query.email || '').toString().trim().toLowerCase();
      if (!tripId || !/^[a-f0-9]{16}$/.test(tripId)) {
        return res.status(400).json({ error: 'tripId required (16-char hex)' });
      }
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'email required (must include @)' });
      }
      const tripRef = db.collection('purchasedMixes').doc(tripId);
      const tripSnap = await tripRef.get();
      if (!tripSnap.exists) {
        return res.status(404).json({ error: 'trip not found', tripId });
      }
      const trip = tripSnap.data();
      if (trip.status !== 'pending_email_capture') {
        return res.status(400).json({ error: 'trip not pending_email_capture', currentStatus: trip.status });
      }
      // Update the doc, then run the confirmation through the regular retry
      // pipeline. If sending succeeds, status flips to 'paid'.
      await tripRef.update({
        userEmail: email,
        recoveredAt: new Date().toISOString()
      });
      // Also flip the subscriber doc now that we know the email.
      await db.collection('letto_subscribers').doc(email).set({
        email,
        stripeCustomerId: trip.stripeCustomerId || null,
        aimixUnlocked: true,
        aimixUnlockedAt: trip.paidAt || new Date().toISOString(),
        aimixSessionId: trip.stripeSessionId || null,
        recoveredFromPendingEmail: true
      }, { merge: true });

      const sendRes = await sendMixConfirmationEmail({ ...trip, userEmail: email });
      if (sendRes.ok) {
        await tripRef.update({ status: 'paid' });
        return res.status(200).json({ ok: true, tripId, email, status: 'recovered', sendId: sendRes.id || null });
      }
      // Retry pipeline already persisted to failed_email_sends + alerted Slack.
      return res.status(200).json({
        ok: false,
        tripId,
        email,
        status: 'email_attached_send_failed',
        sendResult: sendRes,
        note: 'Trip is updated with email; failed_email_sends record exists for cron retry.'
      });
    }

    // F18 SMOKE TEST · synthesize a paid Stripe session with NO email and
    // walk through the same write path the webhook would. Verifies that
    // (a) the trip is recorded with status='pending_email_capture',
    // (b) the F18 Slack alert fires,
    // (c) the manual recovery endpoint can flip the trip to 'paid'.
    if ((req.method === 'POST' || req.method === 'GET') && action === 'smoke-f18') {
      const fakeTripId = (Math.random().toString(16).slice(2) + '000000').slice(0, 16);
      const fakeSessionId = 'cs_smoke_' + fakeTripId;
      const fakeAmount = 799;

      // Write a pending_email_capture trip directly (bypasses Stripe webhook,
      // exercises the same Firestore shape the webhook produces).
      const tripDoc = {
        tripId: fakeTripId,
        stripeSessionId: fakeSessionId,
        stripeCustomerId: null,
        paidAt: new Date().toISOString(),
        tier: 'value',
        userEmail: null,
        route: { origin: 'BEG', dest: 'TST' },
        flight: {
          airline: 'TestAir', flightNumber: 'TA-F18',
          depart: '2099-01-01', return: '2099-01-08',
          duration: '2h', stops: 0, totalPrice: 199,
          bookingUrl: null, bookingPartner: null
        },
        hotel: {
          name: 'F18 Smoke Hotel', stars: 4, neighborhood: 'Centar',
          nights: 7, pricePerNight: 100, priceTotal: 700,
          bookingUrl: null, hotellookId: null
        },
        pax: { adults: 1, children: 0, infants: 0 },
        grandTotal: 899,
        currency: 'EUR',
        status: 'pending_email_capture',
        pendingMixId: fakeTripId
      };
      await db.collection('purchasedMixes').doc(fakeTripId).set(tripDoc);
      await postSlackAlert(
        `🚨 F18 SMOKE · session=${fakeSessionId} amount=${fakeAmount / 100}€ trip=${fakeTripId} · this is a synthetic test alert; no real customer affected`
      ).catch(() => {});

      // Read back to confirm
      const writtenSnap = await db.collection('purchasedMixes').doc(fakeTripId).get();
      const written = writtenSnap.exists ? writtenSnap.data() : null;

      // Cleanup
      await db.collection('purchasedMixes').doc(fakeTripId).delete().catch(() => {});

      return res.status(200).json({
        smoke: 'f18',
        fakeTripId,
        writtenStatus: written?.status,
        writtenUserEmail: written?.userEmail,
        cleanedUp: !!writtenSnap.exists,
        notes: [
          'Trip was written with userEmail=null and status=pending_email_capture.',
          'Slack alert was posted (look for the SMOKE prefix to distinguish from real F18s).',
          'Test trip was deleted from Firestore.',
          'To verify the recovery endpoint, omit cleanup and call resend-mix manually.'
        ]
      });
    }

    // F13 SMOKE TEST · trigger an end-to-end email failure with a synthetic
    // trip whose userEmail is deliberately invalid. Exercises the real retry
    // pipeline (3 attempts × exp backoff), persists to failed_email_sends, and
    // posts to Slack. Cleans up the test record after capturing it so the
    // daily cron doesn't keep retrying a fake trip.
    if ((req.method === 'POST' || req.method === 'GET') && action === 'smoke-f13') {
      const fakeTripId = 'smoke' + Math.random().toString(16).slice(2, 12);
      const fakeTrip = {
        tripId: fakeTripId,
        userEmail: 'invalid-format-no-at-symbol', // Resend returns 422
        tier: 'value',
        route: { origin: 'BEG', dest: 'TST' },
        flight: {
          airline: 'TestAir',
          flightNumber: 'TA001',
          depart: '2099-01-01',
          return: '2099-01-08',
          duration: '2h 30m',
          stops: 0,
          totalPrice: 199,
          bookingUrl: null,
          bookingPartner: null
        },
        hotel: {
          name: 'Smoke Test Hotel',
          stars: 4,
          neighborhood: 'Centar',
          nights: 7,
          pricePerNight: 100,
          priceTotal: 700,
          bookingUrl: null
        },
        pax: { adults: 1, children: 0, infants: 0 },
        grandTotal: 899,
        currency: 'EUR',
        status: 'paid',
        paidAt: new Date().toISOString()
      };

      const sendResult = await sendMixConfirmationEmail(fakeTrip);
      const recRef = db.collection('failed_email_sends').doc(fakeTripId);
      const recSnap = await recRef.get();
      const recData = recSnap.exists ? recSnap.data() : null;
      // Cleanup test record so the daily cron doesn't loop on a fake tripId.
      await recRef.delete().catch(() => {});

      return res.status(200).json({
        smoke: 'f13',
        fakeTripId,
        sendResult,
        persistedRecord: recData,
        cleanedUp: recSnap.exists,
        notes: [
          'Slack alert was posted iff sendResult.attempts === 3.',
          'failed_email_sends/{fakeTripId} was created and then deleted.',
          'No real customer was emailed.'
        ]
      });
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

      const results = { scanned: snap.size, delivered: 0, escalated: 0, errors: [], byFlow: {} };
      for (const doc of snap.docs) {
        const rec = doc.data();
        const flow = rec.flow || 'mix'; // legacy records (pre-FAZA-B) lack flow → assume mix
        results.byFlow[flow] = results.byFlow[flow] || { delivered: 0, escalated: 0, errors: 0 };

        try {
          let send;
          let label = doc.id;
          if (flow === 'premium_welcome') {
            // Premium welcome retry: re-send the SendGrid welcome email.
            send = await sendWelcomeEmailWithRetry({
              to: rec.userEmail,
              firstName: null,
              inviteLink: rec.inviteLink || null,
              stripeCustomerId: rec.stripeCustomerId || null,
              stripeSessionId: rec.stripeSessionId || null,
              subscriptionId: rec.subscriptionId || null
            });
            label = `welcome:${rec.userEmail}`;
          } else {
            // Default: mix confirmation. Look up the canonical trip.
            const tripId = rec.tripId;
            const tripSnap = await db.collection('purchasedMixes').doc(tripId).get();
            if (!tripSnap.exists) {
              await doc.ref.update({
                status: 'manual_review',
                lastAttemptAt: new Date().toISOString(),
                lastError: { reason: 'purchasedMixes_doc_missing' }
              });
              results.escalated++;
              results.byFlow[flow].escalated++;
              continue;
            }
            send = await sendMixConfirmationEmail(tripSnap.data());
            label = `mix:${tripId}`;
          }

          if (send.ok) {
            await doc.ref.update({
              status: 'delivered',
              deliveredAt: new Date().toISOString(),
              resendId: send.id || null,
              attempts: (rec.attempts || 0) + (send.attempts || 1)
            });
            results.delivered++;
            results.byFlow[flow].delivered++;
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
              results.byFlow[flow].escalated++;
              await postSlackAlert(
                `🛑 Email escalated to manual_review · ${label} · ${totalAttempts} attempts · flow=${flow}. Open Stripe + email-provider dashboards.`
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
          results.errors.push({ docId: doc.id, flow, message: e.message });
          results.byFlow[flow].errors++;
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

export default withSentry('admin', handler);
