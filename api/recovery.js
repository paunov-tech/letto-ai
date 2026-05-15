// api/recovery.js — Email-only self-serve recovery for active subscribers.
//
// Flow:
//   POST { email } → if email maps to a Stripe customer with an active
//   subscription, send a recovery email containing:
//     - Telegram invite link (from letto_subscribers/{email}.telegramInviteLink)
//     - Stripe Billing Portal URL (one-shot, expires per Stripe defaults)
//
// Same-shape response (200 { sent: true }) regardless of email existence —
// don't leak whether an email is a subscriber. Real failure modes (5xx) only
// fire on actual server errors after we confirm a subscriber.

import Stripe from 'stripe';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { withSentry } from '../lib/sentry-backend.js';

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
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia'
});

const FROM = process.env.RESEND_FROM || 'Letto <info@letto.live>';
const PORTAL_RETURN = (process.env.VITE_SITE_URL || 'https://letto.live') + '/dobrodosao.html';

// Exported so api/customer-portal.js can call the same email-delivery path
// for its email branch (portal URL goes to the inbox owner, never returned
// synchronously to the POSTer). When called with telegramInvite=null
// (portal-only flow), the Telegram block is omitted from the rendered
// HTML / text and only the Stripe Billing Portal link is sent.
async function sendRecoveryEmail(toEmail, telegramInvite, portalUrl) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[recovery] RESEND_API_KEY missing — cannot send');
    return { ok: false, reason: 'no_resend_key' };
  }
  const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;color:#1e293b;max-width:560px;margin:0 auto;padding:24px;">
  <h2 style="color:#0f766e;margin:0 0 16px;">Tvoji Letto Premium pristupni linkovi</h2>
  <p>Ako si izgubio prethodni email, evo aktivnih linkova za tvoju pretplatu:</p>
  ${telegramInvite ? `<div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:16px;margin:20px 0;">
    <p style="margin:0 0 8px;font-weight:600;">🔑 Premium Telegram kanal:</p>
    <p style="margin:0;"><a href="${telegramInvite}" style="color:#0f766e;word-break:break-all;">${telegramInvite}</a></p>
  </div>` : ''}
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:20px 0;">
    <p style="margin:0 0 8px;font-weight:600;">⚙️ Otkazivanje / promena podataka:</p>
    <p style="margin:0;"><a href="${portalUrl}" style="color:#b45309;word-break:break-all;">Stripe Billing Portal</a></p>
    <p style="margin:8px 0 0;font-size:13px;color:#475569;">Otkaži kad god kroz Stripe portal · pretplata radi do kraja current perioda. Link važi 30 minuta. Ako istekne, pošalji ponovo zahtev na <a href="https://letto.live/me">letto.live/me</a>.</p>
  </div>
  <p style="font-size:13px;color:#94a3b8;margin-top:32px;">Ako nisi tražio ovaj email, ignoriši ga. Niko nije dobio pristup tvom nalogu.</p>
</body></html>`;
  const text = [
    'Tvoji Letto Premium pristupni linkovi',
    '',
    ...(telegramInvite ? ['Premium Telegram kanal:', telegramInvite, ''] : []),
    'Otkazivanje / promena podataka (Stripe portal · link važi 30 min):',
    portalUrl,
    'Otkaži kad god · pretplata radi do kraja current perioda.',
    '',
    'Ako nisi tražio ovaj email, ignoriši ga.'
  ].join('\n');
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [toEmail],
        subject: 'Tvoji Letto Premium pristupni linkovi',
        html,
        text,
        tags: [{ name: 'flow', value: 'recovery' }]
      })
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error('[recovery] Resend HTTP', r.status, body.slice(0, 240));
      return { ok: false, status: r.status };
    }
    return { ok: true };
  } catch (e) {
    console.error('[recovery] Resend send threw:', e.message);
    return { ok: false, reason: e.message };
  }
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Validan email obavezan' });
  }
  const lowerEmail = email.toLowerCase().trim();

  // Always return the same shape so the existence of the email isn't leaked
  // by HTTP status / response body.
  const samePromise = res.status.bind(res); // not used; placeholder

  try {
    const customers = await stripe.customers.list({ email: lowerEmail, limit: 1 });
    if (!customers.data.length) {
      return res.status(200).json({ sent: true });
    }
    const customer = customers.data[0];

    const subs = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'active',
      limit: 1
    });
    if (!subs.data.length) {
      return res.status(200).json({ sent: true });
    }

    // Build portal URL
    const portal = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: PORTAL_RETURN
    });

    // Look up Telegram invite from Firestore. Doc ID is the email itself
    // (lowercased) per existing webhook write pattern.
    let telegramInvite = 'https://letto.live/me';
    try {
      const sub = await db.collection('letto_subscribers').doc(lowerEmail).get();
      if (sub.exists) {
        const d = sub.data() || {};
        telegramInvite = d.telegramInviteLink || d.telegramInvite || telegramInvite;
      }
    } catch (e) {
      console.warn('[recovery] Firestore lookup failed:', e.message);
    }

    const send = await sendRecoveryEmail(lowerEmail, telegramInvite, portal.url);
    if (!send.ok) {
      // Don't surface the failure to the client (don't leak existence). Log it.
      console.error('[recovery] send failed for confirmed subscriber', { email: lowerEmail, send });
    }

    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error('[recovery]', err.message);
    return res.status(500).json({ error: 'Greška. Pokušaj ponovo ili napiši na info@letto.live' });
  }
}

// Cross-route reuse — api/customer-portal.js imports this for its email branch.
// Vercel bundler supports importing from another route file (same pattern as
// api/stripe-webhook.js exporting sendMixConfirmationEmail / postSlackAlert).
export { sendRecoveryEmail };

export default withSentry('recovery', handler);
