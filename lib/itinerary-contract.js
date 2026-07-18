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
    const url = new URL(value);
    if (/^\/search\/[A-Z]{3}\d{4}[A-Z]{3}\d{4}\d+$/.test(url.pathname)) return true;
    return /(^|\.)booking\.com$/i.test(url.hostname) &&
      url.pathname.startsWith('/flights') &&
      url.searchParams.get('type') === 'ROUNDTRIP' &&
      !!url.searchParams.get('depart') &&
      !!url.searchParams.get('return');
  } catch (_) {
    return false;
  }
}

function hasInboundSegment(pkg) {
  const inbound = pkg?.flight?.inbound || pkg?.returnFlight;
  return !!(
    inbound?.sourceProvided === true &&
    inbound?.origin &&
    inbound?.destination &&
    inbound?.departureTime &&
    inbound?.arrivalTime &&
    inbound?.flightNumber
  );
}

function hasOfferSpecificHandoff(flight) {
  if (flight?.bookingHandoff !== 'offer_specific' || !isHttp(flight.bookingUrl)) return false;
  try {
    const url = new URL(flight.bookingUrl);
    return /(^|\.)aviasales\.com$/i.test(url.hostname) &&
      !!url.searchParams.get('itinerary_key') &&
      !!url.searchParams.get('expected_price_uuid');
  } catch (_) {
    return false;
  }
}

export function isOneWaySearchUrl(value) {
  if (!isHttp(value)) return false;
  try {
    const url = new URL(value);
    return /(^|\.)booking\.com$/i.test(url.hostname) &&
      url.pathname.startsWith('/flights') &&
      url.searchParams.get('type') === 'ONEWAY' &&
      !!url.searchParams.get('depart') &&
      !!url.searchParams.get('departDate');
  } catch (_) {
    return false;
  }
}

function hasVerifiedSelfTransfer(flight) {
  if (flight?.ticketing?.type !== 'self_transfer' ||
      flight?.ticketing?.providerProtection !== 'unprotected' ||
      flight?.selfTransfer?.protected !== false) return false;
  const handoffs = flight?.bookingUrls;
  const segments = flight?.segments;
  return Array.isArray(handoffs) && handoffs.length === 4 &&
    handoffs.every(item => isOneWaySearchUrl(item?.url)) &&
    Array.isArray(segments) && segments.length === 4 &&
    segments.every(segment =>
      segment?.legs?.length === 1 &&
      segment.legs[0]?.sourceProvided === true &&
      segment.legs[0]?.flightNumber &&
      segment.legs[0]?.departureAt &&
      segment.legs[0]?.arrivalAt
    ) &&
    flight?.selfTransfer?.outboundConnection?.safe === true &&
    flight?.selfTransfer?.inboundConnection?.safe === true;
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
  const selfTransferConfirmed = dateAligned && Number(flight.totalPrice) > 0 &&
    hasVerifiedSelfTransfer(flight);
  const flightSearchConfirmed = selfTransferConfirmed || (
    dateAligned && Number(flight.totalPrice) > 0 && isRoundTripSearchUrl(flight.bookingUrl)
  );
  const flightSegmentConfirmed = selfTransferConfirmed ||
    (flightSearchConfirmed && hasInboundSegment(pkg));
  const offerSpecificHandoff = flightSearchConfirmed && hasOfferSpecificHandoff(flight);
  const hotelConfirmed = dateAligned && Number(hotel.totalWithTaxes || hotel.totalPrice) > 0 &&
    isHttp(hotel.bookingUrl) && (
      /booking\.com\/hotel\//i.test(hotel.bookingUrl) ||
      /hotels\.com\/ho\d+/i.test(hotel.bookingUrl)
    );
  const level = flightSegmentConfirmed && hotelConfirmed
    ? 'segment_confirmed'
    : (flightSearchConfirmed && hotelConfirmed ? 'search_confirmed' : 'incomplete');
  return {
    level,
    complete: level !== 'incomplete',
    dateAligned,
    calendarNights,
    handoffs: level === 'incomplete' ? null : (selfTransferConfirmed ? 5 : 2),
    flight: {
      verification: selfTransferConfirmed ? 'self_transfer_segments_confirmed' :
        (flightSegmentConfirmed ? 'segment_confirmed' :
          (flightSearchConfirmed ? 'roundtrip_search_confirmed' : 'unavailable')),
      hasInboundSegment: flightSegmentConfirmed,
      handoff: selfTransferConfirmed ? 'multi_ticket_search' :
        (offerSpecificHandoff ? 'offer_specific' : 'roundtrip_search'),
      protection: selfTransferConfirmed ? 'unprotected_self_transfer' : 'not_verified',
      bookingUrls: selfTransferConfirmed ? flight.bookingUrls.map(item => item.url) : null,
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
