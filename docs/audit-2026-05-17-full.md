# LETTO.LIVE · Full Independent App Audit · 2026-05-17

Independent technical / UX / UI audit of the production app **letto.live**.
Builds on `docs/deep-audit-2026-05-17.md` (post polish v1–v12). Production HEAD
at audit time: `c351d05` (polish v18). RESEARCH ONLY — no code changed.

Scope note: the paywall **card** visual design (`.paywall-card` + children) is
being redesigned in a parallel stream and is **excluded**. The paywall *flow*
(when the gate triggers, caching) is in scope and was reviewed.

---

## 0. Production health — ALL GREEN

| Check | Result |
|---|---|
| Pages `/`, `/results`, `/trip`, `/me`, `/about`, `/privacy`, `/terms`, `/dobrodosao` | all **200** |
| `/api/health` | `ok:true` · gitSha `c351d05` · region iad1 · all 8 checks true · firestore latency 362ms |
| `/api/packages?limit=5` (anon) | 200 · 7 pkgs · **5 locked / 2 try-it** (narrow scrub works) |
| `/api/packages?limit=5&auth=1` | 200 · `cache-control: private, no-store` (cache partition works) |
| `/api/me` (no session) | 401 (correct) |
| HTML structural balance | index.html div 284/284, section 8/8; results.html div 228/228 — all balanced |
| JS syntax | all 20 `api/*.js` + 9 `lib/*.js` pass `node --check` |

No blocker. The app is healthy for soft launch.

---

## Prioritized summary

| # | Prio | Area | Finding | File |
|---|---|---|---|---|
| 1 | **P1** | Tech | Production debug logging — 12+ `console.log` statements in the Mix-form code ship to every visitor | `index.html` ~6276-6306, ~6563-6574 |
| 2 | **P1** | Tech | Dead code STILL not cleaned — Solari CSS+JS (~160 lines) + old `.hero-*` CSS (~23 refs) + `packagesData` static object (~230 lines, unreachable) | `index.html` |
| 3 | **P1** | UX/i18n | Mix search bar is **Serbian-only** — `Odakle/Kuda/Datumi/Putnici/Traži`, toggle labels, every toast — no `data-en`/`data-sr`. An EN visitor sees mixed-language UI | `index.html` 3765-3831, 6320-6588 |
| 4 | **P1** | UX/i18n | `/me` (account dashboard + recovery) is **100% Serbian** — no lang toggle, no bilingual spans at all | `me.html` |
| 5 | P2 | Tech | `stripe-webhook.js:872` TODO still open — canceled premium user is NOT removed from premium Telegram channel | `api/stripe-webhook.js:872` |
| 6 | P2 | Tech | Plausible still not loaded; `mix_finished` event in results.html stays dormant | `results.html` ~6165 |
| 7 | P2 | UX | 5 different contact emails across the site (`info@`, `hello@`, `podrska@`, `legal@`, `privacy@`) — inconsistent, confusing | all pages |
| 8 | P2 | Tech | FB Pixel snippet is a permanent no-op (`LETTO_FB_PIXEL_ID=''`) — dead unless ID is filled | `index.html:3425` |
| 9 | P2 | UI/a11y | Combo dropdown options (`.letto-combo__option`) are `<div>` not `<button>`/`<li>` — `role="option"` present but not keyboard-reachable as real options; no `aria-activedescendant` | `index.html` 6382-6386 |
| 10 | P3 | UX | recovery email says "Link važi 30 minuta" but Stripe billing-portal links last per Stripe default — copy may misstate expiry | `api/recovery.js:67` |
| 11 | P3 | UI | `trip.html` & `me.html` outside the design-token system (own `:root`, `me.html` uses `Inter` not `IBM Plex Sans`) | `trip.html`, `me.html` |
| 12 | P3 | Tech | `toTripShape` still duplicated verbatim in `save-mix.js` + `save-mix-premium.js` | both files |
| 13 | P3 | Tech | Billboard depends on 6 external Unsplash images — external dependency + LCP/availability risk | `index.html` 3866-3913 |
| 14 | P3 | SEO | `admin-scraping.html` is neither in `robots.txt` Disallow nor sitemap; `impressum.html` missing from sitemap | `robots.txt`, `sitemap.xml` |
| 15 | P3 | UI/a11y | No `<link rel="preload">` for fonts on the two large pages; render-blocking Google Fonts | `index.html`, `results.html` |
| 16 | P3 | UX | JSON-LD `Service` offer says price `29.00 EUR / P3M` while the whole site advertises `€9.99/mo` — structured-data mismatch | `index.html:3384` |

