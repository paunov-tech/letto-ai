// Multi-city trip composer · FAZA 3 (2026-07-17).
// Builds origin → city A (stay) → city B (stay) → origin trips from
// independent one-way provider offers, evaluating BOTH city orders so the
// cheaper sequence wins (the tryp.com-style order optimization).
// Each leg is a single provider offer (regular connecting flight is fine);
// the three tickets are independent and explicitly unprotected.
// Pure and injectable (searchImpl) so tests never touch the network.

import { searchBookingOneWayFlights } from './booking-flight-provider.js';

const DAY = 86400000;
export const MIN_STAY_NIGHTS = 2;
export const MAX_TRIP_NIGHTS = 21;

function parseIso(value) {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
}

function iso(time) {
  return new Date(time).toISOString().slice(0, 10);
}

function addDays(value, days) {
  const time = parseIso(value);
  return time === null ? null : iso(time + days * DAY);
}

// Two date-aligned plans (city order A→B and B→A) or [] when the requested
// shape cannot hold at least MIN_STAY_NIGHTS in each city.
export function buildMultiCityPlans({ origin, cities, from, to, stayFirst = null }) {
  const [cityA, cityB] = cities || [];
  const totalNights = Math.round((parseIso(to) - parseIso(from)) / DAY);
  if (!cityA || !cityB || cityA === cityB || cityA === origin || cityB === origin) return [];
  if (!(totalNights >= MIN_STAY_NIGHTS * 2) || totalNights > MAX_TRIP_NIGHTS) return [];
  let firstNights;
  if (stayFirst !== null && stayFirst !== undefined) {
    firstNights = Number(stayFirst);
    if (!Number.isInteger(firstNights) ||
        firstNights < MIN_STAY_NIGHTS || totalNights - firstNights < MIN_STAY_NIGHTS) return [];
  } else {
    firstNights = Math.ceil(totalNights / 2);
  }
  const secondNights = totalNights - firstNights;
  const boundary = addDays(from, firstNights);
  const planFor = (first, second) => ({
    order: [origin, first, second, origin],
    legs: [
      { origin, destination: first, date: from },
      { origin: first, destination: second, date: boundary },
      { origin: second, destination: origin, date: to }
    ],
    stays: [
      { code: first, checkIn: from, checkOut: boundary, nights: firstNights },
      { code: second, checkIn: boundary, checkOut: to, nights: secondNights }
    ]
  });
  return [planFor(cityA, cityB), planFor(cityB, cityA)];
}

// Searches all three legs of both orders in parallel per order, keeps the
// cheapest offer per leg, and returns every order where all legs exist,
// sorted by transport price (cheapest sequence first).
export async function searchMultiCityTrip({
  origin, cities, from, to, stayFirst = null, pax = 1,
  searchImpl = searchBookingOneWayFlights, legLimit = 4
}) {
  const plans = buildMultiCityPlans({ origin, cities, from, to, stayFirst });
  if (!plans.length) return { trips: [], provider: 'booking-multi-city', error: 'invalid_plan' };
  const trips = [];
  const attempts = [];
  for (const plan of plans) {
    const results = await Promise.all(plan.legs.map(leg =>
      searchImpl({ origin: leg.origin, destination: leg.destination, from: leg.date, pax, limit: legLimit })
    ));
    const error = results.find(result => result.error)?.error || null;
    const chosen = results.map(result =>
      (result.flights || [])
        .filter(flight => flight?.segment?.legs?.length >= 1 && Number(flight.totalPrice) > 0)
        .sort((a, b) => Number(a.totalPrice) - Number(b.totalPrice))[0] || null
    );
    if (chosen.some(flight => !flight)) {
      attempts.push({ order: plan.order.join('-'), error: error || 'missing_leg_flights' });
      continue;
    }
    const transportPrice = Math.round(
      chosen.reduce((sum, flight) => sum + Number(flight.totalPrice), 0) * 100
    ) / 100;
    trips.push({
      id: `mc-${plan.order.join('-')}-${from}-${to}`,
      order: plan.order,
      legs: chosen,
      stays: plan.stays,
      transportPrice,
      currency: 'EUR',
      bookingPartner: 'booking.com/flights',
      ticketing: {
        type: 'multi_city_independent_tickets',
        tickets: 3,
        providerProtection: 'unprotected'
      },
      source: 'booking-multi-city'
    });
    attempts.push({ order: plan.order.join('-'), error: null });
  }
  if (!trips.length) {
    return { trips: [], provider: 'booking-multi-city', attempts, error: attempts.at(-1)?.error || 'missing_leg_flights' };
  }
  trips.sort((a, b) => a.transportPrice - b.transportPrice);
  return { provider: 'booking-multi-city', trips, attempts };
}
