// api/recovery.js — Email-only self-serve recovery for active subscribers.
//
// Flow:
//   POST { email } → if email maps to a Stripe customer with an active
//   subscription, send a recovery email containing:
//     - Dashboard magic-link  /me?session={aimixSessionId}  (primary; omitted
//       for legacy subscribers that have no aimixSessionId on file)
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
// `sessionId` (the cs_... from letto_subscribers.aimixSessionId) renders the
// primary dashboard magic-link; falsy → that block is omitted — covers legacy
// subscribers and the customer-portal caller, which doesn't load the doc.
async function sendRecoveryEmail(toEmail, telegramInvite, portalUrl, sessionId, locale) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[recovery] RESEND_API_KEY missing — cannot send');
    return { ok: false, reason: 'no_resend_key' };
  }
  const en = locale === 'en';
  const T = en ? {
    subject: 'Your Letto Premium access links',
    heading: 'Your Letto Premium access links',
    intro: 'Lost the earlier email? Here are the active links for your subscription:',
    acct: '🪙 Open your Letto account:',
    acctBtn: 'Open dashboard →',
    acctHint: 'See all your trips, subscription status and manage your account.',
    tg: '🔑 Premium Telegram channel:',
    cancel: '⚙️ Cancel / change details:',
    cancelHint: 'Cancel anytime via the Stripe portal · your subscription stays active until the end of the current period. This link expires in 30 minutes — if it does, request again at',
    footer: "If you didn't request this email, ignore it. Nobody got access to your account.",
    cancelTextLine: 'Cancel / change details (Stripe portal · link expires in 30 min):',
    cancelTextHint: 'Cancel anytime · subscription stays active until the end of the current period.'
  } : {
    subject: 'Tvoji Letto Premium pristupni linkovi',
    heading: 'Tvoji Letto Premium pristupni linkovi',
    intro: 'Ako si izgubio prethodni email, evo aktivnih linkova za tvoju pretplatu:',
    acct: '🪙 Otvori svoj Letto nalog:',
    acctBtn: 'Otvori dashboard →',
    acctHint: 'Vidi sve svoje putove, status pretplate i upravljaj nalogom.',
    tg: '🔑 Premium Telegram kanal:',
    cancel: '⚙️ Otkazivanje / promena podataka:',
    cancelHint: 'Otkaži kad god kroz Stripe portal · pretplata radi do kraja tekućeg perioda. Link važi 30 minuta. Ako istekne, pošalji ponovo zahtev na',
    footer: 'Ako nisi tražio ovaj email, ignoriši ga. Niko nije dobio pristup tvom nalogu.',
    cancelTextLine: 'Otkazivanje / promena podataka (Stripe portal · link važi 30 min):',
    cancelTextHint: 'Otkaži kad god · pretplata radi do kraja tekućeg perioda.'
  };
  const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;color:#1e293b;max-width:560px;margin:0 auto;padding:24px;">
  <h2 style="color:#0f766e;margin:0 0 16px;">${T.heading}</h2>
  <p>${T.intro}</p>
  ${sessionId ? `<div style="margin:20px 0 24px;">
    <p style="margin:0 0 10px;font-weight:600;">${T.acct}</p>
    <p style="margin:0;"><a href="https://letto.live/me?session=${sessionId}" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#8A5F1F,#B8863B,#8A5F1F);color:#F7F1E3;text-decoration:none;border-radius:999px;font-weight:500;">${T.acctBtn}</a></p>
    <p style="margin:8px 0 0;font-size:12px;color:#6B5E47;">${T.acctHint}</p>
  </div>` : ''}
  ${telegramInvite ? `<div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:16px;margin:20px 0;">
    <p style="margin:0 0 8px;font-weight:600;">${T.tg}</p>
    <p style="margin:0;"><a href="${telegramInvite}" style="color:#0f766e;word-break:break-all;">${telegramInvite}</a></p>
  </div>` : ''}
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:20px 0;">
    <p style="margin:0 0 8px;font-weight:600;">${T.cancel}</p>
    <p style="margin:0;"><a href="${portalUrl}" style="color:#b45309;word-break:break-all;">Stripe Billing Portal</a></p>
    <p style="margin:8px 0 0;font-size:13px;color:#475569;">${T.cancelHint} <a href="https://letto.live/me">letto.live/me</a>.</p>
  </div>
  <p style="font-size:13px;color:#94a3b8;margin-top:32px;">${T.footer}</p>
</body></html>`;
  const text = [
    T.heading,
    '',
    ...(sessionId ? [
      T.acct,
      `https://letto.live/me?session=${sessionId}`,
      T.acctHint,
      ''
    ] : []),
    ...(telegramInvite ? [T.tg, telegramInvite, ''] : []),
    T.cancelTextLine,
    portalUrl,
    T.cancelTextHint,
    '',
    T.footer
  ].join('\n');
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [toEmail],
        subject: T.subject,
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

  const { email, locale } = req.body || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  const lowerEmail = email.toLowerCase().trim();
  const loc = locale === 'en' ? 'en' : 'sr';

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
    let sessionId = null;
    try {
      const sub = await db.collection('letto_subscribers').doc(lowerEmail).get();
      if (sub.exists) {
        const d = sub.data() || {};
        telegramInvite = d.telegramInviteLink || d.telegramInvite || telegramInvite;
        sessionId = d.aimixSessionId || null;
        if (!sessionId) {
          // Legacy / manually-created subscriber predating the aimixSessionId
          // write — drops to the two-link (Telegram + portal) email.
          console.warn('[recovery] subscriber missing aimixSessionId:', lowerEmail);
        }
      }
    } catch (e) {
      console.warn('[recovery] Firestore lookup failed:', e.message);
    }

    const send = await sendRecoveryEmail(lowerEmail, telegramInvite, portal.url, sessionId, loc);
    if (!send.ok) {
      // Don't surface the failure to the client (don't leak existence). Log it.
      console.error('[recovery] send failed for confirmed subscriber', { email: lowerEmail, send });
    }

    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error('[recovery]', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Cross-route reuse — api/customer-portal.js imports this for its email branch.
// Vercel bundler supports importing from another route file (same pattern as
// api/stripe-webhook.js exporting sendMixConfirmationEmail / postSlackAlert).
export { sendRecoveryEmail };

export default withSentry('recovery', handler);
