# Noćna smena · 2026-05-17 · CC Autonomous

**Trajanje:** ~45 min · **Status:** COMPLETE (5/5 taskova) · **Mod:** read-only inspect, nula write-ova / commit-ova
**Za:** Miroslav · 5-minutni prepared brief umesto sata copy/paste-a

---

## TASK 1: "Završi miks" CTA flow

### Šta postoji u `public/results.html`
Stage 3 = `#mix-final` (linija 4438). Dve grane, dele se preko CSS body-klasa:

- **Non-premium:** overlay `.mix-final__paywall` (linija 4439) je vidljiv, `.mix-final__inner` je blur-ovan. Paywall CTA `data-stripe="premium"` → `lettoCheckout('premium')`.
- **Premium / mix-unlocked:** `body.letto-premium` ili `body.letto-mix-unlocked` sakriva paywall (CSS linija 2431-2432). User vidi Mix summary + **dva** dugmeta: `data-mix-book="flight"` ("Book flight →") i `data-mix-book="hotel"` ("View & book →").

### Tačan code path za premium user-a
Click na final dugme → handler na liniji 6194-6199 → `bookFlight()` / `bookHotel()`:

- **`bookFlight()`** (5972): proverava `unlocked` (body klasa). Premium → `window.open(fSel.bookingUrl, '_blank')` — otvara partnera (Aviasales / CJ affiliate) u novom tabu + toast. Non-premium → `lettoCheckout('premium')` (Stripe).
- **`bookHotel()`** (6013): otvara `h.bookingUrl || buildHotellookUrl()` → Booking.com / Hotellook u novom tabu. **Nema JS `unlocked` gate** — oslanja se samo na CSS blur.

### Gde se zove Stripe / save-mix
`/api/save-mix` se zove **isključivo** iz `lettoSaveMixBeforeCheckout()` (6715), a to se zove **samo unutar `lettoCheckout()`** (6784) — dakle samo na Stripe checkout path-u. Tok: anon user → `lettoCheckout` → `save-mix` upisuje `pending_mixes/{tripId}` → `tripId` ide kroz Stripe metadata → webhook promoviše `pending_mixes` → `purchasedMixes` → user sleće na `/trip/{tripId}`.

### DIAGNOZA — zašto premium user ne dobija envelope
Premium "finish" akcija je doslovno samo dva `window.open()` poziva ka partnerskim sajtovima. **Nema** `save-mix`, **nema** `purchasedMixes` write-a, **nema** webhook-a, **nema** `/trip/{tripId}` redirect-a, **nema** email-a, **nema** Telegram-a. Cela mašinerija za isporuku Mix-a (save-mix → pending_mixes → webhook → purchasedMixes → /trip → email) je zakačena **samo na Stripe checkout path**. Premium user-i preskaču checkout (već su pretplaćeni), pa propadaju u goli "otvori partnerski link" tok bez ijednog delivery artefakta. Envelope je nuspojava *checkout-a*, a premium user-i ne checkout-uju.

---

## TASK 2: Mix Confirmation Email audit

### Source + signature
`sendMixConfirmationEmail(trip)` — `api/stripe-webhook.js:511`. Build preko `buildMixEmailRequest(trip)`; 3-attempt exponential backoff (1s/3s/9s); na finalni fail → `failed_email_sends/{tripId}` doc + Slack alert. Exportovan na liniji 622.

### Gde se POZIVA (4 mesta)
| Lokacija | Tip | Uslov |
|---|---|---|
| `stripe-webhook.js:797` | **LIVE auto** | samo ako `session.metadata.tripId` postoji **I** `pending_mixes/{tripId}` doc postoji |
| `admin.js:447` | admin/retry | manual |
| `admin.js:566` | admin test | `fakeTrip` |
| `admin.js:631` | admin | lookup po tripId |

Live grana je unutar `if (session.metadata?.tripId)` (webhook linija 769). Email se šalje tek nakon `pending → purchased` promocije.

### Resend Dashboard log
**BLOCKED:** `GET https://api.resend.com/emails?limit=20` vraća `400 "API key is invalid"`. Ključ radi za slanje (`POST /emails` — recovery mailovi su prošli), ali ne za management/read API — verovatno sending-only restricted ključ, ili Resend nema javni list endpoint. Delivery istorija se mora gledati kroz Resend dashboard UI (resend.com → Emails/Logs). Vercel CLI runtime logovi takođe ne daju istoriju (stream-only).

