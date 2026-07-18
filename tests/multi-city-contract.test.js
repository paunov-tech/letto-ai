import test from 'node:test';
import assert from 'node:assert/strict';
import { multiCityContract } from '../lib/multi-city-contract.js';

function leg(origin, destination, date, price = 80) {
  return {
    origin, destination, depart: date, totalPrice: price,
    bookingUrl: `https://www.booking.com/flights/index.html?type=ONEWAY&depart=${origin}.AIRPORT-${destination}.AIRPORT&departDate=${date}`,
    segment: {
      origin, destination, stops: 0,
      legs: [{
        sourceProvided: true, origin, destination,
        departureAt: `${date}T06:00:00+02:00`, arrivalAt: `${date}T08:00:00+02:00`,
        flightNumber: 'JU1', airline: 'Air Serbia'
      }]
    }
  };
}

function hotel(nights, url = 'https://www.booking.com/hotel/it/test.html', total = 300) {
  return { name: 'Test Hotel', bookingUrl: url, totalWithTaxes: total, nights };
}

function validPackage() {
  return {
    id: 'mc-BEG-FCO-BCN-BEG-2026-09-17-2026-09-24',
    multiCity: true,
    origin: { code: 'BEG' },
    stops: [
      { code: 'FCO', stay: { code: 'FCO', checkIn: '2026-09-17', checkOut: '2026-09-21', nights: 4 }, hotel: hotel(4) },
      { code: 'BCN', stay: { code: 'BCN', checkIn: '2026-09-21', checkOut: '2026-09-24', nights: 3 }, hotel: hotel(3) }
    ],
    legs: [
      leg('BEG', 'FCO', '2026-09-17'),
      leg('FCO', 'BCN', '2026-09-21'),
      leg('BCN', 'BEG', '2026-09-24')
    ],
    dates: { departure: '2026-09-17', return: '2026-09-24', nights: 7 },
    pricing: { total: 840, currency: 'EUR' }
  };
}

test('a fully sourced multi-city package is segment_confirmed with 5 handoffs', () => {
  const contract = multiCityContract(validPackage());
  assert.equal(contract.complete, true);
  assert.equal(contract.level, 'segment_confirmed');
  assert.equal(contract.handoffs, 5);
  assert.equal(contract.protection, 'unprotected_independent_tickets');
  assert.equal(contract.aiMayRank, true);
  assert.deepEqual(contract.hotels.map(h => h.verification), ['property_price_confirmed', 'property_price_confirmed']);
});

test('a leg date that breaks the stay boundary is incomplete', () => {
  const pkg = validPackage();
  pkg.legs[1] = leg('FCO', 'BCN', '2026-09-22'); // stay says checkOut 09-21
  const contract = multiCityContract(pkg);
  assert.equal(contract.complete, false);
  assert.equal(contract.dateAligned, false);
  assert.equal(contract.aiMayRank, false);
});

test('a broken airport chain is incomplete', () => {
  const pkg = validPackage();
  pkg.legs[1] = leg('FCO', 'PMI', '2026-09-21');
  const contract = multiCityContract(pkg);
  assert.equal(contract.complete, false);
  assert.equal(contract.legsConfirmed, false);
});

test('a hotel without a confirmable property page is incomplete', () => {
  const pkg = validPackage();
  pkg.stops[1].hotel = hotel(3, 'https://example.com/not-a-property');
  const contract = multiCityContract(pkg);
  assert.equal(contract.complete, false);
  assert.deepEqual(contract.hotels.map(h => h.verification), ['property_price_confirmed', 'unavailable']);
});

test('hotel nights must match the stay exactly', () => {
  const pkg = validPackage();
  pkg.stops[0].hotel = hotel(2); // stay is 4 nights
  assert.equal(multiCityContract(pkg).complete, false);
});

test('a leg without source-provided segments is incomplete', () => {
  const pkg = validPackage();
  pkg.legs[0].segment.legs[0].sourceProvided = false;
  assert.equal(multiCityContract(pkg).complete, false);
});
