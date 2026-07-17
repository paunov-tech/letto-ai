import test from 'node:test';
import assert from 'node:assert/strict';
import { itineraryContract } from '../lib/itinerary-contract.js';

const base = {
  dates: { departure: '2026-09-17', return: '2026-09-24', nights: 7 },
  flight: {
    totalPrice: 100,
    bookingUrl: 'https://www.aviasales.com/search/BEG1709BUD24091?marker=722287'
  },
  hotel: {
    nights: 7, totalWithTaxes: 500,
    bookingUrl: 'https://www.booking.com/hotel/hu/example.html'
  }
};

test('accepts a date-aligned independent flight search and hotel property', () => {
  const c = itineraryContract(base);
  assert.equal(c.level, 'search_confirmed');
  assert.equal(c.complete, true);
  assert.equal(c.flight.hasInboundSegment, false);
  assert.equal(c.aiMayClaimExactSegments, false);
});

test('rejects a generic hotel redirect', () => {
  const c = itineraryContract({ ...base, hotel: { ...base.hotel, bookingUrl: 'https://www.booking.com/searchresults.html?ss=Budapest' } });
  assert.equal(c.level, 'incomplete');
  assert.equal(c.hotel.verification, 'unavailable');
  assert.equal(c.aiMayRank, false);
});

test('rejects a declared stay that disagrees with calendar dates', () => {
  const c = itineraryContract({
    ...base,
    dates: { departure: '2026-09-17', return: '2026-09-29', nights: 10 },
    hotel: { ...base.hotel, nights: 10 }
  });
  assert.equal(c.calendarNights, 12);
  assert.equal(c.dateAligned, false);
  assert.equal(c.complete, false);
});
