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
import { cleanAviasalesUrl, buildAviasalesUrl } from '../lib/aviasales-url.js';
import { verifyPremiumSession, getSessionIdFromRequest } from '../lib/auth.js';
import { passThroughFull, scrubToPreview } from '../lib/package-shape.js';

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

// Daily try-it picker · top 3 packages by pricing.total DESC, eligible set
// fixed at startOfDayUTC so today's freshly-mined packages don't churn the
// picks during the day (option C from product brief). Cached once per UTC
// day per warm Lambda instance — Vercel may spawn multiple instances, but
// each does at most 1 read/day for this. If the underlying query errors
// (e.g. composite index not provisioned), free users see a fully-scrubbed
// catalog for that instance/day instead of breaking the endpoint.
let dailyTryItCache = { dateKey: null, ids: new Set() };

async function getDailyTryItIds() {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const dateKey = startOfDay.toISOString().slice(0, 10);
  if (dailyTryItCache.dateKey === dateKey) return dailyTryItCache.ids;

  try {
    const startOfDayMs = startOfDay.getTime();
    // Use the (status, metadata.createdAt DESC) composite that listing mode
    // already exercises — no new Firestore index needed. Pull a wider
    // 100-row window then sort by pricing.total in memory; catalog is well
    // under 100 today, so this is effectively the global top-N by price.
    const snap = await db.collection('letto_packages')
      .where('status', 'in', ['published_public', 'published_premium'])
      .orderBy('metadata.createdAt', 'desc')
      .limit(100)
      .get();
    // metadata.createdAt arrives from admin SDK as a Firestore Timestamp
    // (toMillis()-bearing class instance, serialized as {_seconds,
    // _nanoseconds} when JSON-stringified). Earlier code compared the
    // Timestamp directly to an ISO string — JS coerced the object to
    // "[object Object]", string-compared against "2026-…", returned
    // false for every doc, eligible set was always empty, picker
    // silently returned no try-it ids. Coerce to epoch ms here.
    function tsToMs(ts) {
      if (!ts) return null;
      if (typeof ts.toMillis === 'function') return ts.toMillis();
      if (typeof ts.toDate === 'function') return ts.toDate().getTime();
      if (typeof ts._seconds === 'number') return ts._seconds * 1000 + Math.floor((ts._nanoseconds || 0) / 1e6);
      if (typeof ts.seconds === 'number') return ts.seconds * 1000;
      if (typeof ts === 'string') return new Date(ts).getTime();
      return null;
    }
    const eligible = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => {
        const ms = tsToMs(p.metadata?.createdAt);
        return ms != null && ms < startOfDayMs;
      });
    eligible.sort((a, b) => (b.pricing?.total ?? 0) - (a.pricing?.total ?? 0));
    // Slice 2 (was 3) per 2026-05-15 spec — fewer try-it picks per day
    // since the scrub is now narrow (locked cards still show price/hotel/
    // dates/image, so the marketing pressure on the try-it set is lower).
    const ids = new Set(eligible.slice(0, 2).map(p => p.id));
    dailyTryItCache = { dateKey, ids };
    return ids;
  } catch (e) {
    console.warn('[packages] daily_try_it query failed, free users see fully scrubbed catalog today:', e.message);
    return new Set();
  }
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const wantsPremium = req.query.tier === 'premium';

  // Silent auth check on every call — paid status determines RESPONSE SHAPE
  // (passThroughFull vs scrubToPreview), not just access to the premium pool.
  // Anonymous callers skip the Stripe round-trip.
  const sessionId = getSessionIdFromRequest(req);
  const auth = sessionId ? await verifyPremiumSession(sessionId) : { premium: false };

  // Hard gate on ?tier=premium — preserves the 401 behaviour from 45524e1.
  if (wantsPremium && !auth.premium) {
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(401).json({ error: 'premium_required' });
  }
  const isPremium = auth.premium;

  // Cache partition: ANY sessioned request is private. Only fully-anonymous
  // calls hit the shared CDN cache. Stronger than relying on Vary: X-Letto-Session
  // (CDN edges honour custom-header Vary inconsistently — that may have been
  // the cross-tier-cache atomicity bug in the reverted e74d4da). With the
  // session-bit-in-cache-key partition, a logged-in caller can never receive
  // a CDN-cached scrubbed response, and an anon caller can never receive a
  // cached premium response.
  if (sessionId) {
    res.setHeader('Cache-Control', 'private, no-store');
  } else {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
  }

  const tier = wantsPremium ? 'premium' : 'public';
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
    // ?tier=premium → premium pool only (auth already verified above).
    // Default → BOTH pools so free callers see the full catalog width;
    // response shape (scrubToPreview vs passThroughFull, applied below)
    // gates the booking info per-card, not the query.
    let q = wantsPremium
      ? db.collection('letto_packages').where('status', '==', 'published_premium')
      : db.collection('letto_packages').where('status', 'in', ['published_public', 'published_premium']);
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

    // P0 fix · normalize the bookingUrl shipped to the frontend. Two cases:
    //   1) URL exists → strip any stale TP fare tokens, convert YYMMDD → DDMM
    //   2) URL is missing/empty (mining engine sometimes writes packages
    //      without it) → synthesize from origin + destination + dates so
    //      the frontend's `var url = fSel.bookingUrl || ''` doesn't yield
    //      an empty CTA on Custom Mix searches that surface these packages.
    for (const pkg of packages) {
      if (!pkg.flight) pkg.flight = {};
      if (pkg.flight.bookingUrl) {
        pkg.flight.bookingUrl = cleanAviasalesUrl(pkg.flight.bookingUrl);
      } else {
        const synth = buildAviasalesUrl(pkg);
        if (synth) pkg.flight.bookingUrl = synth;
      }
    }

    // Markers + shape selection.
    //   daily_try_it · true iff this id is in today's global top-3-by-price
    //                  (computed in getDailyTryItIds above). Unlocks the
    //                  card for free callers — try-it teaser.
    //   top_deal     · chip-only marker; flightDealRatio < 0.65 means the
    //                  flight is >35% under the route median. No unlock
    //                  semantics — purely cosmetic.
    //   round_trip   · universal badge — every catalog package is RT by
    //                  definition (departure + return + nights).
    // Unlock policy:  premium subscriber OR daily_try_it → passThroughFull
    //                 (full shape + labels). Otherwise → scrubToPreview
    //                 (masked shape + labels). passThroughFull keeps the
    //                 preview labels so the frontend renders one card.
    const dailyTryItIds = await getDailyTryItIds();
    packages = packages.map(p => {
      const isDailyTryIt = dailyTryItIds.has(p.id);
      const isTopDeal = (p.deal?.flightDealRatio ?? 1) < 0.65;
      const unlocked = isPremium || isDailyTryIt;
      const out = unlocked ? passThroughFull(p) : scrubToPreview(p);
      out.daily_try_it = isDailyTryIt;
      out.top_deal = isTopDeal;
      out.round_trip = true;
      return out;
    });

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
