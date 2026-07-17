import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchFreshFlight,
  matchFreshHotel,
  priceCheck
} from '../lib/price-revalidation.js';

test('matches a fresh Booking flight by provider offer key before price comparison', () => {
  const matched = matchFreshFlight([
    { id: 'booking-old', sourceOfferKey: 'other', totalPrice: 300 },
    { id: 'booking-new', sourceOfferKey: 'wanted', totalPrice: 315 }
  ], { id: 'booking-old', sourceOfferKey: 'wanted' });
  assert.equal(matched.id, 'booking-new');
  assert.deepEqual(priceCheck(300, matched.totalPrice), {
    status: 'changed', previousPrice: 300, freshPrice: 315, difference: 15
  });
});

test('keeps self-transfer matching scoped to the selected hub', () => {
  const matched = matchFreshFlight([
    { selfTransfer: { required: true, hub: 'VIE' }, totalPrice: 400 },
    { selfTransfer: { required: true, hub: 'IST' }, totalPrice: 420 }
  ], { selfTransfer: { required: true, hub: 'IST' } });
  assert.equal(matched.selfTransfer.hub, 'IST');
});

test('matches hotel using the stable provider property id and never hides an unavailable price', () => {
  const matched = matchFreshHotel([
    { id: 'one', providerHotelId: '1', priceTotal: 400 },
    { id: 'two', providerHotelId: '2', priceTotal: 450 }
  ], { sourceHotelId: 'two' });
  assert.equal(matched.providerHotelId, '2');
  assert.deepEqual(priceCheck(400, null), {
    status: 'unavailable', previousPrice: 400, freshPrice: null, difference: null
  });
});
