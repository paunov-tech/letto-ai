import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBookingFlight, searchBookingFlights } from '../lib/booking-flight-provider.js';

const offer = {
  flightKey: 'JU140-JU145',
  segments: [
    {
      departureAirport: { code: 'BEG' }, arrivalAirport: { code: 'BUD' },
      departureTime: '2026-09-17T09:45:00', arrivalTime: '2026-09-17T10:55:00',
      totalTime: 4200,
      legs: [{
        flightInfo: { flightNumber: 140, carrierInfo: { marketingCarrier: 'JU' } },
        carriersData: [{ name: 'Air Serbia' }]
      }]
    },
    {
      departureAirport: { code: 'BUD' }, arrivalAirport: { code: 'BEG' },
      departureTime: '2026-09-27T18:45:00', arrivalTime: '2026-09-27T19:50:00',
      totalTime: 3900,
      legs: [{
        flightInfo: { flightNumber: 145, carrierInfo: { marketingCarrier: 'JU' } },
        carriersData: [{ name: 'Air Serbia' }]
      }]
    }
  ],
  priceBreakdown: { total: { currencyCode: 'EUR', units: 300, nanos: 890000000 } }
};

test('normalizes a Booking round trip with both source-provided segments', () => {
  const flight = normalizeBookingFlight(offer, {
    origin: 'BEG', destination: 'BUD', from: '2026-09-17', to: '2026-09-27', pax: 2
  });
  assert.equal(flight.flightNumber, 'JU140');
  assert.equal(flight.inbound.flightNumber, 'JU145');
  assert.equal(flight.inbound.sourceProvided, true);
  assert.equal(flight.totalPrice, 300.89);
  assert.match(flight.bookingUrl, /booking\.com\/flights/);
});

test('calls the subscribed RapidAPI endpoint and drops incomplete offers', async () => {
  const previous = process.env.RAPIDAPI_KEY;
  process.env.RAPIDAPI_KEY = 'test-key';
  try {
    const result = await searchBookingFlights({
      origin: 'BEG', destination: 'BUD', from: '2026-09-17', to: '2026-09-27', pax: 2,
      fetchImpl: async (url, options) => {
        assert.match(String(url), /searchFlights/);
        assert.equal(options.headers['X-RapidAPI-Host'], 'booking-com15.p.rapidapi.com');
        return { ok: true, json: async () => ({ data: { flightOffers: [offer, {}] } }) };
      }
    });
    assert.equal(result.flights.length, 1);
    assert.equal(result.provider, 'booking-com15');
  } finally {
    if (previous === undefined) delete process.env.RAPIDAPI_KEY;
    else process.env.RAPIDAPI_KEY = previous;
  }
});
