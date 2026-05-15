// lib/email-leads.js — DOI confirmation email for /api/lead-capture
// signups. Mirrors the Resend fetch pattern used by api/recovery.js's
// sendRecoveryEmail — same env vars (RESEND_API_KEY, RESEND_FROM), same
// tagged-send approach.
//
// Single-purpose helper; lives in lib/ so api/lead-capture.js can import
// it cleanly without an inter-route dependency.

const FROM = process.env.RESEND_FROM || 'Letto <info@letto.live>';
const SITE = process.env.VITE_SITE_URL || 'https://letto.live';

/**
 * Send a double-opt-in confirmation email containing a one-shot confirm
 * link. The link points at /api/lead-confirm?token=<token>, which flips
 * the email_leads doc from pending → confirmed.
 *
 * Returns { ok: true } on Resend 2xx, { ok: false, status|reason } on
 * any failure. Callers should NOT surface failure to the end-user —
 * /api/lead-capture's response shape is intentionally same-shape
 * regardless of email-send success so a transient Resend outage doesn't
 * leak signal or block UX.
 */
export async function sendLeadDoiEmail(toEmail, confirmToken, dealId) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[email-leads] RESEND_API_KEY missing — cannot send DOI');
    return { ok: false, reason: 'no_resend_key' };
  }
  if (!confirmToken) {
    return { ok: false, reason: 'no_token' };
  }

  const confirmUrl = `${SITE}/api/lead-confirm?token=${encodeURIComponent(confirmToken)}`;
  const manageUrl = `${SITE}/me`;

  const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;color:#1F2226;max-width:560px;margin:0 auto;padding:24px;background:#FAF6EA;">
  <h2 style="font-family:'Fraunces',serif;color:#A17433;margin:0 0 16px;font-weight:500;letter-spacing:-0.01em;">Jedan klik do potvrde</h2>
  <p style="font-size:15px;line-height:1.55;color:#3A3F47;">Hvala što si zatražio LETTO dnevne deal-ove. Klikni dugme ispod da potvrdiš pretplatu — bez toga ne šaljemo ništa.</p>
  <p style="margin:28px 0;">
    <a href="${confirmUrl}" style="display:inline-block;background:#1F2226;color:#FAF6EA;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;letter-spacing:0.02em;">Potvrdi pretplatu →</a>
  </p>
  <p style="font-size:12.5px;color:#6A604D;line-height:1.55;">Ako dugme ne radi, kopiraj link u browser: <br><span style="word-break:break-all;font-family:'JetBrains Mono',monospace;font-size:11.5px;">${confirmUrl}</span></p>
  <p style="font-size:13px;color:#6A604D;margin-top:32px;">Ako nisi tražio ovaj email, samo ga ignoriši — pretplata nikad ne počinje bez tvoje potvrde.</p>
  <hr style="border:none;border-top:1px solid #E4D9BC;margin:28px 0 14px;">
  <p style="font-size:11.5px;color:#94a3b8;line-height:1.6;">
    LETTO.LIVE · SIAL Consulting d.o.o. · Brežice, Slovenia<br>
    Upravljaj pretplatom: <a href="${manageUrl}" style="color:#A17433;text-decoration:none;">${manageUrl}</a>
  </p>
</body></html>`;

  const text = [
    'Jedan klik do potvrde',
    '',
    'Hvala što si zatražio LETTO dnevne deal-ove. Klikni link ispod da potvrdiš pretplatu — bez toga ne šaljemo ništa.',
    '',
    'Potvrdi pretplatu:',
    confirmUrl,
    '',
    'Ako nisi tražio ovaj email, ignoriši ga — pretplata nikad ne počinje bez tvoje potvrde.',
    '',
    '— LETTO.LIVE · SIAL Consulting d.o.o. · Brežice, Slovenia',
    'Upravljaj pretplatom: ' + manageUrl,
  ].join('\n');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [toEmail],
        subject: 'Potvrdi pretplatu na LETTO dnevne dealove',
        html,
        text,
        tags: [
          { name: 'flow', value: 'lead-doi' },
          ...(dealId ? [{ name: 'deal_id', value: String(dealId).slice(0, 64) }] : []),
        ],
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error('[email-leads] Resend HTTP', r.status, body.slice(0, 240));
      return { ok: false, status: r.status };
    }
    return { ok: true };
  } catch (e) {
    console.error('[email-leads] Resend fetch threw:', e.message);
    return { ok: false, reason: e.message };
  }
}
