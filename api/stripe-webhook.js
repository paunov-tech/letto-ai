// api/stripe-webhook.js — Handles Stripe subscription events
// - checkout.session.completed → mark user premium + send Telegram invite
// - customer.subscription.deleted → revoke premium access

import Stripe from 'stripe';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import PDFDocument from 'pdfkit';

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

  // 1) Explicit override via env wins — full From header, e.g.
  //    RESEND_FROM="Letto Mix <mix@example.com>"
  if (process.env.RESEND_FROM) {
    __resendSenderCache = {
      from: process.env.RESEND_FROM,
      replyTo: process.env.RESEND_REPLY_TO || null
    };
    console.log('[mix-email] sender from RESEND_FROM env:', __resendSenderCache.from);
    return __resendSenderCache;
  }

  // 2) Discover via Resend /v1/domains; prefer letto.live → sial.com →
  //    first verified domain. Logs the verified list so debugging is trivial.
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
    const verified = (j.data || []).filter(d => d.status === 'verified').map(d => d.name);
    console.log('[mix-email] verified Resend domains:', verified.join(', ') || '(none)');

    if (verified.includes('letto.live')) {
      __resendSenderCache = { from: 'Letto Mix <mix@letto.live>', replyTo: null };
    } else if (verified.includes('sial.com')) {
      __resendSenderCache = { from: 'Letto Mix <mix@sial.com>', replyTo: 'noreply@letto.live' };
    } else if (verified.length > 0) {
      // Fall back to whatever IS verified — better deliverability beats
      // brand-perfect sender if the user hasn't verified letto.live yet.
      const d = verified[0];
      __resendSenderCache = { from: `Letto Mix <mix@${d}>`, replyTo: 'podrska@letto.live' };
      console.log('[mix-email] using first verified domain:', d);
    } else {
      console.warn('[mix-email] NO verified domains in Resend — send will fail. Add domain at https://resend.com/domains.');
      __resendSenderCache = { from: 'Letto Mix <mix@letto.live>', replyTo: null };
    }
    return __resendSenderCache;
  } catch (e) {
    console.warn('[mix-email] domains lookup failed:', e.message);
    __resendSenderCache = { from: 'Letto Mix <mix@letto.live>', replyTo: null };
    return __resendSenderCache;
  }
}

