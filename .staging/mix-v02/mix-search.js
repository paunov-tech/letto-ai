// api/mix-search.js — Mix V0.1 search proxy.
// Validates input → forwards to n8n Workflow 05 webhook → returns mix payload.
// Analytics writes to Firestore mix_searches collection (fire-and-forget).
//
// Env:
//   N8N_MIX_WEBHOOK_URL — Hetzner n8n webhook URL (Workflow 05)
//   FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY — already set
//
// Set MIX_USE_MOCK=1 to bypass n8n and serve api/mix-mock.js (dev/preview only).

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { buildMockPayload } from './mix-mock.js';

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

const IATA_RE = /^[A-Z]{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function badRequest(res, msg) {
  return res.status(400).json({ error: 'bad_request', message: msg });
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const src = req.method === 'POST' ? (req.body || {}) : req.query;
  const from = String(src.from || '').toUpperCase().trim();
  const to = String(src.to || '').toUpperCase().trim();
  const depart = String(src.depart || '').trim();
  const ret = String(src.return || src.ret || '').trim();
  const pax = Math.max(1, Math.min(parseInt(src.pax, 10) || 2, 9));
  const currency = String(src.currency || 'EUR').toUpperCase();

  if (!IATA_RE.test(from)) return badRequest(res, 'invalid `from` IATA');
  if (!IATA_RE.test(to)) return badRequest(res, 'invalid `to` IATA');
  if (!DATE_RE.test(depart)) return badRequest(res, 'invalid `depart` (YYYY-MM-DD)');
  if (!DATE_RE.test(ret)) return badRequest(res, 'invalid `return` (YYYY-MM-DD)');
  if (depart >= ret) return badRequest(res, '`return` must be after `depart`');

  const searchId = randomUUID();
  const startedAt = Date.now();

  const isProd = process.env.VERCEL_ENV === 'production';
  const useMock = process.env.MIX_USE_MOCK === '1' ||
                  (!process.env.N8N_MIX_WEBHOOK_URL && !isProd);

  if (!useMock && !process.env.N8N_MIX_WEBHOOK_URL) {
    return res.status(503).json({ error: 'not_configured', message: 'N8N_MIX_WEBHOOK_URL missing' });
  }

  let data, cacheHit = false;
  try {
    if (useMock) {
      data = buildMockPayload({ from, to, depart, ret, pax });
    } else {
      const upstreamRes = await fetch(process.env.N8N_MIX_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, depart, return: ret, pax, currency }),
        signal: AbortSignal.timeout(15000)
      });
      if (!upstreamRes.ok) throw new Error(`upstream_${upstreamRes.status}`);
      data = await upstreamRes.json();
    }
    cacheHit = !!data.cache_hit;
  } catch (err) {
    console.error('[MIX] upstream error:', err.message);
    logSearch(searchId, { from, to, depart, return: ret, pax }, false, null, Date.now() - startedAt, err.message);
    return res.status(502).json({
      error: 'upstream_failed',
      message: 'Pretraga trenutno nije dostupna. Pokušaj ponovo za par sekundi.'
    });
  }

  // Analytics write (fire-and-forget)
  logSearch(searchId, { from, to, depart, return: ret, pax }, true, {
    cache_hit: cacheHit,
    flights: (data.flights || []).length,
    hotels: (data.hotels || []).length
  }, Date.now() - startedAt, null);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ search_id: searchId, ...data });
}

function logSearch(searchId, query, success, results, latencyMs, errorMsg) {
  // Fire-and-forget; do not block response
  db.collection('mix_searches').doc(searchId).set({
    search_id: searchId,
    timestamp: FieldValue.serverTimestamp(),
    query,
    success,
    results: results || null,
    latency_ms: latencyMs,
    error: errorMsg || null,
    selected_flight_id: null,
    selected_hotel_id: null,
    affiliate_clicks: { flight: 0, hotel: 0 }
  }).catch((e) => console.error('[MIX] logSearch error:', e.message));
}
