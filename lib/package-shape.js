// lib/package-shape.js
// Narrow-scrub response shaping for /api/packages.
//
// History · scrub narrowed three times:
//   2026-05-15 — replaced wide-scrub with narrow (4 flight fields only)
//   2026-05-16 — hotel.bookingUrl freed (Booking.com is free to use anyway)
//   v36        — flight.bookingUrl freed. The canonical /search/{org}{date}…
//                Aviasales URL carries no proprietary data; the affiliate
//                marker on it is the WHOLE POINT of letting free visitors
//                click through. Pre-mix catalog cards are now the free
//                lead-magnet funnel — lead-capture.js intercepts the click
//                for email capture before opening the partner. Custom Mix
//                (results.html Stage 3) is where Premium gates apply now.
//
// Only 3 FLIGHT fields stay behind the paywall:
//
//   flight.airline          — keeps which carrier from leaking
//   flight.departureTime    — keeps the exact timetable from leaking
//   flight.arrivalTime      — same
//
// Free sees everything else incl. both bookingUrl-s. Premium / try-it
// additionally get the 3 flight fields above. `locked: true` is kept on
// scrubbed records as a data flag — frontend uses it to leave airline /
// times blank, NOT as a visual "buy to unlock" gate.

export function scrubToPreview(pkg) {
  if (!pkg) return pkg;
  const flight = pkg.flight
    ? { ...pkg.flight, airline: null, departureTime: null, arrivalTime: null }
    : null;
  return { ...pkg, flight, locked: true };
}

export function passThroughFull(pkg) {
  if (!pkg) return pkg;
  return { ...pkg, locked: false };
}
