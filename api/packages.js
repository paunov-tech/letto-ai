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
import { withSentry } from '../lib/sentry-backend.js';
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

async function handler(req, res) {
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
  // B · price tier filter (budget < €400 < value < €800 < lux). Independent
  // of the older `tier` param which targets published_public vs premium.
  const priceTier = ['budget', 'value', 'lux'].includes((req.query.priceTier || '').toLowerCase())
    ? req.query.priceTier.toLowerCase()
    : null;
  const isSearch = !!(origin || dest || from || to || priceTier);

  try {
    let q = db.collection('letto_packages').where('status', '==', status);
    if (origin) q = q.where('origin.code', '==', origin);
    if (dest)   q = q.where('destination.code', '==', dest);
    if (priceTier) q = q.where('tier', '==', priceTier);

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
      // Catalog is sparse — instead of strict date filtering (which often
      // returns 0 results for niche routes), rank by date proximity to the
      // requested `from` and tier the response: packages within ±21 days are
      // marked dateMatch:'tight', within ±60d 'loose', beyond that 'far'.
      // Frontend shows all but headlines the tight matches first.
      const fromTs = from ? new Date(from + 'T00:00:00Z').getTime() : null;
      packages.forEach(p => {
        const dep = p?.dates?.departure;
        if (!dep || !fromTs) {
          p._dateDeltaDays = null;
          p._dateMatch = 'unknown';
          return;
        }
        const depTs = new Date(dep + 'T00:00:00Z').getTime();
        const days = Math.round(Math.abs(depTs - fromTs) / 86400000);
        p._dateDeltaDays = days;
        p._dateMatch = days <= 21 ? 'tight' : (days <= 60 ? 'loose' : 'far');
      });

      // Sort: date proximity first (NULL = last), then deal quality
      packages.sort((a, b) => {
        const da = a._dateDeltaDays;
        const db = b._dateDeltaDays;
        if (da == null && db == null) {} // tie
        else if (da == null) return 1;
        else if (db == null) return -1;
        else if (da !== db) return da - db;
        const ra = (a.deal && a.deal.flightDealRatio) || 1;
        const rb = (b.deal && b.deal.flightDealRatio) || 1;
        return ra - rb;
      });

      packages = packages.slice(0, limit);
    }

    return res.status(200).json({
      packages,
      count: packages.length,
      tier,
      mode: isSearch ? 'search' : 'listing',
      filters: isSearch ? { origin, dest, from, to, priceTier } : null
    });
  } catch (e) {
    console.error('[LETTO API] /packages error:', e.message);
    return res.status(500).json({ error: 'internal' });
  }
}

export default withSentry('packages', handler);
