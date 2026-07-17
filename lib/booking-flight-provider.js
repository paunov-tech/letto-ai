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

function normalizeLeg(leg, fallback = {}) {
  const number = flightNumber(leg);
  if (!number) return null;
  return {
    sourceProvided: true,
    origin: leg?.departureAirport?.code || fallback?.departureAirport?.code || '',
    destination: leg?.arrivalAirport?.code || fallback?.arrivalAirport?.code || '',
    departureAt: leg?.departureTimeTz || leg?.departureTime || fallback?.departureTimeTz || fallback?.departureTime || '',
    arrivalAt: leg?.arrivalTimeTz || leg?.arrivalTime || fallback?.arrivalTimeTz || fallback?.arrivalTime || '',
    departureTime: time(leg?.departureTime || fallback?.departureTime),
    arrivalTime: time(leg?.arrivalTime || fallback?.arrivalTime),
    flightNumber: number,
    airline: leg?.carriersData?.[0]?.name ||
      leg?.flightInfo?.carrierInfo?.marketingCarrier || '',
    airlineCode: leg?.flightInfo?.carrierInfo?.marketingCarrier ||
      leg?.flightInfo?.carrierInfo?.operatingCarrier || '',
    duration: Math.round(Number(leg?.totalTime || 0) / 60) || null,
    terminalFrom: leg?.departureTerminal || null,
    terminalTo: leg?.arrivalTerminal || null
  };
}

function normalizeSegment(segment) {
  const legs = (segment?.legs || []).map(leg => normalizeLeg(leg, segment)).filter(Boolean);
  if (!legs.length) return null;
  const connections = legs.slice(1).map((leg, index) => {
    const previous = legs[index];
    const minutes = Math.round(
      (Date.parse(leg.departureAt) - Date.parse(previous.arrivalAt)) / 60000
    );
    const airportChange = previous.destination !== leg.origin;
    const minimumMinutes = airportChange ? 240 : 90;
    return {
      fromFlight: previous.flightNumber,
      toFlight: leg.flightNumber,
      airport: airportChange ? `${previous.destination}→${leg.origin}` : leg.origin,
      airportChange,
      minutes: Number.isFinite(minutes) ? minutes : null,
      minimumMinutes,
      safe: Number.isFinite(minutes) && minutes >= minimumMinutes
    };
  });
  return {
    origin: segment?.departureAirport?.code || legs[0].origin,
    destination: segment?.arrivalAirport?.code || legs.at(-1).destination,
    departureAt: segment?.departureTimeTz || segment?.departureTime || legs[0].departureAt,
    arrivalAt: segment?.arrivalTimeTz || segment?.arrivalTime || legs.at(-1).arrivalAt,
    departureTime: time(segment?.departureTime),
    arrivalTime: time(segment?.arrivalTime),
    duration: Math.round(Number(segment?.totalTime || 0) / 60) || null,
    stops: Math.max(0, legs.length - 1),
    legs,
    connections
  };
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
  const outboundSegment = normalizeSegment(outbound);
  const inboundSegment = normalizeSegment(inbound);
  const outLeg = outboundSegment?.legs?.[0];
  const inLeg = inboundSegment?.legs?.[0];
  const totalPrice = money(offer?.priceBreakdown?.total);
  if (!outbound || !inbound || !outLeg || !inLeg || !(totalPrice > 0)) return null;
  const outNumber = outLeg?.flightNumber;
  const inNumber = inLeg?.flightNumber;
  if (!outNumber || !inNumber) return null;
  const airline = outLeg?.airline || outLeg?.airlineCode || '';
  return {
    id: `booking-${offer.flightKey || offer.token?.slice(0, 18) || `${outNumber}-${inNumber}`}`,
    airline,
    flightNumber: outNumber,
    departureTime: outboundSegment.departureTime,
    arrivalTime: outboundSegment.arrivalTime,
    duration: outboundSegment.duration,
    stops: outboundSegment.stops,
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
    ticketing: {
      type: 'single_provider_offer',
      tickets: 1,
      providerProtection: 'not_verified'
    },
    segments: [outboundSegment, inboundSegment],
    inbound: {
      sourceProvided: true,
      origin: inbound.departureAirport?.code || search.destination,
      destination: inbound.arrivalAirport?.code || search.origin,
      departureTime: time(inbound.departureTime),
      arrivalTime: time(inbound.arrivalTime),
      flightNumber: inNumber,
      airline: inLeg?.airline || airline,
      stops: inboundSegment.stops,
      duration: inboundSegment.duration,
      legs: inboundSegment.legs,
      connections: inboundSegment.connections
    }
  };
}

export function normalizeBookingOneWay(offer, search) {
  const segment = normalizeSegment(offer?.segments?.[0]);
  const totalPrice = money(offer?.priceBreakdown?.total);
  if (!segment || !(totalPrice > 0)) return null;
  const first = segment.legs[0];
  return {
    id: `booking-ow-${offer.flightKey || offer.token?.slice(0, 18) || first.flightNumber}`,
    origin: segment.origin,
    destination: segment.destination,
    depart: date(segment.departureAt),
    totalPrice: Math.round(totalPrice * 100) / 100,
    currency: offer?.priceBreakdown?.total?.currencyCode || 'EUR',
    segment,
    airline: first.airline,
    flightNumber: first.flightNumber,
    bookingUrl: bookingOneWayUrl({ ...search, from: date(segment.departureAt) }),
    bookingPartner: 'booking.com/flights',
    source: 'booking-com15'
  };
}

function bookingOneWayUrl({ origin, destination, from, pax }) {
  const url = new URL('https://www.booking.com/flights/index.html');
  url.search = new URLSearchParams({
    type: 'ONEWAY',
    cabinClass: 'ECONOMY',
    children: '',
    adults: String(pax),
    depart: `${origin}.AIRPORT-${destination}.AIRPORT`,
    departDate: from
  }).toString();
  return url.toString();
}

export async function searchBookingOneWayFlights({
  origin, destination, from, pax = 1, limit = 8, fetchImpl = fetch
}) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return { flights: [], provider: 'booking-com15-oneway', error: 'not_configured' };
  const url = new URL(`https://${HOST}/api/v1/flights/searchFlights`);
  for (const [name, value] of Object.entries({
    fromId: `${origin}.AIRPORT`,
    toId: `${destination}.AIRPORT`,
    departDate: from,
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
    if (!response.ok) {
      return { flights: [], provider: 'booking-com15-oneway', error: `http_${response.status}` };
    }
    const payload = await response.json();
    const flights = (payload?.data?.flightOffers || [])
      .map(offer => normalizeBookingOneWay(offer, { origin, destination, from, pax }))
      .filter(Boolean)
      .sort((a, b) => a.totalPrice - b.totalPrice)
      .slice(0, limit);
    return { flights, provider: 'booking-com15-oneway' };
  } catch (error) {
    return {
      flights: [], provider: 'booking-com15-oneway',
      error: error.name === 'TimeoutError' || error.name === 'AbortError' ? 'timeout' : 'exception'
    };
  }
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
