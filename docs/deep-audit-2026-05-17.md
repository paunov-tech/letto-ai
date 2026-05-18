# LETTO.LIVE · Deep Audit · 2026-05-17 (post-polish v1–v12)

Audit posle 12 polish commit-ova (`6590ba3`…`fece5cb`) + 2 PR merge-a.
Supersedes `app-audit-2026-05-17.md` (taj je bio posle Commit 1).
Production HEAD: `fece5cb`.

## A. Production health — ✅ ALL GREEN
| Provera | Rezultat |
|---|---|
| Stranice (`/`, `/results`, `/me`, `/trip/{id}`, `/about`, `/privacy`, `/terms`, `/dobrodosao`) | sve **200** |
| `/api/health` | `ok:true` · gitSha `fece5cb` · **svi check-ovi true** (firebaseAdmin, stripe, stripeWebhook, resend, rapidapi, notifySecret, adminToken, firestore) · firestore latency 288ms |
| `/api/packages?limit=5` | 200 |
| `/api/me` (bez sesije) | 401 (ispravno) |
| `og.png` | 200 · image/png · 66877 B |
| **Catalog gating** | anon → 52 paketa, **50 locked / 2 try-it** (scrub radi) · `?auth=1` → `private, no-store` |

## B. Strukturni integritet — ✅
- `index.html` 6787 linija — div 288/288, section 8/8, aside 1/1, inline JS **11 blokova 0 grešaka**
- `results.html` div 228/228 · `trip.html` 28/28 · `me.html` 13/13 — svi balansirani
- API/lib syntax (`save-mix-premium`, `packages`, `recovery`, `stripe-webhook`, `me`, `telegram-mix-post`, `auth`) — svi `node --check` OK

## C. ⚠️ Dead code akumulacija (glavni nalaz)
12 rundi polish-a na `index.html` ostavilo je mrtav kod — ništa ne lomi, ali je cruft:
| Mrtvo | Obim | Otkad |
|---|---|---|
| Stari hero CSS (`.hero-grid`/`.hero-eyebrow`/`.hero-sub`/`.hero-actions`/`.hero-watermark`) | ~19 ref-ova | Commit 1 (hero restyle) |
| `.hero-sep` CSS | 1 def, **0 markup uses** | v10 (`·` izbačen iz H1) |
| `.solari-board` CSS (`-row`/`-cell`/`-char`) | ~30 ref-ova | Commit 1 (Solari izbačen iz hero-a) |
| Solari JS IIFE (linija ~6650) | ~130 linija | Commit 1 — `if(!board)return` self-guard → čist no-op, ali se parsira na svakom load-u |

**Ukupno ~180 linija mrtvog koda.** Commit 1 je rekao "Solari migracija u Phase 5" — Phase 5 se nije desio. **Preporuka: cleanup commit** (obrisati stari hero CSS + Solari CSS+JS + `.hero-sep`). Nisko-rizično — ništa živo ih ne referencira (potvrđeno: 0 `#solari` elemenata u markup-u, 0 `class="hero grain"`).

## D. Known issues / tech debt
| # | Prio | Problem |
|---|---|---|
| 1 | P1 | **Dead code** (sekcija C) — ~180 linija. Cleanup commit. |
| 2 | P2 | **Plausible nije učitan** u index.html (`grep plausible` = 0). `mix_finished` event (results.html) je dormant. Analytics nije zakačen. |
| 3 | P2 | **`stripe-webhook.js:872` TODO** — otkazani premium user se NE izbacuje iz premium Telegram kanala (`banChatMember`). Zadržava pristup posle otkaza. |
| 4 | P2 | **Restore point stale** — tag `v1.0-soft-launch-ready` (`73e6807`) je sad 12 commit-ova iza. Rollback na njega bi izgubio ceo v2-v12 polish. Preporuka: nov tag na `fece5cb`. |
| 5 | P3 | `toTripShape` dupliran (`save-mix.js` + `save-mix-premium.js`) — ekstrahovati u `lib/mix-shape.js`. |
| 6 | P3 | `#mix-search-form` ima `!important` grid override-e (v2) — fragilno ako se Mix forma menja. |
| 7 | P3 | Billboard zavisi od **6 eksternih Unsplash slika** — eksterna zavisnost + LCP rizik. Razmotriti self-host u `public/`. |
| 8 | P3 | `me.html` van design-token sistema (svoj `:root`). |
| 9 | P3 | JSON-LD `Organization.logo` (index + results) i dalje `og-image.png` — namerno (logo ≠ OG share slika), ali nedosledno; razmotriti pravi kvadratni logo. |
| 10 | P3 | 3 untracked audit doc-a (`docs/*.md`) — commit-ovati ili ostaviti. |

## E. Šta NIJE pronađeno (provereno, čisto)
- Nema strukturnih grešaka (svi tag-ovi balansirani u 4 glavna fajla).
- Nema JS syntax grešaka (11 inline blokova + 7 API/lib fajlova).
- Catalog gating NIJE pokvaren — scrub radi (50/52 locked anon), `?auth=1` cache-bust radi (`no-store`).
- Nema regresije u produkcijskim flow-ovima — sve stranice + API zdravi.
- `og-image.png` zadržan kao legacy — social cache-ovi ne 404-uju.

## F. Preporuke (po prioritetu)
1. **P1** — cleanup commit: obrisati mrtav hero/Solari CSS+JS (~180 linija) iz index.html.
2. **P2** — nov restore-point tag na `fece5cb` (trenutni je 12 commit-ova zastareo).
3. **P2** — stripe-webhook: izbaciti otkazane korisnike iz premium TG kanala.
4. **P2** — učitati Plausible skriptu ili ukloniti dormant event.
5. **P3** — self-host billboard slike; ekstrahovati `toTripShape`; poravnati me.html tokene.

## Zaključak
**App je zdrav za soft launch.** Production zelen na svim proverama, nula strukturnih/syntax grešaka, catalog gating potvrđen ispravan. Jedini stvarni nalaz je **akumulirani mrtav kod** od 12 polish rundi — cruft, ne blocker. Ostalo je poznati tech debt (P2-P3). Nema pravog blokera.
