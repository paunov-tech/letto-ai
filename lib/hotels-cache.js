// Firestore-backed cache layer for /api/hotels-search.
//
// Why Firestore instead of Vercel CDN cache?
//   - Vercel CDN cache is per-deploy, evicts on redeploy.
//   - Cold-start hits (new Lambda) bypass any in-process Map.
//   - Different sessions hitting the same destination/date combo all need
//     to share the result, not re-pull from RapidAPI 4× in 5min.
//
// Key shape: dest_checkIn_checkOut_adults_children — destination is the
// 3-letter IATA code so we don't cache against the SPA's regionId (which
// is provider-specific).
//
// TTL: 6h. Hotel prices fluctuate but for the same room/date pair within
// 6h the variation is small enough that returning a slightly-stale price
// list is far better UX than a 27s wait.
//
// Cleanup: lazy. Stale rows just don't get returned (cachedAt check). A
// future daily cron could prune them; for now Firestore storage is cheap
// and the TTL prevents unbounded growth meaningfully (max ~routes×dates).

import { FieldValue } from 'firebase-admin/firestore';

const TTL_MS = 6 * 60 * 60 * 1000;

export function buildCacheKey({ destination, checkIn, checkOut, adults, children }) {
  return `${destination}_${checkIn}_${checkOut}_${adults}_${children || 0}`;
}

export async function getCached(db, key) {
  try {
    const doc = await db.collection('hotels_search_cache').doc(key).get();
    if (!doc.exists) return null;
    const data = doc.data();
    const cachedAtMs = data.cachedAt && typeof data.cachedAt.toMillis === 'function'
      ? data.cachedAt.toMillis()
      : 0;
    if (!cachedAtMs || Date.now() - cachedAtMs > TTL_MS) return null;
    return {
      hotels: data.hotels || [],
      destination: data.destination || null,
      ageMs: Date.now() - cachedAtMs
    };
  } catch (e) {
    console.warn('[hotels-cache] read failed:', e.message);
    return null; // never let cache failures block live calls
  }
}

export async function setCached(db, key, payload) {
  try {
    await db.collection('hotels_search_cache').doc(key).set({
      hotels: payload.hotels || [],
      destination: payload.destination || null,
      cachedAt: FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.warn('[hotels-cache] write failed:', e.message);
  }
}
