// Live package inventory from structured tour-operator searches.
// These are complete agency offers and intentionally stay separate from the
// component Mix (flight + hotel), so their package price is never double-counted.
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { withSentry } from '../lib/sentry-backend.js';

if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: 'letto-ai',
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
  }) });
}
const db = getFirestore();

const DEST_ALIASES = {
  AYT: ['AYT', 'ALANYA', 'BELEK', 'KEMER', 'SIDE'],
  BJV: ['BODRUM'], DLM: ['MARMARIS', 'FETHIYE'], ADB: ['IZMIR', 'KUSADASI'],
  HRG: ['HURGADA'], MIR: ['MIR', 'SOUSSE', 'SCN'], RHO: ['RODOS'],
  HER: ['KRIT'], CFU: ['KRF'], ZTH: ['ZAKINTOS'], LCA: ['LARNACA'],
  PMI: ['MALLORCA'], MLA: ['MALTAISLAN'], DXB: ['DUBAI'], ZNZ: ['ZANZIBAR']
};

function isoMs(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : null;
}

function normalize(doc) {
  const p = doc.data();
  const departure = p.outboundDate || null;
  const nights = Number(p.nights) || null;
  const returnDate = departure && nights
    ? new Date(Date.parse(departure + 'T00:00:00Z') + nights * 86400000).toISOString().slice(0, 10)
    : null;
  return {
    id: doc.id, kind: 'complete_agency_package', source: p.source,
    sourceLabel: p.source === 'kontiki' ? 'KonTiki' : (p.source === 'bigblue' ? 'Big Blue' : p.source),
    hotel: { name: p.title, stars: p.hotelStars || null, image: p.image || null },
    destination: { code: p.destinationCode || null, name: p.destinationName || p.destination || null, country: p.country || null },
    origin: { code: p.originCode || 'BEG' },
    dates: { departure, return: returnDate, nights },
    stay: { board: p.board || null, room: p.room || null, allInclusive: !!p.allInclusive },
    pricing: { total: Number(p.price) || null, oldTotal: Number(p.oldPrice) || null, currency: p.currency || 'EUR', basis: 'supplier_package' },
    bookingUrl: /^https:\/\//.test(p.bookingUrl || '') ? p.bookingUrl : null,
    freshness: { scrapedAt: p.scrapedAt || null, validUntil: p.validUntil || null },
    complete: !!(p.title && Number(p.price) > 0 && departure && p.bookingUrl),
    provenance: ['structured_supplier_api']
  };
}

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const destination = String(req.query.destination || '').toUpperCase().slice(0, 3);
  const origin = String(req.query.origin || 'BEG').toUpperCase().slice(0, 3);
  const from = isoMs(req.query.from ? req.query.from + 'T00:00:00Z' : null);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 30);
  if (!/^[A-Z]{3}$/.test(destination)) return res.status(400).json({ error: 'destination_required' });

  try {
    const snap = await db.collection('letto_scrape_inventory')
      .where('type', '==', 'charter_package').limit(500).get();
    const aliases = new Set(DEST_ALIASES[destination] || [destination]);
    let packages = snap.docs.map(normalize).filter(p => {
      if (!p.complete || p.origin.code !== origin) return false;
      if (!aliases.has(String(p.destination.code || '').toUpperCase())) return false;
      const validUntil = isoMs(p.freshness.validUntil);
      return validUntil == null || validUntil > Date.now() - 6 * 3600000;
    });
    packages.forEach(p => {
      p.dateDeltaDays = from && p.dates.departure
        ? Math.round(Math.abs(isoMs(p.dates.departure + 'T00:00:00Z') - from) / 86400000)
        : null;
      p.dateMatch = p.dateDeltaDays == null ? 'unknown' : (p.dateDeltaDays <= 14 ? 'tight' : p.dateDeltaDays <= 45 ? 'near' : 'alternative');
    });
    packages.sort((a, b) => (a.dateDeltaDays ?? 9999) - (b.dateDeltaDays ?? 9999) || a.pricing.total - b.pricing.total);
    packages = packages.slice(0, limit);
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
    return res.status(200).json({ packages, count: packages.length, destination, origin,
      coverage: { sources: [...new Set(packages.map(p => p.source))], complete: packages.filter(p => p.complete).length } });
  } catch (error) {
    console.error('[agency-packages]', error.message);
    return res.status(500).json({ error: 'internal' });
  }
}

export default withSentry('agency-packages', handler);
