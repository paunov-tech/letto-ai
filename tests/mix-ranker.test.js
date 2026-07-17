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
  assert.match(ranked[0].why[0], /Duži boravak/);
});

test('explains a longer stay without disguising it as generic date drift', () => {
  const longer = pkg('longer', '2026-08-03', 600);
  longer.dates.return = '2026-08-12';
  longer.dates.nights = 9;
  longer.hotel.nights = 9;
  const ranked = rankItineraries([longer], { from: '2026-08-03', to: '2026-08-10' });
  assert.equal(ranked[0].dateFlex.nightsDifference, 2);
  assert.match(ranked[0].why[0], /Duži boravak: 9 noći/);
});

test('a saved ranking preference changes order without changing verification', () => {
  const cheap = pkg('cheap', '2026-08-03', 500, 7.2);
  cheap.flight.stops = 1;
  cheap.flight.duration = '5h 20m';
  const qualityHotel = pkg('quality', '2026-08-03', 620, 9.6);
  qualityHotel.flight.stops = 0;
  qualityHotel.flight.duration = '2h 10m';

  const ranked = rankItineraries([cheap, qualityHotel], {
    from: '2026-08-03', to: '2026-08-10', preference: 'hotel'
  });
  assert.equal(ranked[0].id, 'quality');
  assert.equal(ranked[0].personalization.preference, 'hotel');
  assert.equal(ranked[0].itinerary.level, 'search_confirmed');
  assert.equal(ranked[1].itinerary.level, 'search_confirmed');
});

test('direct-flight preference keeps self-transfer explicit and behind a verified direct option', () => {
  const direct = pkg('direct', '2026-08-03', 620, 8.2);
  direct.flight.stops = 0;
  direct.flight.duration = '2h 00m';
  const selfTransfer = pkg('self', '2026-08-03', 500, 9.4);
  selfTransfer.flight.stops = 0;
  selfTransfer.flight.duration = '1h 40m';
  selfTransfer.flight.selfTransfer = { required: true, protected: false };
  selfTransfer.flight.ticketing = { type: 'self_transfer', providerProtection: 'unprotected' };
  selfTransfer.flight.bookingUrls = [1, 2, 3, 4].map(n => ({ url: `https://www.booking.com/flights/route/?type=ONEWAY&depart=BEG&departDate=2026-08-0${n}` }));
  selfTransfer.flight.segments = [1, 2, 3, 4].map(n => ({ legs: [{ sourceProvided: true, flightNumber: `X${n}`, departureAt: '2026-08-03T08:00:00Z', arrivalAt: '2026-08-03T10:00:00Z' }] }));
  selfTransfer.flight.selfTransfer.outboundConnection = { safe: true };
  selfTransfer.flight.selfTransfer.inboundConnection = { safe: true };

  const ranked = rankItineraries([selfTransfer, direct], {
    from: '2026-08-03', to: '2026-08-10', preference: 'direct'
  });
  assert.equal(ranked[0].id, 'direct');
  assert.equal(ranked[1].flight.selfTransfer.required, true);
});
