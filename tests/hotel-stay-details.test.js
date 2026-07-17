import test from 'node:test';
import assert from 'node:assert/strict';
import { extractAmenities, mergeStayDetails, normalizeStayDetails } from '../lib/hotel-stay-details.js';

test('normalizes only explicit rate conditions and property amenities', () => {
  const details = normalizeStayDetails({
    roomName: 'Deluxe Queen Room', breakfastIncluded: true, freeCancellation: true,
    messages: ['Taxes and fees included']
  }, {
    summary: { amenities: [{ name: 'Free WiFi' }, { name: 'Fitness center' }, { name: 'Free WiFi' }] }
  });
  assert.equal(details.roomType, 'Deluxe Queen Room');
  assert.equal(details.mealPlan, 'breakfast_included');
  assert.equal(details.cancellation, 'free_cancellation');
  assert.equal(details.taxes, 'included');
  assert.deepEqual(details.amenities, ['Free WiFi', 'Fitness center']);
});

test('leaves rate conditions unknown when the source does not state them', () => {
  const details = normalizeStayDetails({ name: 'Hotel' }, {});
  assert.equal(details.mealPlan, 'unknown');
  assert.equal(details.cancellation, 'unknown');
  assert.equal(details.taxes, 'unknown');
  assert.equal(details.roomType, null);
  assert.deepEqual(details.amenities, []);
});

test('keeps prior rate scope while adding detail amenities', () => {
  const merged = mergeStayDetails(
    normalizeStayDetails({ breakfastIncluded: true }, {}),
    normalizeStayDetails({}, { data: { facilities: [{ title: 'Airport shuttle' }] } })
  );
  assert.equal(merged.mealPlan, 'breakfast_included');
  assert.deepEqual(merged.amenities, ['Airport shuttle']);
  assert.deepEqual(extractAmenities({ facilities: ['Parking'] }), ['Parking']);
});
