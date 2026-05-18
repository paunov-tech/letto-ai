# Bluff Repo Audit · Letto Integracija · 2026-05-17

**Mod:** read-only · klon `github.com/paunov-tech/bluff-game` → `~/bluff-game` (3.4M)
**Status:** COMPLETE — 7 sekcija (A-G)
**Stack:** Vite + React 19 PWA · Vercel serverless `api/` · PartyKit (real-time duel) · Firebase Auth + Firestore REST · Vercel KV · Stripe

> ⚠️ **NAJVAŽNIJE:** Bluff radi na Firebase projektu **`molty-portal`**, letto.live na **`letto-ai`**. To su DVA različita Firebase projekta → Firebase Auth uid-ovi se NE poklapaju između njih. Ovo je glavni blocker za svaku "unified `users/{uid}`" priču. Vidi sekciju F + G.

---

## A. Bluff user shape

Firestore kolekcija **`bluff_players`**, doc id = `userId` (Firebase Auth uid ILI anon id). Izvor: `api/swear-profile.js`.

| Polje | Tip | Napomena |
|---|---|---|
| `userId` | string | doc id |
| `handle` | string\|null | display handle (zaseban od Auth `name`) |
| `swearBalance` | integer | token balans (SWEAR currency) |
| `createdAt` / `updatedAt` | ISO string | |
| `isEarlyAdopter` | bool | prvih 100 korisnika |
| `earlyAdopterRank` | int\|null | |
| `isPro` | bool | **paid gate flag** |
| `proPlan` | string\|null | `monthly` / `yearly` / `lifetime` |
| `stats` | map | soloWins/Losses, blitzWins/Losses, duelWins/Losses, dailyCompletes, dailyPerfects, bestStreak, grandBluffs, shifterWins/Losses/CleanSweeps, numbersWins/Losses/CleanSweeps |
| `firstBonusAwarded` | bool | dedup za first_time_bonus |
| `migratedTo` | string\|null | set kad se anon profil spoji u authed |

**Bitno:** `bluff_players` **NE čuva `email`, `displayName`, `photoURL`**. Ta identity polja žive samo u Firebase Auth tokenu (`verify-firebase-token.js` vraća `uid/email/name/picture`). Profil je keyovan po uid-u ali ne duplira Auth identitet.

## B. Auth metod

**Firebase Auth, samo Google provider.** (`src/auth.js`)
- `GoogleAuthProvider` — `signInWithPopup`, sa `signInWithRedirect` fallback-om.
- iOS Safari poseban put: **Google Identity Services (GIS)** popup (`renderGoogleButton`) jer iOS 18+ ITP particioniše Firebase redirect storage. `signInWithCredential` konzumira GIS ID token.
- Persistence: `indexedDBLocalPersistence` (robusnije od localStorage pod Safari ITP).
- Apple sign-in: stub, baca `apple_signin_not_available`. Email/password: **ne postoji**.
- Server-side verifikacija: `api/_lib/verify-firebase-token.js` — edge-compatible, `jose` + JWKS (`securetoken@system`), bez firebase-admin SDK-a. `verifyRequestAuth(req)` → Bearer token → `{uid, email, name, picture, authTime}`.
- **Drugi identity izvor:** `api/telegram-auth.js` — `verifyTelegramData(initData)` HMAC verifikacija (Telegram Mini App). Bluff podržava i Telegram identitet pored Google-a.

Firebase config (`molty-portal`): `VITE_FIREBASE_*` env vars. Google OAuth client id je public (hardkodovan kao fallback).

## C. Token ledger schema — SWEAR currency

Nije klasičan "sum the transactions" ledger. Dva odvojena dela:

1. **Balans:** `bluff_players/{userId}.swearBalance` — jedan integer. Menja se **atomično** preko Firestore `:commit` transform (`fsIncrement` u `firestore-rest.js`) — `increment` field transform, ne read-modify-write.
2. **Earn log (audit + dedup):** kolekcija **`bluff_earn_log`**, doc id = `{userId}__{gameId}__{event}`. Polja: `{userId, gameId, event, amount, meta, ts}`. Append-only; doc id JE dedup ključ — `fsCreateIfMissing` (Firestore `currentDocument.exists:false`) → idempotentno, retry-safe. Ako log doc već postoji → `duplicate:true`, increment se preskače.

- **Earn rates:** `api/_lib/swear-rates.js` — `EARN_RATES` tabela, server-side. Klijent šalje `event` ime, server gleda iznos (klijent ne može da naduva balans). Npr. `solo_win:30`, `first_time_bonus:100`, `early_adopter_bonus:500`, `grand_bluff_victory:100`.
- **Anon cap:** neautentifikovani korisnici limitirani na `ANON_CAP = 500` SWEAR (`swear-earn.js`) — push ka sign-in-u.
- **Stats bump:** earn event mapira i na `stats.*` counter (`STAT_MAP`), best-effort.
- **Composite indexes:** **nijedan** — nema `firestore.indexes.json` u repou. Ledger je sve doc-id-keyed get/create/increment; jedini `fsQuery` (runQuery, leaderboard) koristi single-field orderBy → bez composite indeksa.
- Trošenje: `api/shop.js` (dekrement `swearBalance`).
- Migracija anon→authed: `api/swear-migrate.js` spaja anon profil u authed, postavlja `migratedTo` na starom.

