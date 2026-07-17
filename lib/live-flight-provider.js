import { buildAviasalesUrl } from './aviasales-url.js';

const DAY = 86400000;

function isoDate(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function deltaDays(left, right) {
  return Math.abs(Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / DAY;
}

export async function searchTravelpayoutsFlights({
  origin, destination, from, to, pax = 1, limit = 12, fetchImpl = fetch
}) {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!token) return { flights: [], provider: 'travelpayouts', error: 'not_configured' };
  const url = new URL('https://api.travelpayouts.com/aviasales/v3/prices_for_dates');
  url.searchParams.set('origin', origin);
  url.searchParams.set('destination', destination);
  url.searchParams.set('currency', 'EUR');
  url.searchParams.set('departure_at', from.slice(0, 7));
  url.searchParams.set('return_at', to.slice(0, 7));
  url.searchParams.set('one_way', 'false');
  url.searchParams.set('sorting', 'price');
  url.searchParams.set('limit', '30');
  url.searchParams.set('token', token);

  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'letto.live-mix/3.0' },
      signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined
    });
    if (!response.ok) return { flights: [], provider: 'travelpayouts', error: `http_${response.status}` };
    const json = await response.json();
    const flights = (Array.isArray(json?.data) ? json.data : []).flatMap(row => {
      const depart = isoDate(row.departure_at);
      const ret = isoDate(row.return_at);
      const unitPrice = Number(row.price);
      if (!depart || !ret || !(unitPrice > 0) || ret <= depart) return [];
      if (deltaDays(depart, from) > 21 || deltaDays(ret, to) > 21) return [];
      const pkg = {
        origin: { code: origin },
        destination: { code: destination },
        dates: { departure: depart, return: ret }
      };
      return [{
        id: `tp-${origin}-${destination}-${depart}-${ret}-${row.airline || 'xx'}`,
        airline: row.airline || '',
        flightNumber: row.flight_number ? String(row.flight_number) : '',
        departureTime: String(row.departure_at || '').slice(11, 16),
        returnTime: String(row.return_at || '').slice(11, 16),
        duration: Number(row.duration) || null,
        stops: Number(row.transfers) || 0,
        origin, destination, depart, ret,
        unitPrice,
        totalPrice: Math.round(unitPrice * Math.max(1, pax)),
        currency: 'EUR',
        bookingUrl: buildAviasalesUrl(pkg),
        bookingPartner: 'aviasales.com',
        source: 'travelpayouts',
        inbound: {
          sourceProvided: false,
          origin: destination,
          destination: origin,
          departureTime: String(row.return_at || '').slice(11, 16)
        }
      }];
    }).sort((a, b) => a.totalPrice - b.totalPrice).slice(0, limit);
    return { flights, provider: 'travelpayouts', fetchedAt: new Date().toISOString() };
  } catch (error) {
    return { flights: [], provider: 'travelpayouts', error: error.name === 'TimeoutError' ? 'timeout' : 'exception' };
  }
}
