import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { withSentry } from '../lib/sentry-backend.js';
import { cleanAviasalesUrl, buildAviasalesUrl } from '../lib/aviasales-url.js';
import { normalizeRankingPreference, rankItineraries } from '../lib/mix-ranker.js';
import { itineraryContract } from '../lib/itinerary-contract.js';

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
const IATA = /^[A-Z]{3}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function timestampMs(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  const origin = String(req.query.origin || '').toUpperCase();
  const dest = String(req.query.dest || '').toUpperCase();
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  const pax = Math.max(1, Math.min(9, Number(req.query.pax) || 2));
  const limit = Math.max(1, Math.min(12, Number(req.query.limit) || 6));
  const preference = normalizeRankingPreference(req.query.preference);
  if (!IATA.test(origin) || !IATA.test(dest) || !ISO.test(from) || !ISO.test(to)) {
    return res.status(400).json({ error: 'invalid_search', required: ['origin', 'dest', 'from', 'to'] });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
  try {
    const snap = await db.collection('letto_packages')
      .where('status', 'in', ['published_public', 'published_premium'])
      .where('origin.code', '==', origin)
      .where('destination.code', '==', dest)
      .limit(100)
      .get();
    // Never rank packages whose departure date has already passed — they
    // can't be booked. WF02 sweeps them to `expired`; this is the read guard.
    const todayISO = new Date().toISOString().slice(0, 10);
    const packages = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(pkg => typeof pkg?.dates?.departure !== 'string' || pkg.dates.departure >= todayISO);
    for (const pkg of packages) {
      if (!pkg.flight) pkg.flight = {};
      pkg.flight.bookingUrl = pkg.flight.bookingUrl
        ? cleanAviasalesUrl(pkg.flight.bookingUrl)
        : buildAviasalesUrl(pkg);
    }
    const validated = packages.filter(pkg => itineraryContract(pkg).complete);
    const freshCutoff = Date.now() - 48 * 3600000;
    const fresh = validated.filter(pkg => {
      const stamp = timestampMs(pkg?.metadata?.createdAt || pkg?.metadata?.updatedAt);
      return stamp !== null && stamp >= freshCutoff;
    });
    const itineraries = rankItineraries(packages, { from, to, pax, preference }, limit);
    return res.status(200).json({
      itineraries,
      count: itineraries.length,
      requested: { origin, dest, from, to, pax, preference },
      personalization: {
        preference,
        disclosure: 'Preference changes only the order of complete, verified combinations; prices and source facts are unchanged.'
      },
      coverage: {
        scanned: packages.length,
        contractValid: validated.length,
        relevantWithin60Days: itineraries.length,
        exactDates: itineraries.filter(item => item.dateMatch === 'exact').length,
        freshWithin48h: fresh.length,
        health: itineraries.length > 0 ? 'available' : (validated.length > 0 ? 'date_gap' : 'source_gap')
      },
      mode: 'independent_ranked_mix',
      disclosure: 'LETTO ranks complete flight and hotel combinations. Partner pages confirm live availability and final price.'
    });
  } catch (error) {
    console.error('[LETTO API] /mix-search error:', error.message);
    return res.status(500).json({ error: 'internal' });
  }
}

export default withSentry('mix-search', handler);
