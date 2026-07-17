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
  const value = String(cityName || '').trim();
  if (value.length < 2) return null;
  const result = await bookingGet('hotels/searchDestination', value, options);
  const city = result.data.find(row =>
    String(row.search_type || row.dest_type || '').toLowerCase() === 'city'
  ) || result.data[0];
  if (!city?.dest_id) return null;
  return {
    destId: String(city.dest_id),
    searchType: String(city.search_type || city.dest_type || 'CITY').toUpperCase(),
    cityEn: city.city_name || city.name || value,
    country: city.country || '',
    latitude: Number(city.latitude) || null,
    longitude: Number(city.longitude) || null,
    source: 'booking-com15'
  };
}
