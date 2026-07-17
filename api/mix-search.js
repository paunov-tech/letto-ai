import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { withSentry } from '../lib/sentry-backend.js';
import { cleanAviasalesUrl, buildAviasalesUrl } from '../lib/aviasales-url.js';
import { rankItineraries } from '../lib/mix-ranker.js';

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
    const packages = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    for (const pkg of packages) {
      if (!pkg.flight) pkg.flight = {};
      pkg.flight.bookingUrl = pkg.flight.bookingUrl
        ? cleanAviasalesUrl(pkg.flight.bookingUrl)
        : buildAviasalesUrl(pkg);
    }
    const itineraries = rankItineraries(packages, { from, to, pax }, limit);
    return res.status(200).json({
      itineraries,
      count: itineraries.length,
      requested: { origin, dest, from, to, pax },
      coverage: {
        scanned: packages.length,
        complete: itineraries.length,
        exactDates: itineraries.filter(item => item.dateMatch === 'exact').length
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
