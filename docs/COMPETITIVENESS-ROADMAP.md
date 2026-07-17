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
- [x] 2. Broader destination network and discovery
- [ ] 3. Flexible dates and stay durations — in progress
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

Phase 2 completed in production on 2026-07-17 (`5df8824`, `40f243a`,
`a91f2c0`). The homepage now augments its static catalog with global airport
autocomplete through `/api/destination-search`. Unknown airport codes are
resolved to their hotel city dynamically, Booking hotel ids are discovered at
runtime, and the best properties are enriched with date-specific property
handoffs. Production proof for BEG-JFK: 17 flight offers, 30 hotel rows and 8
complete ranked itineraries; the leading results had confirmed outbound and
inbound segments plus concrete Booking hotel URLs.

Phase 3 is now active: search a controlled matrix of nearby departure/return
dates and stay durations, deduplicate the resulting trips, and rank exact and
flexible alternatives without hiding the date difference.

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