### DIAGNOZA — zašto stao posle prvog puta
Nije rate-limit, nije throw, nije missing param. **`sendMixConfirmationEmail` je strukturno dohvatljiv samo na anon→subscribe-with-saved-Mix path-u.** Poslao jednom (`paunov@calderyserbia.com`, Commit 2 verifikacija) jer je taj path tada bio prošao. Od tada je svaki test rađen sa **već-premium nalogom** — a premium user koji završava Mix nikad ne zove `lettoCheckout`/`save-mix` (vidi TASK 1), pa `session.metadata.tripId` nikad ne postoji → webhook grana na liniji 769 se nikad ne ulazi → funkcija se nikad ne pozove. Sekundarno: `pending_mixes` ima 24h TTL (`expiresAt`); čak i da tripId prođe kroz checkout >24h kasnije, doc bi nestao (webhook linija 808 "missing/expired").

---

## TASK 3: Telegram infra

### Env vars — SVE postavljeno
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_PREMIUM_CHANNEL_ID`, `TELEGRAM_PUBLIC_CHANNEL_ID`, `TELEGRAM_ADMIN_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET` — svi `<set>` u production env.

### Bot `getMe`
`@lettolive_bot` · "LETTO" · id `8557444574` · potvrđen live.

### Premium kanal
- ID (numeric): `-1003830940800` · title "LETTO Premium" · type `channel` · invite `https://t.me/+FnaIg85zfZNhZmM0`
- Bot je **administrator** kanala sa `can_post_messages: true` (+ edit/delete/invite). Postovanje Mix-a u kanal je permisiono **potpuno odblokirano**.

### Postojeći Telegram kod
- `api/telegram-webhook.js` — inbound bot webhook (`/start`, `/status`, `/help`, member detection, callback_query approval flow). Ima interni `sendMessage(chatId, text, options)` helper (nije exportovan). Referencira `PREMIUM_CHANNEL_ID` i `PUBLIC_CHANNEL_ID`.
- `api/stripe-webhook.js:599` `generateTelegramInvite()` — `createChatInviteLink` za premium kanal. **Radi** (`telegramInviteLink` je set na sva 3 subscriber doc-a).
- `api/stripe-webhook.js:103` `notifyAdminFallback()` — `sendMessage` ka admin chat-u.
- `api/notify-admin.js:42` — `sendMessage`.
- `api/stripe-webhook.js:873` — komentar o `banChatMember` (kick na otkaz; verovatno TODO).

### GAP analiza — "Mix-post u Premium kanal"
| Komponenta | Status |
|---|---|
| Bot token / channel ID / env | ✅ ima |
| Bot post permisije u kanalu | ✅ administrator, `can_post_messages` |
| `sendMessage` helper pattern | ✅ postoji u telegram-webhook.js (ali nije exportovan / reusable) |
| Kod koji POSTUJE sadržaj u premium kanal | ❌ ne postoji — premium channel ID se koristi samo za invite linkove |
| `sendPhoto` / `sendDocument` korišćenje | ❌ nigde |

**To-do za sutra:** napravi reusable helper (`lib/telegram-mix-post.js`) sa `sendMessage` ili `sendPhoto` ka `TELEGRAM_PREMIUM_CHANNEL_ID`, sadržaj = Mix summary + link na `/trip/{tripId}`. Zero infra blokera — čisto code task.

---

## TASK 4: Firestore audit (read-only)

### `letto_subscribers` · 3 doc-a
| doc | tier | aimixUnlocked | aimixSessionId | subscriptionStatus | premiumSince |
|---|---|---|---|---|---|
| `miroslavpaunov@icloud.com` | premium | `true` | set (`cs_live_b1qU…`) | UNSET | 2026-05-16 |
| `miroslavpaunov@me.com` | premium | `true` | set (`cs_live_b13v…`) | UNSET | 2026-05-16 |
| `paunov@calderyserbia.com` | premium | **`undefined`** | **`null`** | UNSET | 2026-05-10 |

- `paunov@calderyserbia.com` je **legacy shape** — nastao 2026-05-10 (Commit 2 era), pre nego što je webhook počeo da piše `aimixUnlocked` / `aimixSessionId`. Posledica: recovery email za taj nalog → two-link fallback (bez magic-link-a); `/api/me` → `mixUnlocked` false.
- Sva 3 imaju `subscriptionStatus`/`cancelAtPeriodEnd`/`currentPeriodEnd` = UNSET → novi `customer.subscription.updated` handler još nije primio nijedan event. Dashboard prikazuje `status: null` za sve.

