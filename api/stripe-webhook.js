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

// ─── C-2 · Resend mix confirmation email ─────────────────────────────────
// Discover verified sender once (cached in module scope), then send a Letto-
// branded HTML email with flight + hotel summary and direct booking CTAs
// after a successful Stripe checkout for the AI Mix tier.
let __resendSenderCache = null;
async function resolveResendSender(apiKey) {
  if (__resendSenderCache) return __resendSenderCache;
  try {
    const r = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!r.ok) {
      console.warn('[mix-email] domains lookup HTTP', r.status, '— defaulting to letto.live');
      __resendSenderCache = { from: 'Letto Mix <mix@letto.live>', replyTo: null };
      return __resendSenderCache;
    }
    const j = await r.json();
    const domains = (j.data || []).filter(d => d.status === 'verified').map(d => d.name);
    if (domains.includes('letto.live')) {
      __resendSenderCache = { from: 'Letto Mix <mix@letto.live>', replyTo: null };
    } else if (domains.includes('sial.com')) {
      __resendSenderCache = { from: 'Letto Mix <mix@sial.com>', replyTo: 'noreply@letto.live' };
    } else {
      // No matching verified domain — log and fall back to letto.live (will fail
      // gracefully at send time if not actually verified).
      console.warn('[mix-email] no verified letto.live or sial.com — verified list:', domains.join(', ') || '(empty)');
      __resendSenderCache = { from: 'Letto Mix <mix@letto.live>', replyTo: null };
    }
    return __resendSenderCache;
  } catch (e) {
    console.warn('[mix-email] domains lookup failed:', e.message);
    __resendSenderCache = { from: 'Letto Mix <mix@letto.live>', replyTo: null };
    return __resendSenderCache;
  }
}

function fmtDateRangeForEmail(dep, ret) {
  if (!dep || !ret) return '';
  try {
    const d1 = new Date(dep + 'T00:00:00Z');
    const d2 = new Date(ret + 'T00:00:00Z');
    const opt = { day: 'numeric', month: 'short', year: 'numeric' };
    return d1.toLocaleDateString('sr-Latn', opt) + ' – ' + d2.toLocaleDateString('sr-Latn', opt);
  } catch { return dep + ' – ' + ret; }
}

