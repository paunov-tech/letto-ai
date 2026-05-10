# LETTO.LIVE · Stabilization Failure Mode Audit
**Date:** 2026-05-10
**Auditor:** Claude (Opus 4.7)
**Scope:** 20 critical paths × ≥5 specific failure modes per path = 96 findings
**Method:** Code review of every API/lib/frontend critical path. NO fixes applied — this document is triage input only.

🔴 = Observability gap (we wouldn't know in production if this fired)

---

## Stats summary

| Severity | Count |
|---|---|
| P0 (customer can't transact) | 11 |
| P1 (broken happy-path edge case) | 26 |
| P2 (degraded UX, recoverable) | 30 |
| P3 (polish) | 29 |
| **Total** | **96** |
| 🔴 Observability gaps | 17 |

### Top 5 P0 to triage first

1. **F13** — `/api/stripe-webhook` swallows email-send errors after payment recorded. User pays €7.99, gets no confirmation, no PDF, no /trip link. Currently logged-only.
2. **F18** — Apple Pay / Stripe Express checkout can omit `customer_email` field. Webhook `if (!email) break` silently drops the entire purchase: Firestore record never written, email never sent, user has paid with zero record.
3. **F63** — 01-LETTO-MIXING-ENGINE crashed 2026-05-08 16:00 with `WorkflowCrashedError` at "Stage B.6 · CJ inventory lookup". 4GB V8 cap is being hit. Without 01-MIXING, no new packages ever land in the catalog.
4. **F66** — `/opt/sial-factory/docker-compose.yml` on Hetzner contains plaintext production secrets (`ANTHROPIC_API_KEY`, `RAPIDAPI_KEY`, `TRAVELPAYOUTS_TOKEN`, `SENDGRID_API_KEY`, `TELEGRAM_BOT_TOKEN`, `FIREBASE_ACCESS_TOKEN`). Any compromise of root → all services compromised simultaneously.
5. **F95** — No GDPR cookie consent banner anywhere in `public/`. EU traffic + FB Pixel = potential 4% global revenue fine. Hard blocker before paid acquisition.

---

## Findings

| ID | Path | Failure mode (specific scenario) | Severity | User impact | Detection method | Fix scope (h) |
|---|---|---|---|---|---|---|
| F1 | /api/stripe-checkout | `tier` not in {beta, premium, aimix} (e.g. malicious `{"tier":"free"}`) falls to else branch; missing `STRIPE_FREE_PRICE_ID` returns 500. No allowlist. | P1 | Random 500s; abuse vector | Vercel logs (5xx alert) | 1 |
| F2 | /api/stripe-checkout | `STRIPE_AIMIX_PRICE_ID` optional → falls back to inline `price_data` hardcoding `unit_amount: 799` EUR. If product details ever change in Stripe, two sources of truth diverge. | P2 | Price/name drift between dashboard and live | Manual Stripe audit | 0.5 |
| F3 | /api/stripe-checkout | `mixSnapshot` accepted as any object → no schema validation. Posting 1MB+ JSON exceeds Firestore 1MB doc limit, `set()` throws; user can't checkout. | P1 | Abuse → no checkout for that user | Firestore write logs | 1 |
| F4 | /api/stripe-checkout | `pendingMixes/{id}` written with `expiresAt` field but **no TTL policy** in Firestore — 🔴 orphan docs accumulate forever. Storage cost grows with abandoned checkouts. | P3 | Storage cost; never visible to user | Manual collection size check | 🔴 1 |
| F5 | /api/stripe-checkout | `customer_creation: 'always'` creates Stripe Customer on every session, even abandoned. Stripe customer list pollutes; harder to reconcile real customers. | P3 | Internal admin friction | Stripe customer list audit | 0.5 |
| F6 | /api/stripe-checkout | `SITE_URL = process.env.VITE_SITE_URL || 'https://letto.live'` — if env set wrong (typo, preview value leaked to prod), success_url redirects to wrong host → user thinks payment failed. | P2 | Lost sale | Compare env var to canonical | 0.5 |
| F7 | /api/stripe-checkout | `success_url` uses `{CHECKOUT_SESSION_ID}` placeholder — if Stripe SDK ever changes the substitution token, literal `{CHECKOUT_SESSION_ID}` reaches /api/me which validates `startsWith('cs_')` → false → user loses unlock. | P1 | Paid customer locked out | /api/me logs | 1 |
| F8 | /api/stripe-checkout | No idempotency key on `stripe.checkout.sessions.create()` — duplicate POSTs (double-click, retry on timeout) create duplicate sessions + duplicate `pendingMixes` docs with different IDs. | P2 | Duplicate billable sessions | Stripe dashboard | 0.5 |
| F9 | /api/stripe-checkout | `req.body || {}` — non-JSON content-type yields empty object → tier='beta' → checkout for beta even if user clicked aimix CTA. | P2 | Wrong product purchased | Compare metadata to UI intent | 0.5 |
| F10 | /api/stripe-checkout | Method not allowed returns 405 with no `Allow` header. RFC 7231 violation; some clients (curl `-i`, security scanners) flag. | P3 | Cosmetic | Header inspection | 0.25 |
| F11 | /api/stripe-webhook | Webhook awaits PDF generation + Resend send synchronously inside event handler. Total latency 700-2000ms. Vercel default function timeout 10s; under load (concurrent webhooks), batches could near limit. | P2 | Webhook 5xx → Stripe retries | Vercel timeout logs | 2 |
| F12 | /api/stripe-webhook | `purchasedMixes/{tripId}` `set()` not idempotent on `paidAt` field — Stripe webhook retries (up to 3× with exponential backoff) overwrite `paidAt` with newer timestamp, breaking "first paid at" semantics. | P3 | Internal record drift | Diff stripeSessionId.created vs paidAt | 0.5 |
| F13 | /api/stripe-webhook | `await sendMixConfirmationEmail(tripDoc)` thrown error caught + logged but **no retry queue, no admin alert**. Customer pays €7.99 → no email → no PDF → no /trip link. | **P0** | Paid with no confirmation; refund risk | Vercel logs only (no alerting) | 4 |
| F14 | /api/stripe-webhook | `buildMixPdfBuffer` runs pdfkit inline. If pdfkit throws (corrupt font cache, unicode edge), entire email path collapses but `purchasedMixes/{tripId}` already written. | **P0** | Same as F13 | Same as F13 | 3 |
| F15 | /api/stripe-webhook | PDF buffer assembled via `chunks.push()` + `Buffer.concat()` — currently small but adversarial trip with very long hotel name/messages could OOM the 1024MB Vercel function. | P2 | Function crash | Function memory metrics | 1 |
| F16 | /api/stripe-webhook | Resend attachments capped 40MB. Current PDFs ~30KB so safe, but adding photos to PDF later would require staged check. | P3 | Future regression | Manual size assertion | 0.5 |
| F17 | /api/stripe-webhook | Tier resolution: `snapshot?.tier \|\| f.tier` defaults to 'value' silently when both missing. User who selected Budget could receive "Tvoj Letto Value Mix · ..." subject. | P2 | Mislabeled email + PDF | Email subject vs purchasedMixes.tier diff | 0.5 |
| F18 | /api/stripe-webhook | `if (!email) break` silently aborts when `customer_email` AND `customer_details.email` are both null. Apple Pay / Express checkout can omit. **No Firestore record, no email, no /trip link** — user has paid, system has nothing. | **P0** | Paid customer with zero record | 🔴 Vercel logs only ("session.customer_email is null") | 2 |
| F19 | /api/stripe-webhook | `sendWelcomeEmail` (premium subscribers) uses SendGrid. SendGrid `r.status === 202` is the only "ok" check; 200/204 from edge proxies treated as failure. Two providers (Resend for aimix, SendGrid for premium) = double the failure surface. | P1 | Premium new sub gets no Telegram invite | SendGrid dashboard | 2 |
| F20 | /api/stripe-webhook | `customer.subscription.deleted` calls `await stripe.customers.retrieve(sub.customer)` — if Stripe API momentarily down, webhook throws → retries → multiple deletion events for same sub. Idempotent on Firestore but logs noisy. | P2 | Internal log noise | Vercel logs duplicate detection | 0.5 |
| F21 | /api/stripe-webhook | TODO at line 792: cancelled premium user **NOT** removed from Telegram channel. Cancelled customer keeps receiving premium content indefinitely. | P1 | Revenue leakage; product devaluation | Manual channel member audit | 2 |
| F22 | /api/stripe-webhook | `metadata.source !== 'letto'` skip path is correct (jadran.ai shares Stripe account) but **not logged to Firestore** → no audit trail of cross-account event filtering. | P3 | 🔴 Cross-product accounting blindspot | Vercel logs only | 1 |
| F23 | /api/hotels-search | `RAPIDAPI_KEY` revoked (rotation, abuse, billing) → every hotel search returns 502 with no graceful fallback. No cached results. Mix V2 hotel stage breaks hard. | **P0** | Mix V2 unusable | /api/health checks key presence only, not validity | 6 |
| F24 | /api/hotels-search | `hotelDetailCache` is module-level `Map` — Vercel function cold start = empty cache, every cold scope re-fetches all 5 hotel detail calls (5×6s timeout = potential 30s). | P2 | Cold-start latency spike | Function duration p99 | 2 |
| F25 | /api/hotels-search | `domain=DE&locale=de_DE` chosen for native EUR. If RapidAPI silently changes locale handling (e.g. de_AT→USD), prices come back in different currency but UI labels them EUR. **No currency assertion in the response.** | P1 | 🔴 Silent overcharge / undercharge | Manual sample check | 2 |
| F26 | /api/hotels-search | `parseDeNumber` strips non-digits — accepts "$5.99" and produces 5.99, treating USD as EUR. Same risk if RapidAPI ever returns mixed currencies in response. | **P0** | 🔴 Silent currency conversion → wrong price shown to user | Diff vs known fixture | 2 |
| F27 | /api/hotels-search | Stars derived `Math.round(guestRating / 2)` — not actual hotel-class stars. A 4★ business hotel with mediocre 6.0 guest rating renders as "3★". | P2 | UX misleading; hotel class advertising | Sample compare | 4 |
| F28 | /api/hotels-search | `IATA_TO_CITY_EN` hardcoded list (~70 codes). New IATA codes added to engine but not here → 400 "Unknown destination IATA". | P1 | Hotel search dies for new routes | API 400 logs | 1 |
| F29 | /api/hotels-search | Region lookup 8s timeout + property search 15s timeout = 23s worst-case. Vercel `maxDuration: 25s`. 2s margin → cold start can exceed. | P2 | Function timeout, user sees "couldn't load hotels" | Vercel duration metrics | 1 |
| F30 | /api/hotels-search | `Promise.allSettled` for top-5 detail enrichment — fine for single slow call. But if all 5 IDs fail simultaneously (RapidAPI partial outage), distance feature silently absent for all hotels. | P3 | 🔴 No "distancesEnriched=0 across all results" alert | Manual sample | 1 |
| F31 | /api/hotels-search | CORS allowlist hardcoded `letto.live` + `*.vercel.app` regex. Tunneled local dev (ngrok, localhost) blocked. | P3 | Dev friction | curl OPTIONS test | 0.5 |
| F32 | /api/hotels-search | `regionId = winner.gaiaId` — if RapidAPI ever returns `gaiaId: null` (data quality bug), URL becomes `&region_id=null` → silent property search returning 0 hotels. | P2 | "0 hotels" empty state for valid city | Sample assertion | 0.5 |
| F33 | /api/hotels-search | No 429 rate-limit aware retry. RapidAPI bursts → single 429 → user sees error → must refresh. | P1 | Spike-time outages | Rate limit response logs | 2 |
| F34 | /api/packages | `priceTier` filter excludes packages where `tier` field is missing/null (legacy pre-tier seeds). Smart fallback chain on frontend can mask this, but a route with ONLY untiered packages shows empty even if matches exist. | P1 | Hidden inventory | Compare tier counts vs route counts | 1 |
| F35 | /api/packages | Search mode pulls 60 docs then sorts in-memory — at scale (>200 packages on a route), the actual best-deal is missed. Currently catalog 64 total so safe; budget watch. | P2 | At-scale top-N inaccuracy | Catalog size threshold | 4 |
| F36 | /api/packages | Date filter is ranking-only, not filtering. A 2027 package in response to 2026-06-01 search ranks "far" but still shows up. UX shows ±300d hint. | P2 | Confusing for users with strict dates | Inspect `_dateMatch` field | 2 |
| F37 | /api/packages | `req.query.from` not validated. `'2026-13-99'` → `new Date()` returns Invalid Date → `fromTs = NaN` → all packages get `_dateMatch: 'unknown'` → ranking degraded. | P3 | Sort order falls back to default | Validate query params | 0.5 |
| F38 | /api/packages | 5-min CDN cache + 10-min SWR. Engine writes new package → users won't see for 5 min. Acceptable but not customer-facing. | P3 | New deals delayed by 5 min | Cache header inspection | 0.25 |
| F39 | /api/packages | Firestore composite-index-missing error caught generically as `internal`. Operator can't tell from response that index needs deploying. | P2 | 🔴 Missed index ⇒ slow path | Vercel logs (e.message inspection) | 0.5 |
| F40 | /api/packages | URL param naming overload: `tier` = visibility tier (public/premium); `priceTier` = price band. Two different concepts on the same query string. Easy to confuse during integration. | P2 | Query confusion in admin/3p | Param rename | 1 |
| F41 | /api/cj-refresh | `pullPartner` loop hardcoded `offset < 2000`. If a partner ever has >2000 deals, last items silently dropped. CJ Air Serbia at 1657 today; growth could hit. | P1 | Inventory undercount | Compare CJ count to fetched count | 0.5 |
| F42 | /api/cj-refresh | `gqlQuery` no retry on 5xx. Single transient CJ failure = entire refresh aborts; n8n cron error counts up. | P1 | False-negative cron errors | n8n execution status | 1 |
| F43 | /api/cj-refresh | Batch write 400-doc chunk fails atomically → 400 docs marked `failed` but other batches still commit. Inconsistent inventory state on partial failure. | P2 | Stale inventory mixed with new | Batch-level status reporting | 1 |
| F44 | /api/cj-refresh | `docId = ('cj_' + partner.id + '_' + p.id).replace(/[^a-zA-Z0-9_-]/g, '')` — if partner IDs ever overlap with product ID format, collision possible. Future-proofing only. | P3 | Future partner adds | Manual ID schema | 0.5 |
| F45 | /api/cj-refresh | No TTL on stale CJ inventory. CJ-deleted products linger forever, polluting search. | P2 | Stale offers shown | Compare lastSyncedAt < 24h count | 1 |
| F46 | /api/cj-refresh | `parseFloat(p.price.amount)` — if CJ ever returns EU-formatted "1.099,50", parses as 1.099 (silent under-pricing). | P1 | 🔴 Wrong prices propagate | Sample check vs CJ portal | 0.5 |
| F47 | /api/cj-refresh | `NOTIFY_SECRET` env var loss → all calls return 401 → cron errors silently → no admin alert (because the very alert path is the same env var). | P1 | 🔴 Silent cron death | n8n cron status board | 1 |
| F48 | /api/admin | ADMIN_TOKEN auth via Bearer header. Rotation breaks n8n + admin UI simultaneously. No graceful overlap window. | P1 | Admin lockout | Rotation runbook | 1 |
| F49 | /api/admin | `engine-stats` reads `letto_engine_events`. If engine stops writing events (e.g., n8n crash), endpoint returns `events: {}` — looks like "all healthy". | P2 | 🔴 False "all green" status | Heartbeat doc with min-age check | 1 |
| F50 | /api/admin | PATCH allows arbitrary field updates with no schema validation. Admin can break package shape (e.g. set `pricing.total = "abc"`). | P3 | Internal damage | Schema validate on PATCH | 1 |
| F51 | /api/admin | Approve action sets status without validating package fields are complete (e.g. publishing a package with no `flight.airline`). | P2 | Broken package in production | Pre-approve validation | 1 |
| F52 | /api/admin | No audit log of who approved/rejected/edited. `approvedBy: 'admin'` is hardcoded, no per-user identity. | P3 | No accountability trail | Admin event log collection | 2 |
| F53 | /api/stripe-webhook (Resend) | `resolveResendSender` falls back to first-verified domain if `letto.live` not verified. If `letto.live` ever unverifies (DNS, billing), email sender drifts to `<other-domain>` silently. Spam folder risk. | P1 | Deliverability tank | Diff actual sender vs config | 1 |
| F54 | /api/stripe-webhook (Resend) | Resend API key rotation kills every email until env updated. No SMS/push fallback to nudge user "your trip is ready, login to see it". | **P0** | All confirmations dead | /api/health includes resend `length>5` only | 4 |
| F55 | Resend infra | Domain DKIM/SPF/DMARC: if DNS records drift (Cloudflare update breaks), deliverability tanks but Resend still returns 200 to API. We see "sent successfully" while emails go to spam. | **P0** | 🔴 Silent deliverability collapse | External tools (Mail-tester, Glock) | 4 |
| F56 | PDF generation | pdfkit Helvetica font is WinAnsi only — non-Latin chars (ć, š, č, Greek) replaced with ?. Currently text is ASCII-fied for safety, but Greek hotel names break. | P2 | Greek/Cyrillic content shows as "?????" | Sample with Cyrillic hotel | 2 |
| F57 | PDF generation | PDF assembled in-memory via Buffer concat. Adversarial trip with very long copy could exceed 1024MB function memory. | P3 | Function OOM | Memory metric | 0.5 |
| F58 | PDF generation | No PDF signature/embedded metadata. Easy to forge a fake trip PDF for support escalation abuse. | P3 | Low-value support fraud vector | Manual hash verification | 4 |
| F59 | /api/trip/[id] | `tripId` is 16-char hex (64-bit entropy). Adequate, but if shared on social/screenshot, full trip + buyer email exposed. No revocation API. | P2 | Privacy leak via public share | Manual revoke endpoint missing | 2 |
| F60 | /api/trip/[id] | 60s edge cache + `private`. `private` should prevent leakage between viewers, but if Vercel ever changes cache key handling, semantics could drift. | P3 | Theoretical privacy leak | Manual cache header inspection | 0.5 |
| F61 | /api/trip/[id] | Returns full `userEmail` in response. Anyone with the link sees the buyer's email. | P2 | PII leak via share | Strip from response | 0.5 |
| F62 | /api/trip/[id] | 500 returns generic `internal`. Operator can't diagnose without Vercel logs. | P3 | 🔴 Diagnosis friction | Surface error code | 0.25 |
| F63 | n8n 01-LETTO-MIXING-ENGINE | Crashed 2026-05-08 16:00 UTC at "Stage B.6 · CJ inventory lookup" with `WorkflowCrashedError: "n8n may have run out of memory"`. Even with `NODE_OPTIONS=--max-old-space-size=4096`, this stage hits the cap. CJ inventory grew from a few hundred to 1657. Without 01-MIXING running, **no new packages are generated**, ever. | **P0** | Catalog stale forever; ad spend on dead inventory | Last successful execution + Stage B.6 OOM signature | 6 |
| F64 | n8n 01-LETTO-MIXING-ENGINE | `scheduleTrigger.rule.interval[0].hoursInterval = 12` BUT node named "Trigger · every 6h". Semantic drift between configured cadence and operator expectation. | P1 | Operator surprise; 2× cadence loss | DB inspection | 0.25 |
| F65 | n8n drift | Workflow JSONs in repo could fall out of sync with n8n DB at any moment (UI edits, manual fixes). 05-CJ-REFRESH drift was just closed today; same risk applies to 00, 01, 02, 03, 04, 06. **No automated drift detector.** | P2 | 🔴 Silent config drift | Git diff vs DB export | 4 |
| F66 | n8n infrastructure | `/opt/sial-factory/docker-compose.yml` contains plaintext production secrets (ANTHROPIC_API_KEY, RAPIDAPI_KEY, TRAVELPAYOUTS_TOKEN, SENDGRID_API_KEY, TELEGRAM_BOT_TOKEN, FIREBASE_ACCESS_TOKEN, postgres password). Root compromise → all services compromised. | **P0** | Lateral movement risk | Secret rotation history | 8 |
| F67 | n8n infrastructure | Container has no docker-level memory limit (`HostConfig.Memory=0`). If Node escapes the 4GB V8 cap (worker threads, native modules), host could OOM-kill postgres or other workloads. | P1 | Cross-service crash cascade | docker inspect | 0.5 |
| F68 | n8n schedule trigger | `hoursInterval` semantics = "every N hours from start". Container restart resets the schedule clock. No fixed-time guarantee (e.g. "fire at 04:00 UTC"). Cron expression form (`0 0 0/6 * *`) would be sturdier but isn't used. | P1 | Cron drift after each restart | DB schedule trigger inspection | 1 |
| F69 | n8n error handler | 3 unfinished webhook executions at restart (DIRIGENT — Error Handler) — those errors are LOST. The error handler itself can't notify Miroslav of errors that happened during n8n restart. | P1 | Error handler self-blackout | Crashed execution count | 2 |
| F70 | n8n IMAP triggers | IMAP triggers throwing ECONNRESET/EPIPE on every restart with auto-reactivate noise. Could mask real persistent failures (mail server down for hours). | P3 | False-OK after persistent IMAP outage | Reactivation log threshold | 1 |
| F71 | results.html | `STATE_TTL_MS` localStorage TTL — if too long (7+ days), stale flight prices shown to returning user; checkout for stale price → Stripe sees current. | P2 | Wrong total at stage 3 | Stale state detection | 1 |
| F72 | results.html | `selectPackage` falls through silently if `pkgId` not in `packagesState.raw` — `console.warn` only, no UI feedback. User clicked + nothing happens. | P3 | Confusing dead clicks during transient state | Click handler audit | 0.5 |
| F73 | results.html | `localStorage.setItem` `QuotaExceededError` handler clears letto_* keys and retries — but if the retried payload is itself the bloat, retry also fails silently. State lost. | P2 | State lost mid-flow | localStorage instrumentation | 1 |
| F74 | results.html | `getState` discards `version !== 2` — if older user has old state, "first visit" treatment despite knowing the user. | P3 | Cold start UX for returning user | Version migration | 1 |
| F75 | results.html | Empty state shows ONLY after auto-flip exhausts all 3 tiers. If user explicitly clicks tier and gets 0, empty state shows. Correct behavior but copy doesn't differentiate "this tier empty" vs "no tiers available". | P3 | Mild UX confusion | Copy improvement | 0.5 |
| F76 | index.html | 4 `data-stripe="beta"` CTAs rely on `lettoCheckout()` JS handler. If JS bundle fails to load (network, blocker, ancient browser), all 4 CTAs are dead — no <form> action="/api/stripe-go" progressive-enhancement fallback. | P1 | Total checkout failure for JS-disabled users | Lighthouse no-JS audit | 2 |
| F77 | index.html | `data-stripe="premium"` CTA only on pricing card. Same JS dependency. | P1 | Same as F76 | Same | (covered by F76) |
| F78 | index.html | `lettoCheckout` writes "Opening Stripe..." into `txtSpan` (first `[data-en]` or button itself). If markup variant doesn't have `[data-en]`, label persists "Opening Stripe..." after fallback fires. | P3 | Cosmetic stuck CTA label | Manual variant test | 0.5 |
| F79 | trip.html | `getId()` reads `pathname` first, falls back to `?id=`. If Vercel rewrite ever changes (`/trip/:id` → something else), both paths could fail simultaneously. | P2 | Trip page broken after rewrite change | Rewrite contract test | 0.5 |
| F80 | trip.html | `<meta name="robots" content="noindex">` set. But OG image+description still preview when shared on Twitter/Facebook. Content includes flight times + hotel name. | P3 | Privacy leak via OG preview | OG cards audit | 0.5 |
| F81 | /api/me | Returns `EMPTY` (false/false) on ANY error. No distinction between "not logged in", "Stripe API down", "Firestore unreachable". Transient infra blip → user appears unpaid. | P1 | 🔴 Customer reports "I lost access" with no trace | Differentiated error codes | 2 |
| F82 | /api/me | `sessionId.startsWith('cs_')` accepts both `cs_test_*` and `cs_live_*`. Production uses live keys, so test sessionIds wouldn't resolve. Defense in depth missing. | P3 | Theoretical mode confusion | Stricter prefix | 0.25 |
| F83 | /api/me | 60s `private` cache. User pays then refunds within 60s, cache hides revocation. Edge case but possible during disputes. | P3 | 60-second stale entitlement | Cache invalidation hook | 1 |
| F84 | localStorage | `letto_mix_state_v2` namespace. No migration path designed for v3+. Silent state loss on schema change. | P3 | Cold start UX for upgrade | Migration runner | 1 |
| F85 | localStorage | State holds full `flight.selected` + `hotel.selected`. If hotel name + neighborhood + photo URL combined exceed quota (rare), entire state lost. | P3 | Mid-flow state loss | Size monitoring | 0.5 |
| F86 | localStorage | No cross-tab sync. Two tabs → conflicting writes → last-write-wins clobbers user's other-tab work. | P3 | Lost selections in multi-tab use | BroadcastChannel sync | 1 |
| F87 | Stripe Live activation | `STRIPE_SECRET_KEY = sk_live_*` lives in `.env.stripe` (gitignored). If `.env*` ever committed accidentally (e.g. `git add -A` in a hurry), live key leaks to GitHub. | **P0** | Full Stripe takeover | Pre-commit secret scanner | 1 |
| F88 | Stripe Live | `STRIPE_WEBHOOK_SECRET` rotation requires Vercel env update + Stripe dashboard update atomic. During the window, webhook delivery fails → missed paid events. | P1 | Webhook outage during rotation | Rotation runbook with overlap | 2 |
| F89 | Resend domain | `resolveResendSender` checks domain on every webhook invocation. If DNS drifts mid-day, next email send silently switches sender to first-verified domain (potentially `sial.com`). | P1 | Branding inconsistency; spam | Daily domain verify ping | 1 |
| F90 | Resend bounce handling | No bounce/complaint webhook configured. Bounced emails visible only in Resend dashboard. We don't know if a customer's email is invalid. | P2 | 🔴 Failed delivery invisible | Resend webhook listener | 4 |
| F91 | RapidAPI key | Single key for engine + frontend hotels-search. Compromise → must rotate immediately, breaking all paths until Vercel + n8n env updated. | P1 | Cross-system outage during rotation | Two-key segregation | 4 |
| F92 | RapidAPI quota | No usage alerting. Approaches monthly quota → no warning until 429 errors surface. With 14k req/mo plan and growing traffic, this WILL bite. | P2 | Sudden hotel search outage | Quota monitor | 2 |
| F93 | Firestore indexes | 2 composite indexes defined. New `priceTier` query works without composite (4-equality query). At scale, composite `(status, origin.code, destination.code, tier, metadata.createdAt)` would help cold-cache cases. | P3 | Cold-query latency at scale | Query plan inspection | 1 |
| F94 | Firestore indexes | Adding a NEW where clause in the future without an index update throws `FAILED_PRECONDITION` only at runtime. Pre-deploy lint missing. | P2 | Production query crash | Pre-deploy index validation | 2 |
| F95 | GDPR cookie consent | NO cookie banner anywhere. localStorage usage + planned FB Pixel = personal data processing under GDPR. Pre-launch hard blocker for paid acquisition. | **P0** | Up to 4% global revenue fine | Manual page audit | 6 |
| F96 | GDPR | Privacy policy (`terms.html` 109 LOC) does not mention FB Pixel, Resend, RapidAPI as data processors. Required disclosure under Art. 13. | P1 | Compliance gap | Legal review | 4 |

---

## Patterns observed

- **Single-provider dependence in payment + email path**: Stripe + Resend. Either rotation event = outage. Mitigations exist for RapidAPI (could fall back to Booking.com or Hotellook) but not for the payment/email leg.
- **Silent fallback proliferation**: `tier` defaults to 'value', sender defaults to first-verified domain, `_dateMatch` defaults to 'unknown'. Each defensive default hides a real signal.
- **Observability gaps cluster around success-path silences**: every "swallow error and return EMPTY" path (F18, F25, F26, F46, F47, F49, F55, F62, F65, F81) is invisible until a customer complains.
- **Drift between repo and runtime**: 05-CJ-REFRESH drift just closed; n8n schedule node name vs config drift (F64); SITE_URL env vs canonical drift (F6); workflow active flag in JSON `null` vs DB `t` drift.
- **Pre-launch P0s are LEGAL/SECURITY, not product**: F66 (plaintext secrets), F87 (potential key leak), F95 (GDPR banner). These block FB launch even though product flow works.

## Recommended fix order (ignoring this audit's scope-no-fix rule)

1. **F95** (cookie banner) — legal blocker, 6h
2. **F66** (rotate plaintext keys to a secret manager) — pre-FB-launch security baseline, 8h
3. **F13 + F14 + F18** (post-payment confirmation reliability) — bundled because they share fix path: persist email-send failures to a `failed_confirmations` collection + admin alert + retry job, ~6h total
4. **F63** (01-MIXING OOM in Stage B.6) — refactor stage to stream/batch instead of in-memory, 6h
5. **F26 + F46 + F25** (silent currency conversion paths) — assertion + alert, 4h total

Remaining items batch into a "Q3 stabilization" sprint of ~80h estimated.

---

*End of audit. 96 findings. No fixes applied. Triage decisions belong to Miroslav.*
