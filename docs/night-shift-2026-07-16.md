# LETTO night shift · 2026-07-16

## Scope

Only additive, read-only or rollback-safe work was authorized. No Stripe,
checkout, webhook, Firestore schema, n8n, scraper, pricing, content or UI flow
was changed during this shift.

## Completed

- Added `scripts/smoke-readonly.mjs`, a credential-free production/preview
  probe that performs public GETs and negative authentication checks only.
- Added `npm run smoke:prod`.
- Expanded contract coverage for:
  - Vercel static rewrite targets;
  - private paths in `robots.txt`;
  - sitemap URL uniqueness and HTTPS origin;
  - representative SR/EN destination canonical + hreflang pairs;
  - the four critical entry points and shared UI-finish stylesheet.

## Verified

`npm test` passes. The production smoke probe passes 8/8 checks:

| Check | Expected | Result |
|---|---:|---:|
| `/` | 200 | 200 |
| `/results` | 200 | 200 |
| `/me` | 200 | 200 |
| `/css/ui-finish.20260716.css` | 200 | 200 |
| `/api/health` | 200 + `ok:true` | pass |
| `/api/packages?limit=1` | 200 + packages array | pass |
| `/api/me` without session | 401 | 401 |
| `/api/admin?action=stats` without token | 401 | 401 |

## Intentionally deferred

These require a separate preview/compatibility pass or a product decision and
were therefore not changed autonomously:

- dependency upgrades (`npm audit`: 1 critical, 3 high, 14 moderate);
- `firebase-admin` 14 major upgrade;
- pinning the Vercel Node major instead of the current `>=20` range;
- replacing the per-instance in-memory rate limiter;
- changing Stripe checkout-session authentication/localStorage;
- tightening CSP while inline scripts remain in use;
- admin PATCH field allowlisting until real admin payloads are observed;
- frontend/module refactors or additional visual changes.

## Next safe operator action

Run `npm run smoke:prod` after each production deploy. It uses no secrets and
does not mutate external state.
