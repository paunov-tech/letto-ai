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

test('accepts a concrete Hotels.com property handoff', () => {
  const c = itineraryContract({
    ...base,
    hotel: { ...base.hotel, bookingUrl: 'https://www.hotels.com/ho694842/classic-hotel-budapest/' }
  });
  assert.equal(c.hotel.verification, 'property_price_confirmed');
  assert.equal(c.complete, true);
});

test('only confirms inbound segments that came from a structured source', () => {
  const c = itineraryContract({
    ...base,
    flight: {
      ...base.flight,
      inbound: {
        origin: 'BUD', destination: 'BEG', departureTime: '18:45',
        arrivalTime: '19:50', flightNumber: 'JU145', sourceProvided: true
      }
    }
  });
  assert.equal(c.level, 'segment_confirmed');
  assert.equal(c.aiMayClaimExactSegments, true);

  const synthesized = itineraryContract({
    ...base,
    flight: {
      ...base.flight,
      inbound: {
        origin: 'BUD', destination: 'BEG', departureTime: '18:45',
        arrivalTime: '19:50', flightNumber: 'JU145', sourceProvided: false
      }
    }
  });
  assert.equal(synthesized.level, 'search_confirmed');
});

test('distinguishes an offer-specific flight handoff from a repeated search', () => {
  const c = itineraryContract({
    ...base,
    flight: {
      ...base.flight,
      bookingHandoff: 'offer_specific',
      bookingUrl: 'https://www.aviasales.com/search/BEG1709BUD24091?itinerary_key=abc&expected_price_uuid=uuid'
    }
  });
  assert.equal(c.flight.handoff, 'offer_specific');
  assert.equal(itineraryContract(base).flight.handoff, 'roundtrip_search');
});

test('accepts only complete and explicitly unprotected self-transfer handoffs', () => {
  const segment = (origin, destination, number) => ({
    legs: [{
      sourceProvided: true, origin, destination, flightNumber: number,
      departureAt: '2026-09-17T06:00:00+02:00', arrivalAt: '2026-09-17T07:00:00+02:00'
    }]
  });
  const url = route => `https://www.booking.com/flights/index.html?type=ONEWAY&depart=${route}&departDate=2026-09-17`;
  const c = itineraryContract({
    ...base,
    flight: {
      totalPrice: 320,
      bookingHandoff: 'multi_ticket_search',
      bookingUrl: url('BEG.AIRPORT-VIE.AIRPORT'),
      bookingUrls: [
        { url: url('BEG.AIRPORT-VIE.AIRPORT') },
        { url: url('VIE.AIRPORT-BUD.AIRPORT') },
        { url: url('BUD.AIRPORT-VIE.AIRPORT') },
        { url: url('VIE.AIRPORT-BEG.AIRPORT') }
      ],
      ticketing: { type: 'self_transfer', providerProtection: 'unprotected' },
      selfTransfer: {
        protected: false,
        outboundConnection: { safe: true },
        inboundConnection: { safe: true }
      },
      segments: [
        segment('BEG', 'VIE', 'JU1'), segment('VIE', 'BUD', 'OS2'),
        segment('BUD', 'VIE', 'OS3'), segment('VIE', 'BEG', 'JU4')
      ]
    }
  });
  assert.equal(c.level, 'segment_confirmed');
  assert.equal(c.handoffs, 5);
  assert.equal(c.flight.handoff, 'multi_ticket_search');
  assert.equal(c.flight.protection, 'unprotected_self_transfer');
});
