// api/lead-capture.js — Email capture interstitial before external booking
// links (Wizz / Booking / Kiwi / Aviasales / TPEmbars / etc.).
//
// Triggered by public/lead-capture.js click-intercept on .deal-flight-book
// (and any other a[href*=booking-host] link on the page). Writes to
// Firestore `email_leads` collection, rate-limited 5 captures / IP / 24h.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { withSentry } from '../lib/sentry-backend.js';
import { applyRateLimit, getClientIp } from '../lib/rate-limit.js';
import { sendLeadDoiEmail } from '../lib/email-leads.js';
import crypto from 'crypto';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: 'letto-ai',
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const db = getFirestore();

// RFC-5322 is overkill for capture UX. This is the same regex pattern the
// front-end Stripe-checkout fallback uses: one @, non-empty local + domain,
// at least one dot in the domain. Catches obvious typos without false-
// rejecting real addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_SOURCES = new Set(['try_it', 'mix', 'premium', 'catalog']);

// IP hash so we can audit / dedupe without storing raw IPs. SALT must be set
// in Vercel project env — falls back to a constant for local dev only.
const IP_HASH_SALT = process.env.LEAD_IP_HASH_SALT || 'letto-dev-only-not-prod';

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const contentType = (req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ error: 'content_type_required' });
  }

  // 5 captures per IP per 24h. Same per-instance best-effort limiter the rest
  // of the API uses — sufficient to stop scripted abuse, not strict global.
  if (applyRateLimit(req, res, { scope: 'lead-capture', limit: 5, windowMs: 86400000 })) return;

  const { email, dealId, source } = req.body || {};
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }

  const ip = getClientIp(req);
  const ipHash = crypto.createHash('sha256').update(ip + IP_HASH_SALT).digest('hex').slice(0, 16);

  const safeSource = (typeof source === 'string' && VALID_SOURCES.has(source)) ? source : 'unknown';
  const safeDealId = typeof dealId === 'string' ? dealId.slice(0, 120) : '';

  const lowerEmail = email.toLowerCase().trim();

  try {
    // Idempotency · if a pending DOI doc already exists for this email,
    // reuse its confirmToken and re-send the email rather than create a
    // new doc. Prevents token bloat from refresh / impatient resubmit,
    // and guarantees the same email-confirmation link works regardless of
    // which submission the user clicks. Equality-only query — no
    // composite index needed; Firestore single-field indexes are auto.
    const existing = await db.collection('email_leads')
      .where('email', '==', lowerEmail)
      .where('status', '==', 'pending')
      .limit(1).get();

    let confirmToken;
    if (!existing.empty) {
      confirmToken = existing.docs[0].data().confirmToken || crypto.randomUUID();
      // If the legacy doc somehow lacks a token, patch one in for the resend.
      if (!existing.docs[0].data().confirmToken) {
        await existing.docs[0].ref.update({ confirmToken });
      }
    } else {
      confirmToken = crypto.randomUUID();
      await db.collection('email_leads').add({
        email: lowerEmail,
        dealId: safeDealId,
        source: safeSource,
        status: 'pending',
        confirmToken,
        confirmedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        ipHash,
      });
    }

    // Fire the DOI email · non-blocking failure. If Resend is down, the
    // doc is written (or reused) and a manual cleanup / retry can run
    // later. Don't surface send failure to the client — same-shape
    // {sent:true} keeps the UX unaffected and the lead in the queue.
    const send = await sendLeadDoiEmail(lowerEmail, confirmToken, safeDealId);
    if (!send.ok) {
      console.error('[lead-capture] DOI send failed for', lowerEmail, send);
    }

    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error('[lead-capture] Firestore write failed:', err.message);
    return res.status(500).json({ error: 'write_failed' });
  }
}

export default withSentry('lead-capture', handler);
