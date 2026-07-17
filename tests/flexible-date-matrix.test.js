import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFlexibleDateMatrix,
  selectDateDiverseFlights
} from '../lib/flexible-date-matrix.js';

test('builds exact, shifted and different-duration windows in a fixed budget', () => {
  const windows = buildFlexibleDateMatrix({
    from: '2026-09-17', to: '2026-09-27',
    today: new Date('2026-07-17T00:00:00Z')
  });
  assert.deepEqual(windows.map(item => [item.from, item.to, item.kind]), [
    ['2026-09-17', '2026-09-27', 'exact'],
    ['2026-09-14', '2026-09-24', 'shift_earlier'],
    ['2026-09-20', '2026-09-30', 'shift_later'],
    ['2026-09-17', '2026-09-25', 'shorter_stay'],
    ['2026-09-17', '2026-09-29', 'longer_stay']
  ]);
});

test('can disable flexibility and never creates an invalid short stay', () => {
  assert.equal(buildFlexibleDateMatrix({
    from: '2026-09-17', to: '2026-09-19', enabled: false,
    today: new Date('2026-07-17T00:00:00Z')
  }).length, 1);
});

test('selects distinct date pairs instead of several fares for one window', () => {
  const flights = [
    { id: 'a', origin: 'BEG', depart: '2026-09-17', ret: '2026-09-27', totalPrice: 300 },
    { id: 'b', origin: 'BEG', depart: '2026-09-17', ret: '2026-09-27', totalPrice: 250 },
    { id: 'c', origin: 'BEG', depart: '2026-09-14', ret: '2026-09-24', totalPrice: 180 },
    { id: 'd', origin: 'BEG', depart: '2026-09-20', ret: '2026-09-30', totalPrice: 190 }
  ];
  const selected = selectDateDiverseFlights(flights, {
    from: '2026-09-17', to: '2026-09-27'
  }, 3);
  assert.deepEqual(selected.map(item => item.id), ['b', 'c', 'd']);
});
