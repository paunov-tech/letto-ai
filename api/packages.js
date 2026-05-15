// api/packages.js — Two-tier catalog read for letto.live.
//
// Auth model — paywall reveals INFO, not content:
//   - No session / non-premium → scrubbed preview (hotel.name, booking
//     URLs, exact dates masked; computed labels emitted). CDN-cached 5min
//     with Vary: X-Letto-Session so cached responses can't cross tiers.
//   - Premium session          → full shape with booking URLs. Never
//     CDN-cached (Cache-Control: private, no-store).
//
// Three request shapes:
//   1) Listing (no filters):  GET /api/packages?limit=20
//        → newest from BOTH published_public + published_premium pools,
//        ordered by metadata.createdAt DESC.
//        Used by index.html deals carousel + Solari board.
//
//   2) Search (Mix V2):       GET /api/packages?origin=BEG&dest=ATH&from=2026-06-01&to=2026-06-08
//        → packages matching the route, ranked by date proximity then deal
//        quality. Same two-pool source as listing.
//
//   3) Premium-only browse:   GET /api/packages?tier=premium  (X-Letto-Session required)
//        → published_premium pool only. 401 without auth.

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

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const wantsPremium = req.query.tier === 'premium';

  // Silent auth check on every call — paid status determines response shape
  // (scrubToPreview vs passThroughFull) and cache policy. Short-circuit if
  // no session header/query so free callers don't pay a Stripe round-trip.
  const sessionId = getSessionIdFromRequest(req);
  const auth = sessionId ? await verifyPremiumSession(sessionId) : { premium: false };

  // Hard gate on ?tier=premium — preserves the 401 behavior from 45524e1.
  if (wantsPremium && !auth.premium) {
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(401).json({ error: 'premium_required' });
  }
  const isPremium = auth.premium;

  // Cache split: paid responses are per-user (never shared-cache); free
  // responses are CDN-cached, but Vary on X-Letto-Session so the CDN never
  // serves a paid response to a free caller (or vice versa) on a shared URL.
  if (isPremium) {
    res.setHeader('Cache-Control', 'private, no-store');
  } else {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    res.setHeader('Vary', 'X-Letto-Session');
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
    // ?tier=premium → premium pool only. Default → both pools so free users
    // see full catalog width; response shape (scrubToPreview) gates the
    // booking info, not the query.
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

    // Response shape: paid → full data + labels; free → scrubbed shape +
    // labels (hotel.name, exact dates, booking URLs hidden). Both shapes
    // include the same `preview` labels so the frontend renders one card
    // component regardless of tier; the `locked` flag drives CTA choice.
    const shape = isPremium ? passThroughFull : scrubToPreview;
    packages = packages.map(shape);

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
