// api/lead-confirm.js — Double-opt-in confirmation endpoint.
//
// GET /api/lead-confirm?token=<uuid>
//   - Looks up email_leads where confirmToken=<token> AND status='pending'
//   - On match: atomic flip to status='confirmed', confirmedAt=serverTimestamp,
//     confirmToken=null (token is one-shot, can never be re-used)
//   - Renders a minimal Letto-styled HTML thank-you page (success) or an
//     "already used / invalid" page (token miss). Both return HTTP 200 so
//     a curious crawler can't probe valid-token vs invalid-token via
//     status code.
//
// No Stripe auth — the token is the credential. Token validation is
// regex-only (alphanumeric + hyphen, 8-64 chars), so malformed query
// strings short-circuit before the Firestore round-trip.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { withSentry } from '../lib/sentry-backend.js';

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

const TOKEN_RE = /^[A-Za-z0-9-]{8,64}$/;

function renderPage(kind) {
  const success = kind === 'success';
  const title = success
    ? 'Pretplata potvrđena · LETTO'
    : 'Token nije validan · LETTO';
  const heading = success
    ? 'Hvala, pretplata potvrđena.'
    : 'Token nije validan ili je već iskorišćen.';
  const body = success
    ? 'Šaljemo ti 1–3 deal-a nedeljno. Bez spama, jedan klik odjava u svakom email-u.'
    : 'Možda je link već iskorišćen, ili je istekao. Vrati se na sajt i pošalji email ponovo ako želiš.';
  return `<!doctype html>
<html lang="sr-Latn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Instrument+Serif:ital@0;1&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root { --paper:#FAF6EA; --line:#E4D9BC; --ink:#1F2226; --muted:#6A604D; --gold:#A17433; --gold-light:#D9A94A; --burgundy:#7C1E29; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'IBM Plex Sans',-apple-system,sans-serif; background:linear-gradient(180deg,var(--paper) 0%,#F5EFE0 100%); color:var(--ink); min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
  .card { background:var(--paper); border:1px solid var(--line); border-radius:14px; padding:36px 32px; max-width:520px; width:100%; box-shadow:0 16px 40px -16px rgba(10,13,17,0.1); text-align:center; }
  .badge { display:inline-block; font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:0.28em; text-transform:uppercase; color:${success ? 'var(--gold)' : 'var(--burgundy)'}; font-weight:600; margin-bottom:16px; }
  h1 { font-family:'Fraunces',serif; font-weight:500; font-size:clamp(24px,5vw,32px); line-height:1.15; letter-spacing:-0.01em; margin-bottom:14px; }
  h1 .italic { font-style:italic; color:var(--gold); }
  p { font-family:'Instrument Serif',serif; font-style:italic; font-size:17px; line-height:1.5; color:var(--muted); margin-bottom:24px; }
  .cta { display:inline-block; background:var(--ink); color:var(--paper); text-decoration:none; padding:13px 28px; border-radius:8px; font-family:'IBM Plex Sans',sans-serif; font-weight:600; font-size:14px; letter-spacing:0.01em; }
  .cta:hover { background:#3A3F47; }
  .footer { margin-top:28px; font-size:11.5px; color:#94a3b8; font-family:'IBM Plex Sans',sans-serif; line-height:1.6; }
  .footer a { color:var(--gold); text-decoration:none; }
</style>
</head>
<body>
  <div class="card">
    <div class="badge">${success ? 'Pretplata · Potvrđena' : 'Pretplata · Greška'}</div>
    <h1>${heading}</h1>
    <p>${body}</p>
    <a class="cta" href="https://letto.live/">letto.live →</a>
    <div class="footer">LETTO.LIVE · SIAL Consulting d.o.o. · Brežice, Slovenia</div>
  </div>
</body>
</html>`;
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('method_not_allowed');
  }

  const token = (req.query.token || '').toString();
  if (!TOKEN_RE.test(token)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(renderPage('invalid'));
  }

  try {
    const snap = await db.collection('email_leads')
      .where('confirmToken', '==', token)
      .where('status', '==', 'pending')
      .limit(1).get();

    if (snap.empty) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).send(renderPage('invalid'));
    }

    const docRef = snap.docs[0].ref;
    await docRef.update({
      status: 'confirmed',
      confirmedAt: FieldValue.serverTimestamp(),
      confirmToken: null,
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(renderPage('success'));
  } catch (err) {
    console.error('[lead-confirm] Firestore lookup/update failed:', err.message);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(renderPage('invalid'));
  }
}

export default withSentry('lead-confirm', handler);
