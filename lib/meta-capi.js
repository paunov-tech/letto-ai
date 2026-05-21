// lib/meta-capi.js — Meta Conversions API helper (v28)
//
// Fires server-side conversion events to Meta Pixel 2513952102382319,
// bypassing client-side ad-blockers and recovering attribution lost to them
// (typically 20-40% of conversions, depending on audience).
//
// Setup (one-time, per environment):
//   1. Events Manager (business.facebook.com/events_manager) → your Pixel
//      → Settings → Conversions API → "Generate access token". Copy it.
//   2. Set env var:  META_CAPI_ACCESS_TOKEN=EAAxxxxx
//   3. (Optional, for testing) META_CAPI_TEST_EVENT_CODE=TESTxxxxx so events
//      route to Events Manager → Test Events tab without polluting production
//      stats. Generate the code in that tab.
//
// Without the access token, sendCapiEvent() is a silent no-op (single warning
// logged per process). Never throws — callers stay safe.
//
// Reference: https://developers.facebook.com/docs/marketing-api/conversions-api

import crypto from 'node:crypto';

const PIXEL_ID = '2513952102382319';   // mirrors public/pixel.js
const GRAPH_VERSION = 'v18.0';
let warnedMissingToken = false;

function sha256Lower(s) {
  return crypto.createHash('sha256').update(String(s).toLowerCase().trim()).digest('hex');
}

/**
 * Send a server-side conversion event to Meta.
 *
 * @param {string} eventName  Standard event name (e.g. 'Subscribe', 'Purchase', 'Lead')
 *                            or a custom name. Standard names are required for some
 *                            Meta optimizations (CAPI for Ads → Subscribe / Purchase).
 * @param {object} opts
 *   @param {string} [opts.email]            Plain-text email. SHA-256-hashed before send.
 *   @param {string} [opts.eventSourceUrl]   Canonical URL the event "happened on" (e.g. /me).
 *   @param {string} [opts.eventId]          Stable id for dedup with any client-side fbq fire of the SAME event.
 *   @param {number} [opts.value]            Transaction amount (major units, e.g. 29.00).
 *   @param {string} [opts.currency]         ISO 4217 (e.g. 'EUR').
 *   @param {string} [opts.actionSource]     'website' (default) | 'system_generated' | 'email' | ...
 *   @param {string} [opts.externalId]       Stable user id. v32 · sent RAW (unhashed) so it
 *                                           matches the browser Pixel's letto_ext_id, which
 *                                           fbevents.js sends unhashed. Hashing one side breaks the join.
 *   @param {string} [opts.fbp]              _fbp cookie value · links the server event to the browser session.
 *   @param {string} [opts.fbc]              _fbc cookie value · links to the originating ad click.
 *   @param {string} [opts.clientIpAddress]  Visitor IP (NOT the webhook caller's).
 *   @param {string} [opts.clientUserAgent]  Visitor User-Agent.
 *   @param {string} [opts.contentName]      custom_data.content_name (e.g. 'mix_finish').
 *   @param {string} [opts.contentCategory]  custom_data.content_category (e.g. 'subscription').
 * @returns {Promise<{ok:boolean, status?:number, eventsReceived?:number, error?:string, skipped?:string}>}
 */
export async function sendCapiEvent(eventName, opts = {}) {
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!token) {
    if (!warnedMissingToken) {
      console.warn('[meta-capi] META_CAPI_ACCESS_TOKEN not set · CAPI fires skipped (single warning per process)');
      warnedMissingToken = true;
    }
    return { ok: false, skipped: 'no-token' };
  }
  if (!eventName) return { ok: false, error: 'missing eventName' };

  const userData = {};
  if (opts.email)      userData.em = [sha256Lower(opts.email)];
  // external_id · RAW (v32). The browser Pixel sends letto_ext_id unhashed;
  // fbevents.js does not hash external_id. Both sides must carry the identical
  // value for Meta to join the browser PageView to this server-side event.
  if (opts.externalId) userData.external_id = [String(opts.externalId)];
  // fbp / fbc / ip / ua · transmitted as-is — Meta does not hash these. fbp+fbc
  // are the strongest attribution link (browser session ↔ ad click ↔ conversion).
  if (opts.fbp)             userData.fbp = String(opts.fbp);
  if (opts.fbc)             userData.fbc = String(opts.fbc);
  if (opts.clientIpAddress) userData.client_ip_address = String(opts.clientIpAddress);
  if (opts.clientUserAgent) userData.client_user_agent = String(opts.clientUserAgent);

  const event = {
    event_name:    eventName,
    event_time:    Math.floor(Date.now() / 1000),
    action_source: opts.actionSource || 'website',
    user_data:     userData
  };
  if (opts.eventSourceUrl) event.event_source_url = opts.eventSourceUrl;
  if (opts.eventId)        event.event_id         = opts.eventId;
  if (opts.value != null && opts.currency) {
    event.custom_data = { value: Number(opts.value), currency: String(opts.currency).toUpperCase() };
  }
  // v33 · content_name / content_category enrich Lead + InitiateCheckout so
  // Meta can segment (mix_finish vs hotel_finish, premium_premium, …).
  if (opts.contentName || opts.contentCategory) {
    event.custom_data = event.custom_data || {};
    if (opts.contentName)     event.custom_data.content_name     = String(opts.contentName);
    if (opts.contentCategory) event.custom_data.content_category = String(opts.contentCategory);
  }

  const body = { data: [event] };
  const testCode = process.env.META_CAPI_TEST_EVENT_CODE;
  if (testCode) body.test_event_code = testCode;

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`;
  try {
    const r = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body)
    });
    const text = await r.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (_) {}
    if (!r.ok) {
      console.error('[meta-capi] non-ok response', r.status, text.slice(0, 300));
      return { ok: false, status: r.status, error: (parsed && parsed.error && parsed.error.message) || text.slice(0, 200) };
    }
    return { ok: true, status: r.status, eventsReceived: parsed && parsed.events_received };
  } catch (err) {
    console.error('[meta-capi] fetch threw', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * v32 · Extract Meta attribution params from a checkout request, shaped for
 * Stripe Checkout Session metadata (string values, capped at Stripe's 500-char
 * limit). The browser sends fbp/fbc/extId in the POST body; ip/ua come from the
 * request headers — the user's browser hits the checkout endpoint directly, so
 * those headers ARE the visitor's (unlike the later Stripe webhook call).
 *
 * The Stripe webhook later reads session.metadata.{fbp,fbc,letto_ext_id,fb_ip,
 * fb_ua} and forwards them to sendCapiEvent — that's the browser↔server link.
 *
 * @param {object} req   The checkout request (for headers).
 * @param {object} body  The parsed request body (JSON or form).
 * @returns {object}     Metadata fragment · only keys whose values are present.
 */
export function metaCheckoutMetadata(req, body) {
  body = body || {};
  const out = {};
  const cap = (v) => String(v).slice(0, 500);
  if (body.fbp)   out.fbp = cap(body.fbp);
  if (body.fbc)   out.fbc = cap(body.fbc);
  if (body.extId) out.letto_ext_id = cap(body.extId);
  const xff = req && req.headers && req.headers['x-forwarded-for'];
  const ip = xff ? String(xff).split(',')[0].trim() : '';
  if (ip) out.fb_ip = cap(ip);
  const ua = req && req.headers && req.headers['user-agent'];
  if (ua) out.fb_ua = cap(ua);
  return out;
}
