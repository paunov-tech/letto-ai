import test from 'node:test';
import assert from 'node:assert/strict';
import { rankItineraries } from '../lib/mix-ranker.js';

function pkg(id, departure, total, hotelScore = 8.8, bookingUrl = 'https://www.booking.com/hotel/rs/test.html') {
  const returnDate = new Date(`${departure}T00:00:00Z`);
  returnDate.setUTCDate(returnDate.getUTCDate() + 7);
  return {
    id,
    origin: { code: 'BEG' },
    destination: { code: 'ATH' },
    dates: { departure, return: returnDate.toISOString().slice(0, 10), nights: 7 },
    flight: {
      totalPrice: 180,
      stops: 0,
      bookingUrl: 'https://www.aviasales.com/search/BEG0308ATH10082'
    },
    hotel: { totalWithTaxes: total - 180, nights: 7, reviewScore: hotelScore, bookingUrl },
    pricing: { total, currency: 'EUR' }
  };
}

test('filters incomplete handoffs and ranks complete itineraries', () => {
  const ranked = rankItineraries([
    pkg('complete', '2026-08-03', 600),
    pkg('incomplete', '2026-08-03', 300, 9, 'https://example.com/search')
  ], { from: '2026-08-03', to: '2026-08-10' });
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].id, 'complete');
  assert.equal(ranked[0].itinerary.complete, true);
});

test('date alignment outweighs a modest price difference', () => {
  const ranked = rankItineraries([
    pkg('near', '2026-08-03', 620),
    pkg('far', '2026-09-20', 560)
  ], { from: '2026-08-03', to: '2026-08-10' });
  assert.equal(ranked[0].id, 'near');
  assert.equal(ranked[0].dateMatch, 'exact');
  assert.equal(ranked[0].rank, 1);
});

test('does not present very distant inventory as a recommendation', () => {
  const ranked = rankItineraries([
    pkg('too-far', '2026-05-01', 400)
  ], { from: '2026-08-03', to: '2026-08-10' });
  assert.equal(ranked.length, 0);
});

test('labels a partial date mismatch as near rather than exact', () => {
  const shiftedReturn = pkg('shifted-return', '2026-08-03', 600);
  shiftedReturn.dates.return = '2026-08-12';
  shiftedReturn.dates.nights = 9;
  shiftedReturn.hotel.nights = 9;
  const ranked = rankItineraries([shiftedReturn], { from: '2026-08-03', to: '2026-08-10' });
  assert.equal(ranked[0].dateMatch, 'near');
  assert.match(ranked[0].why[0], /Najbliži/);
});
