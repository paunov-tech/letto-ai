// api/multi-city-search.js — Live multi-city orchestrator (FAZA 3, 2026-07-17).
//
//   GET /api/multi-city-search?origin=BEG&cities=FCO,BCN&from=2026-09-17&to=2026-09-24&stayFirst=4&pax=2
//
// Composes origin → city A (stay) → city B (stay) → origin trips from
// independent one-way offers (both city orders evaluated), attaches real
// hotels per stop, keeps only packages that pass multiCityContract, and
// ranks them by price/hotel quality. Verification is never invented:
// incomplete packages are dropped, not repaired.

import { withSentry } from '../lib/sentry-backend.js';
import { searchMultiCityTrip, buildMultiCityPlans } from '../lib/multi-city-provider.js';
import { searchBookingOneWayFlights } from '../lib/booking-flight-provider.js';
import { multiCityContract } from '../lib/multi-city-contract.js';
import { mapWithConcurrency } from '../lib/concurrency.js';
import { providerHealthSnapshot, withProviderResilience } from '../lib/provider-resilience.js';
import { applyRateLimit } from '../lib/rate-limit.js';

const IATA = /^[A-Z]{3}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function resultFailure(result) {
  const error = String(result?.error || '');
  return Boolean(error && !(result?.flights || []).length && !['not_configured', 'invalid_plan'].includes(error));
}

function retryTransientError(error) {
  const message = String(error?.message || '').toLowerCase();
  // Same rule as live-mix-search: a 28s provider timeout has already spent
  // its budget; never retry it into a request-wide timeout.
  if (message === 'timeout' || message === 'aborterror' || message === 'aborted') return false;
  return !/^http_4(?!29)/.test(message);
}

