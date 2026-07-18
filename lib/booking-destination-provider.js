const HOST = 'booking-com15.p.rapidapi.com';

function headers(key) {
  return {
    'X-RapidAPI-Key': key,
    'X-RapidAPI-Host': HOST,
    Accept: 'application/json'
  };
}

async function bookingGet(path, query, { fetchImpl = fetch, key = process.env.RAPIDAPI_KEY } = {}) {
  if (!key) return { data: [], error: 'not_configured' };
  const url = new URL(`https://${HOST}/api/v1/${path}`);
  url.searchParams.set('query', query);
  try {
    const response = await fetchImpl(url, {
      headers: headers(key),
      signal: AbortSignal.timeout ? AbortSignal.timeout(9000) : undefined
    });
    if (!response.ok) return { data: [], error: `http_${response.status}` };
    const payload = await response.json();
    return { data: Array.isArray(payload?.data) ? payload.data : [] };
  } catch (error) {
    return {
      data: [],
      error: error.name === 'TimeoutError' || error.name === 'AbortError' ? 'timeout' : 'exception'
    };
  }
}

export async function searchGlobalAirports(query, options = {}) {
  const value = String(query || '').trim();
  if (value.length < 2 || value.length > 80) return { airports: [], error: 'invalid_query' };
  const result = await bookingGet('flights/searchDestination', value, options);
  const seen = new Set();
  const airports = result.data.flatMap(row => {
    const code = String(row?.code || '').toUpperCase();
    if (row?.type !== 'AIRPORT' || !/^[A-Z]{3}$/.test(code) || seen.has(code)) return [];
    seen.add(code);
    return [{
      iata: code,
      airportId: row.id || `${code}.AIRPORT`,
      airport: row.name || code,
      city: row.cityName || row.name || code,
      cityEn: row.cityName || row.name || code,
      country: row.countryName || row.countryNameShort || row.country || '',
      countryCode: row.country || '',
      photo: /^https:\/\//.test(row.photoUri || '') ? row.photoUri : null,
      distanceToCityKm: Number(row?.distanceToCity?.value) || null,
      source: 'booking-com15'
    }];
  });
  return { airports, provider: 'booking-com15', error: result.error || null };
}

export async function resolveAirportCity(iata, options = {}) {
  const code = String(iata || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  const result = await searchGlobalAirports(code, options);
  return result.airports.find(item => item.iata === code) || null;
}

export async function resolveBookingHotelDestination(cityName, options = {}) {
  const result = await searchBookingHotelDestinations(cityName, options);
  return result.destinations[0] || null;
}

// Hotel destinations deliberately use Booking's hotel index rather than the
// flight index. A hotel search is allowed to end in a town, resort, district
// or village with no airport at all, so filtering this through IATA would
// silently remove precisely the places a hotel-only journey needs.
export async function searchBookingHotelDestinations(cityName, options = {}) {
  const value = String(cityName || '').trim();
  if (value.length < 2 || value.length > 80) return { destinations: [], error: 'invalid_query' };
  const result = await bookingGet('hotels/searchDestination', value, options);
  const seen = new Set();
  const destinations = result.data.flatMap(city => {
    const destId = String(city?.dest_id || '').trim();
    const cityEn = String(city?.city_name || city?.name || '').trim();
    if (!destId || !cityEn || seen.has(destId)) return [];
    seen.add(destId);
    return [{
      destId,
      searchType: String(city.search_type || city.dest_type || 'CITY').toUpperCase(),
      cityEn,
      country: city.country || '',
      latitude: Number(city.latitude) || null,
      longitude: Number(city.longitude) || null,
      source: 'booking-com15'
    }];
  });
  // Prefer actual cities, but keep resorts/districts when that is the only
  // honest result. Those are valid hotel destinations too.
  destinations.sort((a, b) => Number(b.searchType === 'CITY') - Number(a.searchType === 'CITY'));
  return { destinations: destinations.slice(0, 12), error: result.error || null };
}

export async function getBookingHotelProperty({
  hotelId, checkIn, checkOut, adults = 2
}, { fetchImpl = fetch, key = process.env.RAPIDAPI_KEY } = {}) {
  if (!key || !hotelId) return null;
  const url = new URL(`https://${HOST}/api/v1/hotels/getHotelDetails`);
  for (const [name, value] of Object.entries({
    hotel_id: String(hotelId),
    arrival_date: checkIn,
    departure_date: checkOut,
    adults: String(adults),
    room_qty: '1',
    currency_code: 'EUR',
    languagecode: 'en-us'
  })) url.searchParams.set(name, value);
  try {
    const response = await fetchImpl(url, {
      headers: headers(key),
      signal: AbortSignal.timeout ? AbortSignal.timeout(9000) : undefined
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const propertyUrl = payload?.data?.url;
    if (!/^https:\/\/(www\.)?booking\.com\/hotel\//i.test(propertyUrl || '')) return null;
    const handoff = new URL(propertyUrl);
    handoff.searchParams.set('checkin', checkIn);
    handoff.searchParams.set('checkout', checkOut);
    handoff.searchParams.set('group_adults', String(adults));
    handoff.searchParams.set('no_rooms', '1');
    return {
      bookingUrl: handoff.toString(),
      breakfastIncluded: payload?.data?.hotel_include_breakfast === true,
      address: payload?.data?.address || null,
      latitude: Number(payload?.data?.latitude) || null,
      longitude: Number(payload?.data?.longitude) || null
    };
  } catch (_) {
    return null;
  }
}