---

## What changed since `deep-audit-2026-05-17.md`

Open vs. resolved status of the prior audit's findings:

| deep-audit item | Status now |
|---|---|
| **C / D#1 · Dead hero+Solari code (~180 lines)** | **STILL OPEN.** No cleanup commit landed. Confirmed: 33 `solari` refs, 23 old `.hero-*` refs in `index.html`. Worse — `packagesData` (a separate ~230-line static object) is also dead (see Tech #2). |
| **D#2 · Plausible not loaded** | **STILL OPEN.** `grep plausible index.html` = 0; `results.html` still fires the dormant `mix_finished` event. |
| **D#3 · stripe-webhook:872 TODO** | **STILL OPEN.** Line 872 unchanged — canceled users keep premium Telegram access. |
| **D#4 · Stale restore-point tag** | Out of scope to verify here; left as-is per audit note. |
| **D#5 · `toTripShape` duplicated** | **STILL OPEN.** Both `save-mix.js` and `save-mix-premium.js` carry their own copy. |
| **D#7 · Billboard 6 Unsplash images** | **STILL OPEN.** No self-hosting. |
| **D#8 · me.html off design-token** | **STILL OPEN** — and bigger than reported: me.html is also fully un-translated (new finding). |
| **deep-audit P0 (catalog gating)** | **RESOLVED & VERIFIED.** Anon → 5 locked/2 try-it, `?auth=1` → `private, no-store`. The narrow-scrub + URL cache-partition approach works in production. |

The app gained polish v13–v18 since the deep audit (mobile fixes, pricing
redux, EU-Omnibus ribbon copy fix, paywall peek, free "copy as text"). Those
are net improvements; the audit below focuses on what is still wrong + new
issues.

---

## 1. TECHNICAL

### P1 — Production debug logging shipped to every visitor
`index.html` lines ~6276–6306 and ~6561–6574 contain a dense block of
diagnostic `console.log` calls inside the Mix search-form IIFE:
`[mix-form] init`, `[mix-form] submit button`, `[mix-form] GLOBAL CAPTURE
click`, `[mix-form] ENTER pressed`, `[mix-form] SUBMIT fired`, `[mix-form]
parsed`, plus `mousedown`/`click` instrumentation listeners that exist *only*
to log. This was clearly added to debug a "submit doesn't fire" issue. It runs
on every page load for every user. **Action:** strip the diagnostic block and
the extra mousedown/capture listeners; keep only the real handlers. (10
`console.log` in index.html, 28 in results.html — most are legitimate
`console.warn` error paths, but the `[mix-form]` set is pure instrumentation.)

### P1 — Three distinct bodies of dead code
1. **Solari board** — CSS `.solari-board*` (from ~line 2720) and a ~130-line
   IIFE (lines 6713–6844) with a `var board = document.getElementById(
   'solari-rows'); if (!board) return;` self-guard. No `#solari-rows` element
   exists in markup → the IIFE parses and no-ops on every load. Includes a
   15-entry mock `DEALS_POOL` and a `setInterval` clock that never runs.
2. **Old hero CSS** — `.hero-grid`, `.hero-eyebrow`, `.hero-sub`,
   `.hero-actions`, `.hero-watermark`, `.hero-sep`, `.hero-live` (lines
   ~723–830). The live hero is `.letto-hero` (line 3733). `.hero-sep` has a
   CSS def at line 2989 with zero markup uses.
3. **`packagesData`** (lines 5885–6115, ~230 lines) — a static object keyed by
   scene names (`istanbul`, `rome`, `halkidiki`…). `openDealModal` does
   `packagesData[card.dataset.deal]`, but every real card sets `data-deal` to
   the Firestore package **id** (`renderCard`, line 4138), never a scene name.
   So `packagesData` is always a miss and the modal always falls through to
   `window.lettoPackages`. The entire object + its `iconBus`/legacy modal
   branch is unreachable. **Action:** one cleanup commit removes ~400+ lines of
   `index.html` with zero behavioral risk (verified: 0 static `.deal-card` in
   markup, 0 `#solari-rows`).

