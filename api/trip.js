// api/trip.js — Public read of a paid trip itinerary by tripId.
//
// Auth model: tripId itself is the bearer token (16-char hex = 64 bits of
// entropy, similar to Stripe receipt URLs). Anyone with the link can see
// the trip — fine for non-financial summary data. Not indexed (page sets
// noindex), but if leaked, no payment or PII beyond email is exposed.
//
// Used by /trip/{tripId} static page (Vercel rewrite → /trip.html?id=X).

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const id = (req.query.id || '').toString().trim();
  // tripId is 16-char hex; reject anything else early to avoid Firestore probes
  if (!/^[a-f0-9]{16}$/.test(id)) {
    return res.status(400).json({ error: 'invalid_trip_id' });
  }

  // Cache 60s edge to absorb refresh / share traffic; private since the
  // tripId itself is the access key.
  res.setHeader('Cache-Control', 'private, max-age=60');

  try {
    const snap = await db.collection('purchasedMixes').doc(id).get();
    if (!snap.exists) return res.status(404).json({ error: 'not_found' });
    const d = snap.data();

    // Strip nothing for now — tripId is the access token, the user already
    // has the email + tripId combo if they reach here.
    return res.status(200).json({
      tripId: d.tripId,
      tier: d.tier || 'value',
      route: d.route || null,
      paidAt: d.paidAt || null,
      flight: d.flight || null,
      hotel: d.hotel || null,
      pax: d.pax || null,
      grandTotal: d.grandTotal || 0,
      currency: d.currency || 'EUR',
      status: d.status || 'paid'
    });
  } catch (e) {
    console.error('[/api/trip] error:', e.message);
    return res.status(500).json({ error: 'internal' });
  }
}
