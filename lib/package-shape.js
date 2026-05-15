// lib/package-shape.js
// Narrow-scrub response shaping for /api/packages.
//
// Previous wide-scrub (e74d4da → reverted, then re-landed via 0ec44e1)
// hid hotel name, exact dates, exact prices, image, etc. Replaced
// 2026-05-15 with a narrow scrub, then narrowed AGAIN 2026-05-16:
// hotel.bookingUrl is no longer scrubbed — Booking.com is free to use,
// so a free visitor can book the hotel. Only the 4 FLIGHT fields stay
// behind the paywall:
//
//   flight.airline          — keeps which carrier from leaking
//   flight.departureTime    — keeps the exact timetable from leaking
//   flight.arrivalTime      — same
//   flight.bookingUrl       — the click-through Aviasales / partner link
//
// Free sees everything else incl. hotel.bookingUrl. Premium / try-it
// additionally get the 4 flight fields. Frontend renders locked cards
// with all visible fields + the hotel Book link, and appends a thin
// gold "Unlock flight → €9.99/mo" strip that links to #pricing.

export function scrubToPreview(pkg) {
  if (!pkg) return pkg;
  const flight = pkg.flight
    ? { ...pkg.flight, airline: null, departureTime: null, arrivalTime: null, bookingUrl: null }
    : null;
  return { ...pkg, flight, locked: true };
}

export function passThroughFull(pkg) {
  if (!pkg) return pkg;
  return { ...pkg, locked: false };
}
