import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseSelfTransferHub,
  pairOneWayFlights,
  searchSelfTransferRoundTrip
} from '../lib/self-transfer-provider.js';

function oneWay(id, origin, destination, departureAt, arrivalAt, price) {
  return {
    id, origin, destination, totalPrice: price, airline: id.toUpperCase(),
    flightNumber: `${id.toUpperCase()}1`, bookingUrl: `https://www.booking.com/flights/?id=${id}`,
    segment: {
      origin, destination, departureAt, arrivalAt, stops: 0,
      legs: [{
        sourceProvided: true, origin, destination, departureAt, arrivalAt,
        departureTime: departureAt.slice(11, 16), arrivalTime: arrivalAt.slice(11, 16),
        flightNumber: `${id.toUpperCase()}1`, airline: id.toUpperCase()
      }]
    }
  };
}

test('chooses a hub that differs from both endpoints', () => {
  assert.equal(chooseSelfTransferHub('BEG', 'BUD'), 'VIE');
  assert.notEqual(chooseSelfTransferHub('VIE', 'BUD'), 'VIE');
});

test('rejects unsafe connections and chooses the cheapest safe pair', () => {
  const first = [
    oneWay('a', 'BEG', 'VIE', '2026-09-17T06:00:00+02:00', '2026-09-17T07:00:00+02:00', 50)
  ];
  const unsafe = oneWay('b', 'VIE', 'BUD', '2026-09-17T08:00:00+02:00', '2026-09-17T09:00:00+02:00', 30);
  const safe = oneWay('c', 'VIE', 'BUD', '2026-09-17T10:00:00+02:00', '2026-09-17T11:00:00+02:00', 40);
  const pair = pairOneWayFlights(first, [unsafe, safe]);
  assert.equal(pair.second.id, 'c');
  assert.equal(pair.connection.minutes, 180);
});

test('builds a four-ticket unprotected round trip only from safe pairs', async () => {
  const sets = [
    [oneWay('a', 'BEG', 'VIE', '2026-09-17T06:00:00+02:00', '2026-09-17T07:00:00+02:00', 50)],
    [oneWay('b', 'VIE', 'BUD', '2026-09-17T10:00:00+02:00', '2026-09-17T11:00:00+02:00', 40)],
    [oneWay('c', 'BUD', 'VIE', '2026-09-27T06:00:00+02:00', '2026-09-27T07:00:00+02:00', 45)],
    [oneWay('d', 'VIE', 'BEG', '2026-09-27T10:00:00+02:00', '2026-09-27T11:00:00+02:00', 55)]
  ];
  let call = 0;
  const result = await searchSelfTransferRoundTrip({
    origin: 'BEG', destination: 'BUD', from: '2026-09-17', to: '2026-09-27', pax: 2,
    searchImpl: async () => ({ flights: sets[call++] })
  });
  const flight = result.flights[0];
  assert.equal(flight.bookingUrls.length, 4);
  assert.equal(flight.ticketing.providerProtection, 'unprotected');
  assert.equal(flight.selfTransfer.outboundConnection.minutes, 180);
  assert.equal(flight.totalPrice, 190);
});
