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
- [x] 3. Flexible dates and stay durations
- [x] 4. Multi-city and self-transfer combinations
- [x] 5. Price revalidation before display/click
- [x] 6. Deeper hotel mix: rooms, cancellation, meals, taxes, amenities
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

Phase 3 completed in production on 2026-07-17 (`a22bd9c`, `e2f6865`,
`8a267a0`). Every live search now evaluates a bounded five-window matrix:
exact dates, three days earlier/later, and stays two nights shorter/longer.
Hotel searches run with bounded concurrency, empty results receive only a
short cache lifetime, and final recommendations guarantee date-pair diversity.
Production proof for BEG-BUD: 42 flights, 60 hotels, zero failed hotel
searches, 8 complete itineraries spanning all five date pairs with explicit
labels for exact, shifted, shorter and longer stays.

Phase 4 completed in production on 2026-07-17 (`ed8c08c`, `13dc313`,
`0ca1e2c`, `4b06015`). LETTO now builds an independent four-ticket round trip
through an eligible hub; it requires direct legs, same-airport connections of
150–480 minutes, and never calls the result protected. The source returns four
individual Booking one-way handoffs, all segments and times, baggage re-check
notice, and `unprotected_self_transfer` status. It tries a bounded two-hub
fallback and accepts an explicit `via=IATA` hub when requested. A self-transfer
is retained through ranking/diversification and appears as a clearly-labelled
alternative next to the two best regular combinations rather than being
misrepresented as the default. Production proof for BEG-BUD on 17–27 Sep:
IST produced four handoffs (BEG–IST, IST–BUD, BUD–IST, IST–BEG), 345/420-minute
safe connections, `segment_confirmed` verification and four visible booking
links; the production UI visibly renders the `Self-transfer alternative` card.

Phase 5 completed in production on 2026-07-17 (`d11f587`, `0eb3ddc`). A
rate-limited, no-store `/api/revalidate-mix` re-runs the selected Booking,
Travelpayouts, or self-transfer flight search and a fresh, uncached hotel
search before Stage 3 and again after five minutes before a partner handoff.
It preserves provider offer/property identifiers, updates price and partner
URLs only from fresh data, and returns `confirmed`, `changed`, `unavailable`,
or `unverified`; an unavailable/unverified mix is not opened as if it had a
current price. The hotel check inspects all 200 returned provider properties,
so a property that moved below the discovery page after repricing remains
verifiable. Production proof for BEG-BUD on 17–27 Sep: a selected Booking
flight changed by +€6.70, the selected hotel was confirmed with a fresh
property URL, the endpoint returned `bookable: true` and €726.59 total, and a
headless browser click displayed “Price refreshed — the total above has
changed.” before booking.

Phase 6 completed in production on 2026-07-17 (`71d9a5f`, `382bf41`,
`ebec73f`). Every hotel carries a normalized stay scope: room/rate name,
meal plan, cancellation, taxes/fees and amenities are shown only when a
provider or property page explicitly states them; each missing term remains
"confirm at partner" instead of being inferred from generic copy. The
selected property is additionally checked through a rate-limited, same-origin
Bright Data endpoint. It removes date/availability parameters and requests
the canonical property page, so durable amenities are enriched without
mistaking page-level text for a chosen room's cancellation, breakfast or tax
terms. Booking's visible "Most popular amenities" list and structured data
are parsed, while unavailable page metadata remains explicitly unavailable.
Production proof: Bright Data's configured `web_unlocker1` returned the
canonical Booking property HTML and the parser extracted Free Wifi, Family
rooms, Non-smoking rooms, 24-hour front desk and Air conditioning. A
production browser selection for BEG-JFK completed the independent mix and
price revalidation; its selected property had no published amenities list, so
the Stage 3 screen truthfully retained the three partner-confirmation labels
rather than inventing them. Price comparisons therefore retain only the
source-confirmed stay scope and visibly disclose all unknown terms.

Phase 7 is now active: personalize ranking without changing source facts or
silently hiding viable independent combinations.

Relevant files:

- `lib/booking-flight-provider.js`
- `lib/self-transfer-provider.js`
- `api/live-mix-search.js`
- `lib/itinerary-contract.js`
- `lib/flexible-date-matrix.js`
- `lib/price-revalidation.js`
- `lib/hotel-stay-details.js`
- `lib/hotel-page-details.js`
- `api/hotel-stay-details.js`
- `scrapers/lib/brightdata.mjs`
- `api/revalidate-mix.js`
- `public/results.html`
- `tests/booking-flight-provider.test.js`

## Resume protocol

On a new session, read this file, inspect the current Git status/log, and resume
the first unchecked phase. Never skip ahead unless the earlier phase is
explicitly blocked and the blocker is recorded here with evidence.