### P2 — Canceled subscriber keeps premium Telegram access
`api/stripe-webhook.js:872` — on `customer.subscription.deleted` the Firestore
doc is correctly downgraded (`subscribed:false`, `aimixUnlocked:false`), but
the `// TODO: Kick user from premium Telegram channel` is unimplemented. A
churned user keeps reading the premium channel indefinitely. **Action:**
implement `banChatMember` (then optionally `unbanChatMember` so they can
rejoin if they resubscribe), using the stored `telegramUserId` if available.

### P2 — Plausible analytics not wired
`results.html` fires `window.plausible('mix_finished', …)` (line ~6169) but no
Plausible script tag exists anywhere (`grep plausible index.html` = 0). Either
add the Plausible loader or delete the dormant event. Right now the funnel's
key conversion event (Mix finished) is unmeasured.

### P2 — FB Pixel snippet is a permanent no-op
`index.html:3425` — `var LETTO_FB_PIXEL_ID = ''; … if (!LETTO_FB_PIXEL_ID)
return;`. The whole consent-gated pixel block (3423–3443) does nothing. It's
harmless but dead; either fill the ID or remove the template until needed.

### P3 — `toTripShape` duplicated
`save-mix.js:36` and `save-mix-premium.js:56` carry near-identical copies (the
premium one adds a `hotel.image` passthrough). Drift risk. Extract to
`lib/mix-shape.js` with an `{ includeImage }` option.

### Security review — clean, minor notes
- Secrets: `.env*`, `.secrets/`, `backups/` are gitignored. No secret leaks in
  `console.log`. Stripe webhook signature verification present.
- Input validation at API boundaries is solid: `save-mix`/`save-mix-premium`
  enforce `MAX_MIX_BYTES` (50KB), method gating, `toTripShape` null-guard;
  `packages.js` clamps `limit` to 50 and slices IATA codes to 3 chars;
  `recovery.js` uses a constant-shape `200 {sent:true}` response so subscriber
  existence isn't leaked.
- XSS: client renderers (`renderCard`, trip.html `render`, me.html dashboard)
  all use an `esc()`/`safe()` helper; URLs are sanitized with
  `.replace(/[<>"']/g,'')`. No raw interpolation found.
- Auth: `lib/auth.js` only trusts a Stripe `cs_` session resolved server-side
  to a Firestore unlock flag — localStorage flags are advisory. Correct model.
- `/trip/{id}` is a public 16-char-hex bearer link **by design** (documented).
  Acceptable; just note that anyone with the link sees the trip.
- Rate limiting (`lib/rate-limit.js`) is per-instance in-memory — explicitly
  best-effort. Fine for soft launch; note it for scale.
- CSP is `Content-Security-Policy-Report-Only` (vercel.json:32) — it does not
  enforce, only reports. Reasonable while stabilizing; plan to flip to
  enforcing once `unsafe-inline`/`unsafe-eval` can be tightened.

### Performance
- The hero is **CSS-only** (despite the `letto-hero-video-wrap` class name it's
  a gradient, no video) — good for LCP.
- No `<link rel="preload">` for fonts on `index.html`/`results.html`; the
  Google Fonts stylesheet (5 families, many weights) is render-blocking.
  Consider `preload` for the one or two fonts used above the fold (Fraunces,
  IBM Plex Sans) or `font-display: swap` is already in the URL — keep it.
