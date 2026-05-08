# LETTO MIX V0.1 — Workflow 05

MVP for unbundled-holiday search: user enters from/to/dates/pax → backend returns 5 flights + 5 hotels + 1 auto-paired recommended combination + Claude one-line summary.

## Architecture

```
[Browser]
  └→ POST /api/mix-search    (Vercel serverless)
       └→ POST {N8N_MIX_WEBHOOK_URL}    (n8n on Hetzner, Workflow 05)
            ├─ Cache Get (Firestore mix_cache)  → if hit, respond cached
            ├─ Travelpayouts Flights API        ┐
            ├─ Hotellook Hotels API             ┴→ Merge → Score+Rank → Claude Summary → Cache Set → Respond
```

- **Cache key:** `{from}-{to}-{depart}-{return}-{pax}` (dashes stripped from dates)
- **Cache TTL:** 24h
- **Claude:** `claude-haiku-4-5-20251001`, 200 tokens, 3s timeout, fallback to `summary: null`

## Files added in this branch

| File | Role |
|---|---|
| `public/index.html` | Mix toggle was already present; **added form submit handler** that parses inputs and navigates to `/search/mix?...` |
| `public/search/mix.html` | Search results page — recommended panel, two columns (flights + hotels), sticky selection footer |
| `api/mix-search.js` | Vercel serverless proxy → n8n webhook. Validates IATA + dates, logs to `mix_searches` Firestore collection. Honors `MIX_USE_MOCK=1` env to bypass n8n in dev/preview |
| `api/mix-mock.js` | Deterministic mock (seeded by query) — returns synthetic flights+hotels so frontend renders without n8n |
| `n8n/05-mix-search.json` | n8n workflow JSON for import. Webhook → cache → flights+hotels parallel → score → Claude → respond |
| `firestore.rules` | Added deny rules for `mix_cache` and `mix_searches` (Admin SDK + service account only — clients never touch) |
| `vercel.json` | Added rewrite `/search/mix` → `/search/mix.html` |

## Firestore schema

### `mix_cache`
```js
{
  cache_key: "BEG-ATH-20260815-20260822-2",  // doc id
  created_at: Timestamp,
  expires_at: Timestamp,                      // +24h
  result: "<JSON-stringified payload>",       // string-encoded for compactness
  hit_count: number
}
```

### `mix_searches` (analytics)
```js
{
  search_id: "uuid",
  timestamp: serverTimestamp,
  query: { from, to, depart, return, pax },
  success: boolean,
  results: { cache_hit, flights, hotels } | null,
  latency_ms: number,
  error: string | null,
  selected_flight_id: null,                   // updated by separate /api endpoint (V0.2)
  selected_hotel_id: null,
  affiliate_clicks: { flight: 0, hotel: 0 }
}
```

## Env vars

### Vercel project env
- `N8N_MIX_WEBHOOK_URL` — full URL of n8n Workflow 05 webhook (e.g. `https://n8n.your-host.tld/webhook/mix-search`)
- `MIX_USE_MOCK` — set to `1` on Preview env to bypass n8n and serve `/api/mix-mock` (don't set in production)
- `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` — already present (used by `api/packages.js`)

### n8n env (set on Hetzner host)
- `TP_TOKEN` — Travelpayouts API token (covers both Aviasales flights + Hotellook hotels under the same partner)
- `TP_MARKER` — Travelpayouts affiliate marker for partner payouts
- `ANTHROPIC_KEY` — for Claude summary call
- Google service-account credential **inside n8n** (Settings → Credentials → Google API) with `datastore.user` role on the `letto-ai` Firestore project — used by Cache Get / Cache Set HTTP nodes

## n8n workflow import

1. Hetzner n8n UI → Workflows → Import from File → upload `n8n/05-mix-search.json`
2. Open the workflow:
   - **Cache Get / Cache Set** nodes: open each → Authentication → select your Google service account credential
   - All other nodes already reference `$env.TP_TOKEN`, `$env.TP_MARKER`, `$env.ANTHROPIC_KEY` — confirm these are set in n8n env
3. Click each Code node and **Save** once (n8n auto-validates JS on save)
4. Activate the workflow → copy the production webhook URL → set as `N8N_MIX_WEBHOOK_URL` in Vercel env
5. Hit `Execute Workflow` once with sample payload to warm caches:
   ```json
   { "from": "BEG", "to": "ATH", "depart": "2026-08-15", "return": "2026-08-22", "pax": 2 }
   ```

## Stage 1 verification (BEFORE importing the workflow)

The spec **explicitly stops** here if Hotellook is not enabled. Run these manually:

```bash
# Flights (should already work — same product as Workflow 01)
curl 'https://api.travelpayouts.com/v2/prices/latest?origin=BEG&destination=ATH&currency=EUR&token=YOUR_TOKEN'

# Hotels — this is the gate
curl 'https://engine.hotellook.com/api/v2/cache.json?location=Athens&currency=EUR&token=YOUR_TOKEN'
```

If hotels returns `401`/`403` → log into Travelpayouts Partner panel, request Hotellook white-label activation for the partner ID, **do not import the workflow until access is granted**.

## Local dev / preview testing

The frontend is wired to the API. To test end-to-end without n8n:

```bash
# Local-equivalent: deploy a preview branch with MIX_USE_MOCK=1
vercel env add MIX_USE_MOCK preview   # value: 1
vercel
```

Then open the preview URL → enter `BEG → ATH 2026-08-15 - 2026-08-22 2` in the search bar → submit → `/search/mix` renders with mock flights + hotels.

For pure local (no Vercel build), the static `public/search/mix.html` will fail to fetch `/api/mix-search` — only Python http.server can't run serverless functions. Use `vercel dev` (mimics prod) for full local testing:

```bash
vercel dev
```

## Test plan (Stage 6)

| Route | Expectations |
|---|---|
| BEG → ATH 2026-08-15 / 2026-08-22 / 2 pax | ≥5 flights (Air Serbia, Wizz, Aegean), ≥5 hotels in Athens range €30-200/night, recommended total €600-1200 |
| BEG → IST 2026-09-10 / 2026-09-17 / 2 pax | ≥5 flights (Turkish, Air Serbia, Pegasus), ≥5 hotels Istanbul, recommended €500-900 |
| BEG → BUD 2026-07-20 / 2026-07-23 / 1 pax | ≥3 flights, ≥5 hotels, single-pax edge case |

Cache test: rerun first query → response time < 300ms, `hit_count` incremented in Firestore.

Empty-state test: search BEG → XYZ (invalid IATA) → `/search/mix` renders empty card, no crash.

## Known V0.1 limitations (per spec)

- Date input is plain text; format `YYYY-MM-DD - YYYY-MM-DD` or `YYYY-MM-DD do YYYY-MM-DD`. Date picker → V0.2.
- Bus routes not included → V0.2.
- Air Serbia treated equally with other tier-1 carriers in ranking; preferential treatment → V0.2.
- Hotel affiliate URL is generic Hotellook deep-link (room-level pricing reflected in `priceFrom` only).
- City→IATA mapping is a small client-side hint list (~20 cities). Backend accepts IATA only; unknown cities pass through and may 4xx.

## Stop conditions

1. Travelpayouts hotels endpoint returns 401/403 → Stage 1 fail, do not deploy
2. Travelpayouts feed price >50% off Booking.com manual check on test routes → Stage 6 fail, may need different hotel source
3. Architecture-locked decisions in spec (parallel side-by-side, no bus, deterministic ranking, Claude summary-only) require change → escalate
