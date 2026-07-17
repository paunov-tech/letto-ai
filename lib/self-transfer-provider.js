import { searchBookingOneWayFlights } from './booking-flight-provider.js';

const HUBS = ['VIE', 'BUD', 'IST', 'FCO', 'WAW', 'FRA'];

export function chooseSelfTransferHub(origin, destination) {
  return HUBS.find(code => code !== origin && code !== destination) || null;
}

function connection(first, second, minimumMinutes = 150, maximumMinutes = 480) {
  const arrival = Date.parse(first?.segment?.arrivalAt);
  const departure = Date.parse(second?.segment?.departureAt);
  const minutes = Math.round((departure - arrival) / 60000);
  const sameAirport = first?.segment?.destination === second?.segment?.origin;
  return {
    airport: first?.segment?.destination || '',
    airportChange: !sameAirport,
    minutes: Number.isFinite(minutes) ? minutes : null,
    minimumMinutes,
    maximumMinutes,
    safe: sameAirport && Number.isFinite(minutes) &&
      minutes >= minimumMinutes && minutes <= maximumMinutes
  };
}

function direct(flights) {
  return (flights || []).filter(flight =>
    flight?.segment?.stops === 0 &&
    flight?.segment?.legs?.length === 1
  );
}

export function pairOneWayFlights(firstFlights, secondFlights) {
  const pairs = [];
  for (const first of direct(firstFlights)) {
    for (const second of direct(secondFlights)) {
      const transfer = connection(first, second);
      if (!transfer.safe) continue;
      pairs.push({
        first,
        second,
        connection: transfer,
        totalPrice: Number(first.totalPrice) + Number(second.totalPrice)
      });
    }
  }
  return pairs.sort((a, b) => a.totalPrice - b.totalPrice)[0] || null;
}

export async function searchSelfTransferRoundTrip({
  origin, destination, from, to, pax = 1,
  searchImpl = searchBookingOneWayFlights
}) {
  const hub = chooseSelfTransferHub(origin, destination);
  if (!hub) return { flights: [], provider: 'booking-self-transfer', error: 'no_hub' };
  const searches = await Promise.all([
    searchImpl({ origin, destination: hub, from, pax }),
    searchImpl({ origin: hub, destination, from, pax }),
    searchImpl({ origin: destination, destination: hub, from: to, pax }),
    searchImpl({ origin: hub, destination: origin, from: to, pax })
  ]);
  const error = searches.find(result => result.error)?.error || null;
  const outbound = pairOneWayFlights(searches[0].flights, searches[1].flights);
  const inbound = pairOneWayFlights(searches[2].flights, searches[3].flights);
  if (!outbound || !inbound) {
    return { flights: [], provider: 'booking-self-transfer', hub, error: error || 'no_safe_pair' };
  }
  const parts = [outbound.first, outbound.second, inbound.first, inbound.second];
  const totalPrice = Math.round(
    parts.reduce((sum, flight) => sum + Number(flight.totalPrice), 0) * 100
  ) / 100;
  const duration = Math.round(
    (Date.parse(outbound.second.segment.arrivalAt) -
      Date.parse(outbound.first.segment.departureAt)) / 60000
  );
  const inboundDuration = Math.round(
    (Date.parse(inbound.second.segment.arrivalAt) -
      Date.parse(inbound.first.segment.departureAt)) / 60000
  );
  return {
    provider: 'booking-self-transfer',
    hub,
    flights: [{
      id: `self-${origin}-${hub}-${destination}-${from}-${to}`,
      origin,
      destination,
      depart: from,
      ret: to,
      airline: `${outbound.first.airline} + ${outbound.second.airline}`,
      flightNumber: `${outbound.first.flightNumber} / ${outbound.second.flightNumber}`,
      departureTime: outbound.first.segment.legs[0].departureTime,
      arrivalTime: outbound.second.segment.legs[0].arrivalTime,
      duration,
      stops: 1,
      totalPrice,
      unitPrice: Math.round(totalPrice / Math.max(1, pax) * 100) / 100,
      currency: 'EUR',
      bookingUrl: outbound.first.bookingUrl,
      bookingUrls: parts.map((flight, index) => ({
        order: index + 1,
        route: `${flight.origin}-${flight.destination}`,
        flightNumber: flight.flightNumber,
        url: flight.bookingUrl
      })),
      bookingPartner: 'booking.com/flights',
      bookingHandoff: 'multi_ticket_search',
      source: 'booking-self-transfer',
      ticketing: {
        type: 'self_transfer',
        tickets: 4,
        providerProtection: 'unprotected',
        baggageRecheckRequired: true
      },
      segments: parts.map(flight => flight.segment),
      selfTransfer: {
        required: true,
        hub,
        protected: false,
        outboundConnection: outbound.connection,
        inboundConnection: inbound.connection
      },
      inbound: {
        sourceProvided: true,
        origin: destination,
        destination: origin,
        departureTime: inbound.first.segment.legs[0].departureTime,
        arrivalTime: inbound.second.segment.legs[0].arrivalTime,
        flightNumber: `${inbound.first.flightNumber} / ${inbound.second.flightNumber}`,
        airline: `${inbound.first.airline} + ${inbound.second.airline}`,
        stops: 1,
        duration: inboundDuration,
        legs: [inbound.first.segment.legs[0], inbound.second.segment.legs[0]],
        connections: [inbound.connection]
      }
    }]
  };
}