- `index.html` is 253KB, `results.html` 280KB — fully inline CSS+JS monoliths.
  Removing the ~400 lines of dead code (Tech #2) shaves real bytes off every
  load. Long-term: extract shared CSS tokens to one file (still duplicated
  verbatim across index/results/trip).
- External runtime deps loaded on `index.html`: tpembars affiliate script,
  flatpickr (CDN), Sentry CDN, 6 Unsplash billboard images. Each is a 3rd-party
  availability/LCP risk; the billboard images especially (D#7) should be
  self-hosted in `public/`.

### API robustness — good
`packages.js` is defensively written: `tsToMs` handles every Firestore
Timestamp serialization shape; `getDailyTryItIds` degrades to an empty set on
query failure rather than 500ing; missing-`bookingUrl` packages get a
synthesized Aviasales URL. `me.js` degrades the mix list to `[]` on a missing
composite index. `save-mix-premium.js` treats email + Telegram delivery as
best-effort side effects. No correctness bugs found in the API layer.

---

## 2. UX

### P1 — Mix search bar is Serbian-only (i18n gap)
The hero search bar — the app's single most important interactive element — is
hardcoded Serbian: field labels `Odakle`, `Kuda`, `Datumi`, `Putnici`; submit
`Traži`; toggle buttons `Sastavi sam · unbundled holiday` / `Pravljeno po
meri`; pax options `2 putnika`; every validation toast (`Izaberi odredište iz
liste`, `Izaberi datume polaska i povratka`, `Datum povratka mora biti posle
datuma polaska`); the combo "no results" string `Nema rezultata`. An EN visitor
toggles to English and still sees a Serbian search bar — jarring and
trust-eroding on a bilingual product. **Action:** wrap all of these in
`data-en`/`data-sr` (labels) and a `lang()`-branched string table (toasts).

### P1 — `/me` account dashboard + recovery are fully Serbian
`me.html` has `<html lang="sr-Latn">`, no `lang-toggle`, and not a single
`data-en`/`data-sr` span. Subscribers who use the site in English hit a 100%
Serbian dashboard and recovery form. The recovery email (`api/recovery.js`) is
also Serbian-only. **Action:** at minimum add the language toggle + bilingual
spans to `me.html`; ideally branch the recovery email by a stored locale.

### P2 — Five contact emails, no single source of truth
`info@letto.live` (index nav, pricing, footer, me.html error), `hello@
letto.live` (results.html nav dropdown), `podrska@letto.live` (trip.html
footer + error), plus `legal@` and `privacy@` in legal pages. A user who
emails `hello@` then `podrska@` can't tell if they're reaching the same
inbox. **Action:** standardize on one public address (`info@` or `podrska@`)
for support; keep `legal@`/`privacy@` only where legally scoped.

### Flow review — mostly solid
- **Catalog browse:** carousel (5 cards + billboard slot) + full grid below
  `#pricing`; locked cards show price/hotel/dates and a gold unlock-strip —
  clean. Modal opens via event delegation; works for dynamically-added cards.
- **Mix builder:** 3-stage flow (search → select flight+hotel → review). Stage
  3 paywall-gated; premium "Finish Mix" calls `save-mix-premium` →
  `/trip/{id}`. The new free "copy as text" alternative (polish v18) is a good
  dead-end mitigation for non-premium users.
- **Recovery / magic-link:** email → `recovery.js` → email with `/me?session=`
  link; same-shape 200 prevents enumeration. Solid.
- **Account dashboard:** `/me` auto-claims `?session=cs_…`, resolves via
  `/api/me`, lists past mixes, logout clears localStorage. Works.
- **Checkout:** `lettoCheckout` has a fetch-then-navigate primary path and a
  form-POST fallback to `/api/stripe-go` with a 1.2s belt-and-suspenders timer
  — robust against mobile-Safari gesture quirks.

### P3 — Friction / dead-end notes
- The free tier CTA is a `mailto:` newsletter signup — no in-page capture; a
  user with no mail client configured hits a dead end. Consider an inline
  email field (the `lead-capture.js` infra already exists).
- recovery email copy "Link važi 30 minuta" (recovery.js:67) — Stripe
  billing-portal session links expire on Stripe's default schedule, not a
  fixed 30 min; if that default differs the copy misleads.
- The hero toggle "Pravljeno po meri" (curated) just smooth-scrolls to
  `#deals` — fine, but the toggle visually implies a second search mode that
  doesn't exist. A returning user may expect a different form.

---

## 3. UI

### P2 — Combo dropdown accessibility
`.letto-combo__option` elements are `<div role="option">` (index.html
6382–6386). They're only selectable via mouse `mousedown` or the input's
arrow-key handler; they are not in the tab order and there's no
`aria-activedescendant` linking the input to the highlighted option. Screen
reader users get an incomplete combobox. **Action:** add
`aria-activedescendant` on the input pointing at the highlighted option id, or
restructure options as a proper listbox.

### P3 — Design-token drift
- `trip.html` and `me.html` each define their own `:root`. `me.html`
  additionally uses the `Inter` font family while the rest of the site uses
  `IBM Plex Sans` — visibly different sans-serif on the account page.
  `trip.html` redefines `--paper`/`--ink` with slightly different hex values
  than `index.html`.
- `index.html`'s `:root` carries layered polish-version comments
  (`Letto polish v1`, `polish v2`) and partly-unused tokens — the spacing/type
  scales (`--space-*`, `--text-*`) are defined but `index.html` body markup
  still uses many hardcoded px values and 55 inline `style="…"` attributes.

### P3 — Responsive breakpoint sprawl
Media-query breakpoints across `index.html` alone: 480, 600, 720, 760, 768,
1024. No documented breakpoint system. Not breaking anything, but each new
component picks an ad-hoc value — maintenance hazard. (Carried from
app-audit D#8, still unaddressed.)

### Accessibility — generally decent, gaps
- Good: SVG decorations carry `aria-hidden="true"`; the deal modal has
  `role="dialog"` + `aria-labelledby`; nav dropdown toggles `aria-expanded`/
  `aria-hidden`; ESC closes modals; reduced-motion is respected in the
  billboard (`prefers-reduced-motion` guard) and hero CSS.
- Gaps:
  - `results.html` announcement bar is a `<div role="button" tabindex="0">`
    that triggers Stripe — `role="button"` is set but verify it also responds
    to Enter/Space (a keydown handler should exist).
  - Card photos: `renderCard` sets `alt` from `imageCredit.alt` or city name —
    OK — but the `.photo-scene` CSS-gradient fallback is decorative and
    correctly `aria-hidden`. Fine.
  - `me.html` form: the result `<div id="result">` is not an `aria-live`
    region, so the success/error message isn't announced.
  - `.letto-hero-title` uses `letter-spacing: 0.18em` on an all-caps H1 — wide
    tracking on all-caps can reduce readability; cosmetic.
  - No skip-link to main content on the long monolith pages.
- Color contrast: the paper/ink palette is high-contrast and safe; muted text
  (`--muted #6E6453` on `--paper #F5EFE0`) is ~4.6:1 — passes AA for body
  text. `.pricing-footnote` at `opacity:0.55` on dark may dip below AA — worth
  a contrast check.

### SEO / structured-data
- **P3 — JSON-LD price mismatch:** `index.html:3384` `Service` offer declares
  `price "29.00" EUR` with `billingDuration P3M` — a quarterly €29 plan. The
  entire visible site sells `€9.99/mo`. Search engines may surface the stale
  €29 figure. **Action:** update the JSON-LD offer to `9.99 EUR / P1M`.
- `admin-scraping.html` is publicly reachable, not `Disallow`-ed in
  `robots.txt` (only `admin.html`, `metrics.html` are) and not in the sitemap.
  Add it to `robots.txt` Disallow. `impressum.html` exists but is missing from
  `sitemap.xml` (a legally-relevant page) — add it.
- JSON-LD `Organization.logo` still points at `og-image.png` (the legacy OG
  share image, not a square logo) — carried from deep-audit D#9.

---

## Conclusion

The app is **healthy and shippable** — production all-green, no structural or
syntax errors, the previously-blocking catalog gating is fixed and verified.

The real findings cluster into three themes:
1. **Cleanup debt** — ~400 lines of dead code in `index.html` (Solari, old
   hero CSS, the unreachable `packagesData` object) plus left-in `[mix-form]`
   debug logging. Low-risk, one commit.
2. **Bilingual incompleteness** — the Mix search bar and the entire `/me`
   account/recovery experience are Serbian-only on a product that markets
   itself as EN/SR. This is the most user-visible quality gap.
3. **Carried tech debt** — the Telegram-channel-on-cancel TODO, dormant
   Plausible, duplicated `toTripShape`, off-token `trip.html`/`me.html`.

No blocker. Recommended order: Mix-form debug strip + dead-code cleanup (P1,
trivial) → Mix bar + `/me` translation (P1, the highest user impact) → Telegram
cancel + Plausible (P2) → token/SEO/a11y polish (P3).
