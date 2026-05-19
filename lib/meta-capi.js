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
 *   @param {string} [opts.externalId]       Stable downstream user id (e.g. Stripe customer id). SHA-256-hashed.
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
  if (opts.externalId) userData.external_id = [sha256Lower(opts.externalId)];

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
