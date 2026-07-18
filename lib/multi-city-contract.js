// Multi-city itinerary truth contract · FAZA 3 (2026-07-17).
// Same rule as itinerary-contract.js: AI may rank or explain a multi-city
// package, but verification is derived purely from provider-sourced fields —
// never invented, never upgraded. A multi-city package is complete only when
// all three one-way legs carry source-provided segments, the leg dates match
// the declared stay boundaries exactly, and both stop hotels are
// property-price-confirmed for the exact stay length.

import { isOneWaySearchUrl } from './itinerary-contract.js';

function positivePrice(value) {
  return Number(value) > 0;
}

function hotelConfirmedFor(hotel, stay) {
  return positivePrice(hotel?.totalWithTaxes || hotel?.totalPrice) &&
    typeof hotel?.bookingUrl === 'string' && /^https:\/\//.test(hotel.bookingUrl) && (
      /booking\.com\/hotel\//i.test(hotel.bookingUrl) ||
      /hotels\.com\/ho\d+/i.test(hotel.bookingUrl)
    ) &&
    Number(hotel?.nights) === Number(stay?.nights);
}

export function multiCityContract(pkg) {
  const legs = Array.isArray(pkg?.legs) ? pkg.legs : [];
  const stops = Array.isArray(pkg?.stops) ? pkg.stops : [];
  const origin = pkg?.origin?.code || '';
  const chain = [origin, stops[0]?.code, stops[1]?.code, origin];

  const legsConfirmed = legs.length === 3 && stops.length === 2 && legs.every((leg, index) =>
    leg?.origin === chain[index] &&
    leg?.destination === chain[index + 1] &&
    positivePrice(leg?.totalPrice) &&
    isOneWaySearchUrl(leg?.bookingUrl) &&
    Array.isArray(leg?.segment?.legs) && leg.segment.legs.length >= 1 &&
    leg.segment.legs.every(item =>
      item?.sourceProvided === true && item.flightNumber && item.departureAt && item.arrivalAt
    )
  );

  const dates = pkg?.dates || {};
  const dateAligned = legsConfirmed &&
    legs[0].depart === dates.departure &&
    legs[0].depart === stops[0].stay?.checkIn &&
    legs[1].depart === stops[0].stay?.checkOut &&
    legs[1].depart === stops[1].stay?.checkIn &&
    legs[2].depart === stops[1].stay?.checkOut &&
    legs[2].depart === dates.return;

  const hotels = stops.map(stop => {
    const confirmed = hotelConfirmedFor(stop?.hotel, stop?.stay);
    return {
      code: stop?.code || '',
      verification: confirmed ? 'property_price_confirmed' : 'unavailable',
      bookingUrl: confirmed ? stop.hotel.bookingUrl : null
    };
  });
  const hotelsConfirmed = hotels.length === 2 && hotels.every(h => h.verification === 'property_price_confirmed');

  const complete = Boolean(legsConfirmed && dateAligned && hotelsConfirmed && positivePrice(pkg?.pricing?.total));
  return {
    level: complete ? 'segment_confirmed' : 'incomplete',
    complete,
    legsConfirmed: Boolean(legsConfirmed),
    dateAligned: Boolean(dateAligned),
    handoffs: complete ? 5 : null, // 3 one-way flight searches + 2 hotel property pages
    legs: legsConfirmed
      ? legs.map(leg => ({ origin: leg.origin, destination: leg.destination, depart: leg.depart, bookingUrl: leg.bookingUrl }))
      : null,
    hotels,
    protection: 'unprotected_independent_tickets',
    aiMayRank: complete,
    aiMayClaimExactSegments: Boolean(legsConfirmed && dateAligned)
  };
}
