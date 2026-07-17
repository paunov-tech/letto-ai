import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { withSentry } from '../lib/sentry-backend.js';
import { applyRateLimit, getClientIp } from '../lib/rate-limit.js';
import { authorizeAdminRequest } from '../lib/admin-auth.js';
import {
  bestAlertTotal,
  evaluatePriceAlert,
  normalizePriceAlertSearch,
  normalizeTargetTotal
} from '../lib/price-alerts.js';

if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: 'letto-ai',
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
  }) });
}

const db = getFirestore();
const SITE = process.env.VITE_SITE_URL || 'https://letto.live';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_RE = /^[A-Za-z0-9-]{8,80}$/;
const RUN_ACTION = 'run-price-alerts';

function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

function alertId(email, search) {
  return crypto.createHash('sha256').update(`${email}|${JSON.stringify(search)}`).digest('hex').slice(0, 40);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

async function sendEmail({ to, subject, html, text, tags }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: 'resend_unavailable' };
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Letto <info@letto.live>', to: [to], subject, html, text,
        tags: [{ name: 'flow', value: 'price-alert' }, ...(tags || [])]
      })
    });
    return response.ok ? { ok: true } : { ok: false, status: response.status };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

async function sendConfirmation(alert) {
  const route = `${alert.search.origin} → ${alert.search.dest}`;
  const confirm = `${SITE}/api/price-alerts?action=confirm&token=${encodeURIComponent(alert.confirmToken)}`;
  const cancel = `${SITE}/api/price-alerts?action=unsubscribe&token=${encodeURIComponent(alert.manageToken)}`;
  return sendEmail({
    to: alert.email,
    subject: `Potvrdi Letto price alert · ${route}`,
    text: `Potvrdi price alert za ${route}: ${confirm}\n\nAko ovo nisi tražio, otkaži: ${cancel}`,
    html: `<p>Potvrdi price alert za <strong>${escapeHtml(route)}</strong>.</p><p><a href="${confirm}">Potvrdi alert →</a></p><p>Ako ovo nisi tražio: <a href="${cancel}">otkaži alert</a>.</p>`,
    tags: [{ name: 'kind', value: 'confirmation' }]
  });
}

async function sendDropEmail(alert, currentTotal, evaluation) {
  const route = `${alert.search.origin} → ${alert.search.dest}`;
  const searchUrl = `${SITE}/results?origin_iata=${alert.search.origin}&destination_iata=${alert.search.dest}&depart_date=${alert.search.from}&return_date=${alert.search.to}&adults=${alert.search.pax}&children=0`;
  const cancel = `${SITE}/api/price-alerts?action=unsubscribe&token=${encodeURIComponent(alert.manageToken)}`;
  const reason = evaluation.reason === 'target_reached' ? 'Tvoj ciljni iznos je dostignut.' : `Ukupan iznos je pao za €${Math.round(evaluation.drop || 0)}.`;
  return sendEmail({
    to: alert.email,
    subject: `Letto price alert · ${route} sada od €${currentTotal}`,
    text: `${reason}\nNajbolja potvrđena kombinacija je sada od €${currentTotal}.\nProveri: ${searchUrl}\n\nOdjava: ${cancel}`,
    html: `<p>${escapeHtml(reason)}</p><p>Najbolja potvrđena kombinacija za <strong>${escapeHtml(route)}</strong> je sada od <strong>€${currentTotal}</strong>.</p><p><a href="${searchUrl}">Otvori aktuelne kombinacije →</a></p><p><a href="${cancel}">Odjavi price alert</a></p>`,
    tags: [{ name: 'kind', value: 'drop' }]
  });
}

function page(message) {
  return `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Letto price alert</title><main style="font-family:system-ui;max-width:560px;margin:12vh auto;padding:28px"><h1>LETTO</h1><p>${escapeHtml(message)}</p><p><a href="${SITE}">Nazad na letto.live</a></p></main>`;
}

async function confirm(req, res) {
  const token = String(req.query.token || '');
  if (!TOKEN_RE.test(token)) return res.status(200).send(page('Link nije validan ili je već iskorišćen.'));
  const snap = await db.collection('price_alerts').where('confirmToken', '==', token).where('status', '==', 'pending_confirmation').limit(1).get();
  if (snap.empty) return res.status(200).send(page('Link nije validan ili je već iskorišćen.'));
  await snap.docs[0].ref.update({ status: 'active', confirmToken: null, confirmedAt: FieldValue.serverTimestamp(), nextCheckAt: new Date() });
  return res.status(200).send(page('Price alert je potvrđen. Javljamo se samo kad cena smisleno padne ili dostigne tvoj cilj.'));
}