// Final 2 · tier display + color helpers (Budget green / Value blue / Lux gold)
function tierColors(tier) {
  if (tier === 'budget') return { bg: '#1B7A3E', fg: '#E8F4EE', label: 'BUDGET' };
  if (tier === 'lux')    return { bg: '#D9A94A', fg: '#1F2226', label: 'LUX' };
  return                  { bg: '#2563AB', fg: '#E0EBF7', label: 'VALUE' }; // default value
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
  const tCol = tierColors(trip.tier);

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F5EFE0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1F2226;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5EFE0;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FAF6EA;border:1px solid #E4D9BC;border-radius:14px;overflow:hidden;">

      <!-- Header -->
      <tr><td style="padding:32px 36px 22px;text-align:center;border-bottom:1px solid #E4D9BC;">
        <div style="margin-bottom:10px;">
          <span style="display:inline-block;padding:4px 12px;background:${tCol.bg};color:${tCol.fg};font-family:'Segoe UI',sans-serif;font-size:10px;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;border-radius:99px;">${tCol.label}</span>
          <span style="margin-left:6px;font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:#A17433;font-weight:600;vertical-align:middle;">Letto Mix · paid</span>
        </div>
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

      <!-- Online view CTA -->
      <tr><td style="padding:18px 36px 0;text-align:center;">
        <a href="https://letto.live/trip/${safe(trip.tripId)}" style="display:inline-block;padding:11px 24px;border:1px solid #1F2226;border-radius:6px;color:#1F2226;font-family:'Segoe UI',sans-serif;font-size:13px;font-weight:600;text-decoration:none;">Otvori online →</a>
      </td></tr>

      <!-- Attachment hint -->
      <tr><td style="padding:12px 36px 0;text-align:center;font-family:'Segoe UI',sans-serif;font-size:12px;color:#6A604D;">
        📎 PDF priložen · <em style="color:#A17433;">letto-mix-${safe(trip.tripId)}.pdf</em>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:18px 36px 22px;text-align:center;font-family:'Segoe UI',sans-serif;font-size:12px;color:#6A604D;line-height:1.6;">
        Pitanja? Pisi nam na <a href="mailto:podrska@letto.live" style="color:#A17433;text-decoration:none;">podrska@letto.live</a>.<br>
        SIAL Consulting d.o.o. · Brežice, Slovenija · <a href="https://letto.live" style="color:#A17433;text-decoration:none;">letto.live</a>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

// C-3: build a one-page PDF itinerary for the trip. Returns Buffer.
// Uses pdfkit's built-in Helvetica/Times so we don't ship font files.
// Cyrillic / Latin Serbian special chars (čšđž) work via WinAnsi encoding
// of the standard fonts when present; falls back gracefully otherwise.
function buildMixPdfBuffer(trip, originName, destName, dateRange) {
  return new Promise((resolve, reject) => {
    try {
      const f = trip.flight || {};
      const h = trip.hotel || {};
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 56, bottom: 56, left: 56, right: 56 },
        info: {
          Title: `Letto Mix · ${trip.tripId}`,
          Author: 'LETTO.LIVE · SIAL Consulting',
          Subject: `${originName} → ${destName} · ${dateRange}`,
          Producer: 'Letto Mix v1'
        }
      });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const COL = { ink: '#1F2226', muted: '#6A604D', gold: '#A17433', goldBright: '#D9A94A', burgundy: '#7C1E29', line: '#E4D9BC', paper: '#FAF6EA' };
      const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      // pdfkit's bundled standard fonts (Helvetica) only support WinAnsi
      // encoding, so we ASCII-ify the few special chars used elsewhere on
      // the brand (arrows, stars). Brand-perfect typography needs a TTF
      // bundle, which we can add later.
      const ARR = '->';
      const STAR = '*';

      // Header band — solid ink with tier-colored pill
      const tCol = tierColors(trip.tier);
      doc.rect(0, 0, doc.page.width, 100).fill(COL.ink);

      // Tier pill (top-left)
      const pillW = 60, pillH = 16;
      doc.roundedRect(doc.page.margins.left, 26, pillW, pillH, 8).fill(tCol.bg);
      doc.fillColor(tCol.fg).font('Helvetica-Bold').fontSize(8.5).text(tCol.label, doc.page.margins.left, 30, { width: pillW, align: 'center', characterSpacing: 1.6 });
      // "LETTO MIX · PAID" eyebrow next to pill
      doc.fillColor(COL.goldBright).font('Helvetica-Bold').fontSize(10).text('LETTO MIX  ·  PAID', doc.page.margins.left + pillW + 10, 30, { characterSpacing: 2.4 });

      doc.fillColor('#FAF6EA').font('Helvetica').fontSize(22).text(`${originName} ${ARR} ${destName}`, doc.page.margins.left, 52);
      doc.fillColor('#D9CFB4').fontSize(11).text(dateRange || '', doc.page.margins.left, 80);
      doc.fillColor(COL.goldBright).font('Helvetica').fontSize(9).text(`tripId: ${trip.tripId}`, doc.page.margins.left, 80, { width: W, align: 'right' });

      // Reset to body
      doc.fillColor(COL.ink).font('Helvetica');
      doc.y = 134;

      // Section: Flight
      doc.fillColor(COL.gold).font('Helvetica-Bold').fontSize(9).text('FLIGHT', { characterSpacing: 2.4 });
      doc.moveDown(0.4);
      doc.fillColor(COL.ink).font('Helvetica-Bold').fontSize(15).text([f.airline, f.flightNumber].filter(Boolean).join(' ') || 'Flight');
      const flightMetaParts = [
        f.depart || '',
        f.duration || '',
        f.stops === 0 ? 'non-stop' : f.stops === 1 ? '1 stop' : f.stops > 1 ? `${f.stops} stops` : ''
      ].filter(Boolean);
      doc.fillColor(COL.muted).font('Helvetica').fontSize(10).text(flightMetaParts.join('  ·  '));
      doc.moveDown(0.3);
      doc.fillColor(COL.ink).font('Helvetica-Bold').fontSize(20).text(`€${Math.round(f.totalPrice || 0)}`, { continued: true });
      doc.fillColor(COL.muted).font('Helvetica').fontSize(10).text(`   ${f.bookingPartner || 'partner'}`);
      if (f.bookingUrl) {
        doc.moveDown(0.3);
        doc.fillColor(COL.gold).font('Helvetica').fontSize(9).text('Rezerviši: ' + f.bookingUrl, { link: f.bookingUrl, underline: true, lineBreak: true });
      }

      // Divider
      doc.moveDown(0.8);
      const dy = doc.y;
      doc.strokeColor(COL.line).lineWidth(1).moveTo(doc.page.margins.left, dy).lineTo(doc.page.width - doc.page.margins.right, dy).stroke();
      doc.moveDown(0.6);

      // Section: Hotel
      doc.fillColor(COL.gold).font('Helvetica-Bold').fontSize(9).text('STAY', { characterSpacing: 2.4 });
      doc.moveDown(0.4);
      const stars = (h.stars > 0 && h.stars <= 5) ? '  ' + STAR.repeat(h.stars) : '';
      doc.fillColor(COL.ink).font('Helvetica-Bold').fontSize(15).text((h.name || 'Hotel') + stars);
      const hotelMetaParts = [h.neighborhood || '', h.nights ? `${h.nights} noći` : ''].filter(Boolean);
      doc.fillColor(COL.muted).font('Helvetica').fontSize(10).text(hotelMetaParts.join('  ·  '));
      doc.moveDown(0.3);
      doc.fillColor(COL.ink).font('Helvetica-Bold').fontSize(20).text(`€${Math.round(h.priceTotal || 0)}`, { continued: true });
      if (h.pricePerNight) {
        doc.fillColor(COL.muted).font('Helvetica').fontSize(10).text(`   €${Math.round(h.pricePerNight)} / noć`);
      } else {
        doc.text('');
      }
      if (h.bookingUrl) {
        doc.moveDown(0.3);
        doc.fillColor(COL.gold).font('Helvetica').fontSize(9).text('Rezerviši: ' + h.bookingUrl, { link: h.bookingUrl, underline: true, lineBreak: true });
      }

      // Total band
      doc.moveDown(1.2);
      const ty = doc.y;
      doc.rect(doc.page.margins.left, ty, W, 70).fill(COL.ink);
      doc.fillColor(COL.goldBright).font('Helvetica-Bold').fontSize(9).text('TOTAL', doc.page.margins.left, ty + 12, { width: W, align: 'center', characterSpacing: 2.4 });
      doc.fillColor(COL.goldBright).font('Helvetica-Bold').fontSize(28).text(`€${Math.round(trip.grandTotal || 0)}`, doc.page.margins.left, ty + 26, { width: W, align: 'center' });
      doc.y = ty + 90;

      // Pax line
      const pax = trip.pax || {};
      const paxParts = [];
      if (pax.adults) paxParts.push(`${pax.adults} ${pax.adults === 1 ? 'osoba' : 'osobe'}`);
      if (pax.children) paxParts.push(`${pax.children} dec.`);
      if (pax.infants) paxParts.push(`${pax.infants} beb.`);
      doc.fillColor(COL.muted).font('Helvetica').fontSize(10).text(paxParts.join(' · '), { align: 'center' });

      // Footer
      doc.moveDown(2);
      const fy = doc.y;
      doc.strokeColor(COL.line).lineWidth(0.5).moveTo(doc.page.margins.left, fy).lineTo(doc.page.width - doc.page.margins.right, fy).stroke();
      doc.moveDown(0.6);
      doc.fillColor(COL.muted).font('Helvetica').fontSize(8.5);
      doc.text(`Plaćeno preko Stripe · ${trip.paidAt ? new Date(trip.paidAt).toUTCString() : ''}`, { align: 'center' });
      doc.moveDown(0.2);
      doc.text('Pitanja: podrska@letto.live · letto.live · SIAL Consulting d.o.o., Brežice', { align: 'center' });
      doc.moveDown(0.2);
      doc.fillColor('#A89E80').fontSize(8).text(`tripId · ${trip.tripId}`, { align: 'center' });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
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
  lines.push('');
  lines.push(`Otvori online: https://letto.live/trip/${trip.tripId}`);
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
  const tierLabel = trip.tier ? (trip.tier.charAt(0).toUpperCase() + trip.tier.slice(1)) : 'Mix';
  const subj = `Tvoj Letto ${tierLabel} Mix · ${origin} → ${dest}${dateRange ? ' · ' + dateRange : ''}`;

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

  // C-3: PDF itinerary attachment. Failure to generate = log + still send
  // the email without attachment, never block delivery.
  try {
    const pdfBuffer = await buildMixPdfBuffer(trip, origin, dest, dateRange);
    body.attachments = [{
      filename: `letto-mix-${trip.tripId}.pdf`,
      content: pdfBuffer.toString('base64')
    }];
    console.log('[mix-email] PDF attached · ' + pdfBuffer.length + ' bytes · trip=' + trip.tripId);
  } catch (e) {
    console.error('[mix-email] PDF generation failed (sending without attachment):', e.message);
  }

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

                // Final 2 · tier denormalized. Prefer snapshot.tier (top-level,
                // current frontend) and fall back to flight.selected.tier (older
                // snapshots) before defaulting to 'value'.
                const rawTier = snapshot?.tier || f.tier;
                const priceTier = (rawTier === 'budget' || rawTier === 'lux') ? rawTier : 'value';

                const tripDoc = {
                  tripId,
                  userEmail: lowerEmail,
                  stripeSessionId: session.id,
                  paidAt,
                  tier: priceTier,
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
