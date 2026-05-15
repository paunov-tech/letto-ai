// lib/package-shape.js
// Narrow-scrub response shaping for /api/packages.
//
// Previous wide-scrub (e74d4da → reverted, then re-landed via 0ec44e1)
// hid hotel name, exact dates, exact prices, image, etc. Replaced
// 2026-05-15 with a much narrower scrub: free users see EVERYTHING in
// the catalog (slika, hotel name, exact dates, exact price, deal ratio,
// transport, rating). Only the keys needed to actually complete a
// booking are nulled:
//
//   flight.airline          — keeps which carrier from leaking
//   flight.departureTime    — keeps the exact timetable from leaking
//   flight.arrivalTime      — same
//   flight.bookingUrl       — the click-through Aviasales / partner link
//   hotel.bookingUrl        — the click-through Booking / partner link
//
// Frontend renders locked cards with all raw fields visible, no blur,
// and appends a thin gold "Unlock flight + booking → €9.99/mo" strip
// that links to #pricing.

export function scrubToPreview(pkg) {
  if (!pkg) return pkg;
  const flight = pkg.flight
    ? { ...pkg.flight, airline: null, departureTime: null, arrivalTime: null, bookingUrl: null }
    : null;
  const hotel = pkg.hotel
    ? { ...pkg.hotel, bookingUrl: null }
    : null;
  return { ...pkg, flight, hotel, locked: true };
}

export function passThroughFull(pkg) {
  if (!pkg) return pkg;
  return { ...pkg, locked: false };
}
