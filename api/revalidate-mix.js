import { withSentry } from '../lib/sentry-backend.js';
import { applyRateLimit } from '../lib/rate-limit.js';
import { searchBookingFlights } from '../lib/booking-flight-provider.js';
import { searchTravelpayoutsFlights } from '../lib/live-flight-provider.js';
import { searchSelfTransferRoundTrip } from '../lib/self-transfer-provider.js';
import {
  matchFreshFlight,
  matchFreshHotel,
  priceCheck,
  projectFreshFlight,
  projectFreshHotel
} from '../lib/price-revalidation.js';

const IATA = /^[A-Z]{3}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isLettoOrigin(value) {
  try {
    const host = new URL(value).hostname;
    return host === 'letto.live' || host === 'www.letto.live' || host.endsWith('.vercel.app');
  } catch (_) {
    return false;
  }
}

function unavailable(previousPrice, reason) {
  return { ...priceCheck(previousPrice, null), reason, fresh: null };
}

function unverified(previousPrice, reason) {
  return {
    status: 'unverified', previousPrice: Number(previousPrice) || null,
    freshPrice: null, difference: null, reason, fresh: null
  };
}

async function refreshFlight(selected, search) {
  let result;
  if (selected.source === 'booking-com15') {
    result = await searchBookingFlights({ ...search, limit: 30 });
  } else if (selected.source === 'travelpayouts') {
    result = await searchTravelpayoutsFlights({ ...search, limit: 30 });
  } else if (selected.source === 'booking-self-transfer') {
    result = await searchSelfTransferRoundTrip({
      ...search,
      hub: selected?.selfTransfer?.hub || ''
    });
  } else {
    return unverified(selected.totalPrice, 'unsupported_flight_source');
  }
  if (result.error) return unverified(selected.totalPrice, `flight_${result.error}`);
  const freshFlight = matchFreshFlight(result.flights, selected);
  if (!freshFlight) return unavailable(selected.totalPrice, 'flight_no_longer_available');
  return {
    ...priceCheck(selected.totalPrice, freshFlight.totalPrice),
    reason: null,
    fresh: projectFreshFlight(freshFlight)
  };
}

async function refreshHotel(req, selected, search) {
  const host = String(req.headers.host || 'letto.live');
  const base = `https://${host}`;
  const url = new URL('/api/hotels-search', base);
  url.search = new URLSearchParams({
    destination: search.destination,
    checkIn: search.from,
    checkOut: search.to,
    adults: String(search.pax),
    limit: '200',
    fresh: '1',
    revalidate: '1'
  }).toString();
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json', Referer: `${base}/results`, Origin: base },
      signal: AbortSignal.timeout ? AbortSignal.timeout(45000) : undefined
    });
  } catch (_) {
    return unverified(selected.priceTotal, 'hotel_request_failed');
  }
  if (!response.ok) return unverified(selected.priceTotal, `hotel_http_${response.status}`);
  const payload = await response.json().catch(() => null);
  const freshHotel = matchFreshHotel(payload?.hotels, selected);
  if (!freshHotel) return unavailable(selected.priceTotal, 'hotel_no_longer_available');
  return {
    ...priceCheck(selected.priceTotal, freshHotel.priceTotal),
    reason: null,
    fresh: projectFreshHotel(freshHotel)
  };
}

async function handler(req, res) {
  const origin = req.headers.origin || req.headers.referer || '';
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!isLettoOrigin(origin)) return res.status(403).json({ error: 'forbidden_origin' });
  if (applyRateLimit(req, res, { scope: 'revalidate-mix', limit: 8, windowMs: 60_000 })) return;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');

  const body = req.body || {};
  const selectedFlight = body.flight || {};
  const selectedHotel = body.hotel || {};
  const originCode = String(body.search?.origin || selectedFlight.origin || '').toUpperCase();
  const destination = String(body.search?.destination || selectedFlight.dest || '').toUpperCase();
  const from = String(body.search?.from || selectedFlight.depart || '');
  const to = String(body.search?.to || selectedFlight.ret || '');
  const pax = Math.max(1, Math.min(7, Number(body.search?.pax) || 2));
  if (!IATA.test(originCode) || !IATA.test(destination) || !ISO.test(from) || !ISO.test(to) || from >= to ||
      !selectedFlight.source || !(selectedHotel.sourceHotelId || selectedHotel.providerHotelId)) {
    return res.status(400).json({ error: 'invalid_selection' });
  }
  const search = { origin: originCode, destination, from, to, pax };
  const [flight, hotel] = await Promise.all([
    refreshFlight(selectedFlight, search),
    refreshHotel(req, selectedHotel, search)
  ]);
  const bookable = ['confirmed', 'changed'].includes(flight.status) &&
    ['confirmed', 'changed'].includes(hotel.status);
  const total = bookable ? Math.round((Number(flight.freshPrice) + Number(hotel.freshPrice)) * 100) / 100 : null;
  return res.status(200).json({
    checkedAt: new Date().toISOString(),
    bookable,
    changed: flight.status === 'changed' || hotel.status === 'changed',
    total,
    currency: flight.fresh?.currency || hotel.fresh?.currency || 'EUR',
    flight,
    hotel
  });
}

export default withSentry('revalidate-mix', handler);
