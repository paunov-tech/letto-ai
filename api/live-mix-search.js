import { withSentry } from '../lib/sentry-backend.js';
import { searchTravelpayoutsFlights } from '../lib/live-flight-provider.js';
import { searchBookingFlights } from '../lib/booking-flight-provider.js';
import { normalizeRankingPreference, rankItineraries } from '../lib/mix-ranker.js';
import {
  buildFlexibleDateMatrix,
  diversifyItineraries,
  selectDateDiverseFlights
} from '../lib/flexible-date-matrix.js';
import { mapWithConcurrency } from '../lib/concurrency.js';
import { searchSelfTransferRoundTrip } from '../lib/self-transfer-provider.js';
import { providerHealthSnapshot, withProviderResilience } from '../lib/provider-resilience.js';

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

function resultFailure(result) {
  const error = String(result?.error || '');
  // Missing configuration and an intentionally unsupported route are not
  // transient outages and must not burn a circuit or trigger retries.
  return Boolean(error && !(result?.flights || []).length && !['not_configured', 'unsupported_destination', 'disabled'].includes(error));
}

function retryTransientError(error) {
  const message = String(error?.message || '').toLowerCase();
  // Long provider timeouts have already consumed their budget. Do not turn a
  // 28-second Booking timeout into a 56-second request that starves hotels.
  if (message === 'timeout' || message === 'aborterror' || message === 'aborted') return false;
  return !/^http_4(?!29)/.test(message);
}

