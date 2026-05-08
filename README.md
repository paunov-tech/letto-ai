# LETTO.LIVE

**AI kurator putničkih dealova za Balkan.**

Informacioni servis (ne turistička agencija) koji skenira ponude i šalje pretplatnicima samo deal-ove koji su realno ispod proseka. **Prodajemo informacije, ne putovanja.**

---

## Arhitektura — stvarna

```
                   ┌────────────────────────────────────┐
                   │  letto.live  (Vercel)              │
                   │                                    │
                   │  public/   ← standalone HTML       │
                   │     ├ index.html       (landing)   │
                   │     ├ results.html     (Mix V2)    │
                   │     ├ about / impressum / privacy  │
                   │     ├ admin / metrics / scraping   │
                   │     └ dobrodosao.html  (Stripe ok) │
                   │                                    │
                   │  api/     ← Vercel functions       │
                   │     ├ me                (paywall)  │
                   │     ├ packages          (read)     │
                   │     ├ hotels-search     (RapidAPI) │
                   │     ├ stripe-checkout / webhook    │
                   │     ├ telegram-webhook             │
                   │     ├ admin / scrape-status        │
                   │     ├ spots-remaining              │
                   │     ├ notify-admin (n8n auth)      │
                   │     └ cj-refresh   (n8n cron)      │
                   └────────────────┬───────────────────┘
                                    │ Admin SDK
                                    ▼
                   ┌────────────────────────────────────┐
                   │  Firestore (project: letto-ai)     │
                   │   letto_packages · letto_subscribers│
                   │   letto_engine_events · letto_cj_*  │
                   │   letto_scrape_*                    │
                   └────────────────────────────────────┘
                                    ▲
                                    │ Admin SDK writes
                   ┌────────────────┴───────────────────┐
                   │  Hetzner CPX41 · 204.168.153.192   │
                   │   n8n      (workflows/*.json)      │
                   │   scrapers (scrapers/*.mjs)        │
                   │   PostgreSQL (price history)       │
                   └────────────────────────────────────┘
```

**Frontend je standalone HTML — nema React, nema Vite, nema build step-a.**
`public/` se serv-uje kao-jeste preko Vercel-a (`outputDirectory: "public"` u `vercel.json`).

---

## Direktoriji

| Path | Šta je | Deploy gde |
|---|---|---|
| `public/` | landing + Mix V2 + admin pages | Vercel static |
| `api/` | serverless funkcije | Vercel functions |
| `workflows/` | n8n workflow JSON-ovi (kanonska verzija) | Hetzner n8n |
| `workflows/_legacy/` | pre-pivot workflow drafts (referenca) | — |
| `scrapers/` | flight scraper-i (Smartproxy) | Hetzner |
| `scripts/` | ops alati (env push, verify, image populate) | lokalno |
| `ops/` | infra fix-evi (Hetzner Firebase token rotation) | lokalno → Hetzner |
| `docs/` | handoff + audit + setup guide-ovi | repo |
| `firestore.rules` / `firestore.indexes.json` | Firebase config | `firebase deploy --only firestore` |

---

## API endpoint-i

| Endpoint | Caller | Auth | Šta radi |
|---|---|---|---|
| `/api/me` | frontend (results, index) | none — cs_ session_id | Server-side paywall validation: vraća `{premium, mixUnlocked}` |
| `/api/packages` | frontend (index, results) | none, cached 5min | List published packages |
| `/api/hotels-search` | frontend (Mix V2) | none, cached 1h | Hotels.com via RapidAPI |
| `/api/stripe-checkout` | frontend | none | Kreira Stripe checkout session (`tier`: `beta`/`premium`/`aimix`) |
| `/api/stripe-webhook` | Stripe | signature verify | Handle `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted` |
| `/api/telegram-webhook` | Telegram | signature | Bot komande + new member detection |
| `/api/spots-remaining` | frontend | none, cached 5min | Beta scarcity counter (100 - sold) |
| `/api/admin` | admin pages | `Bearer ADMIN_TOKEN` | Approve/reject/edit packages + stats |
| `/api/scrape-status` | admin | `Bearer ADMIN_TOKEN` | Scrape inventory + run history |
| `/api/notify-admin` | n8n | `Bearer NOTIFY_SECRET` | Push event → Telegram admin DM + audit log |
| `/api/cj-refresh` | n8n cron 6h | `Bearer NOTIFY_SECRET` | Pull CJ travel inventory → Firestore |

---

## Stripe tier-ovi

| Tier | Mode | Cena | Trial |
|---|---|---|---|
| `aimix` | one-time payment | €7.99 | — |
| `beta` | subscription | €19/3mo (prvih 100) | 14 dana |
| `premium` | subscription | €29/3mo | 14 dana |

Svi pišu u `letto_subscribers/{email}` preko webhook-a. Frontend čita unlock state isključivo preko `/api/me`.

---

## Lokalni dev

```bash
npm install
vercel dev               # local Vercel runtime za api/ + public/
```

Env vars: kopiraj `.env.example` → `.env.local`, popuni vrednosti. Stripe / Firebase / Telegram tokens u `.env.stripe`, `.env.engine`, `.env.telegram` (svi gitignored).

## Deploy

```bash
git push origin main     # Vercel auto-deploy na main
```

Manuelno:
```bash
vercel --prod
```

n8n workflow-i se sinhronizuju ručno na Hetzner — `docs/HETZNER-DEPLOY-HANDOVER.md`.

---

## Firestore kolekcije

| Collection | Pisac | Čitač |
|---|---|---|
| `letto_packages` | n8n via Admin SDK | `/api/packages` (status filter) |
| `letto_subscribers` | `/api/stripe-webhook` | `/api/me` (po email-u) |
| `letto_engine_events` | `/api/notify-admin` | admin metrics |
| `letto_cj_inventory` | `/api/cj-refresh` (cron) | engine internal |
| `letto_scrape_inventory`, `letto_scrape_runs` | scrapers (Hetzner) | `/api/scrape-status` |
| `letto_telegram_events` | `/api/telegram-webhook` | internal audit |

Pravila: `firestore.rules` — deny-by-default, pisanje samo Admin SDK-om, čitanje samo za `published_*` status.

---

## Status (2026-05-08)

- v0.2 cleanup: orphan React app obrisan, dead API endpoints obrisani, server-side paywall validation, `letto-engine/` + `n8n/` konsolidovani u `workflows/`
- Mix V2 Stage 3 sa Stripe paywall-om za AI Mix unlock (€7.99 jednokratno)
- Hotellook engine endpoints (`engine.hotellook.com/api/v2/cache.json`) vraćaju 404 nginx od 2026-05-06 — Mix V2 hoteli idu preko `/api/hotels-search` (RapidAPI Hotels.com)

Audit: `docs/AUDIT-2026-04-28.md`, `DEPLOY-LOG.md`.

---

## Vlasništvo

SIAL Consulting d.o.o., Brežice, Slovenija. Kontakt: `info@letto.live`.
