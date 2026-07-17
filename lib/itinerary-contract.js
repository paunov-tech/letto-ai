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

export function itineraryContract(pkg) {
  const dates = pkg?.dates || {};
  const flight = pkg?.flight || {};
  const hotel = pkg?.hotel || {};
  const dateAligned = iso(dates.departure) && iso(dates.return) &&
    Number(dates.nights) > 0 && Number(hotel.nights || dates.nights) === Number(dates.nights);
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
