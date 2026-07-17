import test from 'node:test';
import assert from 'node:assert/strict';
import { directBookingUrl, inventoryId, pairRoundTrips, SOURCE_ROUTES } from '../scrapers/lib/flight-inventory.mjs';

test('source route matrix is provider-aware', () => {
  assert.ok(SOURCE_ROUTES.wizzair.some(([origin]) => origin === 'BEG'));
  assert.ok(SOURCE_ROUTES.wizzair.some(([origin]) => origin === 'INI'));
  assert.deepEqual(SOURCE_ROUTES.ryanair.map(route => route[0]), ['INI', 'INI', 'INI', 'INI']);
  assert.deepEqual(SOURCE_ROUTES.pegasus, [['BEG', 'SAW']]);
});

test('round trips use a same-currency return within 3 to 10 nights', () => {
  assert.deepEqual(pairRoundTrips(
    [{ date: '2026-08-01', price: 45, currency: 'EUR' }],
    [{ date: '2026-08-02', price: 10, currency: 'EUR' }, { date: '2026-08-06', price: 35, currency: 'EUR' }, { date: '2026-08-07', price: 30, currency: 'USD' }]
  ), [{ outbound: { date: '2026-08-01', price: 45, currency: 'EUR' }, inbound: { date: '2026-08-06', price: 35, currency: 'EUR' }, nights: 5, totalPrice: 80, currency: 'EUR' }]);
});

test('IDs are deterministic and booking URLs remain source-direct', () => {
  const entry = { source: 'wizzair', type: 'roundtrip_flight', origin: 'BEG', destination: 'MLA', outbound: { date: '2026-08-01' }, return: { date: '2026-08-08' } };
  assert.equal(inventoryId(entry), inventoryId({ ...entry }));
  assert.match(directBookingUrl('wizzair', 'BEG', 'MLA'), /departureStation=BEG/);
  assert.match(directBookingUrl('ryanair', 'INI', 'VIE'), /departureAirportIataCode=INI/);
});
