// api/stripe-webhook.js — Handles Stripe subscription events
// - checkout.session.completed → mark user premium + send Telegram invite
// - customer.subscription.deleted → revoke premium access

import Stripe from 'stripe';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Init Firebase Admin
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

// Vercel requires raw body for Stripe signature verification
export const config = {
  api: { bodyParser: false }
};

async function getRawBody(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

async function getTopDealWithActivities() {
  // Fetches top public deal + its viator activities. Returns null on error / empty.
  try {
    const snap = await db.collection('letto_packages')
      .where('status', '==', 'published_public')
      .orderBy('metadata.createdAt', 'desc')
      .limit(1).get();
    if (snap.empty) return null;
    const pkg = snap.docs[0].data();
    return {
      city: pkg.destination?.city,
      country: pkg.destination?.country,
      total: pkg.pricing?.total,
      flightDealRatio: pkg.deal?.flightDealRatio,
      activities: Array.isArray(pkg.activities) ? pkg.activities.slice(0, 3) : []
    };
  } catch (e) {
    console.error('[stripe-webhook] top deal fetch failed:', e.message);
    return null;
  }
}

async function sendWelcomeEmail({ to, firstName, inviteLink }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no_api_key' };

  const safeName = (firstName || 'putnik').replace(/[<>&]/g, '');
  const safeLink = inviteLink || '';

  const featured = await getTopDealWithActivities();

  let activitiesHtml = '';
  let activitiesText = '';
  if (featured && featured.activities.length > 0) {
    const items = featured.activities.map(a => {
      const price = Number(a.fromPrice) ? `€${Math.round(a.fromPrice)}` : '€?';
      const title = String(a.title || '').replace(/[<>&]/g, '').slice(0, 80);
      const url = a.url || '#';
      return `<li><a href="${url}" style="color:#0f766e;">${title}</a> — od <strong>${price}</strong></li>`;
    }).join('');
    const ratio = Number(featured.flightDealRatio);
    const pctBelow = (ratio > 0 && ratio < 1) ? Math.round((1 - ratio) * 100) : null;
    const dealLineHtml = pctBelow != null
      ? `<p style="margin:6px 0 0;font-size:13px;color:#6B1A25;font-weight:600;">Avio karta ${pctBelow}% niža od redovne cene.</p>`
      : '';
    const dealLineText = pctBelow != null
      ? `Avio karta ${pctBelow}% niža od redovne cene.\n`
      : '';
    activitiesHtml = `
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:20px 0;">
    <p style="margin:0 0 8px;font-weight:600;">🎯 Aktivnosti u ${featured.city}:</p>
    <ul style="padding-left:20px;line-height:1.7;margin:0;">${items}</ul>
    <p style="margin:8px 0 0;font-size:13px;color:#78716c;">Top deal danas: <strong>${featured.city}</strong> (€${Math.round(Number(featured.total) || 0)})</p>${dealLineHtml}
  </div>`;
    activitiesText = `\nAKTIVNOSTI U ${featured.city.toUpperCase()}:\n` +
      featured.activities.map(a => `- ${a.title} — od €${Math.round(a.fromPrice || 0)} (${a.url})`).join('\n') + '\n' +
      dealLineText;
  }

  const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;color:#1e293b;max-width:560px;margin:0 auto;padding:24px;">
  <h2 style="color:#0f766e;margin:0 0 16px;">Dobrodošao u LETTO Premium 🎉</h2>
  <p>Zdravo <strong>${safeName}</strong>,</p>
  <p>Tvoj LETTO Premium pristup je aktivan.</p>
  <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:16px;margin:20px 0;">
    <p style="margin:0 0 8px;font-weight:600;">🔑 Pristup Premium kanalu:</p>
    <p style="margin:0;"><a href="${safeLink}" style="color:#0f766e;word-break:break-all;">${safeLink}</a></p>
    <p style="margin:8px 0 0;font-size:13px;color:#475569;">Link važi 7 dana, jednokratan — sačuvaj ga.</p>
  </div>
  <p style="margin-top:24px;"><strong>Šta dobijaš:</strong></p>
  <ul style="padding-left:20px;line-height:1.7;">
    <li>Premium Telegram kanal — top deal-ovi sa najvećim popustima (45%+)</li>
    <li>Daily picks svako jutro</li>
    <li>Route alerts za tvoje izabrane destinacije</li>
  </ul>${activitiesHtml}
  <p style="font-size:14px;color:#64748b;">Ako ne vidiš link ili imaš problem, odgovori na ovaj email.</p>
  <p style="margin-top:32px;">Srećan put,<br><strong>LETTO tim</strong><br><a href="https://letto.live" style="color:#0f766e;">letto.live</a></p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
  <p style="font-size:12px;color:#94a3b8;">Otkazivanje: jednim klikom u Stripe portal-u (link u potvrdi plaćanja).</p>
</body></html>`;

  const text = `Zdravo ${safeName},

Tvoj LETTO Premium pristup je aktivan.

PRISTUPI PREMIUM KANALU:
${safeLink}

Link važi 7 dana i može se iskoristiti samo jednom — sačuvaj ga.

ŠTA DOBIJAŠ:
- Premium Telegram kanal — top deal-ovi sa najvećim popustima (45%+)
- Daily picks svako jutro
- Route alerts za tvoje izabrane destinacije
${activitiesText}
Ako ne vidiš link ili imaš problem, odgovori na ovaj email.

Srećan put,
LETTO tim
https://letto.live

---
Otkazivanje: jednim klikom u Stripe portal-u (link u potvrdi plaćanja).
`;

  const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: 'noreply@letto.live', name: 'LETTO' },
      reply_to: { email: 'info@letto.live', name: 'LETTO' },
      subject: 'Dobrodošao u LETTO Premium 🎉',
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html }
      ]
    })
  });

  if (r.status === 202) return { ok: true };
  const body = await r.text();
  return { ok: false, status: r.status, body: body.slice(0, 500) };
}

async function notifyAdminFallback({ email, inviteLink, reason }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: `⚠️ <b>SendGrid welcome email failed</b>\nSubscriber: <code>${email}</code>\nReason: <code>${reason}</code>\nManual invite: ${inviteLink}`,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  }).catch(() => {});
}

async function generateTelegramInvite(customerEmail) {
  // Creates one-time invite link for premium channel
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const channelId = process.env.TELEGRAM_PREMIUM_CHANNEL_ID;

  const resp = await fetch(`https://api.telegram.org/bot${botToken}/createChatInviteLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: channelId,
      expire_date: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
      member_limit: 1,
      name: `premium_${customerEmail.split('@')[0]}`
    })
  });

  const data = await resp.json();
  return data.result?.invite_link || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('Missing signature');

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      // Subscription activated
      case 'checkout.session.completed': {
        const session = event.data.object;

        // Isolation guard: only process events that originated from LETTO checkout.
        // Same Stripe account is shared with jadran.ai — defensive skip if metadata.source !== 'letto'.
        if (session.metadata?.source && session.metadata.source !== 'letto') {
          console.log(`[LETTO] Skipping non-letto checkout event (source=${session.metadata.source})`);
          break;
        }

        const email = session.customer_email || session.customer_details?.email;
        const firstName = session.customer_details?.name?.split(' ')[0];
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        if (!email) break;

        // Generate one-time Telegram invite
        const inviteLink = await generateTelegramInvite(email);

        // Upsert user to Firestore
        await db.collection('letto_subscribers').doc(email.toLowerCase()).set({
          email: email.toLowerCase(),
          tier: 'premium',
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          premiumSince: new Date().toISOString(),
          subscribed: true,
          telegramInviteLink: inviteLink,
          telegramInviteIssued: new Date().toISOString()
        }, { merge: true });

        // Welcome email with Telegram invite link via SendGrid
        const sg = await sendWelcomeEmail({ to: email, firstName, inviteLink }).catch(err => ({ ok: false, reason: err.message }));
        if (sg.ok) {
          console.log(`[LETTO] Welcome email sent to ${email}`);
        } else {
          console.error(`[LETTO] SendGrid send failed (${sg.status || sg.reason}):`, sg.body || sg.reason);
          await notifyAdminFallback({ email, inviteLink, reason: `${sg.status || sg.reason || 'unknown'}` });
        }

        console.log(`[LETTO] Premium activated: ${email}, invite: ${inviteLink}`);
        break;
      }

      // Subscription renewed
      case 'invoice.paid': {
        const invoice = event.data.object;
        const email = invoice.customer_email;
        if (email) {
          await db.collection('letto_subscribers').doc(email.toLowerCase()).set({
            lastPaidAt: new Date().toISOString(),
            tier: 'premium'
          }, { merge: true });
        }
        break;
      }

      // Subscription canceled or expired
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const customer = await stripe.customers.retrieve(sub.customer);
        const email = customer.email;

        if (email) {
          await db.collection('letto_subscribers').doc(email.toLowerCase()).set({
            tier: 'free', // downgrade
            premiumEndedAt: new Date().toISOString(),
            stripeSubscriptionId: null
          }, { merge: true });

          // TODO: Kick user from premium Telegram channel via bot API
          // POST https://api.telegram.org/bot{token}/banChatMember
          console.log(`[LETTO] Premium canceled: ${email}`);
        }
        break;
      }

      default:
        console.log(`Unhandled Stripe event: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
