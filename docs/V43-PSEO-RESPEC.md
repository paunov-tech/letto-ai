# LETTO v43 · pSEO Hybrid Engine — Letto-stack re-spec

**Authored:** 2026-05-25 · CC
**Supersedes:** `Downloads/LETTO_V42_PSEO_SPEC.md` (original written for a
Vite/React/TS/Edge codebase that Letto isn't)
**Status:** PROPOSED · awaiting Miroslav go-ahead

---

## 0. Why a re-spec

Original spec assumed:

| Original spec | Letto reality |
|---|---|
| Vite + React + React Router + TypeScript | Static HTML + inline JS, no `src/`, no JSX/TSX |
| `runtime: 'edge'` on Vercel Edge | `api/*.js` Node serverless with `firebase-admin` (Edge can't import firebase-admin) |
| `@vercel/kv` (new dep + new Vercel KV instance) | Firestore already wired everywhere; can act as KV with a single collection |
| `src/components/DestinationMatrix.tsx` | Inline JS inside `public/index.html` (existing pattern, e.g. carousel) |
| New `tsx` + `ts` build | No build step — `outputDirectory: "public"` ships HTML as-is; `scripts/*.mjs` for one-off Node tasks |

Implementing the original literally would require **1-2 weeks of Vite/React/TS
migration** before any pSEO work — refactoring 240KB of working HTML +
re-testing every v34–v42 fix in the new stack. Not acceptable pre-launch.

This re-spec achieves **the same end functionality** — hybrid pre-gen +
on-demand pSEO with ~20K addressable slugs, feature-gated, Claude-generated,
KV-cached — using only patterns Letto already runs in prod.

---

## 1. Stack mapping (spec item → Letto pattern)

| Original | Letto |
|---|---|
| `src/lib/pseo-storage.ts` (`@vercel/kv`) | `lib/pseo-storage.js` (Firestore `pseo_pages` + `pseo_index` collections, ESM) |
| `api/pseo-route.ts` (Edge `runtime`) | `api/pseo-route.js` (Node serverless, mirrors `api/trip.js` shape) |
| `api/sitemap-pseo.ts` (Edge) | `api/sitemap-pseo.js` (Node) |
| `src/lib/pseo-claude-gen.ts` | `lib/pseo-claude-gen.mjs` for the pre-gen script + `lib/pseo-claude-gen.js` for the route (both call `@anthropic-ai/sdk`) |
| `src/lib/pseo-render.tsx` | `lib/pseo-render.js` — pure template-literal HTML generator (same pattern as `scripts/generate-destination-pages.mjs:renderPage()`) |
| `src/components/DestinationMatrix.tsx` | Inline `<section id="destMatrix">` + IIFE in `public/index.html` (same pattern as the existing `.deal-grid` carousel) |
| `src/data/pseo-origins.json` | `scripts/lib/pseo-origins.mjs` (ESM constant, mirrors `scripts/lib/destinations.mjs`) |
| `src/data/pseo-enums.ts` | `scripts/lib/pseo-enums.mjs` |
| `scripts/pseo-pregen-top500.ts` | `scripts/pseo-pregen.mjs` (`node` runs it directly, no tsx) |

**Storage decision · Firestore over Vercel KV:**
- Letto already initialises `firebase-admin` in 8 API routes — zero new SDK.
- Firestore free tier: 50K reads + 20K writes / day. Pre-gen 500 pages = 500
  writes once; live traffic = ~5K-15K reads/day → well within free tier.
- Doc shape: `pseo_pages/{slug}` (single doc per page).
- Index sets: `pseo_index/pre_gen` + `pseo_index/on_demand` (each holds a
  string array of slug names; rewritten on each pre-gen run, no atomic-set
  primitive needed at our volumes).
- Trade-off vs KV: ~5-15ms extra read latency vs KV's edge-cached. Acceptable
  given we cache the HTML response itself for 24h at the CDN.

---

## 2. Production safety mandate (unchanged from original)

- Zero breaking changes on existing routes.
- Feature flag gating: `PSEO_ENABLED` + `PSEO_FULL`.
- Phased rollout: silent → pre-gen 500 → on-demand.
- Rollback: 1-flag-flip closes everything; sitemap-pseo drops from
  `sitemap-index.xml`.
- No new vendor deps. Firestore already in prod; only new SDK is
  `@anthropic-ai/sdk` (already in `scripts/push-engine-env.mjs` env list,
  so the key is already a known prod var).

---

## 3. Deliverable A · Schema upgrade (mostly already shipped)

### A.1 TouristDestination · ✅ DONE in v42 (`6e37177`)

Already on all 46 landings:
- `@type: TouristDestination` with `name`, `description`, `url`, `address`,
  `geo`, `touristType`, `includesAttraction`.
- Place node enriched with `geo`.

**3 spec fields NOT yet added (5-min follow-up):**
- `isAccessibleForFree: false`
- `publicAccess: true`
- `image: ORIGIN + '/og/' + dest.enSlug + '.webp'` (placeholder path — the
  `/og/*.webp` files don't exist yet; will 404 until OG image asset pipeline
  ships. Defer to v44+ or use existing `/og.png` as a fallback.)

### A.2 FAQPage schema · NOT done (v43-A target)

5 Q/A per destination, additive JSON-LD in the existing `@graph` array of the
generator. Source data:

- **Q1 "Koliko košta let za {dest} iz Beograda?"** — static price range from
  a new `dest.flight_price_eur_range_from_beg: [min, max]` field. Live
  `/api/packages` lookup would couple build-time generator to a runtime API;
  out-of-scope for static landings (live prices belong on `/results`).
- **Q2 "Koliko traje let Beograd-{dest}?"** — `dest.flight_duration_min_from_beg: 135`.
- **Q3 "Kada je najbolja sezona?"** — `dest.best_months: [5,6,9,10]` →
  human-readable join.
- **Q4 "Koliko košta hotel u {dest} po noći?"** — static range from
  `dest.hotel_price_eur_range_per_night: [min, max]`.
- **Q5 "Da li je potrebna viza?"** — `dest.visa_required_for_rs: false` +
  `dest.visa_note_sr`/`visa_note_en`.

EN parallel via parallel keys. All fields land in `scripts/lib/destinations.mjs`.

### A.3 destinations.mjs minimal extension (v43-A target)

Per entry, add 5 fields (defer the spec's case-form proliferation — `srCity`
already serves all current uses; if we need accusative/genitive later, add
when first consumer needs them):

```js
{
  // existing: iata, country, srSlug, srCity, srIntro, enSlug, enCity, enIntro
  flight_duration_min_from_beg: 135,
  best_months: [5, 6, 9, 10],
  visa_required_for_rs: false,
  visa_note_sr: 'Schengen viza nije potrebna za srpske biometrijske pasoše do 90 dana.',
  visa_note_en: 'Schengen visa not required for Serbian biometric passport holders, up to 90 days.',
  flight_price_eur_range_from_beg: [80, 220],
  hotel_price_eur_range_per_night: [55, 180],
  // optional, for richer TouristAttraction children in TouristDestination
  attractions: [
    { name_sr: 'Koloseum', name_en: 'Colosseum' },
    { name_sr: 'Vatikan',  name_en: 'Vatican' },
    { name_sr: 'Fontana di Trevi', name_en: 'Trevi Fountain' }
  ]
}
```

23 destinations × 8 new fields = 184 data points. CC can batch-populate from
public knowledge; Miroslav reviews + corrects.

### A.4 Acceptance · Deliverable A

- [ ] Google Rich Results Test for 5 destinations returns ≥3 valid items each
      (Breadcrumb + TouristDestination + FAQPage).
- [ ] All 23 destinations have ≥5 FAQ items in both SR + EN.
- [ ] CSP unchanged (inline JSON-LD only).

**ETA:** ~3h CC (mostly data entry + generator edit + regen 46 pages).

---

## 4. Deliverable B · Firestore-as-KV layer

### B.1 `lib/pseo-storage.js`

```js
// lib/pseo-storage.js — Firestore-backed key/value for pSEO pages.
// One doc per slug under pseo_pages/{slug}; index sets under pseo_index/.
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp, cert, getApps } from 'firebase-admin/app';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: 'letto-ai',
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const db = getFirestore();

export async function getPseoPage(slug) {
  const snap = await db.collection('pseo_pages').doc(slug).get();
  return snap.exists ? snap.data() : null;
}

export async function setPseoPage(slug, data) {
  await db.collection('pseo_pages').doc(slug).set(data, { merge: true });
  const indexKey = data.isPreGenerated ? 'pre_gen' : 'on_demand';
  await db.collection('pseo_index').doc(indexKey).set(
    { slugs: FieldValue.arrayUnion(slug) },
    { merge: true }
  );
}

export async function listIndex(kind) {
  // kind: 'pre_gen' | 'on_demand'
  const snap = await db.collection('pseo_index').doc(kind).get();
  return snap.exists ? (snap.data().slugs || []) : [];
}
```

### B.2 Acceptance

- [ ] `node scripts/test-pseo-storage.mjs` writes 1, reads 1, lists, deletes — pass.
- [ ] No new env vars beyond existing FIREBASE_ADMIN_*.

**ETA:** ~1h CC (one file, one test script).

---

## 5. Deliverable C · pSEO engine (Letto-stack)

### C.1 Origins data · `scripts/lib/pseo-origins.mjs`

20 ex-YU airports per spec §C.1 — SR slugs in genitive case. CC will write
out the full array; Miroslav reviews case forms.

### C.2 Vibes + months · `scripts/lib/pseo-enums.mjs`

```js
export const VIBES = [
  { code: 'vikend',     slug_sr: 'vikend',     slug_en: 'weekend',   name_sr: 'Vikend',          name_en: 'Weekend getaway' },
  { code: 'porodicno',  slug_sr: 'porodicno',  slug_en: 'family',    name_sr: 'Porodično',       name_en: 'Family trip' },
  { code: 'romanticno', slug_sr: 'romanticno', slug_en: 'romantic',  name_sr: 'Romantično',      name_en: 'Romantic getaway' },
  { code: 'solo',       slug_sr: 'solo',       slug_en: 'solo',      name_sr: 'Solo putovanje',  name_en: 'Solo travel' },
  { code: 'budzet',     slug_sr: 'budzet',     slug_en: 'budget',    name_sr: 'Budžet odmor',    name_en: 'Budget trip' },
];

export function getActiveMonths() {
  const out = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push({
      slug: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      name_sr: ['jan','feb','mart','apr','maj','jun','jul','avg','sep','okt','nov','dec'][d.getMonth()] + ' ' + d.getFullYear(),
      name_en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()] + ' ' + d.getFullYear(),
    });
  }
  return out;
}
```

### C.3 Slug schema · same as original (numeric month format)

- SR base: `/letovi-iz-{origin}-za-{dest}`
- SR + vibe: `/letovi-iz-{origin}-za-{dest}-{vibe}`
- SR + vibe + month: `/letovi-iz-{origin}-za-{dest}-{vibe}-{YYYY}-{MM}`
- EN: `/flights-from-{origin}-to-{dest}[-{vibe}[-{YYYY}-{MM}]]`

**Parser:** `lib/pseo-slug.js` — plain ES regex, no TS. Resolves origin + dest
from imported `pseo-origins.mjs` + `destinations.mjs`.

### C.4 `vercel.json` rewrites

Add to existing rewrites array (carefully, AFTER the single-dest patterns so
the more-specific regex matches first):

```json
{ "source": "/letovi-iz-:rest((?:[a-z0-9-]+))",     "destination": "/api/pseo-route?slug=letovi-iz-:rest&lang=sr" },
{ "source": "/flights-from-:rest((?:[a-z0-9-]+))",  "destination": "/api/pseo-route?slug=flights-from-:rest&lang=en" }
```

The existing `/letovi-:slug` and `/flights-:slug` rules (single-dest) stay
above these — Vercel rewrites match top-down, so `/letovi-rim` resolves to
`/letovi-rim.html` before the pSEO rule sees it.

### C.5 `api/pseo-route.js` (Node serverless)

```js
import { getPseoPage, setPseoPage } from '../lib/pseo-storage.js';
import { parseSlug } from '../lib/pseo-slug.js';
import { renderPseoPage } from '../lib/pseo-render.js';
import { generatePageContent } from '../lib/pseo-claude-gen.js';
import { applyRateLimit } from '../lib/rate-limit.js';
import { withSentry } from '../lib/sentry-backend.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (process.env.PSEO_ENABLED !== '1') return res.status(404).end();

  const slug = String(req.query.slug || '');
  const lang = req.query.lang === 'en' ? 'en' : 'sr';

  if (applyRateLimit(req, res, { scope: 'pseo-route', limit: 60, windowMs: 60_000 })) return;

  // 1 · cache hit
  let page = await getPseoPage(slug);

  // 2 · cache miss · on-demand gen (gated by PSEO_FULL)
  if (!page) {
    if (process.env.PSEO_FULL !== '1') return res.status(404).end();
    const parsed = parseSlug(slug, lang);
    if (!parsed) return res.status(404).end();
    page = await generatePageContent(parsed);
    page.isPreGenerated = false;
    // Fire-and-forget cache write (don't block response)
    setPseoPage(slug, page).catch(e => console.error('[pseo] cache write fail', e.message));
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('X-Pseo-Source', page.isPreGenerated ? 'pre-gen' : 'on-demand');
  return res.status(200).send(renderPseoPage(page));
}

export default withSentry('pseo-route', handler);
```

Mirror of every other Letto API route shape (withSentry wrapper, applyRateLimit,
Cache-Control headers, plain Node).

### C.6 Claude API · `lib/pseo-claude-gen.js`

```js
import Anthropic from '@anthropic-ai/sdk';

// Per session memory: prod env var is `lettoprod` (per 2026-05-08), but
// scripts/push-engine-env.mjs uses ANTHROPIC_API_KEY — verify with Miroslav
// in Vercel dashboard before first deploy.
const apiKey = process.env.ANTHROPIC_API_KEY || process.env.lettoprod;
const client = new Anthropic({ apiKey });

export async function generatePageContent(parsed) {
  const prompt = buildPrompt(parsed);
  const r = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }]
  });
  const raw = r.content[0]?.type === 'text' ? r.content[0].text : '';
  const json = extractJson(raw);
  return {
    slug: buildSlug(parsed),
    origin_code: parsed.origin.iata,
    dest_code: parsed.dest.iata,
    vibe: parsed.vibe || null,
    month: parsed.year ? `${parsed.year}-${String(parsed.month).padStart(2,'0')}` : null,
    lang: parsed.lang,
    copy: json.copy,
    faqs: json.faqs,
    isPreGenerated: false,
    generatedAt: Date.now(),
  };
}
// buildPrompt / extractJson / buildSlug — same shapes as original spec §C.6
```

### C.7 Pre-gen script · `scripts/pseo-pregen.mjs`

Same priority logic as original §C.7 (480 base + 80 high-traffic 3-axis ≈ 560).
Runs `node scripts/pseo-pregen.mjs` locally OR via Vercel cron. Throttles at
~2.5 req/s to stay under Anthropic Tier 1 (50 RPM = 0.83 RPS, so 2.5 RPS is
already over — start at 0.5 RPS and bump after Miroslav confirms tier).

### C.8 Render · `lib/pseo-render.js`

Pure template literal returning HTML string. Same pattern as
`scripts/generate-destination-pages.mjs:renderPage()` — proven, works in
Node serverless, no React/JSX needed.

Includes:
- `<head>`: title, description, canonical, hreflang, OG, breadcrumb + tourist-
  destination + FAQ + Offer JSON-LD (4 schemas in `@graph`).
- `<body>`: shared Letto header markup (copied from index.html nav section into
  a small helper `lib/letto-header.js` to avoid duplication), breadcrumb visible
  nav, `<h1>`, hero LivePriceCard placeholder (sites can hydrate via JS that
  fetches `/api/packages?...` on client), unique copy, FAQ accordion, related-
  routes grid, CTA to `/?from={origin}&to={dest}` Mix flow, footer.
- Pixel + GA dataLayer push for `view_pseo_page` event.

### C.9 Sitemap · `api/sitemap-pseo.js` + sitemap index

```js
import { listIndex } from '../lib/pseo-storage.js';

export default async function handler(req, res) {
  const pre = await listIndex('pre_gen');
  const onDem = process.env.PSEO_FULL === '1' ? await listIndex('on_demand') : [];
  const all = [...pre, ...onDem];
  const today = new Date().toISOString().slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map(s => `  <url><loc>https://letto.live/${s}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>${pre.includes(s)?'0.8':'0.6'}</priority></url>`).join('\n')}
</urlset>`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600');
  res.status(200).send(xml);
}
```

The existing `public/sitemap.xml` (52 URLs static) becomes
`public/sitemap-main.xml`, and a new `public/sitemap.xml` becomes a
sitemap-index pointing to both `/sitemap-main.xml` + `/api/sitemap-pseo`.

### C.10 DestinationMatrix · inline HTML+JS in `index.html`

NOT a React component. Add a new `<section id="destMatrix">` to `index.html`
(replacing or augmenting the existing dest grid), plus an IIFE that:
- Reads `window.LETTO_ORIGINS` (new script `/js/origins.js`, mirror of
  `destinations.js`).
- Reads/writes `localStorage.letto_origin` (default `'BEG'`).
- Renders origin chips/dropdown + dest cards with href patterns built from
  the slug pattern in §C.3.

Same pattern as the existing Mix-mode `<script>` hooks in results.html. Zero
React, zero build step.

### C.11 Feature flags

```
PSEO_ENABLED=0     → all /letovi-iz-… and /flights-from-… return 404
PSEO_ENABLED=1, PSEO_FULL=0  → only pre-gen slugs serve; misses 404
PSEO_ENABLED=1, PSEO_FULL=1  → cache miss triggers on-demand Claude gen
```

Same phased rollout as original §C.11.

---

## 6. Open product decisions

Same 7 questions as original §6 — copying with my recommendations:

1. **Vibe enum:** original 5 OK. Add `partijanje` (party) post-launch v44 if Ibiza/Berlin demand warrants.
2. **Month format:** numeric `2026-07` ✓ (lighter regex, sortable).
3. **Pre-gen Top 500:** Phase 1a base + Phase 1b vibe-pairs (~560). Defer 4-axis (month-specific) until on-demand traffic shows month bias.
4. **Aviasales coverage probe:** reuse `lib/aviasales-url.js buildAviasalesUrl()` — if it returns null for the (origin,dest) pair, the route doesn't exist. Cheap, no API call needed. Pre-gen + on-demand both check before invoking Claude.
5. **Vercel KV plan:** N/A — using Firestore (already in prod, free tier covers us).
6. **Anthropic Tier:** start Tier 1 (50 RPM, ~17min for 500). If pre-gen timing matters, upgrade to Tier 2 before run.
7. **OG image strategy:** Phase 1 ship without per-dest image (use `/og.png` for all). Phase 2 (v44+): build OG image generator using existing brand kit + Pexels source.

---

## 7. Implementation order

```
v43-A · Schema upgrade           ~3h    additive, low risk, real SEO win
v43-B · Firestore KV layer       ~1h    one file + test
v43-C0 · origins + enums         ~1h    data files only, no runtime impact
v43-C1 · slug parser + render    ~3h    pure functions, fully testable
v43-C2 · /api/pseo-route handler ~2h    serverless integration
v43-C3 · vercel.json rewrites    ~1h    + careful regex ordering test
v43-C4 · pre-gen script          ~2h    runs locally first, dry-run mode
v43-C5 · sitemap-pseo + index    ~1h    additive, gated by flag
v43-C6 · DestinationMatrix UI    ~3h    inline HTML+JS in index.html

TOTAL: ~17h CC (vs original 22-30h with Vite/React refactor pre-work)
```

Deploy plan (unchanged from original):
- v43.0 silent (PSEO_ENABLED=0, all pSEO routes 404)
- v43.1 pre-gen 500 live (PSEO_ENABLED=1, PSEO_FULL=0) — monitor 24-48h
- v43.2 on-demand enabled (PSEO_FULL=1) — Day 5+

---

## 8. What we don't bring over from original

- `@vercel/kv` SDK (Firestore is enough at our volumes)
- TypeScript (no build step; ESM `.mjs` for scripts, plain `.js` for runtime)
- React components (template literals already work — see existing generator)
- Vercel Edge runtime (Node serverless covers our needs and supports firebase-admin)
- Granular SR case forms (accusative/genitive/locative) in destinations.mjs —
  add when first consumer needs them, not upfront

---

## 9. Go/no-go ask for Miroslav

Three paths from here:

1. **Ship just v43-A** (~3h) — schema upgrade for FAQPage + tourist-destination polish. Quick SEO win. pSEO engine deferred indefinitely.
2. **Ship v43-A + v43-B** (~4h) — schema + KV setup. Foundation for pSEO without engine yet. Re-evaluate engine after soft launch metrics.
3. **Full v43-A through v43-C** (~17h) — entire pSEO engine, this re-spec end-to-end. Pre-launch risk: new feature, new failure modes.

Recommendation: **Path 1 pre-launch, Path 3 post-launch (~v44 in week 2 after
launch)**. Schema upgrade is pure SEO win, additive, zero risk. The pSEO
engine is genuinely valuable but needs the post-launch breathing room +
real-world traffic data to know which slug-axes to prioritise in pre-gen.

**END SPEC**