### `purchasedMixes` · 1 doc
`207daf598bac0f69` — `userEmail: miroslavpaunov@icloud.com` · `status: paid` · `source: subscription-mix` · `paidAt: 2026-05-16 20:00` · ima flight/hotel/route, nema searchParams. Jedini pravi Mix; `source: subscription-mix` potvrđuje da je došao kroz checkout path (TASK 1/2 dijagnoza).

### `pending_mixes` · 1 doc
`1cbd9f5041fbde76` — `createdAt 2026-05-16 19:45` · `expiresAt 2026-05-17 19:45` · `status: pending`. Orphan: save-mix koji nikad nije promovisan (drugi tripId od purchased `207daf…`). Nije još istekao (~21h do TTL).

### `failed_email_sends` · 1 doc
`welcome_miroslavpaunov@me.com` — `status: delivered` · `attempts: 1` · `flow: premium_welcome`. Završen record (iz ranije sesije, bio zaglavljen → resetovan → delivered).

### PREPORUKA za sutra cleanup
- **Zadržati:** sva 3 `letto_subscribers` (pravi test nalozi), `purchasedMixes/207daf598bac0f69` (pravi Mix).
- **Obrisati (opciono):** `pending_mixes/1cbd9f5041fbde76` (orphan — ili pustiti TTL da ga obriše ~sutra uveče); `failed_email_sends/welcome_miroslavpaunov@me.com` (status delivered, završen record).
- **Backfill needed:** `paunov@calderyserbia.com` nema `aimixUnlocked` ni `aimixSessionId` — ako Miroslav hoće da testira /me dashboard ili recovery magic-link sa tog naloga, treba manual write (`aimixUnlocked:true` + validan `aimixSessionId`). Ostala 2 naloga su kompletna.
- **NE backfill-ovati** `subscriptionStatus` polja — po ranijoj odluci ("wait for the webhook"), populiraju se sami na sledeću promenu pretplate.

---

## TASK 5: Draft spec — Mix Envelope delivery flow

> DRAFT. Miroslav review-uje, prilagođava, pa tek onda code.

### CILJ
Premium user koji završi Mix u `results.html` dobija:
1. **Web:** redirect na `letto.live/trip/{tripId}` (envelope stranica, već postoji)
2. **Email:** Mix confirmation sa share link + flight + hotel + booking dugmad
3. **Telegram:** post u Premium kanal sa istim sadržajem (link na `/trip/{tripId}`)
4. **/me dashboard:** automatski, čim se `purchasedMixes/{tripId}` upiše (već radi)

### Koren problema (iz TASK 1+2)
Cela delivery mašinerija visi na Stripe checkout-u. Premium user-i ne checkout-uju → nula artefakata. `sendMixConfirmationEmail` nije pokvaren — samo je nedohvatljiv za premium tok.

### FILES (predviđene izmene — NIJE konačno)
1. **NEW `api/save-mix-premium.js`** — za autentifikovanog premium user-a kreira `purchasedMixes/{tripId}` **direktno** (bez `pending_mixes`, bez Stripe-a). Verifikuje session preko `verifyPremiumSession` (`lib/auth.js`) → dobija `email`. Generiše `tripId` (16-hex, isti pattern kao `save-mix.js`). Postavlja `userEmail`, `source: 'premium-mix'` (distinkcija od `subscription-mix`). Vraća `{tripId}`. Zatim poziva (reuse):
   - `sendMixConfirmationEmail` (import iz `./stripe-webhook.js` — isti pattern kao `admin.js`)
   - novi `telegramPostMix` helper
2. **EDIT `public/results.html`** — `bookFlight()`/`bookHotel()` trenutno samo `window.open()`. Treba pravi "Završi miks" CTA za premium: novo dugme na `.mix-final__inner` (ili aktivacija praznog `#mix-summary` bara, linija 4555) → POST na `/api/save-mix-premium` → redirect na `/trip/{tripId}`. Booking dugmad ostaju kao sekundarna akcija.
3. **`api/stripe-webhook.js`** — verovatno **bez izmena**. `sendMixConfirmationEmail` je već exportovan; `save-mix-premium.js` ga importuje i zove direktno. (Spec-ov pomen `lib/email-mix-confirmation.js` je netačan — taj fajl ne postoji; funkcija živi u `stripe-webhook.js`.)
4. **NEW `lib/telegram-mix-post.js`** — `sendMessage` (ili `sendPhoto` sa caption) ka `TELEGRAM_PREMIUM_CHANNEL_ID`, sadržaj = Mix summary + `/trip/{tripId}` link. Bot je već admin sa post pravima.