async function resilientProvider(provider, task) {
  const run = await withProviderResilience(provider, task, {
    retries: 1,
    isFailure: resultFailure,
    shouldRetry: retryTransientError
  });
  if (run.ok) return { ...run.value, resilience: { ...run.health, attempts: run.attempts } };
  return { flights: [], provider, error: run.error === 'circuit_open' ? 'circuit_open' : 'provider_unavailable', resilience: { ...run.health, attempts: run.attempts || 0 } };
}

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const origin = String(req.query.origin || '').toUpperCase();
  const dest = String(req.query.dest || '').toUpperCase();
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  const pax = Math.max(1, Math.min(7, Number(req.query.pax) || 2));
  const flexible = String(req.query.flex || '1') !== '0';
  const includeSelfTransfer = String(req.query.selfTransfer || '1') !== '0';
  const via = String(req.query.via || '').toUpperCase();
  const preference = normalizeRankingPreference(req.query.preference);
  if (!IATA.test(origin) || !IATA.test(dest) || !ISO.test(from) || !ISO.test(to) || from >= to ||
      (via && (!IATA.test(via) || via === origin || via === dest))) {
    return res.status(400).json({ error: 'invalid_search' });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
  const alternatives = (NEARBY_ORIGINS[origin] || []).filter(item => item.code !== dest);
  const origins = [{ code: origin, distanceKm: 0 }, ...alternatives];
  const dateWindows = buildFlexibleDateMatrix({ from, to, enabled: flexible });
  const searches = [
    ...dateWindows.map(window => resilientProvider('booking-flights', () => searchBookingFlights({
      origin, destination: dest, from: window.from, to: window.to, pax, limit: 8
    })).then(result => ({ ...result, window }))),
    ...origins.map(item => resilientProvider('travelpayouts-flights', () => searchTravelpayoutsFlights({
      origin: item.code, destination: dest, from, to, pax
    })))
  ];
  const selfTransferPromise = includeSelfTransfer
    ? resilientProvider('booking-self-transfer', () => searchSelfTransferRoundTrip({ origin, destination: dest, from, to, pax, hub: via }))
    : Promise.resolve({ flights: [], provider: 'booking-self-transfer', error: 'disabled' });
  const [standardResults, selfTransferResult] = await Promise.all([
    Promise.all(searches),
    selfTransferPromise
  ]);
  const flightResults = [...standardResults, selfTransferResult];
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
    const run = await withProviderResilience('hotel-search', async () => {
      const response = await fetch(hotelUrl, {
        headers: { Accept: 'application/json', Referer: `https://${req.headers.host || 'letto.live'}/results.html` },
        signal: AbortSignal.timeout ? AbortSignal.timeout(22000) : undefined
      });
      if (!response.ok) throw new Error(`http_${response.status}`);
      return response.json().catch(() => ({}));
    }, { retries: 1, shouldRetry: retryTransientError });
    const payload = run.ok ? run.value : {};
    return {
      flight,
      payload,
      hotels: Array.isArray(payload.hotels) ? payload.hotels : [],
      status: run.ok ? 200 : null,
      error: run.ok ? null : (run.error === 'circuit_open' ? 'circuit_open' : 'request_failed'),
      resilience: { ...run.health, attempts: run.attempts || 0 }
    };
  }
  const standardHotelCandidates = selectDateDiverseFlights(
    flights.filter(flight => !flight.selfTransfer?.required),
    { from, to },
    flexible ? 5 : 3
  );
  const selfTransferCandidate = flights.find(flight => flight.selfTransfer?.required);
  const hotelCandidates = selfTransferCandidate
    ? [...standardHotelCandidates, selfTransferCandidate]
    : standardHotelCandidates;
  // Hotels.com becomes unstable when five region/property/detail pipelines hit
  // it simultaneously. Two workers retain date diversity without sacrificing
  // the exact-date baseline to upstream timeouts.
  const batches = await mapWithConcurrency(hotelCandidates, 2, hotelsFor);
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
          id: hotel.id, providerHotelId: hotel.providerHotelId || null, source: hotel.source || null,
          name: hotel.name, rating: hotel.stars, reviewScore: hotel.guestRating,
          reviewCount: hotel.reviewCount, photo: hotel.photo, nights: flightNights,
          totalWithTaxes: Number(hotel.priceTotal), totalPrice: Number(hotel.priceTotal),
          bookingUrl: hotel.bookingUrl, bookingPartner: hotel.bookingPartner,
          stayDetails: hotel.stayDetails || null
        },
        pricing: {
          total: Number(flight.totalPrice) + Number(hotel.priceTotal),
          currency: 'EUR'
        },
        metadata: { source: 'live_orchestrator_v1', createdAt: new Date().toISOString() }
      });
    }
  }
  // Keep the complete candidate set until category-aware diversification below.
  // A self-transfer commonly ranks below many regular hotel pairings because of
  // its explicit risk penalty; slicing at 40 here would silently remove it
  // before it can receive its reserved, clearly-labelled alternative slot.
  const rankedPool = rankItineraries(packages, { from, to, pax, preference }, Math.max(40, packages.length));
  const itineraries = diversifyItineraries(rankedPool, 8, flexible ? 3 : 8, item =>
    `${item?.dates?.departure}|${item?.dates?.return}|${item?.flight?.selfTransfer?.required ? 'self' : 'standard'}`
  );
  if (!itineraries.length) {
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
  }
  return res.status(200).json({
    itineraries,
    count: itineraries.length,
    requested: { origin, dest, from, to, pax, flexible, includeSelfTransfer, via: via || null, preference },
    personalization: {
      preference,
      disclosure: 'Preference changes only the order of complete, verified combinations; prices and source facts are unchanged.'
    },
    flexibility: {
      enabled: flexible,
      windows: dateWindows.map(window => ({
        from: window.from, to: window.to, nights: window.nights, kind: window.kind
      })),
      hotelDateSearches: hotelCandidates.map(flight => ({
        origin: flight.origin, from: flight.depart, to: flight.ret
      }))
    },
    providers: {
      flights: {
        name: 'multi-provider',
        count: flights.length,
        sources: flightResults.map(result => ({
          name: result.provider,
          count: result.flights?.length || 0,
          error: result.error || null,
          resilience: result.resilience || null
        }))
      },
      hotels: {
        name: batches[0]?.payload?.meta?.provider || 'hotels-com-provider',
        count: batches.reduce((sum, batch) => sum + batch.hotels.length, 0),
        searches: batches.length,
        failedSearches: batches.filter(batch => batch.error).map(batch => ({
          from: batch.flight.depart,
          to: batch.flight.ret,
          error: batch.error,
          status: batch.status
        })),
        resilience: batches[0]?.resilience || null
      },
      resilience: providerHealthSnapshot(['booking-flights', 'travelpayouts-flights', 'booking-self-transfer', 'hotel-search'])
    },
    selfTransfer: {
      enabled: includeSelfTransfer,
      hub: selfTransferResult.hub || null,
      attemptedHubs: selfTransferResult.attemptedHubs || [],
      candidates: selfTransferResult.flights?.length || 0,
      completePackages: packages.filter(pkg => pkg.flight?.selfTransfer?.required &&
        rankItineraries([pkg], { from, to, pax, preference }, 1).length > 0).length
    },
    mode: 'live_independent_mix'
  });
}

export default withSentry('live-mix-search', handler);