function buildMixEmailHtml({ trip, originName, destName, dateRange }) {
  const f = trip.flight || {};
  const h = trip.hotel || {};
  const stars = (h.stars > 0 && h.stars <= 5) ? '★'.repeat(h.stars) : '';
  const flightLine = [f.airline, f.flightNumber].filter(Boolean).join(' ') || 'Let';
  const stopsLabel = f.stops === 0 ? 'direktan'
    : f.stops === 1 ? '1 presedanje'
    : f.stops > 1 ? f.stops + ' presedanja' : '';
  const flightMeta = [f.depart, f.duration, stopsLabel].filter(Boolean).join(' · ');
  const safe = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F5EFE0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1F2226;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5EFE0;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FAF6EA;border:1px solid #E4D9BC;border-radius:14px;overflow:hidden;">

      <!-- Header -->
      <tr><td style="padding:32px 36px 22px;text-align:center;border-bottom:1px solid #E4D9BC;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:#A17433;font-weight:600;margin-bottom:8px;">Letto Mix · paid</div>
        <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:28px;line-height:1.2;color:#1F2226;">${safe(originName)} → ${safe(destName)}</h1>
        <p style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:15px;color:#5A4F3A;">${safe(dateRange)}</p>
      </td></tr>

      <!-- Flight card -->
      <tr><td style="padding:24px 36px 8px;">
        <div style="font-family:'Segoe UI',sans-serif;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#A17433;font-weight:700;margin-bottom:6px;">✈ Flight</div>
        <div style="font-family:'Segoe UI',sans-serif;font-size:18px;font-weight:600;color:#1F2226;">${safe(flightLine)}</div>
        ${flightMeta ? `<div style="font-family:'Segoe UI',sans-serif;font-size:13px;color:#6A604D;margin-top:4px;">${safe(flightMeta)}</div>` : ''}
        <div style="margin-top:10px;display:flex;align-items:baseline;gap:10px;">
          <span style="font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:600;color:#1F2226;">€${Math.round(f.totalPrice || 0)}</span>
          <span style="font-family:'Segoe UI',sans-serif;font-size:11px;color:#A17433;">${safe(f.bookingPartner || 'partner')}</span>
        </div>
        ${f.bookingUrl ? `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px;">
          <tr><td style="background:#1F2226;border-radius:6px;">
            <a href="${safe(f.bookingUrl)}" style="display:inline-block;padding:12px 22px;color:#F5EFE0;font-family:'Segoe UI',sans-serif;font-size:14px;font-weight:600;text-decoration:none;">Rezerviši let →</a>
          </td></tr>
        </table>` : ''}
      </td></tr>

      <!-- Hotel card -->
      <tr><td style="padding:18px 36px 8px;border-top:1px solid #E4D9BC;">
        <div style="font-family:'Segoe UI',sans-serif;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#A17433;font-weight:700;margin-bottom:6px;">🏨 Stay</div>
        <div style="font-family:'Segoe UI',sans-serif;font-size:18px;font-weight:600;color:#1F2226;">${safe(h.name || '?')}${stars ? ' <span style="color:#D9A94A;font-size:13px;">' + stars + '</span>' : ''}</div>
        ${h.neighborhood ? `<div style="font-family:'Segoe UI',sans-serif;font-size:13px;color:#6A604D;margin-top:4px;">${safe(h.neighborhood)}</div>` : ''}
        <div style="margin-top:10px;display:flex;align-items:baseline;gap:10px;">
          <span style="font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:600;color:#1F2226;">€${Math.round(h.priceTotal || 0)}</span>
          ${h.nights ? `<span style="font-family:'Segoe UI',sans-serif;font-size:11px;color:#6A604D;">${h.nights} ${h.nights === 1 ? 'noć' : 'noći'}</span>` : ''}
        </div>
        ${h.bookingUrl ? `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px;">
          <tr><td style="background:transparent;border:1px solid #1F2226;border-radius:6px;">
            <a href="${safe(h.bookingUrl)}" style="display:inline-block;padding:12px 22px;color:#1F2226;font-family:'Segoe UI',sans-serif;font-size:14px;font-weight:600;text-decoration:none;">Rezerviši hotel →</a>
          </td></tr>
        </table>` : ''}
      </td></tr>

      <!-- Total -->
      <tr><td style="padding:22px 36px;border-top:1px solid #E4D9BC;background:#1F2226;color:#F5EFE0;">
        <div style="font-family:'Segoe UI',sans-serif;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#D9A94A;font-weight:700;text-align:center;margin-bottom:4px;">Total</div>
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:36px;font-weight:500;text-align:center;color:#D9A94A;">€${Math.round(trip.grandTotal || 0)}</div>
        <div style="font-family:'Segoe UI',sans-serif;font-size:11px;color:rgba(245,239,224,0.6);text-align:center;margin-top:4px;">tripId · <span style="font-family:'JetBrains Mono',monospace;color:#D9A94A;">${safe(trip.tripId)}</span></div>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:22px 36px;text-align:center;font-family:'Segoe UI',sans-serif;font-size:12px;color:#6A604D;line-height:1.6;">
        Pitanja? Pisi nam na <a href="mailto:podrska@letto.live" style="color:#A17433;text-decoration:none;">podrska@letto.live</a>.<br>
        SIAL Consulting d.o.o. · Brežice, Slovenija · <a href="https://letto.live" style="color:#A17433;text-decoration:none;">letto.live</a>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

function buildMixEmailText(trip, originName, destName, dateRange) {
  const f = trip.flight || {};
  const h = trip.hotel || {};
  const lines = [];
  lines.push(`Letto Mix · ${originName} → ${destName}`);
  lines.push(dateRange);
  lines.push('');
  lines.push('FLIGHT');
  lines.push(`  ${[f.airline, f.flightNumber].filter(Boolean).join(' ')}`);
  if (f.depart) lines.push(`  ${f.depart} · ${f.duration || ''}`);
  lines.push(`  €${Math.round(f.totalPrice || 0)} · ${f.bookingPartner || 'partner'}`);
  if (f.bookingUrl) lines.push(`  Rezerviši: ${f.bookingUrl}`);
  lines.push('');
  lines.push('HOTEL');
  lines.push(`  ${h.name || ''} ${h.stars ? '★'.repeat(h.stars) : ''}`);
  if (h.neighborhood) lines.push(`  ${h.neighborhood}`);
  lines.push(`  €${Math.round(h.priceTotal || 0)} · ${h.nights || 0} noći`);
  if (h.bookingUrl) lines.push(`  Rezerviši: ${h.bookingUrl}`);
  lines.push('');
  lines.push(`TOTAL: €${Math.round(trip.grandTotal || 0)}`);
  lines.push(`tripId: ${trip.tripId}`);
  lines.push('');
  lines.push('Pitanja? podrska@letto.live · letto.live');
  return lines.join('\n');
}

async function sendMixConfirmationEmail(trip) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[mix-email] RESEND_API_KEY missing — skipping email send (trip=' + trip.tripId + ')');
    return { ok: false, reason: 'no_api_key' };
  }
  if (!trip.userEmail) {
    console.warn('[mix-email] no userEmail on trip', trip.tripId);
    return { ok: false, reason: 'no_email' };
  }

  const sender = await resolveResendSender(apiKey);
  const f = trip.flight || {};
  const route = trip.route || {};
  const origin = route.origin || '?';
  const dest = route.dest || '?';
  const dateRange = fmtDateRangeForEmail(f.depart, f.return);
  const subj = `Tvoj Letto Mix · ${origin} → ${dest}${dateRange ? ' · ' + dateRange : ''}`;

  const html = buildMixEmailHtml({ trip, originName: origin, destName: dest, dateRange });
  const text = buildMixEmailText(trip, origin, dest, dateRange);

  const body = {
    from: sender.from,
    to: [trip.userEmail],
    subject: subj,
    html,
    text,
    tags: [
      { name: 'tripId', value: String(trip.tripId).slice(0, 64) },
      { name: 'product', value: 'mix-aimix' }
    ]
  };
  if (sender.replyTo) body.reply_to = sender.replyTo;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('[mix-email] Resend HTTP', r.status, JSON.stringify(j).slice(0, 300));
      return { ok: false, status: r.status, body: j };
    }
    console.log('[mix-email] sent ·', trip.userEmail, '· id=' + (j.id || '?') + ' · trip=' + trip.tripId);
    return { ok: true, id: j.id };
  } catch (e) {
    console.error('[mix-email] send failed:', e.message);
    return { ok: false, reason: e.message };
  }
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
      // Subscription activated OR one-time AI Mix unlock
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
        const tier = session.metadata?.tier;

        if (!email) break;

        // One-time AI Mix unlock (€7.99) — flag user + persist the bought trip
        // as a purchasedMixes record (C-1 · Mix kao proizvod, faza 1).
        if (tier === 'aimix' || session.mode === 'payment') {
          const lowerEmail = email.toLowerCase();
          const paidAt = new Date().toISOString();

          await db.collection('letto_subscribers').doc(lowerEmail).set({
            email: lowerEmail,
            stripeCustomerId: customerId,
            aimixUnlocked: true,
            aimixUnlockedAt: paidAt,
            aimixSessionId: session.id
          }, { merge: true });

          // Resolve pending mix snapshot → purchasedMixes record.
          const pendingMixId = session.metadata?.pendingMixId;
          let tripId = null;
          if (pendingMixId) {
            try {
              const snap = await db.collection('pendingMixes').doc(pendingMixId).get();
              if (snap.exists) {
                const { snapshot } = snap.data();
                const f = snapshot?.flight?.selected || {};
                const h = snapshot?.hotel?.selected || {};
                const sp = snapshot?.searchParams || {};
                const adults = sp.adults || 1;
                const children = sp.children || 0;
                const infants = sp.infants || 0;
                const flightTotal = Math.round(f.totalPrice || f.priceNum || 0);
                const hotelTotal = Math.round(h.priceTotal || 0);
                const grandTotal = flightTotal + hotelTotal;
                tripId = pendingMixId; // reuse short hex as the canonical trip ID

                const tripDoc = {
                  tripId,
                  userEmail: lowerEmail,
                  stripeSessionId: session.id,
                  paidAt,
                  // C-2: route fields denormalized for email subject + display
                  route: {
                    origin: (f.origin || sp.origin_iata || '').toUpperCase(),
                    dest: (f.dest || sp.destination_iata || '').toUpperCase()
                  },
                  flight: {
                    airline: f.airline || null,
                    flightNumber: f.flightNumber || null,
                    depart: f.depart || sp.depart_date || null,
                    return: f.ret || sp.return_date || null,
                    duration: f.duration || null,
                    stops: typeof f.stops === 'number' ? f.stops : null,
                    totalPrice: flightTotal,
                    bookingUrl: f.bookingUrl || null,
                    bookingPartner: f.bookingPartner || null
                  },
                  hotel: {
                    name: h.name || null,
                    stars: h.stars || null,
                    neighborhood: h.neighborhood || null,
                    nights: h.nights || null,
                    pricePerNight: h.pricePerNight || null,
                    priceTotal: hotelTotal,
                    bookingUrl: h.bookingUrl || null,
                    hotellookId: h.id || null
                  },
                  pax: { adults, children, infants },
                  grandTotal,
                  currency: f.currency || h.currency || 'EUR',
                  status: 'paid',
                  pendingMixId
                };
                await db.collection('purchasedMixes').doc(tripId).set(tripDoc);

                // cleanup pending doc
                await db.collection('pendingMixes').doc(pendingMixId).delete().catch(() => {});

                console.log(`[LETTO] purchasedMixes/${tripId} written · ${lowerEmail} · €${grandTotal}`);

                // C-2: Resend confirmation email — must await on Vercel (the
                // function freezes once 200 is sent back to Stripe, killing
                // any in-flight fire-and-forget fetches). Adds ~300-700ms
                // to webhook latency; Stripe accepts up to 30s.
                try {
                  await sendMixConfirmationEmail(tripDoc);
                } catch (e) {
                  console.error('[LETTO] mix email send failed:', e.message);
                }
              } else {
                console.warn(`[LETTO] pendingMixId=${pendingMixId} not found in pendingMixes — purchase recorded without snapshot`);
              }
            } catch (e) {
              console.error('[LETTO] purchasedMixes write failed:', e.message);
            }
          } else {
            console.log(`[LETTO] aimix paid without pendingMixId (legacy or external) · ${lowerEmail}`);
          }

          console.log(`[LETTO] AI Mix unlocked: ${lowerEmail}${tripId ? ' · trip=' + tripId : ''}`);
          break;
        }

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
