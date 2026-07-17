import test from 'node:test';
import assert from 'node:assert/strict';
import { extractAssignedJson, normalizeHotels } from '../scrapers/sources/kontiki.mjs';

test('extracts server-rendered pagingData without being confused by braces in strings', () => {
  const html = '<script>HotelSearchProperties.Prm.pagingData = {"body":{"note":"x } y","hotels":[]}}; next();</script>';
  assert.deepEqual(extractAssignedJson(html, 'HotelSearchProperties.Prm.pagingData ='), {
    body: { note: 'x } y', hotels: [] }
  });
});

test('normalizes the cheapest available structured package offer', () => {
  const rows = normalizeHotels({ body: { hotels: [{
    name: 'Hotel Test', stars: 5, city: { name: 'ANTALIJA' }, country: { name: 'TURSKA' },
    offers: [
      { isAvailable: false, night: 7, checkIn: '2026-08-01', price: { amount: 1000, currency: 'EUR' } },
      { isAvailable: true, night: 7, checkIn: '2026-08-01', price: { amount: 1200, oldAmount: 1400, currency: 'EUR' }, rooms: [{ roomName: 'Standard', boardName: 'All Inclusive' }] }
    ]
  }] } }, 'https://example.test/search', 'https://kontiki.rs', { code: 'AYT', name: 'ANTALIJA' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].price, 1200);
  assert.equal(rows[0].available, true);
  assert.equal(rows[0].allInclusive, true);
  assert.equal(rows[0].destinationCode, 'AYT');
  assert.equal(rows[0].originCode, 'BEG');
});
