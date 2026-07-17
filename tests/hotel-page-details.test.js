import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPropertyPageAmenities, propertyPageStayDetails } from '../lib/hotel-page-details.js';

test('extracts only enabled structured property amenities from a hotel page', () => {
  const html = `<script type="application/ld+json">{
    "@type":"Hotel","amenityFeature":[
      {"name":"Free WiFi","value":true},
      {"name":"Pool","value":false},
      {"name":"Gym","value":true}
    ]
  }</script>`;
  assert.deepEqual(extractPropertyPageAmenities(html), ['Free WiFi', 'Gym']);
  assert.deepEqual(propertyPageStayDetails(html), {
    amenities: ['Free WiFi', 'Gym'], source: 'property_page_amenities', scope: 'property_only'
  });
});

test('extracts the visible Booking.com popular amenities list without inferring rate terms', () => {
  const html = `
    <h3>Most popular amenities</h3>
    <ul><li><span>Free Wifi</span></li><li><span>Family rooms</span></li><li><span>24-hour front desk</span></li></ul>
    <p>Breakfast may be available with some rates.</p>`;
  assert.deepEqual(extractPropertyPageAmenities(html), ['Free Wifi', 'Family rooms', '24-hour front desk']);
  assert.deepEqual(propertyPageStayDetails(html), {
    amenities: ['Free Wifi', 'Family rooms', '24-hour front desk'],
    source: 'property_page_amenities', scope: 'property_only'
  });
});

test('does not infer a rate policy from a property page without structured amenities', () => {
  assert.deepEqual(propertyPageStayDetails('<h1>Hotel</h1>'), {
    amenities: [], source: 'unavailable', scope: 'property_only'
  });
});