## D. Bluff access gate

**Nema `bluff_access` polja** (grep prazan). Gate je `bluff_players.isPro` (bool). Tok je fragmentiran preko 3 mehanizma:

1. **Stripe plaćanje** → `api/webhook.js` ("SIAL Shared Stripe Webhook") na `checkout.session.completed` piše u **zasebnu** kolekciju `{product}_premium/{deviceId}` (npr. `bluff_premium/{deviceId}`) — keyovano po **deviceId**, NE po uid/email. Polja: `plan, days, email, paidAt, expiresAt, sessionId, amount`. `expiresAt` računato iz `days`.
2. **Early adopter** → Vercel KV: `early_adopter_count`, `early_adopter:{uid}` (prvih 100, `api/early-adopter.js`). Early adopter = "Pro zauvijek".
3. **`bluff_players.isPro`** → sinhronizovan preko `api/swear-sync-tier.js`: čita KV early-adopter + **veruje klijentskim hint-ovima** (`req.body.isPro`). Komentar u kodu: *"for Part A we trust client hints."*

⚠️ **Slaba karika:** veza Stripe-plaćanje (`bluff_premium/{deviceId}`) → klijentski gate (`bluff_players.isPro`) je INDIREKTNA i delimično client-trusted. `swear-sync-tier.js` ne čita `bluff_premium` direktno. Klijent (App.jsx, `isPro` korišćen ~15×) gejtuje UI na `isPro`. `api/verify.js` ("SIAL Shared Payment Verification") verovatno popunjava prazninu — klijent verifikuje session_id pa prosledi `isPro` hint.

**Pro planovi** (`api/checkout.js`): monthly €4.99 / yearly €34.99 / lifetime €69.99 (one-time `mode:"payment"`, NE subscription). Webhook/checkout/verify/recover su svi "SIAL Shared" — generički Stripe template preko SIAL proizvoda (`{product}_premium`).

## E. Reusable code za letto-ai

| Fajl | Reuse | Komentar |
|---|---|---|
| `api/_lib/verify-firebase-token.js` | **VISOK** | Edge-compatible Firebase token verifier (jose/JWKS, bez admin SDK). Project-id preko env. Kad letto dobije Firebase Auth — kopiraj skoro 1:1. |
| `src/auth.js` | **VISOK (template)** | Firebase Auth klijent — Google, iOS GIS put, redirect handling, ITP workaround-i. letto frontend adaptira ovo. |
| `api/swear-earn.js` + `swear-rates.js` | **SREDNJI (pattern)** | Idempotent earn-log dedup + atomic increment pattern. Domenski specifičan, ali dizajn je direktno primenljiv ako letto uvede currency/poene. |
| `api/_lib/firestore-rest.js` | **NIZAK** | letto već koristi firebase-admin SDK; REST klijent je redundantan. Hardkodovan na `molty-portal`. Korisno samo ako letto ide na edge runtime. |
| `api/_lib/rate-limit.js` | **NIZAK** | letto već ima `lib/rate-limit.js`. Bluff verzija je KV-backed sliding window — uporedi, ali ne kopiraj. |
| `api/checkout.js`/`webhook.js`/`verify.js`/`recover.js` | **NIZAK** | "SIAL Shared" one-time-payment template. letto već ima napredniji subscription-mode Stripe stack. Ne kopirati — alternativni pattern. |
| `api/telegram-auth.js` | **NIZAK** | Telegram Mini App HMAC verifikacija. Reuse samo ako letto pravi TG Mini App. |

**Pre Stream C implementacije — kopirati:** `verify-firebase-token.js` (1:1, env-parametrizovati project id) + `src/auth.js` (kao template za letto Firebase Auth klijent).

## F. Migration plan — `letto_subscribers/{email}` → `users/{firebaseUid}`

**Trenutno stanje:**
- letto: Firebase `letto-ai`, **bez Firebase Auth**, `letto_subscribers/{email}`, Stripe **subscription**, sesija = Stripe `cs_` id u localStorage.
- Bluff: Firebase `molty-portal`, Firebase Auth (Google) + Telegram, `bluff_players/{uid}`, Stripe **one-time**.

