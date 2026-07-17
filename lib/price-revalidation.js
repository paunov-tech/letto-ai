// Shared identity matching and price-state rules for the last-mile booking
// check. Provider calls live in the API route; keeping these rules pure makes
// it impossible for the UI to silently treat a missing offer as "unchanged".

function positivePrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : null;
}

function sameText(left, right) {
  return String(left || '') === String(right || '');
}

export function matchFreshFlight(flights, selected = {}) {
  const candidates = Array.isArray(flights) ? flights : [];
  if (selected?.selfTransfer?.required) {
    return candidates.find(flight => flight?.selfTransfer?.required &&
      sameText(flight?.selfTransfer?.hub, selected.selfTransfer.hub)) || null;
  }
  if (selected.sourceOfferKey) {
    const byOfferKey = candidates.find(flight => sameText(flight.sourceOfferKey, selected.sourceOfferKey));
    if (byOfferKey) return byOfferKey;
  }
  if (selected.offerId || selected.id) {
    const wantedId = selected.offerId || selected.id;
    const byId = candidates.find(flight => sameText(flight.id, wantedId));
    if (byId) return byId;
  }
  return candidates.find(flight =>
    sameText(flight.origin, selected.origin) &&
    sameText(flight.destination, selected.dest || selected.destination) &&
    sameText(flight.depart, selected.depart) &&
    sameText(flight.ret, selected.ret) &&
    sameText(flight.flightNumber, selected.flightNumber) &&
    sameText(flight.departureTime, selected.departureTime)
  ) || null;
}

export function matchFreshHotel(hotels, selected = {}) {
  const candidates = Array.isArray(hotels) ? hotels : [];
  const ids = [selected.sourceHotelId, selected.providerHotelId, selected.hotelId]
    .filter(Boolean).map(String);
  if (!ids.length) return null;
  return candidates.find(hotel => ids.includes(String(hotel.id || '')) ||
    ids.includes(String(hotel.providerHotelId || ''))) || null;
}

export function priceCheck(previousValue, freshValue) {
  const previous = positivePrice(previousValue);
  const fresh = positivePrice(freshValue);
  if (fresh === null) return { status: 'unavailable', previousPrice: previous, freshPrice: null, difference: null };
  if (previous === null) return { status: 'confirmed', previousPrice: null, freshPrice: fresh, difference: null };
  const difference = Math.round((fresh - previous) * 100) / 100;
  return {
    status: Math.abs(difference) < 0.01 ? 'confirmed' : 'changed',
    previousPrice: previous,
    freshPrice: fresh,
    difference
  };
}

export function projectFreshFlight(flight) {
  if (!flight) return null;
  return {
    id: flight.id || null,
    source: flight.source || null,
    sourceOfferKey: flight.sourceOfferKey || null,
    airline: flight.airline || '',
    flightNumber: flight.flightNumber || '',
    departureTime: flight.departureTime || '',
    arrivalTime: flight.arrivalTime || '',
    origin: flight.origin || '',
    dest: flight.destination || '',
    depart: flight.depart || '',
    ret: flight.ret || '',
    duration: flight.duration || null,
    stops: Number(flight.stops || 0),
    totalPrice: positivePrice(flight.totalPrice),
    currency: flight.currency || 'EUR',
    bookingUrl: flight.bookingUrl || '',
    bookingUrls: Array.isArray(flight.bookingUrls) ? flight.bookingUrls : null,
    bookingPartner: flight.bookingPartner || '',
    inbound: flight.inbound || null,
    segments: Array.isArray(flight.segments) ? flight.segments : null,
    selfTransfer: flight.selfTransfer || null,
    ticketing: flight.ticketing || null
  };
}

export function projectFreshHotel(hotel) {
  if (!hotel) return null;
  return {
    sourceHotelId: hotel.id || null,
    providerHotelId: hotel.providerHotelId || null,
    source: hotel.source || null,
    name: hotel.name || '',
    pricePerNight: positivePrice(hotel.pricePerNight),
    priceTotal: positivePrice(hotel.priceTotal),
    currency: hotel.currency || 'EUR',
    bookingUrl: hotel.bookingUrl || null,
    bookingPartner: hotel.bookingPartner || null,
    stayDetails: hotel.stayDetails || null
  };
}
