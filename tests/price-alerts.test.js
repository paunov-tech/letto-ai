import test from 'node:test';
import assert from 'node:assert/strict';
import { bestAlertTotal, evaluatePriceAlert, normalizePriceAlertSearch, normalizeTargetTotal } from '../lib/price-alerts.js';

test('normalizes only a complete alert search and bounded target', () => {
  assert.deepEqual(normalizePriceAlertSearch({ origin:'beg', dest:'bud', from:'2026-09-17', to:'2026-09-27', pax:2, preference:'direct' }), {
    origin:'BEG', dest:'BUD', from:'2026-09-17', to:'2026-09-27', pax:2, preference:'direct'
  });
  assert.equal(normalizePriceAlertSearch({ origin:'BEG', dest:'BEG', from:'2026-09-17', to:'2026-09-27' }), null);
  assert.equal(normalizeTargetTotal('499.6'), 500);
  assert.equal(normalizeTargetTotal('12'), null);
});

test('uses only complete itinerary totals and notifies for target or meaningful drops', () => {
  assert.equal(bestAlertTotal({ itineraries:[{ itinerary:{ complete:true }, pricing:{ total:620 } }, { itinerary:{ complete:true }, pricing:{ total:580 } }, { itinerary:{ complete:false }, pricing:{ total:20 } }] }), 580);
  assert.deepEqual(evaluatePriceAlert({ previousTotal:700, currentTotal:640, targetTotal:null }), { notify:true, reason:'meaningful_drop', drop:60 });
  assert.deepEqual(evaluatePriceAlert({ previousTotal:700, currentTotal:695, targetTotal:null }), { notify:false, reason:'minor_drop', drop:5 });
  assert.deepEqual(evaluatePriceAlert({ previousTotal:700, currentTotal:650, targetTotal:660, targetReachedAt:null }), { notify:true, reason:'target_reached', drop:50 });
});
