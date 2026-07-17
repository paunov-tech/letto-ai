const HOST = 'booking-com15.p.rapidapi.com';

function money(value) {
  return Number(value?.units || 0) + Number(value?.nanos || 0) / 1e9;
}

function date(value) {
  return String(value || '').slice(0, 10);
}

function time(value) {
  return String(value || '').slice(11, 16);
}

function flightNumber(leg) {
  const carrier = leg?.flightInfo?.carrierInfo?.marketingCarrier ||
    leg?.flightInfo?.carrierInfo?.operatingCarrier || '';
  const number = leg?.flightInfo?.flightNumber;
  return carrier && number !== undefined ? `${carrier}${number}` : '';
}

function bookingSearchUrl({ origin, destination, from, to, pax }) {
  const url = new URL('https://www.booking.com/flights/index.html');
  url.search = new URLSearchParams({
    type: 'ROUNDTRIP',
    cabinClass: 'ECONOMY',
    children: '',
    adults: String(pax),
    depart: `${origin}.AIRPORT-${destination}.AIRPORT`,
    return: `${destination}.AIRPORT-${origin}.AIRPORT`,
    departDate: from,
    returnDate: to
  }).toString();
  return url.toString();
}

export function normalizeBookingFlight(offer, search) {
  const outbound = offer?.segments?.[0];
  const inbound = offer?.segments?.[1];
  const outLeg = outbound?.legs?.[0];
  const inLeg = inbound?.legs?.[0];
  const totalPrice = money(offer?.priceBreakdown?.total);
  if (!outbound || !inbound || !outLeg || !inLeg || !(totalPrice > 0)) return null;
  const outNumber = flightNumber(outLeg);
  const inNumber = flightNumber(inLeg);
  if (!outNumber || !inNumber) return null;
  const airline = outLeg?.carriersData?.[0]?.name ||
    outLeg?.flightInfo?.carrierInfo?.marketingCarrier || '';
  return {
    id: `booking-${offer.flightKey || offer.token?.slice(0, 18) || `${outNumber}-${inNumber}`}`,
    airline,
    flightNumber: outNumber,
    departureTime: time(outbound.departureTime),
    arrivalTime: time(outbound.arrivalTime),
    duration: Math.round(Number(outbound.totalTime || 0) / 60) || null,
    stops: Math.max(0, Number(outbound.legs?.length || 1) - 1),
    origin: outbound.departureAirport?.code || search.origin,
    destination: outbound.arrivalAirport?.code || search.destination,
    depart: date(outbound.departureTime),
    ret: date(inbound.departureTime),
    totalPrice: Math.round(totalPrice * 100) / 100,
    unitPrice: Math.round(totalPrice / Math.max(1, search.pax) * 100) / 100,
    currency: offer?.priceBreakdown?.total?.currencyCode || 'EUR',
    bookingUrl: bookingSearchUrl({
      ...search,
      from: date(outbound.departureTime),
      to: date(inbound.departureTime)
    }),
    bookingPartner: 'booking.com/flights',
    bookingHandoff: 'roundtrip_search',
    source: 'booking-com15',
    sourceOfferKey: offer.flightKey || null,
    inbound: {
      sourceProvided: true,
      origin: inbound.departureAirport?.code || search.destination,
      destination: inbound.arrivalAirport?.code || search.origin,
      departureTime: time(inbound.departureTime),
      arrivalTime: time(inbound.arrivalTime),
      flightNumber: inNumber,
      airline: inLeg?.carriersData?.[0]?.name || airline,
      stops: Math.max(0, Number(inbound.legs?.length || 1) - 1),
      duration: Math.round(Number(inbound.totalTime || 0) / 60) || null
    }
  };
}

export async function searchBookingFlights({
  origin, destination, from, to, pax = 1, limit = 12, fetchImpl = fetch
}) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return { flights: [], provider: 'booking-com15', error: 'not_configured' };
  const url = new URL(`https://${HOST}/api/v1/flights/searchFlights`);
  for (const [name, value] of Object.entries({
    fromId: `${origin}.AIRPORT`,
    toId: `${destination}.AIRPORT`,
    departDate: from,
    returnDate: to,
    pageNo: '1',
    adults: String(pax),
    sort: 'BEST',
    cabinClass: 'ECONOMY',
    currency_code: 'EUR'
  })) url.searchParams.set(name, value);
  try {
    const response = await fetchImpl(url, {
      headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': HOST },
      signal: AbortSignal.timeout ? AbortSignal.timeout(28000) : undefined
    });
    if (!response.ok) return { flights: [], provider: 'booking-com15', error: `http_${response.status}` };
    const payload = await response.json();
    const flights = (payload?.data?.flightOffers || [])
      .map(offer => normalizeBookingFlight(offer, { origin, destination, from, to, pax }))
      .filter(Boolean)
      .sort((a, b) => a.totalPrice - b.totalPrice)
      .slice(0, limit);
    return { flights, provider: 'booking-com15', fetchedAt: new Date().toISOString() };
  } catch (error) {
    return {
      flights: [],
      provider: 'booking-com15',
      error: error.name === 'TimeoutError' || error.name === 'AbortError' ? 'timeout' : 'exception'
    };
  }
}
