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
    amenities: ['Free WiFi', 'Gym'], source: 'property_page_structured_data', scope: 'property_only'
  });
});

test('does not infer a rate policy from a property page without structured amenities', () => {
  assert.deepEqual(propertyPageStayDetails('<h1>Hotel</h1>'), {
    amenities: [], source: 'unavailable', scope: 'property_only'
  });
});
