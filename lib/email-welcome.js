// lib/email-welcome.js — Premium welcome email via Resend.
//
// Replaces the SendGrid sendWelcomeEmail that lived in api/stripe-webhook.js.
// SendGrid rejected every send (HTTP 403 — noreply@letto.live was never a
// verified Sender Identity). Resend already has letto.live verified (the
// recovery / mix-confirmation / lead-DOI flows all send from it), so this
// consolidates onto a single ESP.
//
// Mirrors lib/email-leads.js: same RESEND_API_KEY / RESEND_FROM env, same
// fetch-to-Resend pattern, same { ok } / { ok:false, status|reason } return.

const FROM = process.env.RESEND_FROM || 'Letto <info@letto.live>';
const SITE = process.env.VITE_SITE_URL || 'https://letto.live';

/**
 * Send the premium welcome email.
 *   to          — subscriber email
 *   firstName   — optional; falls back to "putnik"
 *   inviteLink  — one-shot Telegram premium-channel invite (may be null)
 *   amountLabel — optional receipt amount, pre-formatted e.g. "9.99 EUR"
 *   dateLabel   — optional receipt date, pre-formatted e.g. "16.5.2026"
 *
 * Returns { ok:true } on Resend 2xx, { ok:false, status|reason } otherwise.
 * Never throws — the caller's retry wrapper treats a thrown error and a
 * falsy ok identically.
 */
export async function sendWelcomeEmail({ to, firstName, inviteLink, amountLabel, dateLabel, stripeSessionId, tripId }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[email-welcome] RESEND_API_KEY missing — cannot send');
    return { ok: false, reason: 'no_api_key' };
  }

  const safeName = (firstName || 'putnik').replace(/[<>&]/g, '');
  const meUrl = `${SITE}/me`;

  // Primary CTA branches on what the checkout produced:
  //   tripId + session → /trip/{tripId}?session=…  (the user's saved Mix)
  //   session only     → /me?session=…             (account; session pre-claimed)
  //   neither          → /me                        (legacy direct-subscribe)
  let primaryHref, primaryLabel;
  if (tripId && stripeSessionId) {
    primaryHref = `${SITE}/trip/${tripId}?session=${encodeURIComponent(stripeSessionId)}`;
    primaryLabel = 'Otvori svoj Mix';
  } else if (stripeSessionId) {
    primaryHref = `${meUrl}?session=${encodeURIComponent(stripeSessionId)}`;
    primaryLabel = 'Otvori svoj nalog';
  } else {
    primaryHref = meUrl;
    primaryLabel = 'Otvori svoje Premium dealove';
  }

  // Receipt line — only if the webhook passed amount/date.
  const receiptHtml = (amountLabel || dateLabel)
    ? `<div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:14px 16px;margin:18px 0;font-size:13.5px;color:#3A3F47;">
    <strong>LETTO Premium</strong> — mesečna pretplata${amountLabel ? `<br>Iznos: <strong>${amountLabel}</strong>` : ''}${dateLabel ? `<br>Datum: ${dateLabel}` : ''}
  </div>`
    : '';
  const telegramHtml = inviteLink
    ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin:18px 0;">
    <p style="margin:0 0 6px;font-weight:600;">🔑 Premium Telegram kanal</p>
    <p style="margin:0;"><a href="${inviteLink}" style="color:#b45309;word-break:break-all;">${inviteLink}</a></p>
    <p style="margin:6px 0 0;font-size:12.5px;color:#78716c;">Link važi 7 dana, jednokratan — sačuvaj ga.</p>
  </div>`
    : '';

  const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;color:#1F2226;max-width:560px;margin:0 auto;padding:24px;background:#FAF6EA;">
  <h2 style="font-family:'Fraunces',serif;color:#A17433;margin:0 0 12px;font-weight:500;">Dobrodošao u LETTO Premium 🎉</h2>
  <p style="font-size:15px;line-height:1.55;color:#3A3F47;">Zdravo <strong>${safeName}</strong>, hvala — tvoj Premium pristup je aktivan.</p>
  ${receiptHtml}
  <p style="margin:20px 0;">
    <a href="${primaryHref}" style="display:inline-block;background:#1F2226;color:#FAF6EA;text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:600;">${primaryLabel} →</a>
  </p>
  <p style="font-size:13.5px;line-height:1.55;color:#3A3F47;">Svi dealovi su otključani na <a href="${meUrl}" style="color:#A17433;">${meUrl}</a> — aviokompanija, vremena leta i booking linkovi.</p>
  <div style="border-left:3px solid #D9A94A;padding:6px 0 6px 14px;margin:18px 0;font-size:13px;color:#6A604D;">
    <strong>Drugi uređaj ili browser?</strong> Pristup je vezan za ovaj browser. Na <a href="${meUrl}" style="color:#A17433;">${meUrl}</a> klikni „Pošalji link na email" i dobićeš pristupni link gde god ti treba.
  </div>
  <p style="font-size:13.5px;line-height:1.55;color:#3A3F47;">Svaki Mix koji napraviš se čuva na <strong>letto.live/trip/&lt;id&gt;</strong> sa share linkom — možeš ga otvoriti ili poslati bilo kome.</p>
  ${telegramHtml}
  <hr style="border:none;border-top:1px solid #E4D9BC;margin:24px 0 14px;">
  <p style="font-size:12.5px;color:#6A604D;line-height:1.6;">
    Otkazivanje: na <a href="${meUrl}" style="color:#A17433;">${meUrl}</a> zatraži upravljanje pretplatom (Stripe portal) — otkaži kad god, pretplata radi do kraja perioda.<br>
    14-dnevni refund: samo odgovori na ovaj email.
  </p>
  <p style="font-size:11.5px;color:#94a3b8;margin-top:18px;">LETTO.LIVE · SIAL Consulting d.o.o. · Brežice, Slovenia</p>
</body></html>`;

  const text = [
    'Dobrodošao u LETTO Premium',
    '',
    `Zdravo ${safeName}, hvala — tvoj Premium pristup je aktivan.`,
    ...(amountLabel || dateLabel
      ? ['', 'LETTO Premium — mesečna pretplata',
         ...(amountLabel ? ['Iznos: ' + amountLabel] : []),
         ...(dateLabel ? ['Datum: ' + dateLabel] : [])]
      : []),
    '',
    primaryLabel + ':',
    primaryHref,
    '',
    'Drugi uređaj ili browser? Pristup je vezan za ovaj browser. Na ' + meUrl,
    'klikni "Pošalji link na email" i dobićeš pristupni link gde god ti treba.',
    '',
    'Svaki Mix koji napraviš se čuva na letto.live/trip/<id> sa share linkom.',
    ...(inviteLink ? ['', 'Premium Telegram kanal (važi 7 dana, jednokratan):', inviteLink] : []),
    '',
    'Otkazivanje: na ' + meUrl + ' zatraži upravljanje pretplatom (Stripe portal).',
    '14-dnevni refund: odgovori na ovaj email.',
    '',
    '— LETTO.LIVE · SIAL Consulting d.o.o. · Brežice, Slovenia',
  ].join('\n');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        reply_to: 'info@letto.live',
        subject: 'Dobrodošao u LETTO Premium · sve što treba da znaš',
        html,
        text,
        tags: [{ name: 'flow', value: 'premium-welcome' }],
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error('[email-welcome] Resend HTTP', r.status, body.slice(0, 240));
      return { ok: false, status: r.status, body: body.slice(0, 500) };
    }
    return { ok: true };
  } catch (e) {
    console.error('[email-welcome] Resend fetch threw:', e.message);
    return { ok: false, reason: e.message };
  }
}
