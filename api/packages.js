// api/packages.js — Public read endpoint for letto.live packages catalog.
//
// Two modes:
//   1) Listing (no filters):  GET /api/packages?tier=public&limit=20
//        → returns N most-recent published packages, ordered by metadata.createdAt DESC.
//        Used by index.html deals carousel + Solari board.
//
//   2) Search (Mix V2):       GET /api/packages?origin=BEG&dest=ATH&from=2026-06-01&to=2026-06-08&pax=2
//        → returns packages matching the route, with date-window relevance filter
//        (departure within ±21 days of from), sorted by deal quality (lowest
//        flightDealRatio first). pax is captured but not filtered (catalog
//        prices are per-paket, frontend recomputes per-pax view).
//
// Cache: CDN 5 min, SWR 10 min — accepts that engine output is stale up to 5 min.

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

function shiftDateISO(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const tier = req.query.tier === 'premium' ? 'premium' : 'public';
  const status = tier === 'premium' ? 'published_premium' : 'published_public';
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);

  const origin = (req.query.origin || '').toUpperCase().slice(0, 3) || null;
  const dest   = (req.query.dest   || '').toUpperCase().slice(0, 3) || null;
  const from   = req.query.from || null;  // YYYY-MM-DD
  const to     = req.query.to   || null;  // YYYY-MM-DD
  const isSearch = !!(origin || dest || from || to);

  try {
    let q = db.collection('letto_packages').where('status', '==', status);
    if (origin) q = q.where('origin.code', '==', origin);
    if (dest)   q = q.where('destination.code', '==', dest);

    if (!isSearch) {
      // Listing mode — newest first.
      q = q.orderBy('metadata.createdAt', 'desc').limit(limit);
    } else {
      // Search mode — over-fetch then filter/sort in memory.
      // Firestore limits us to 1 inequality per query, so we apply date window
      // and deal sorting client-side rather than chain another where.
      q = q.limit(60);
    }

    const snap = await q.get();
    let packages = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (isSearch) {
      // Date window: keep packages whose departure is within ±21 days of `from`,
      // OR whose return is within ±21 days of `to`. Catalog is sparse so we
      // prefer "close enough" over zero-results. If no date provided, no filter.
      if (from) {
        const fromMin = shiftDateISO(from, -21);
        const fromMax = shiftDateISO(from, 21);
        packages = packages.filter(p => {
          const dep = p?.dates?.departure;
          if (!dep || !fromMin || !fromMax) return true;
          return dep >= fromMin && dep <= fromMax;
        });
      }

      // Sort by deal quality (lower flightDealRatio = bigger discount), then by departure date asc
      packages.sort((a, b) => {
        const ra = (a.deal && a.deal.flightDealRatio) || 1;
        const rb = (b.deal && b.deal.flightDealRatio) || 1;
        if (ra !== rb) return ra - rb;
        return (a.dates?.departure || '').localeCompare(b.dates?.departure || '');
      });

      packages = packages.slice(0, limit);
    }

    return res.status(200).json({
      packages,
      count: packages.length,
      tier,
      mode: isSearch ? 'search' : 'listing',
      filters: isSearch ? { origin, dest, from, to } : null
    });
  } catch (e) {
    console.error('[LETTO API] /packages error:', e.message);
    return res.status(500).json({ error: 'internal' });
  }
}
