// api/cj-flights.js — Public read endpoint for CJ travel inventory.
// Query letto_cj_inventory by origin/destination/maxPrice. Returns sorted by price.
//
// Examples:
//   GET /api/cj-flights?origin=BEG                — all BEG flights, cheapest first
//   GET /api/cj-flights?origin=BEG&destination=BCN — specific route
//   GET /api/cj-flights?origin=BEG&maxPrice=300    — under €300

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
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');

  const origin = (req.query.origin || '').toUpperCase().slice(0, 3);
  const destination = (req.query.destination || '').toUpperCase().slice(0, 3);
  const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : null;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);

  try {
    let q = db.collection('letto_cj_inventory');
    if (origin) q = q.where('originCode', '==', origin);
    if (destination) q = q.where('destinationCode', '==', destination);
    if (maxPrice) q = q.where('priceAmount', '<=', maxPrice);

    const sortField = maxPrice || origin ? 'priceAmount' : 'priceAmount';
    const snap = await q.orderBy(sortField, 'asc').limit(limit).get();
    const flights = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    return res.status(200).json({
      flights,
      count: flights.length,
      filters: { origin: origin || null, destination: destination || null, maxPrice: maxPrice || null },
      affiliateActive: flights.some(f => f.affiliateLink) || false
    });
  } catch (e) {
    console.error('[CJ flights]', e.message);
    return res.status(500).json({ error: 'internal', detail: e.message });
  }
}
