// api/save-mix-premium.js — Premium "Završi miks" Mix delivery path.
//
// Sibling of api/save-mix.js, but for an ALREADY-subscribed user who is NOT
// going through Stripe checkout.
//
// WHY THIS EXISTS: the whole Mix-delivery chain (save-mix → pending_mixes →
// webhook → purchasedMixes → /trip → confirmation email) is wired only to the
// Stripe checkout path. A premium user finishing a Mix in results.html never
// checks out, so they got zero delivery artefacts. This endpoint writes
// purchasedMixes/{tripId} DIRECTLY (no pending_mixes, no Stripe), then fires
// the confirmation email + Telegram premium-channel post.
//
// AUTH: a valid premium Stripe session id (cs_…) via the X-Letto-Session
// header or { sessionId } body — verifyPremiumSession resolves it to an email
// and confirms premium / mixUnlocked. Same trust model as /api/me.
//
// DECISIONS (Commit 5 · confirmed by Miroslav 2026-05-17):
//  · Unlimited Mixes per user — no monthly cap. The 10/IP/min rate limit
//    below is the only abuse guard.
//  · Confirmation email (PDF + HTML) is sendMixConfirmationEmail's own job —
//    its body/shape is not touched here.
//  · /trip/{tripId} stays a public bearer link; no auth gating added.
//  · purchasedMixes is the only collection written. `source:'premium-mix'`
//    distinguishes these from checkout-born `subscription-mix` docs.
//
// The (purchasedMixes: userEmail ASC, paidAt DESC) composite index is enabled.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { withSentry } from '../lib/sentry-backend.js';
import { applyRateLimit } from '../lib/rate-limit.js';
import { verifyPremiumSession, getSessionIdFromRequest } from '../lib/auth.js';
import { sendMixConfirmationEmail } from './stripe-webhook.js';
import { postMixToPremiumChannel } from '../lib/telegram-mix-post.js';

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

const SITE = process.env.VITE_SITE_URL || 'https://letto.live';
const MAX_MIX_BYTES = 50 * 1024;

// letto_mix_state_v2 (flight.selected / hotel.selected / searchParams) → the
// flat "trip" shape api/trip.js + trip.html render. Mirrors toTripShape in
// api/save-mix.js, plus a hotel.image passthrough for the Telegram sendPhoto
// path. save-mix.js's copy is intentionally left untouched (non-premium path).
// Returns null if the mix is incomplete (no selected flight OR hotel).
function toTripShape(state) {
  const fs = (state.flight && state.flight.selected) || null;
  const hs = (state.hotel && state.hotel.selected) || null;
  if (!fs || !hs) return null;
  const sp = state.searchParams || {};
  return {
    tier: (fs.tier === 'budget' || fs.tier === 'lux') ? fs.tier : 'value',
    route: {
      origin: fs.origin || sp.origin_iata || '',
      dest: fs.dest || sp.destination_iata || '',
    },
    flight: {
      airline: fs.airline || '',
      flightNumber: fs.flightNumber || '',
      departureTime: fs.departureTime || '',
      duration: fs.duration || '',
      stops: fs.stops || 0,
      depart: fs.depart || '',
      return: fs.ret || '',
      nights: fs.nights || 0,
      totalPrice: fs.totalPrice || 0,
      bookingPartner: fs.bookingPartner || '',
      bookingUrl: fs.bookingUrl || '',
    },
    hotel: {
      name: hs.name || '',
      stars: hs.stars || 0,
      guestRating: hs.guestRating || null,
      neighborhood: hs.neighborhood || '',
      nights: hs.nights || 0,
      priceTotal: hs.priceTotal || 0,
      pricePerNight: hs.pricePerNight || 0,
      bookingPartner: hs.bookingPartner || null,
      bookingUrl: hs.bookingUrl || null,
      // mix-builder stores the hotel image as `photo` (results.html
      // selectHotel); surfaced as `image` for the Telegram sendPhoto branch.
      image: hs.photo || hs.image || hs.thumbnail || null,
    },
    pax: {
      adults: Number(sp.adults) || 1,
      children: Number(sp.children) || 0,
      infants: 0,
    },
    currency: fs.currency || hs.currency || 'EUR',
    grandTotal: Math.round((Number(fs.totalPrice) || 0) + (Number(hs.priceTotal) || 0)),
  };
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Letto-Session');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // Abuse guard only — unlimited Mixes per user by design (Q1).
  if (applyRateLimit(req, res, { scope: 'save-mix-premium', limit: 10, windowMs: 60_000 })) return;

  // ── Auth — must be a verified premium subscriber ──
  let sessionId = getSessionIdFromRequest(req);
  if (!sessionId && req.body && typeof req.body.sessionId === 'string') {
    sessionId = req.body.sessionId;
  }
  const auth = await verifyPremiumSession(sessionId);
  // results.html unlocks Stage 3 on `letto-premium` OR `letto-mix-unlocked`,
  // so accept either signal here. (Legacy subscribers — e.g. pre-2026-05-10
  // docs — may have premium but no aimixUnlocked; premium alone is enough.)
  if (!auth.email || !(auth.premium || auth.mixUnlocked)) {
    return res.status(401).json({ error: 'not_premium' });
  }
  const email = auth.email;

  // ── Validate the posted Mix ──
  const { mix } = req.body || {};
  if (!mix || typeof mix !== 'object') {
    return res.status(400).json({ error: 'invalid_body' });
  }
  if (JSON.stringify(mix).length > MAX_MIX_BYTES) {
    return res.status(413).json({ error: 'mix_too_large', maxBytes: MAX_MIX_BYTES });
  }
  const tripDoc = toTripShape(mix);
  if (!tripDoc) {
    return res.status(400).json({ error: 'empty_mix' }); // needs flight + hotel
  }

  const tripId = crypto.randomBytes(8).toString('hex'); // 16-char hex
  const tripUrl = `${SITE}/trip/${tripId}`;

  // ── Write purchasedMixes/{tripId} directly — same shape the webhook writes
  //    on the checkout path, minus the Stripe payment fields. ──
  try {
    await db.collection('purchasedMixes').doc(tripId).set({
      ...tripDoc,
      tripId,
      userEmail: email,
      stripeSessionId: sessionId,   // the auth session — provenance, not a payment
      paidAt: new Date(),
      status: 'paid',
      source: 'premium-mix',        // vs 'subscription-mix' from the checkout path
    });
  } catch (e) {
    console.error('[save-mix-premium] purchasedMixes write failed:', e.message);
    return res.status(500).json({ error: 'write_failed' });
  }

  // ── Delivery side-effects — best-effort, never fail the response. ──
  // The Mix is already saved; email + Telegram are bonus, not the contract.
  const trip = { ...tripDoc, tripId, userEmail: email };

  try {
    const mailRes = await sendMixConfirmationEmail(trip);
    if (!mailRes.ok) {
      console.warn('[save-mix-premium] confirmation email not ok:', mailRes.reason || JSON.stringify(mailRes.lastError));
    }
  } catch (e) {
    console.warn('[save-mix-premium] confirmation email threw:', e.message);
  }

  try {
    const tgRes = await postMixToPremiumChannel(trip, tripUrl);
    if (!tgRes.ok) {
      console.warn('[save-mix-premium] telegram post not ok:', tgRes.reason);
    }
  } catch (e) {
    console.warn('[save-mix-premium] telegram post threw:', e.message);
  }

  return res.status(200).json({ ok: true, tripId, tripUrl });
}

export default withSentry('save-mix-premium', handler);
