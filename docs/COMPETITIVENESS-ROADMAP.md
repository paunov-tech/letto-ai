# LETTO competitiveness roadmap

Last updated: 2026-07-17
Active branch: `feat/pseo-engine-v43c`
Last completed production commit at roadmap start: `5cdc1d3`

## Non-negotiable product contract

LETTO independently discovers flights and hotels, aligns them to the same dates,
combines them into complete trips, and ranks them. AI may rank and explain
verified inventory, but it must never invent or upgrade provider verification.
Agency packages and affiliate redirects are supplementary inventory, never the
core product.

## Execution order

- [x] 1. Exact flight booking handoff for the selected offer
- [ ] 2. Broader destination network and discovery — in progress
- [ ] 3. Flexible dates and stay durations
- [ ] 4. Multi-city and self-transfer combinations
- [ ] 5. Price revalidation before display/click
- [ ] 6. Deeper hotel mix: rooms, cancellation, meals, taxes, amenities
- [ ] 7. AI ranking personalization
- [ ] 8. Saved searches, price history, alerts and automatic recommendations
- [ ] 9. Provider fallback, retries, circuit breakers and observability

Each item is complete only after implementation, tests, commit, push,
production deploy, and a read-only production smoke test.

## Current state

Phase 1 completed in production on 2026-07-17 (`996a17f`). Booking.com15 through RapidAPI returns structured
round-trip offers with outbound/inbound legs, flight numbers, times, baggage,
total price, `token`, `flightKey`, and `searchId`. LETTO currently preserves
the segments but its flight CTA reconstructs a Booking flights search URL. The
`getFlightDetails` was verified on 2026-07-17: it returns detailed offer data
but no checkout/deep-link URL. Travelpayouts `prices_for_dates` does return an
offer-specific Aviasales URL containing `itinerary_key`,
`expected_price_uuid`, and expected price. LETTO must preserve that link when
present and label Booking's reconstructed URL as a repeated search. Production
smoke result: 12 Booking structured offers, 2 Travelpayouts offers, 8 complete
flight+hotel itineraries, including one preserved `offer_specific` handoff.

Phase 2 is now active: broaden destination coverage and build discovery beyond
the current small curated frontend list while retaining arbitrary IATA search.

Relevant files:

- `lib/booking-flight-provider.js`
- `api/live-mix-search.js`
- `lib/itinerary-contract.js`
- `public/results.html`
- `tests/booking-flight-provider.test.js`

## Resume protocol

On a new session, read this file, inspect the current Git status/log, and resume
the first unchecked phase. Never skip ahead unless the earlier phase is
explicitly blocked and the blocker is recorded here with evidence.