async function resilientLegSearch(request) {
  const run = await withProviderResilience('booking-flights', () => searchBookingOneWayFlights(request), {
    retries: 1,
    isFailure: resultFailure,
    shouldRetry: retryTransientError
  });
  if (run.ok) return run.value;
  return { flights: [], provider: 'booking-com15-oneway', error: run.error === 'circuit_open' ? 'circuit_open' : 'provider_unavailable' };
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  const origin = String(req.query.origin || '').toUpperCase();
  const cities = String(req.query.cities || '').toUpperCase().split(',').map(s => s.trim()).filter(Boolean);
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  const pax = Math.max(1, Math.min(7, Number(req.query.pax) || 2));
  const stayFirst = req.query.stayFirst !== undefined ? Number(req.query.stayFirst) : null;
  if (!IATA.test(origin) || cities.length !== 2 || !cities.every(c => IATA.test(c)) ||
      !ISO.test(from) || !ISO.test(to) || from >= to) {
    return res.status(400).json({ error: 'invalid_search', required: ['origin', 'cities=A,B', 'from', 'to'] });
  }
  // Plan validation (distinct cities ≠ origin, 2+ nights per city, ≤21 total)
  // lives in buildMultiCityPlans — reuse it instead of duplicating the rules.
  if (!buildMultiCityPlans({ origin, cities, from, to, stayFirst }).length) {
    return res.status(400).json({ error: 'invalid_plan', rule: `cities must differ from each other and origin; ${'2'}+ nights per city, ≤21 total` });
  }
  // Each request fans out to ~6 flight + ~4 hotel upstream calls — keep the
  // per-IP budget tight so a scraper cannot burn the RapidAPI quota.
  if (applyRateLimit(req, res, { scope: 'multi-city-search', limit: 10, windowMs: 60_000 })) return;

  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
  try {
    const tripResult = await searchMultiCityTrip({
      origin, cities, from, to, stayFirst, pax, searchImpl: resilientLegSearch
    });

    async function hotelsFor(trip, stayIndex) {
      const stay = trip.stays[stayIndex];
      const hotelUrl = new URL('/api/hotels-search', `https://${req.headers.host || 'letto.live'}`);
      hotelUrl.search = new URLSearchParams({
        destination: stay.code, checkIn: stay.checkIn, checkOut: stay.checkOut,
        adults: String(pax), limit: '6'
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
        trip, stayIndex,
        hotels: Array.isArray(payload.hotels) ? payload.hotels : [],
        error: run.ok ? null : (run.error === 'circuit_open' ? 'circuit_open' : 'request_failed')
      };
    }

    const hotelJobs = tripResult.trips.flatMap(trip => [0, 1].map(stayIndex => ({ trip, stayIndex })));
    // Two workers — same upstream-stability rule as live-mix-search.
    const hotelBatches = await mapWithConcurrency(hotelJobs, 2, job => hotelsFor(job.trip, job.stayIndex));
    const hotelsByTrip = new Map();
    for (const batch of hotelBatches) {
      if (!hotelsByTrip.has(batch.trip.id)) hotelsByTrip.set(batch.trip.id, [[], []]);
      hotelsByTrip.get(batch.trip.id)[batch.stayIndex] = batch.hotels.slice(0, 2);
    }

    const packages = [];
    for (const trip of tripResult.trips) {
      const [hotelsA, hotelsB] = hotelsByTrip.get(trip.id) || [[], []];
      for (const hotelA of hotelsA) {
        for (const hotelB of hotelsB) {
          const stops = trip.stays.map((stay, index) => {
            const hotel = index === 0 ? hotelA : hotelB;
            return {
              code: stay.code,
              stay,
              hotel: {
                id: hotel.id, providerHotelId: hotel.providerHotelId || null, source: hotel.source || null,
                name: hotel.name, rating: hotel.stars, reviewScore: hotel.guestRating,
                reviewCount: hotel.reviewCount, photo: hotel.photo, nights: stay.nights,
                totalWithTaxes: Number(hotel.priceTotal), totalPrice: Number(hotel.priceTotal),
                bookingUrl: hotel.bookingUrl, bookingPartner: hotel.bookingPartner,
                stayDetails: hotel.stayDetails || null
              }
            };
          });
          const total = Math.round(
            (trip.transportPrice + Number(hotelA.priceTotal) + Number(hotelB.priceTotal)) * 100
          ) / 100;
          packages.push({
            id: `${trip.id}-h${hotelA.id}-h${hotelB.id}`,
            transport: 'flight',
            multiCity: true,
            origin: { code: origin },
            stops,
            legs: trip.legs,
            ticketing: trip.ticketing,
            dates: { departure: from, return: to, nights: trip.stays[0].nights + trip.stays[1].nights },
            pricing: { total, currency: 'EUR' },
            metadata: { source: 'live_multi_city_v1', createdAt: new Date().toISOString() }
          });
        }
      }
    }

    // Truth gate: contract decides, AI/code never repairs incomplete packages.
    const complete = packages
      .map(pkg => ({ pkg, contract: multiCityContract(pkg) }))
      .filter(item => item.contract.complete);
    const totals = complete.map(({ pkg }) => pkg.pricing.total);
    const minPrice = totals.length ? Math.min(...totals) : 0;
    const maxPrice = totals.length ? Math.max(...totals) : 0;
    const spread = Math.max(1, maxPrice - minPrice);
    const cheapestOrder = tripResult.trips[0]?.order?.join('-') || null;
    const itineraries = complete.map(({ pkg, contract }) => {
      const priceScore = 100 - ((pkg.pricing.total - minPrice) / spread) * 55;
      const reviews = pkg.stops.map(stop => Number(stop.hotel.reviewScore || 0));
      const avgReview = reviews.reduce((sum, value) => sum + value, 0) / reviews.length;
      const hotelScore = Math.max(45, Math.min(100, avgReview * 10));
      const orderKey = pkg.legs.map(leg => leg.origin).concat(pkg.legs[2].destination).join('-');
      const why = [];
      if (orderKey === cheapestOrder) why.push('Povoljniji redosled gradova');
      if (pkg.pricing.total <= minPrice * 1.05) why.push('Među najjeftinijim multi-city kombinacijama');
      if (avgReview >= 8) why.push('Visoko ocenjeni hoteli u oba grada');
      why.push('3 nezavisne karte — bez zaštite konekcija');
      return {
        ...pkg,
        itinerary: contract,
        lettoScore: Math.round(Math.max(0, Math.min(100, priceScore * 0.6 + hotelScore * 0.4))),
        why: why.slice(0, 3)
      };
    }).sort((a, b) => b.lettoScore - a.lettoScore || a.pricing.total - b.pricing.total)
      .slice(0, 6)
      .map((item, index) => ({ ...item, rank: index + 1 }));

    if (!itineraries.length) {
      res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    }
    return res.status(200).json({
      itineraries,
      count: itineraries.length,
      requested: { origin, cities, from, to, stayFirst, pax },
      orders: tripResult.trips.map(trip => ({
        order: trip.order,
        transportPrice: trip.transportPrice,
        cheaper: trip.order.join('-') === cheapestOrder
      })),
      providers: {
        flights: {
          name: tripResult.provider,
          attempts: tripResult.attempts || [],
          error: tripResult.error || null
        },
        hotels: {
          searches: hotelBatches.length,
          failedSearches: hotelBatches.filter(batch => batch.error).map(batch => ({
            city: batch.trip.stays[batch.stayIndex].code, error: batch.error
          }))
        },
        resilience: providerHealthSnapshot(['booking-flights', 'hotel-search'])
      },
      disclosure: 'LETTO combines independent one-way tickets and per-city hotels. Partner pages confirm live availability and final price. Independent tickets carry no connection protection.',
      mode: 'live_multi_city_mix'
    });
  } catch (error) {
    console.error('[LETTO API] /multi-city-search error:', error.message);
    return res.status(500).json({ error: 'internal' });
  }
}

export default withSentry('multi-city-search', handler);