### ZAVISNOSTI (blokeri pre testiranja)
- **Firestore composite index** `(purchasedMixes: userEmail ASC, paidAt DESC)` — i dalje **nije deploy-ovan**. `/api/me` Mix lista ostaje prazna dok ne bude `Enabled`. Deploy preko Firebase Console create-link-a ili `firebase deploy --only firestore:indexes` (projekat `letto-ai`, NE molty-portal).

### OPEN QUESTIONS (za Miroslav-a sutra ujutru)
- Da li premium user može NEOGRANIČENO Mix-eva mesečno, ili limit (npr. 5/mes)? Ako limit — gde se broji?
- Mix Confirmation email — PDF attachment (kao Commit 2 spec) ili samo HTML body sa svim linkovima?
- Telegram post — slika hotela (`sendPhoto`) ili samo tekstualna poruka sa linkom (`sendMessage`)?
- `/trip/{tripId}` stranica — javna (bilo ko sa linkom) ili gejtovana? (Trenutno se tretira kao bearer-link.)
- Da li premium-finished Mix ide i u `purchasedMixes` SAMO, ili i negde drugde za analitiku?

### ETA
2-3h CC implementacija + 30 min verifikacija.

---

## SLACK SUMMARY (ready-to-paste — auto-post preskočen)

`SLACK_BOT_TOKEN` ne postoji u env-u (samo `SLACK_ALERT_WEBHOOK_URL`, alerts webhook — pogrešan kanal/semantika za ovo). Po instrukciji noćne smene ("ili spavaj u izveštaju za sutra slack ping"), summary je parkiran ovde:

> 🌙 Noćna smena gotova · ~45 min · 5/5 taskova · read-only, nula write-ova. Full report: `~/letto-ai/docs/night-shift-2026-05-17.md`. Top finding: premium user koji završi Mix dobija samo dva `window.open()` ka partnerima — cela envelope mašinerija (save-mix → webhook → purchasedMixes → /trip → email → Telegram) visi isključivo na Stripe checkout-u, koji premium user-i preskaču. Fix = nov `api/save-mix-premium.js` path. Spec draft u report-u, TASK 5.

---

## EXIT
Svih 5 taskova ima sekciju. Jedan BLOCKED sub-item (TASK 2 Resend list API — sending-only ključ). Nula commit-ova, nula push-ova, nula Firestore write-ova.

---

## ADDENDUM · Scaffold (na zahtev, posle report-a)

Miroslav je odobrio scaffold-ovanje koda — **bez commit-a / push-a / deploy-a**. Dva nova fajla lokalno (untracked, `git status` ?? — ništa staged):

- **`api/save-mix-premium.js`** — DRAFT. Premium "Završi miks" delivery endpoint. Sibling `save-mix.js`, ali piše `purchasedMixes/{tripId}` direktno (bez pending_mixes, bez Stripe-a). Auth preko `verifyPremiumSession` (X-Letto-Session header / `{sessionId}` body). Posle write-a zove `sendMixConfirmationEmail` + `postMixToPremiumChannel` (best-effort). `source:'premium-mix'`.
- **`lib/telegram-mix-post.js`** — DRAFT. `postMixToPremiumChannel(trip, tripUrl)` — `sendMessage` (HTML) u premium kanal. sendPhoto varijanta je stub-ovana.

Oba prolaze `node --check`. **Nije konačno** — inline su markirani DECISION/OPEN-QUESTION blokovi vezani za 5 pitanja iz TASK 5:
- `#1` per-user mesečni Mix cap — stub-ovan u `handler()` (zakomentarisan `count()` query).
- `#3` sendMessage vs sendPhoto — sendMessage je default; sendPhoto stub na dnu `telegram-mix-post.js` (traži hotel image u `toTripShape`).
- `toTripShape` je DUPLIRAN iz `save-mix.js` — TODO marker da se ekstrahuje u `lib/mix-shape.js`.

Još uvek fali za testiranje: (a) wire-ovanje `results.html` premium-finish CTA → POST `/api/save-mix-premium` → redirect `/trip/{tripId}` (TASK 5 file #2, nije scaffold-ovan — diranje velikog HTML fajla traži review prvo), (b) Firestore composite index deploy.

Sledeći korak ujutru: review 2 scaffold fajla + odgovori na 5 open questions → onda wire results.html → commit.
