// api/save-mix.js — Persist an in-progress Mix before the Stripe redirect.
//
// results.html POSTs the user's letto_mix_state_v2 here right before checkout.
// We mint a 16-char hex tripId, transform the mix-builder state into the
// canonical "trip" shape that api/trip.js + trip.html already render, and
// store it in pending_mixes/{tripId} with a 24h expiry.
//
// The Stripe webhook (checkout.session.completed) promotes pending_mixes →
// purchasedMixes once payment lands. If the user never pays, the doc expires.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { withSentry } from '../lib/sentry-backend.js';
import { applyRateLimit, getClientIp } from '../lib/rate-limit.js';
import crypto from 'crypto';

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

const MAX_MIX_BYTES = 50 * 1024;   // 50KB cap on the posted state
const EXPIRY_HOURS = 24;
const IP_HASH_SALT = process.env.LEAD_IP_HASH_SALT || 'letto-dev-only-not-prod';

// letto_mix_state_v2 (flight.selected / hotel.selected / searchParams) → the
// flat "trip" shape api/trip.js returns and trip.html renders. The only real
// rename is flight.selected.ret → flight.return. Returns null if the mix is
// incomplete (no selected flight OR no selected hotel).
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // 5 saves / IP / minute — a user retrying checkout a few times is fine;
  // scripted abuse against pending_mixes is not.
  if (applyRateLimit(req, res, { scope: 'save-mix', limit: 5, windowMs: 60_000 })) return;

  const { mix } = req.body || {};
  if (!mix || typeof mix !== 'object') {
    return res.status(400).json({ error: 'invalid_body' });
  }

  if (JSON.stringify(mix).length > MAX_MIX_BYTES) {
    return res.status(413).json({ error: 'mix_too_large', maxBytes: MAX_MIX_BYTES });
  }

  const tripDoc = toTripShape(mix);
  if (!tripDoc) {
    // A persistable Mix needs BOTH a selected flight and a selected hotel.
    return res.status(400).json({ error: 'empty_mix' });
  }

  const tripId = crypto.randomBytes(8).toString('hex');   // 16-char hex
  const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 3600 * 1000);
  const ipHash = crypto.createHash('sha256')
    .update(getClientIp(req) + IP_HASH_SALT).digest('hex').slice(0, 16);

  try {
    await db.collection('pending_mixes').doc(tripId).set({
      // `mix` is already trip-shaped — the webhook spreads it straight into
      // purchasedMixes/{tripId}, which api/trip.js + trip.html then render.
      mix: { tripId, ...tripDoc },
      createdAt: new Date(),
      expiresAt,
      status: 'pending',
      ipHash,
    });
    return res.status(200).json({ ok: true, tripId, expiresAt: expiresAt.toISOString() });
  } catch (e) {
    console.error('[save-mix] Firestore write failed:', e.message);
    return res.status(500).json({ error: 'write_failed' });
  }
}

export default withSentry('save-mix', handler);
