import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBookingHotelProperty,
  resolveAirportCity,
  resolveBookingHotelDestination,
  searchGlobalAirports
} from '../lib/booking-destination-provider.js';

const key = 'test-key';

test('normalizes only unique airport results from global discovery', async () => {
  const result = await searchGlobalAirports('New York', {
    key,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ data: [
        { id: 'NYC.CITY', type: 'CITY', code: 'NYC', name: 'New York' },
        {
          id: 'JFK.AIRPORT', type: 'AIRPORT', code: 'JFK',
          name: 'John F. Kennedy International Airport', cityName: 'New York',
          country: 'US', countryName: 'United States'
        },
        { id: 'JFK.AIRPORT', type: 'AIRPORT', code: 'JFK', cityName: 'New York' }
      ] })
    })
  });
  assert.equal(result.airports.length, 1);
  assert.equal(result.airports[0].iata, 'JFK');
  assert.equal(result.airports[0].cityEn, 'New York');
});

test('enriches a hotel with a date-specific property handoff', async () => {
  const property = await getBookingHotelProperty({
    hotelId: '1663551', checkIn: '2026-09-17', checkOut: '2026-09-27', adults: 2
  }, {
    key,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ data: {
        url: 'https://www.booking.com/hotel/us/manhattan-bowery-lodge.html',
        address: 'Bowery, New York',
        latitude: 40.7,
        longitude: -74
      } })
    })
  });
  assert.match(property.bookingUrl, /booking\.com\/hotel\/us\/manhattan-bowery-lodge\.html/);
  assert.match(property.bookingUrl, /checkin=2026-09-17/);
  assert.equal(property.address, 'Bowery, New York');
});

test('resolves an exact IATA airport to its hotel city', async () => {
  const airport = await resolveAirportCity('JFK', {
    key,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ data: [{
        id: 'JFK.AIRPORT', type: 'AIRPORT', code: 'JFK',
        name: 'John F. Kennedy International Airport', cityName: 'New York'
      }] })
    })
  });
  assert.equal(airport.cityEn, 'New York');
});

test('resolves a Booking hotel city id dynamically', async () => {
  const destination = await resolveBookingHotelDestination('New York', {
    key,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ data: [
        { dest_id: '929', search_type: 'district', name: 'Manhattan' },
        { dest_id: '20088325', search_type: 'city', city_name: 'New York', country: 'United States' }
      ] })
    })
  });
  assert.equal(destination.destId, '20088325');
  assert.equal(destination.searchType, 'CITY');
});
