import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMultiCityPlans, searchMultiCityTrip } from '../lib/multi-city-provider.js';

function oneWay(id, origin, destination, date, price) {
  return {
    id, origin, destination, depart: date, totalPrice: price, airline: id.toUpperCase(),
    flightNumber: `${id.toUpperCase()}1`,
    bookingUrl: `https://www.booking.com/flights/index.html?type=ONEWAY&depart=${origin}.AIRPORT-${destination}.AIRPORT&departDate=${date}`,
    segment: {
      origin, destination, departureAt: `${date}T06:00:00+02:00`, arrivalAt: `${date}T08:00:00+02:00`, stops: 0,
      legs: [{
        sourceProvided: true, origin, destination,
        departureAt: `${date}T06:00:00+02:00`, arrivalAt: `${date}T08:00:00+02:00`,
        departureTime: '06:00', arrivalTime: '08:00',
        flightNumber: `${id.toUpperCase()}1`, airline: id.toUpperCase()
      }]
    }
  };
}

test('plans cover both city orders with aligned stay boundaries', () => {
  const plans = buildMultiCityPlans({ origin: 'BEG', cities: ['FCO', 'BCN'], from: '2026-09-17', to: '2026-09-24' });
  assert.equal(plans.length, 2);
  assert.deepEqual(plans[0].order, ['BEG', 'FCO', 'BCN', 'BEG']);
  assert.deepEqual(plans[1].order, ['BEG', 'BCN', 'FCO', 'BEG']);
  // 7 nights → first city gets 4, second 3; leg dates match stay boundaries.
  assert.deepEqual(plans[0].stays, [
    { code: 'FCO', checkIn: '2026-09-17', checkOut: '2026-09-21', nights: 4 },
    { code: 'BCN', checkIn: '2026-09-21', checkOut: '2026-09-24', nights: 3 }
  ]);
  assert.deepEqual(plans[0].legs.map(leg => leg.date), ['2026-09-17', '2026-09-21', '2026-09-24']);
});

test('explicit stayFirst is honored and invalid splits are rejected', () => {
  const ok = buildMultiCityPlans({ origin: 'BEG', cities: ['FCO', 'BCN'], from: '2026-09-17', to: '2026-09-24', stayFirst: 5 });
  assert.equal(ok[0].stays[0].nights, 5);
  assert.equal(ok[0].stays[1].nights, 2);
  assert.equal(buildMultiCityPlans({ origin: 'BEG', cities: ['FCO', 'BCN'], from: '2026-09-17', to: '2026-09-24', stayFirst: 1 }).length, 0);
  assert.equal(buildMultiCityPlans({ origin: 'BEG', cities: ['FCO', 'BCN'], from: '2026-09-17', to: '2026-09-24', stayFirst: 6 }).length, 0);
  assert.equal(buildMultiCityPlans({ origin: 'BEG', cities: ['FCO', 'FCO'], from: '2026-09-17', to: '2026-09-24' }).length, 0);
  assert.equal(buildMultiCityPlans({ origin: 'FCO', cities: ['FCO', 'BCN'], from: '2026-09-17', to: '2026-09-24' }).length, 0);
  assert.equal(buildMultiCityPlans({ origin: 'BEG', cities: ['FCO', 'BCN'], from: '2026-09-17', to: '2026-09-20' }).length, 0); // < 2+2
});

test('cheapest offer per leg wins and the cheaper order ranks first', async () => {
  const priceBook = {
    'BEG-FCO': [oneWay('a1', 'BEG', 'FCO', '2026-09-17', 90), oneWay('a2', 'BEG', 'FCO', '2026-09-17', 60)],
    'FCO-BCN': [oneWay('b1', 'FCO', 'BCN', '2026-09-21', 45)],
    'BCN-BEG': [oneWay('c1', 'BCN', 'BEG', '2026-09-24', 120)],
    'BEG-BCN': [oneWay('d1', 'BEG', 'BCN', '2026-09-17', 150)],
    'BCN-FCO': [oneWay('e1', 'BCN', 'FCO', '2026-09-21', 40)],
    'FCO-BEG': [oneWay('f1', 'FCO', 'BEG', '2026-09-24', 70)]
  };
  const calls = [];
  const result = await searchMultiCityTrip({
    origin: 'BEG', cities: ['FCO', 'BCN'], from: '2026-09-17', to: '2026-09-24', pax: 2,
    searchImpl: async ({ origin, destination }) => {
      calls.push(`${origin}-${destination}`);
      return { flights: priceBook[`${origin}-${destination}`] || [] };
    }
  });
  assert.equal(calls.length, 6); // both orders × 3 legs
  assert.equal(result.trips.length, 2);
  assert.equal(result.trips[0].order.join('-'), 'BEG-FCO-BCN-BEG'); // FCO first is cheaper (225 vs 260)
  assert.equal(result.trips[0].transportPrice, 225);
  assert.equal(result.trips[1].transportPrice, 260);
  assert.equal(result.trips[0].legs[0].id, 'a2'); // cheapest BEG-FCO offer
  assert.equal(result.trips[0].ticketing.providerProtection, 'unprotected');
  assert.equal(result.trips[0].ticketing.tickets, 3);
});

test('an order with a missing leg is excluded, the other order survives', async () => {
  const result = await searchMultiCityTrip({
    origin: 'BEG', cities: ['FCO', 'BCN'], from: '2026-09-17', to: '2026-09-24',
    searchImpl: async ({ origin, destination }) => {
      if (`${origin}-${destination}` === 'FCO-BCN') return { flights: [], error: 'timeout' };
      return { flights: [oneWay('x', origin, destination, origin === 'BEG' ? '2026-09-17' : (destination === 'BEG' ? '2026-09-24' : '2026-09-21'), 80)] };
    }
  });
  assert.equal(result.trips.length, 1);
  assert.equal(result.trips[0].order.join('-'), 'BEG-BCN-FCO-BEG');
  assert.deepEqual(result.attempts.find(a => a.error)?.order, 'BEG-FCO-BCN-BEG');
});
