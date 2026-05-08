// api/viator-activities.js — Top 3 Viator activities for a destination city.
// Cached 24h in Firestore letto_viator_activities. Affiliate-tracked URLs (mcid+pid auto-applied
// by Viator based on API key).
//
// GET /api/viator-activities?city=Istanbul  →  { city, activities: [{title, fromPrice, currency, rating, reviews, url, image}] }

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

// Hardcoded city → Viator destinationId. Resolved from /partner/destinations once.
// Add new entries when LETTO covers more cities.
const CITY_TO_DEST_ID = {
  istanbul: 585,
  rome: 511,
  paris: 479,
  barcelona: 562,
  dubai: 828,
  halkidiki: 27334,
  male: 4672,        // Maldives (country-level)
  maldives: 4672,
  tokyo: 334,
  capetown: 318,
  'cape town': 318,
  belgrade: 22817,
  athens: 496,
  amsterdam: 525,
  vienna: 454,
  budapest: 499,
  prague: 462,
  berlin: 488,
  munich: 487,
  zadar: 22433,
  thessaloniki: 568,
  palma: 612,
  valletta: 5258,
  antalya: 939,
  split: 5198,
  tivat: 22813,
  'tel aviv': 808,
  london: 737,
  lisbon: 504,
  phuket: 297
};

const CACHE_TTL_HOURS = 24;

function cityKey(city) {
  return String(city || '').toLowerCase().trim();
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

async function fetchViator(destId) {
  const r = await fetch('https://api.viator.com/partner/products/search', {
    method: 'POST',
    headers: {
      'exp-api-key': process.env.VIATOR_API_KEY,
      'Accept': 'application/json;version=2.0',
      'Accept-Language': 'en-US',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filtering: { destination: String(destId) },
      sorting: { sort: 'TRAVELER_RATING', order: 'DESCENDING' },
      pagination: { start: 1, count: 3 },
      currency: 'EUR'
    })
  });
  if (!r.ok) throw new Error(`Viator ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  return (d.products || []).map(p => {
    const reviews = p.reviews || {};
    const cover = (p.images || []).flatMap(img => img.variants || []).find(v => v.width && v.width >= 360 && v.width <= 540);
    return {
      productCode: p.productCode,
      title: p.title,
      rating: reviews.combinedAverageRating || null,
      reviewsCount: reviews.totalReviews || 0,
      fromPrice: p.pricing?.summary?.fromPrice || null,
      currency: p.pricing?.currency || 'EUR',
      durationMinutes: p.duration?.fixedDurationInMinutes || null,
      url: p.productUrl,
      image: cover?.url || (p.images?.[0]?.variants?.[0]?.url) || null
    };
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=21600');

  const city = (req.query.city || '').trim();
  if (!city) return res.status(400).json({ error: 'city_required' });

  const key = cityKey(city);
  const destId = CITY_TO_DEST_ID[key];
  if (!destId) {
    return res.status(404).json({ error: 'city_not_mapped', city, hint: 'add to CITY_TO_DEST_ID in api/viator-activities.js' });
  }

  const docId = slugify(city);
  const ref = db.collection('letto_viator_activities').doc(docId);

  // Check cache
  try {
    const snap = await ref.get();
    if (snap.exists) {
      const data = snap.data();
      const cachedAt = new Date(data.cachedAt);
      const ageHours = (Date.now() - cachedAt.getTime()) / 3_600_000;
      if (ageHours < CACHE_TTL_HOURS && Array.isArray(data.activities) && data.activities.length > 0) {
        return res.status(200).json({ city, destId, activities: data.activities, cached: true, cacheAgeHours: Math.round(ageHours * 10) / 10 });
      }
    }
  } catch (e) {
    console.error('[viator] cache read fail:', e.message);
  }

  // Fresh fetch
  try {
    const activities = await fetchViator(destId);
    await ref.set({
      city,
      destId,
      activities,
      cachedAt: new Date().toISOString()
    });
    return res.status(200).json({ city, destId, activities, cached: false });
  } catch (e) {
    console.error('[viator] fetch fail:', e.message);
    return res.status(502).json({ error: 'viator_unreachable', detail: e.message });
  }
}