async function unsubscribe(req, res) {
  const token = String(req.query.token || '');
  if (!TOKEN_RE.test(token)) return res.status(200).send(page('Link nije validan ili je već iskorišćen.'));
  const snap = await db.collection('price_alerts').where('manageToken', '==', token).where('status', 'in', ['active', 'pending_confirmation']).limit(1).get();
  if (snap.empty) return res.status(200).send(page('Alert je već odjavljen ili link nije validan.'));
  await snap.docs[0].ref.update({ status: 'cancelled', cancelledAt: FieldValue.serverTimestamp(), confirmToken: null });
  return res.status(200).send(page('Price alert je odjavljen.'));
}

async function observe(ref, data) {
  const params = new URLSearchParams({
    origin: data.search.origin, dest: data.search.dest, from: data.search.from, to: data.search.to,
    pax: String(data.search.pax), preference: data.search.preference, flex: '1', selfTransfer: '1'
  });
  let currentTotal = null;
  try {
    const response = await fetch(`${SITE}/api/live-mix-search?${params}`, {
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout ? AbortSignal.timeout(45_000) : undefined
    });
    const payload = response.ok ? await response.json() : {};
    currentTotal = bestAlertTotal(payload);
  } catch (_) {}
  const now = new Date();
  const evaluation = evaluatePriceAlert({
    previousTotal: data.lastObservedTotal, currentTotal, targetTotal: data.targetTotal, targetReachedAt: data.targetReachedAt
  });
  let emailSent = false;
  if (evaluation.notify) {
    const sent = await sendDropEmail(data, currentTotal, evaluation);
    emailSent = sent.ok;
  }
  await ref.collection('observations').add({ total: currentTotal, checkedAt: now, reason: evaluation.reason, notificationSent: emailSent });
  const update = { lastCheckedAt: now, nextCheckAt: new Date(now.getTime() + 4 * 3600_000) };
  if (currentTotal) update.lastObservedTotal = currentTotal;
  if (emailSent) {
    update.lastNotifiedTotal = currentTotal;
    update.lastNotifiedAt = now;
    if (evaluation.reason === 'target_reached') update.targetReachedAt = now;
  }
  await ref.update(update);
  return { checked: Boolean(currentTotal), notified: emailSent, reason: evaluation.reason };
}

async function run(req, res) {
  if (!authorizeAdminRequest(req).ok) return res.status(401).json({ error: 'unauthorized' });
  const snap = await db.collection('price_alerts').where('status', '==', 'active').limit(12).get();
  const now = Date.now();
  const due = snap.docs.filter(doc => {
    const next = doc.data().nextCheckAt;
    const ms = next?.toMillis ? next.toMillis() : Date.parse(next);
    return !Number.isFinite(ms) || ms <= now;
  }).slice(0, 2);
  const results = await Promise.all(due.map(doc => observe(doc.ref, doc.data()).catch(() => ({ checked: false, notified: false, reason: 'failed' }))));
  return res.status(200).json({ ok: true, scanned: due.length, checked: results.filter(item => item.checked).length, notified: results.filter(item => item.notified).length });
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const action = String(req.query.action || '');
  if (req.method === 'GET' && action === 'confirm') return confirm(req, res);
  if (req.method === 'GET' && action === 'unsubscribe') return unsubscribe(req, res);
  if (req.method === 'GET' && action === RUN_ACTION) return run(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (applyRateLimit(req, res, { scope: 'price-alerts', limit: 3, windowMs: 60 * 60_000 })) return;

  const email = cleanEmail(req.body?.email);
  const search = normalizePriceAlertSearch(req.body?.search);
  const targetTotal = normalizeTargetTotal(req.body?.targetTotal);
  if (!email || !search) return res.status(400).json({ error: 'invalid_alert' });
  if (req.body?.targetTotal !== '' && req.body?.targetTotal != null && !targetTotal) return res.status(400).json({ error: 'invalid_target_total' });

  const id = alertId(email, search);
  const ref = db.collection('price_alerts').doc(id);
  const existing = await ref.get();
  const old = existing.exists ? existing.data() : null;
  if (old?.status === 'active') {
    await ref.update({ targetTotal, updatedAt: FieldValue.serverTimestamp() });
    return res.status(200).json({ status: 'active' });
  }
  const alert = {
    email, search, targetTotal, status: 'pending_confirmation',
    confirmToken: crypto.randomUUID(), manageToken: old?.manageToken || crypto.randomUUID(),
    ipHash: crypto.createHash('sha256').update(getClientIp(req) + (process.env.LEAD_IP_HASH_SALT || 'letto-dev-only-not-prod')).digest('hex').slice(0, 16),
    createdAt: old?.createdAt || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), confirmedAt: null
  };
  await ref.set(alert, { merge: true });
  const sent = await sendConfirmation(alert);
  if (!sent.ok) console.warn('[price-alerts] confirmation delivery unavailable:', sent.reason || sent.status || 'unknown');
  return res.status(200).json({ status: 'confirmation_required' });
}

export default withSentry('price-alerts', handler);
