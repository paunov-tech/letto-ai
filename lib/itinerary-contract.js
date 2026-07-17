// Canonical LETTO itinerary truth contract.
// AI may rank or explain this object, but must never upgrade verification.

function iso(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isHttp(value) {
  return typeof value === 'string' && /^https:\/\//.test(value);
}

function isRoundTripSearchUrl(value) {
  if (!isHttp(value)) return false;
  try {
    const path = new URL(value).pathname;
    return /^\/search\/[A-Z]{3}\d{4}[A-Z]{3}\d{4}\d+$/.test(path);
  } catch (_) {
    return false;
  }
}

function hasInboundSegment(pkg) {
  const inbound = pkg?.flight?.inbound || pkg?.returnFlight;
  return !!(inbound?.origin && inbound?.destination && inbound?.departureTime);
}

function nightsBetween(from, to) {
  if (!iso(from) || !iso(to)) return null;
  const nights = Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000
  );
  return nights > 0 ? nights : null;
}

export function itineraryContract(pkg) {
  const dates = pkg?.dates || {};
  const flight = pkg?.flight || {};
  const hotel = pkg?.hotel || {};
  const calendarNights = nightsBetween(dates.departure, dates.return);
  const declaredNights = Number(dates.nights);
  const hotelNights = Number(hotel.nights || declaredNights);
  const dateAligned = calendarNights !== null && declaredNights === calendarNights &&
    hotelNights === calendarNights;
  const flightSearchConfirmed = dateAligned && Number(flight.totalPrice) > 0 &&
    isRoundTripSearchUrl(flight.bookingUrl);
  const flightSegmentConfirmed = flightSearchConfirmed && hasInboundSegment(pkg);
  const hotelConfirmed = dateAligned && Number(hotel.totalWithTaxes || hotel.totalPrice) > 0 &&
    isHttp(hotel.bookingUrl) && /booking\.com\/hotel\//i.test(hotel.bookingUrl);
  const level = flightSegmentConfirmed && hotelConfirmed
    ? 'segment_confirmed'
    : (flightSearchConfirmed && hotelConfirmed ? 'search_confirmed' : 'incomplete');
  return {
    level,
    complete: level !== 'incomplete',
    dateAligned,
    calendarNights,
    handoffs: level === 'incomplete' ? null : 2,
    flight: {
      verification: flightSegmentConfirmed ? 'segment_confirmed' :
        (flightSearchConfirmed ? 'roundtrip_search_confirmed' : 'unavailable'),
      hasInboundSegment: flightSegmentConfirmed,
      bookingUrl: flightSearchConfirmed ? flight.bookingUrl : null
    },
    hotel: {
      verification: hotelConfirmed ? 'property_price_confirmed' : 'unavailable',
      bookingUrl: hotelConfirmed ? hotel.bookingUrl : null
    },
    aiMayRank: level !== 'incomplete',
    aiMayClaimExactSegments: flightSegmentConfirmed
  };
}
