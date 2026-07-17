import test from 'node:test';
import assert from 'node:assert/strict';
import { searchTravelpayoutsFlights } from '../lib/live-flight-provider.js';

test('normalizes exact round trips and rejects distant or one-way rows', async () => {
  const previous = process.env.TRAVELPAYOUTS_TOKEN;
  process.env.TRAVELPAYOUTS_TOKEN = 'test-token';
  try {
    const result = await searchTravelpayoutsFlights({
      origin: 'BEG', destination: 'BUD', from: '2026-09-17', to: '2026-09-27', pax: 2,
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ data: [
          { price: 100, departure_at: '2026-09-17T06:00:00Z', return_at: '2026-09-27T18:00:00Z', airline: 'W6', transfers: 0 },
          { price: 50, departure_at: '2027-01-01T06:00:00Z', return_at: '2027-01-08T18:00:00Z', airline: 'XX' },
          { price: 20, departure_at: '2026-09-17T06:00:00Z', return_at: null }
        ] })
      })
    });
    assert.equal(result.flights.length, 1);
    assert.equal(result.flights[0].totalPrice, 200);
    assert.equal(result.flights[0].inbound.origin, 'BUD');
    assert.match(result.flights[0].bookingUrl, /BEG1709BUD2709/);
  } finally {
    if (previous === undefined) delete process.env.TRAVELPAYOUTS_TOKEN;
    else process.env.TRAVELPAYOUTS_TOKEN = previous;
  }
});
