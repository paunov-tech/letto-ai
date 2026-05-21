// api/meta-event.js — Server-side mirror of the client Pixel's conversion
// events (Lead, InitiateCheckout). v33 · audit GAP 4.
//
// public/pixel.js lettoTrackPixel() fires the event in the browser via fbq
// AND beacons here with a shared event_id. This endpoint re-fires the same
// event server-side via the Conversions API. Ad-blockers kill the browser
// path for ~20-40% of visitors; the server path survives, so Meta still
// receives the conversion. The shared event_id lets Meta dedup the pair into
// one event (no double-counting).
//
// Guards: POST only · same-origin referer · per-IP rate limit · event
// whitelist. No DB writes — it only relays to CAPI.

import { withSentry } from '../lib/sentry-backend.js';
import { applyRateLimit, getClientIp } from '../lib/rate-limit.js';
import { sendCapiEvent } from '../lib/meta-capi.js';

// Only conversion events the client Pixel actually dual-fires. PageView is
// deliberately NOT here — it's high-volume, browser-only by design.
const ALLOWED_EVENTS = new Set(['Lead', 'InitiateCheckout']);

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // Same-origin only — beacons originate from letto.live pages.
  const referer = req.headers.referer || '';
  if (referer && !referer.startsWith('https://letto.live')) {
    return res.status(403).json({ error: 'forbidden_origin' });
  }

  // 120 events / IP / minute — generous for real clicking, caps spam.
  if (applyRateLimit(req, res, { scope: 'meta-event', limit: 120, windowMs: 60_000 })) return;

  const body = await readJson(req);
  const event = String(body.event || '');
  if (!ALLOWED_EVENTS.has(event)) {
    return res.status(400).json({ error: 'event_not_allowed' });
  }

  // event_source_url is attacker-controlled — pin it to our origin.
  const sourceUrl = (typeof body.sourceUrl === 'string' && body.sourceUrl.startsWith('https://letto.live'))
    ? body.sourceUrl
    : 'https://letto.live/';

  const result = await sendCapiEvent(event, {
    eventId:          body.eventId ? String(body.eventId) : undefined,
    email:            body.email || undefined,
    externalId:       body.extId || undefined,
    value:            (body.value != null && body.value !== '') ? Number(body.value) : undefined,
    currency:         body.currency || undefined,
    contentName:      body.contentName || undefined,
    contentCategory:  body.contentCategory || undefined,
    fbp:              body.fbp || undefined,
    fbc:              body.fbc || undefined,
    clientIpAddress:  getClientIp(req),
    clientUserAgent:  req.headers['user-agent'] || undefined,
    eventSourceUrl:   sourceUrl
  });

  if (result.ok) {
    console.log(`[meta-event] CAPI ${event} sent · eventsReceived=${result.eventsReceived}`);
  } else if (result.skipped !== 'no-token') {
    console.warn(`[meta-event] CAPI ${event} failed`, result.error);
  }

  // Fire-and-forget from the browser (sendBeacon ignores the response).
  // Always 200 past the guards — a non-200 would only noise the console.
  return res.status(200).json({ ok: !!result.ok, skipped: result.skipped || null });
}

export default withSentry('meta-event', handler);
