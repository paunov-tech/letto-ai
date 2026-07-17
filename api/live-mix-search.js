import { withSentry } from '../lib/sentry-backend.js';
import { searchTravelpayoutsFlights } from '../lib/live-flight-provider.js';
import { searchBookingFlights } from '../lib/booking-flight-provider.js';
import { rankItineraries } from '../lib/mix-ranker.js';

const IATA = /^[A-Z]{3}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const NEARBY_ORIGINS = {
  BEG: [{ code: 'INI', distanceKm: 240 }, { code: 'TSR', distanceKm: 165 }],
  INI: [{ code: 'SOF', distanceKm: 160 }, { code: 'BEG', distanceKm: 240 }],
  SJJ: [{ code: 'TZL', distanceKm: 120 }, { code: 'DBV', distanceKm: 240 }],
  SKP: [{ code: 'PRN', distanceKm: 90 }, { code: 'INI', distanceKm: 200 }],
  ZAG: [{ code: 'LJU', distanceKm: 140 }, { code: 'BUD', distanceKm: 345 }]
};

function dedupeFlights(flights) {
  const seen = new Set();
  return flights.filter(flight => {
    const key = [
      flight.origin, flight.destination, flight.depart, flight.ret,
      flight.departureTime, flight.inbound?.departureTime,
      Math.round(Number(flight.totalPrice) || 0)
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const origin = String(req.query.origin || '').toUpperCase();
  const dest = String(req.query.dest || '').toUpperCase();
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  const pax = Math.max(1, Math.min(7, Number(req.query.pax) || 2));
  if (!IATA.test(origin) || !IATA.test(dest) || !ISO.test(from) || !ISO.test(to) || from >= to) {
    return res.status(400).json({ error: 'invalid_search' });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
  const alternatives = (NEARBY_ORIGINS[origin] || []).filter(item => item.code !== dest);
  const origins = [{ code: origin, distanceKm: 0 }, ...alternatives];
  const searches = [
    searchBookingFlights({ origin, destination: dest, from, to, pax }),
    ...origins.map(item => searchTravelpayoutsFlights({
      origin: item.code, destination: dest, from, to, pax
    }))
  ];
  const flightResults = await Promise.all(searches);
  const originDistance = new Map(origins.map(item => [item.code, item.distanceKm]));
  const flights = dedupeFlights(flightResults.flatMap(result => result.flights || []))
    .map(flight => ({
      ...flight,
      requestedOrigin: origin,
      originAlternative: flight.origin !== origin,
      accessDistanceKm: originDistance.get(flight.origin) || 0
    }))
    .sort((a, b) =>
      Number(a.originAlternative) - Number(b.originAlternative) ||
      a.totalPrice - b.totalPrice
    );
  async function hotelsFor(flight) {
    const hotelUrl = new URL('/api/hotels-search', `https://${req.headers.host || 'letto.live'}`);
    hotelUrl.search = new URLSearchParams({
      destination: dest, checkIn: flight.depart, checkOut: flight.ret,
      adults: String(pax), limit: '12'
    }).toString();
    const response = await fetch(hotelUrl, {
      headers: { Accept: 'application/json', Referer: `https://${req.headers.host || 'letto.live'}/results.html` },
      signal: AbortSignal.timeout ? AbortSignal.timeout(22000) : undefined
    }).catch(() => null);
    const payload = response?.ok ? await response.json().catch(() => ({})) : {};
    return { flight, payload, hotels: Array.isArray(payload.hotels) ? payload.hotels : [] };
  }
  const hotelCandidates = [
    ...flights.filter(flight => !flight.originAlternative).slice(0, 3),
    ...flights.filter(flight => flight.originAlternative).slice(0, 1)
  ].slice(0, 4);
  const batches = await Promise.all(hotelCandidates.map(hotelsFor));
  const packages = [];
  for (const batch of batches) {
    const { flight, hotels } = batch;
    const flightNights = Math.round((Date.parse(flight.ret) - Date.parse(flight.depart)) / 86400000);
    for (const hotel of hotels.slice(0, 8)) {
      packages.push({
        id: `live-${flight.id}-${hotel.id}`,
        origin: {
          code: flight.origin,
          requestedCode: origin,
          alternative: flight.originAlternative,
          accessDistanceKm: flight.accessDistanceKm
        },
        destination: { code: dest },
        dates: { departure: flight.depart, return: flight.ret, nights: flightNights },
        flight: { ...flight },
        hotel: {
          name: hotel.name, rating: hotel.stars, reviewScore: hotel.guestRating,
          reviewCount: hotel.reviewCount, photo: hotel.photo, nights: flightNights,
          totalWithTaxes: Number(hotel.priceTotal), totalPrice: Number(hotel.priceTotal),
          bookingUrl: hotel.bookingUrl, bookingPartner: hotel.bookingPartner
        },
        pricing: {
          total: Number(flight.totalPrice) + Number(hotel.priceTotal),
          currency: 'EUR'
        },
        metadata: { source: 'live_orchestrator_v1', createdAt: new Date().toISOString() }
      });
    }
  }
  const itineraries = rankItineraries(packages, { from, to, pax }, 8);
  return res.status(200).json({
    itineraries,
    count: itineraries.length,
    requested: { origin, dest, from, to, pax },
    providers: {
      flights: {
        name: 'multi-provider',
        count: flights.length,
        sources: flightResults.map(result => ({
          name: result.provider,
          count: result.flights?.length || 0,
          error: result.error || null
        }))
      },
      hotels: {
        name: batches[0]?.payload?.meta?.provider || 'hotels-com-provider',
        count: batches.reduce((sum, batch) => sum + batch.hotels.length, 0),
        searches: batches.length
      }
    },
    mode: 'live_independent_mix'
  });
}

export default withSentry('live-mix-search', handler);