**Glavni blokeri:**
1. **Dva Firebase projekta.** Unified `users/{uid}` mora da živi u JEDNOM projektu. Firebase Auth uid je per-projekat — uid u `molty-portal` ≠ ništa u `letto-ai`. Odluka pre svega ostalog (vidi G#1).
2. **letto nema Firebase Auth uopšte.** Identitet je email (iz Stripe-a) + localStorage `cs_` sesija. Da bi se keyovalo po `firebaseUid`, letto MORA da uvede Firebase Auth.
3. **letto je email-keyed, Bluff uid-keyed.** Email je jedini zajednički join ključ.

**Predloženi fazni plan (DRAFT — za review):**

- **Faza 0 — odluka o projektu.** Izabrati jedan Firebase projekat za unified identity (verovatno `molty-portal` jer Bluff + ANVIL + SIAL share, ili nov `sial-id` projekat). letto Firestore podaci ostaju gde jesu; samo `users/` kolekcija je deljena.
- **Faza 1 — letto dobija Firebase Auth.** Kopirati `verify-firebase-token.js` + adaptirati `src/auth.js`. Dodati "Sign in with Google" na letto.live. Korisnik dobija `firebaseUid`.
- **Faza 2 — link na email.** Pri prvom Firebase login-u na letto: `auth.email` → nađi postojeći `letto_subscribers/{email}` → kreiraj/poveži `users/{uid}` sa `{ email, lettoSubscriberRef, ... }`. Email = join ključ. `letto_subscribers/{email}` ostaje kao billing record; `users/{uid}` postaje identity record.
- **Faza 3 — unified `users/{uid}` shape.** `{ uid, email, displayName, photoURL, createdAt, products: { letto: {...}, bluff: {...} } }` — per-product entitlement pod-objekti. Ne spajati billing logiku, samo identitet + entitlement flagove.
- **Faza 4 — cross-product entitlement (opciono).** Bluff login otključava letto premium i obrnuto — tek ako je to produktna odluka (G#4).

**Rizici:** korisnik koji ima i letto i Bluff sa RAZLIČITIM email-ovima neće biti spojen automatski. Anon Bluff korisnici (bez email-a) ne mogu da se join-uju po email-u.

## G. Open questions za Miroslava (10)

1. **Unified Firebase projekat** — `letto-ai`, `molty-portal`, ili nov dedikovan `sial-identity` projekat? (Blokira sve ostalo.)
2. Da li letto uopšte usvaja Firebase Auth, ili ostaje na Stripe-session identitetu, a integracija je samo na nivou podataka?
3. Da li je **email** kanonski join ključ između `letto_subscribers` i `bluff_players`? (Bluff anon korisnici nemaju email.)
4. **Cross-product entitlement** — treba li Bluff Pro da otključa letto premium (i obrnuto), ili su pretplate potpuno odvojene?
5. **Stripe** — ujediniti billing (jedan Customer, više proizvoda) ili zadržati odvojeno? letto = subscription, Bluff = one-time payment.
6. Unified `users/{uid}` — treba li da čuva identity polja (email/displayName/photoURL)? Bluff `bluff_players` ih trenutno NE čuva.
7. Bluff ima dvostruko praćenje plaćanja: `bluff_premium/{deviceId}` (deviceId-keyed) vs `bluff_players.isPro`. Koji je kanonski posle merge-a? Da li čistimo deviceId-keying?
8. **SWEAR token currency** — ostaje Bluff-only, ili postaje cross-product wallet (poeni se troše i na letto)?
9. **Telegram identitet** (Bluff Mini App) — u opsegu za letto unifikaciju, ili samo Google?
10. Bluff dozvoljava **anonimnu igru** (`ANON_CAP` 500 SWEAR) sa anon profilima koji se kasnije migriraju. letto nema taj model — kako se anon Bluff korisnici uklapaju u unified `users/`?

---

## Dodatni nalazi (van A-G)

- **Bronze/Silver/Gold tier sistem NE postoji** u Bluff-u. ZADATAK je pretpostavio `lib/user-tier.js` Bronze/Silver/Gold compute — toga nema. Bluff "tier" je binarni `isPro` + `isEarlyAdopter` badge. Sve "gold" grep pogodke su CSS boje.
- **`lib/token-ledger.js` / `lib/firebase-auth.js` kao imenovani fajlovi NE postoje.** Ekvivalenti: token-ledger → `swear-earn.js` + `swear-rates.js` + `firestore-rest.js`; firebase-auth → `src/auth.js` (klijent) + `_lib/verify-firebase-token.js` (server).
- "SIAL Shared" infrastruktura — `webhook.js`/`checkout.js`/`verify.js`/`recover.js` su generički Stripe template deljen preko SIAL proizvoda (`{product}_premium/{deviceId}`). Potvrđuje memory `project_sial_consulting` — SIAL je parent.
- Real-time duel mod ide preko **PartyKit** (`party/duel.ts`, `partykit.json`) — odvojen od Firestore-a.
- Telemetrija: Sentry + PostHog (Bluff) vs Sentry (letto). letto koristi `withSentry`; PostHog bi bio nov.

## EXIT
7 sekcija (A-G) popunjeno. Nula write-ova u bilo koji repo (samo klon + read). Nijedan BLOCKED. `~/bluff-game` klon ostaje na disku za dalju referencu — obriši sa `rm -rf ~/bluff-game` ako ne treba.
