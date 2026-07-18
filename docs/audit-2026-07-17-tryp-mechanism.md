# Audit sajta i mehanizma za dilove — benchmark: tryp.com

Datum: 2026-07-17
Obim: `public/` (sajt), `api/` (backend), `lib/`, `workflows/`, `scrapers/` (mehanizam za dilove)
Benchmark: mehanizam koji koristi tryp.com

---

## 1. Executive summary

Letto trenutno **ne replicira tryp.com mehanizam** — radi principijelno drugačiji model:

| | tryp.com | Letto danas |
|---|---|---|
| Osnova | **Virtual interlining**: kombinuje letove prevoznika koji ne sarađuju + vozove + buseve + trajekte u jedan itinerar | Jedan round-trip let (najjeftiniji iz Travelpayouts cache-a) + jedan hotel |
| Pokrivenost | 7.000+ gradova, 28M smeštaja | 25 hardkodovanih ruta (pretežno ex-BEG), rotacija 12 ruta po ticku |
| Multi-city | Da — AI sekvencira više destinacija u optimalan redosled | Ne — samo A→B→A |
| Cene | Live, prikaz ukupne cene unapred; booking kroz sopstvu IATA agenciju | Cache do ~12–24h; heuristički "verifier"; affiliate click-out (Aviasales/Booking.com) |
| AI uloga | Generiše itinerare, optimizuje datume i redosled gradova, ML za konverziju | Claude ocenjuje paket 1–10 ali se ocena **nigde ne koristi** |
| Deal feed | Personalizovani gotovi dilovi na homepageu ("deals in 3 seconds") | Statički katalog iz `letto_packages`, ručno Telegram odobravanje |

Dobra vest: Letto ima zdrave temelje (itinerary contract, ranker, pSEO infrastrukturu, scraping pipeline). Pragmatična putanja ka tryp.com modelu je u 4 faze (§6) — bez skoka na puni OTA/IATA model u prvoj fazi.

---

## 2. Audit sajta

### 2.1 Inventar stranica (60 HTML fajlova u `public/`)

- **Core app**: `index.html` (landing + deal grid), `results.html` (Mix builder, 8.279 linija — najveća stranica), `trip.html`, `me.html`, `dobrodosao.html`.
- **pSEO**: 46 statičkih stranica (23 SR + 23 EN) generisanih preko `scripts/generate-destination-pages.mjs`; svaka klijentski vuče `/api/packages?destination=…`.
- **Dinamički pSEO engine**: dormant — `vercel.json:14-15` rewrite-uje `/letovi-iz-*` na `api/pseo-route.js` koji 404-uje dok `PSEO_ENABLED≠1` (`api/pseo-route.js:54`).
- **Admin**: `admin.html`, `admin-scraping.html`, `metrics.html` (token-gated).
- **Legal/static**: about, impressum, privacy, terms.

### 2.2 Arhitektura

- Nema build step-a (`vercel.json:2-4`), plain HTML + inline JS, sav data ide preko `/api/*` fetch-a — nema klijentskog Firestore SDK-a.
- 25 API endpointa u `api/`, svi referencirani sa frontenda postoje (nema mrtvih endpointa).
- Monetizacija: (1) affiliate click-out kroz obavezni email lead-capture modal (`public/lead-capture.js:26`), (2) Stripe pretplata €9.99/mes za Custom Mix (`api/stripe-checkout.js`).
- Service worker, security headeri, rate limiting i GDPR consent su korektno implementirani.

### 2.3 Problemi na sajtu (po težini)

1. **Pogrešna cena u structured data** — `index.html:73` JSON-LD navodi €29.00/3 meseca, dok FAQ i checkout kažu €9.99/mes. Rizik za rich results i Merchant Center.
2. **Past-date paketi se i dalje serviraju** — nijedan API ne filtrira `dates.departure >= today`; vidi §3.4.
3. **In-memory filter može da izgladni homepage** — listing mod vuče `limit(N)` najnovijih dokumenata pa tek onda filtrira na `source==='mixing_engine_v4'` (`api/packages.js:265`); ako su najnoviji docs iz drugih izvora, grid se prazni.
4. **`/api/agency-packages` skenira do 500 dokumenata po pozivu** bez server-side destination filtera (`api/agency-packages.js:62-63`) — Firestore read amplifikacija.
5. **Mrtav kod**: `getDailyTryItIds()` hotfiksovano vraća prazan set (`api/packages.js:71`) uz ~60 linija nedostojne logike; frontend Sentry loader zakomentarisan (`index.html:85-94`) dok init blok ostaje.
6. **SEO**: homepage hreflang "en" pokazuje na `/?lang=en` (samo klijentski toggle, canonical ostaje `/` — lažni hreflang); `og:locale` en_US na `lang="sr-Latn"` dokumentu; zastareo `googledab3a181f159a7a9.html` verification fajl.
7. **CSP sadrži `'unsafe-eval'`** (`vercel.json:37`) — potkopava inače strogu politiku.
8. Dupliran TP marker default (`722287`) na dva mesta (`api/hotels-search.js:41`, `lib/aviasales-url.js:26`) — env promena na jednom mestu tiho driftuje.

---

## 3. Audit mehanizma za dilove

### 3.1 Pipeline (kako dil nastaje danas)

```
Travelpayouts (cache cena, 20 najjeftinijih/ruta)
Booking.com RapidAPI (hoteli)
CJ Affiliate (samo Air Serbia)          ┐
                                        ├─► n8n WF01 MIXING ENGINE (6h, 12/25 ruta po ticku)
kontiki.rs / bigblue.rs scraperi (4h) ──┘        │
                                        (čarteri idu u poseban svet:
                                         letto_scrape_inventory → /api/agency-packages)
                                                 ▼
                              Telegram DM odobravanje (čovek!) → published_*
                                                 ▼
              /api/packages (katalog)  /api/mix-search (ranked)
              /api/live-mix-search (live, ali samo exact-date match)
                                                 ▼
              WF02 PRICE-VERIFIER (6h) — heuristika, ne verifikacija
```

### 3.2 Mixing logika (WF01 Stage C, `workflows/01-LETTO-MIXING-ENGINE.json:185`)

- Let: cena ∈ (0, 800€), round-trip, 3–10 noći → **uzima se samo najjeftiniji**.
- "Deal" test: `cena / medianFlightPrice ≤ 0.70` — let mora biti ≥30% ispod 90-dnevnog medijana rute.
- Hotel: ≥3★, review ≥7.5 → min `totalWithTaxes/stars` (value-per-star).
- CJ doprinos: samo zamena booking URL-a kad avio-kompanija match-uje partnera (mapiranje ima **jedan** unos: JU → Air Serbia).
- ID deterministički `pkg_{org}_{dest}_{datum}_{n}n` → idempotentan upsert. **Nema multi-city nogu, nema kombinovanja prevoznika.**

### 3.3 Ranking (`lib/mix-ranker.js`)

Skor = 0.35·blizina datuma + 0.25·cena (min-max u setu) + 0.18·hotel + 0.12·ruta/stops + 0.10·verification level. Post-filter: `dateDeltaDays ≤ 60`, top-6, srpska "why" obrazloženja. `lib/itinerary-contract.js` je solidan — verification level se strogo izvodi iz polja, AI ne može da ga "nadogradi".

### 3.4 Kritične slabosti mehanizma

1. **Paketi sa prošlim datumima nikad ne umiru.** Nijedan API ne filtrira `departure >= today`, WF02 ne proverava protek datuma, a `mix-ranker.js:10` koristi `Math.abs` na delta danima — paket koji je "poleteo" pre nedelju dana i dalje se rangira i prodaje. **Najveća rupa.**
2. **WF02 nije verifikacija cene već heuristika**: poredi trenutno najjeftiniju cenu na ruti (bilo koji datum!) sa pretpostavkom da let čini 60% ukupne cene paketa; tolerancija 15%; cap 50 paketa; hoteli se **nikad** ne proveravaju (`workflows/02-LETTO-PRICE-VERIFIER.json:48-113`).
3. **`letto_route_baselines` nema pisca u repou.** Cela "30% ispod medijana" tvrdnja stoji na ručno seed-ovanom, potencijalno zastarelom broju; ako baseline nedostaje, ruta se tiho preskače (`no_baseline`).
4. **Plitak mining**: po ruti po runu 1 najjeftiniji let × 1 hotel. Jedna loša cena iz TP cache-a postaje objavljen dil posle jednog Telegram tapa.
5. **Live-mix-search je krhak**: zahteva exact-date match između TP rezultata i zahteva (`api/live-mix-search.js:39`), što TP retko vraća → često 0 rezultata, i to se kešira 15 min (`s-maxage=900`).
6. **Dva inventara se nikad ne sastaju**: čarteri (`letto_scrape_inventory`) i engine katalog; direktni avio scraperi su isključeni (`scrapers/run-production.sh:17`).
7. **Ranking**: `priceScore` je degenerisan pri 1–2 kandidata; date proximity dominira (35%) nad verification-om (10%); Claude rating se računa i ne koristi.
8. **Ops**: Firestore token u n8n env varijabli (1h OAuth) uz poznati drift rizik (`ops/hetzner-firebase-token-fix/`); WF01/WF02/WF06 bez error-workflow-a — pad mixing engine-a se otkriva tek kroz dnevni heartbeat; bez human-approval-a katalog staje u potpunosti.

---

## 4. Kako tryp.com mehanizam radi (istraživanje)

Izvori: [tryp.com](https://www.tryp.com/en), [terms](https://www.tryp.com/en/terms-and-conditions), [AirLapse](https://airlapse.net/blog/ai-to-find-cheap-flights-apps), [localsinsider](https://localsinsider.com/apps/ai-travel-planners/), [tryp.com blog — Smart Date Optimization](https://www.tryp.com/en/blog/how-trypcoms-ai-finds-the-best-travel-dates-for-you), [ArcticStartup](https://arcticstartup.com/tryp-com-raises-e3-1-million/).

1. **Virtual interlining / self-transfer**: algoritam kombinuje letove prevoznika koji međusobno ne sarađuju (plus voz, bus, trajekt) u jedan itinerar — time nastaju kombinacije koje klasični GDS/OTA ne prikazuju, često radikalno jeftinije. Korisnik je explicitno upozoren na rizike self-transfera (terms §20).
2. **Multi-destinacijski itinerari**: korisnik unese više gradova, AI bira **optimalan redosled i datume** ("Smart Date Optimization") — optimizuje se celokupno putovanje, ne izolovani letovi.
3. **Deal feed**: homepage prikazuje gotove dilove personalizovane po lokaciji korisnika, sa filterima (Weekend, Beach, Multi-city, Hidden Gems) — "travel deals in 3 seconds".
4. **Ukupna cena unapred**: transport + smeštaj spakovani u jednu cenu pre klika.
5. **Booking model**: registrovana IATA agencija — bukiraju direktno (čak kreiraju virtuelne email adrese i payment detalje za rezervacije), ne samo affiliate click-out.
6. **Skala**: 7.000+ gradova, 28M smeštaja, 18M itinerara; ML za optimizaciju konverzije; AI asistent (Sandra).

---

## 5. Gap analiza — šta falči da Letto replicira tryp.com

| # | tryp.com sposobnost | Letto status | Šta nedostaje |
|---|---|---|---|
| G1 | Kombinovanje letova različitih prevoznika (virtual interlining) | Ne postoji — samo jedan round-trip fare | Engine koji spaja one-way fare-ove (out + in, po potrebi različiti prevoznici/aerodromi) uz self-transfer pravila (min. layover, baš ta ista logika kao Kiwi) |
| G2 | Multi-city itinerari | Ne postoji — contract je strogo A→B→A | Proširenje `itinerary-contract.js` na segmente/legs; redosled optimizacija |
| G3 | Široka pokrivenost ruta | 25 hardkodovanih ruta, 12/tick | Matrica origin×dest generisana iz podataka (destinations.mjs već ima 23 destinacije; TP podržava `prices_for_dates` bez fiksne destinacije — "anywhere" mining) |
| G4 | Održani baseline-i cena | Nema pisca | Novi workflow koji iz TP cache-a računa i piše `letto_route_baselines` (npr. nedeljno, 90d medijan) |
| G5 | Live/verifikovane cene | Heuristika (60% pravilo, 15% drift) | Per-package re-check sa konkretnim datumima leta (ne cheapest-on-route); hotel re-check; uklanjanje prošlih datuma |
| G6 | Automatsko publikovanje dilova | Ručno Telegram odobravanje (single point of stall) | Auto-publish za pakete koji prođu stroga pravila (deal ratio, segment_confirmed, datum u budućnosti), Telegram samo za edge case-ove |
| G7 | Multi-modal (voz/bus) | Ne postoji | (Opciono, kasnije) — nije potrebno za MVP replikaciju |
| G8 | Direktan booking (OTA) | Affiliate click-out | Veliki strateški korak (Duffel/Amadeus/IATA) — **ne preporučuje se u prvoj fazi**; affiliate model je kompatibilan sa G1–G6 |
| G9 | Personalizovani deal feed | Statički katalog | Tek nakon G3/G6 — feed po origin-u korisnika (BEG default) već delimično postoji |
| G10 | Iskorišćena AI ocena | Claude rating se piše i ne čita | Uključiti `metadata.claudeRating` kao faktor u ranker-u ili ga prestati plaćati |

---

## 6. Preporučena putanja (4 faze)

**Faza 0 — Ispravke (1–2 dana, bez arhitektonskih promena)**
- Filter `dates.departure >= today` u `/api/packages`, `/api/mix-search` i ukloniti `Math.abs` iz `mix-ranker.js:10`.
- Baseline writer workflow (G4).
- WF02: re-check sa konkretnim datumima paketa + hotel provera; expired paketi se reaktiviraju ako cena padne nazad.
- Homepage listing filter u Firestore query (ne in-memory), JSON-LD cena €9.99, hreflang/og:locale fix.

**Faza 1 — Virtual interlining engine (srce tryp.com replikacije)**
- U WF01 (ili novom workflow-u): povlačiti **one-way** fare-ove po smeru i kombinovati out×in nezavisno (dozvoliti različite prevoznike); self-transfer constraint-i (min 3h layover za pozicione letove, isti/različiti aerodrom flag).
- `itinerary-contract.js`: novi tip `roundtrip_composed` (dva ona-way segmenta) pored postojećeg; verification logika ostaje ista po segmentu.
- Ranker: dodati `selfTransfer` penal u `routeScore`.

**Faza 2 — Skala i automatika**
- Route matrica umesto 25 hardkodovanih ruta (origin BEG/TZL/INI × sve destinacije iz `scripts/lib/destinations.mjs` + TP "anywhere" feed za discovery novih ruta).
- Auto-publish pravila (G6); Telegram ostaje kao review za sumnjive.
- Multi-hotel kandidati po paketu (top-3), ne samo value-pick.

**Faza 3 — Multi-city + feed**
- Legs u contract-u (A→B→C→A), redosled optimizacija nad one-way matricom iz Faze 1.
- Deal feed po lokaciji/vibe filterima (infrastruktura iz pSEO engine-a se može reciklirati).
- Odluka o OTA modelu (G8) tek sa realnim obimom podataka o konverziji.

---

## 7. Zaključak

Sajt je funkcionalan i tehnički uredan, sa nekoliko konkretnih bugova (§2.3). Mehanizam za dilove je pouzdan "jedna ruta — najjeftiniji let — jedan hotel" miner sa ozbiljnim problemima svežine (prošli datumi, mrtav baseline-i, heuristički verifier), ali **nije** tryp.com mehanizam: nema virtual interlining-a, nema multi-city-ja, nema automatike u publikovanju, i pokriva 25 ruta umesto hiljada.

Najveći ROI koraci ka tryp.com modelu: Faza 0 ispravke (svežina podataka je preduslov za sve) → Faza 1 virtual interlining (to je srž tryp.com diferencijacije) → Faza 2 skala. Faze 0+1 ne zahtevaju nove eksterne servise — Travelpayouts cache već daje dovoljno one-way podataka.

---

## 8. Dodatak — stanje popravki (2026-07-17)

**Od audita je već stiglo (tuđi commitovi, 5310d23→1937521):**
- `lib/self-transfer-provider.js` + proširen `itinerary-contract.js` + self-transfer penal u ranker-u — **Faza 1 (virtual interlining) je delimično započeta** kroz Booking.com one-way kombinacije preko hubova (IST/VIE/FRA/FCO/WAW/BUD), sa pravilima bezbedne konekcije (150–480 min, isti aerodrom)
- `api/revalidate-mix.js` + `lib/price-revalidation.js` — pravi last-mile re-check cene sa identity matching-om (pokriva ono što WF02 ne ume)
- `api/price-alerts.js`, `lib/provider-resilience.js`, personalizacija ranker-a

**Faza 0 primenjena u ovoj sesiji:**
- `index.html` — JSON-LD cena 29€/P3M → **9.99€/P1M**; uklonjen lažni `hreflang="en"` koji je pokazivao na `?lang=en` (isti canonical)
- `api/packages.js` — read-side guard: paketi sa `dates.departure < today` se više ne serviraju; listing mod over-fetchuje 50 dokumenata pa seče na `limit` (homepage se više ne prazni kad najnoviji docs nisu `mixing_engine_v4`)
- `api/mix-search.js` — isti past-departure guard
- `workflows/02-LETTO-PRICE-VERIFIER.json` — paketi sa prošlim datumom polaska odmah → `expired` (bez poziva ka TP); ispravljen komentar (15%, ne 10%)
- `workflows/08-LETTO-ROUTE-BASELINES.json` — **novo**: nedeljni writer za `letto_route_baselines` (25 ruta × 3 meseca × TP `prices_for_dates`, medijan dnevnih najjeftinijih cena → `medianFlightPrice` integerValue, isti format koji WF01 Stage C čita)

**Ručni korak:** workflow JSON-ovi se sinhronizuju sa n8n ručno — izmenjeni WF02 i novi WF08 nemaju efekta dok se ne importuju/aktiviraju u n8n.

**Svesno odloženo (nije dirano, "oprezno"):**
- `Math.abs` u `mix-ranker.js` — sada bezopasan jer API sloj filtrira prošle datume; ranker ima pokrivajuće testove
- WF02 heuristika 60%-flight-share — ostaje kao grubi čistač; pravu verifikaciju radi `revalidate-mix`
- `og:locale` (en_US na sr-Latn dokumentu) — mešani signali (FAQ JSON-LD je na EN), treba odluku o primarnom jeziku sajta
- Mrtav try-it kod u `packages.js` — radi se o svesnom hotfixu (v22), čišćenje nije hitno

## 9. Dodatak — Faza 2 primenjena (2026-07-17)

Kontekst: `docs/COMPETITIVENESS-ROADMAP.md` (9 faza, sve završene) pokriva **live** stranu (real-time pretraga); Faza 2 ovde pokriva **katalog** stranu (WF01 mining engine). Nema preklapanja.

**Route matrica (G3):**
- `workflows/01-LETTO-MIXING-ENGINE.json` Stage A — 25 hardkodovanih ruta → **52 rute**: BEG × svih 20 destinacija sa postojećim bookingDestId metapodacima + ZAG/SJJ/SKP/INI × 8 core destinacija (IST, FCO, CDG, BCN, ATH, VIE, BUD, PRG). Destinacijski metapodaci (country/city/category/bookingDestId) su zajednički (`DESTS` mapa), pa novi unosi ne dupliraju podatke.
- Rotacija ostaje 12 ruta/run (OOM mitigacija svesno NIJE dirana) → pun sweep kataloga ~30h (bio ~12h). Verifikovano izvršavanjem Stage A koda.
- `workflows/08-LETTO-ROUTE-BASELINES.json` — ista matrica (52 rute × 3 meseca = 156 TP poziva nedeljno). Oba fajla nose "keep in sync" komentar — ručna sinhronizacija je postojeća konvencija projekta.

**Auto-publish (G6):**
- Novi čvorovi u WF01: `Stage E.1 · Auto-publish gate` → `If auto-publish` → `Stage E.2 · Auto-publish status` (PATCH samo `status=published_public`).
- Prag (SVE uslove): deal ratio ≤ 0.65 (strože od mining gate-a 0.70), hotel review ≥ 8.0 sa ≥ 50 ocena, total 99–2000€, polazak ≥ 7 dana unapred.
- Sve ispod praga ide starim putem (Telegram DM); refresh već objavljenih paketa je nepromenjen; pad auto-publish PATCH-a (`neverError`) se samo-leči u DM granu.
- Auto-objavljeni paketi se NE postuju odmah na Telegram kanal (to radi ručni approve); u feed ulaze kroz postojeće digeste (WF03/WF04).

**Ručni korak (isti kao pre):** izmenjeni WF01/WF08 treba importovati u n8n. Pre uključivanja auto-publish grane u produkciji, preporuka: pratiti prvih ~50 auto-objavljenih paketa kroz admin panel.

**Još uvek otvoreno iz Faze 2:** multi-hotel kandidati po paketu (top-3 umesto value-pick), TP "anywhere" feed za discovery novih destinacija (zahteva nove bookingDestId unose — live strana ih već otkriva u runtime-u, katalog ne).

## 10. Dodatak — Faza 3a primenjena (2026-07-17): multi-city engine

Faza 3 je podeljena: **3a = multi-city transport + hoteli + API** (odrađeno), **3b = deal feed po lokaciji/vibe + UI** (ostaje).

**Novo:**
- `lib/multi-city-provider.js` — komponuje origin → grad A (boravak) → grad B (boravak) → origin iz nezavisnih one-way ponuda (Booking.com preko postojećeg `searchBookingOneWayFlights`). **Oba redosleda gradova se uvek evaluiraju** (tryp.com order optimizacija), pobeđuje jeftiniji; po nogi se bira najjeftinja ponuda; redosled bez kompletne noge odpada, drugi preživljava. Podrazumevana podela noći pola/pola (neparna ide prvom gradu), `stayFirst` override sa validacijom (min 2 noći po gradu, max 21 ukupno). Svaka karta je eksplicitno `unprotected` (3 nezavisne karte).
- `lib/multi-city-contract.js` — truth contract po uzoru na `itinerary-contract.js`: lanac aerodroma mora da se poklopi (origin→A→B→origin), datumi nogu moraju tačno da se poklope sa granicama boravaka, oba hotela `property_price_confirmed` za tačan broj noći. Nema popravljanja — nekompletno se odbacuje. `isOneWaySearchUrl` je sada exportovan iz `itinerary-contract.js` (jedina izmena na tom fajlu, aditivno).
- `api/multi-city-search.js` — live orkestrator po uzoru na `live-mix-search.js`: isti resilience obrazac (circuit `booking-flights` + `hotel-search`), hoteli kroz interni `/api/hotels-search` (concurrency 2), max 2 hotela po gradu → do 4 paketa po redosledu, contract filter, score 0.6·cena + 0.4·hotel, srpska `why` obrazloženja, disclosure o nezaštićenim kartama. Rate limit 10/min po IP-u (jedan request = ~10 upstream poziva). `vercel.json` maxDuration 60.
- Testovi: `tests/multi-city-provider.test.js` (4) + `tests/multi-city-contract.test.js` (6) — ukupno **82/82 prolazi**.

**Svesno van obima 3a:**
- Frontend (results.html) — multi-city traži city-picker UI; API je aditivan i ništa ne kvari bez njega.
- Katalog (WF01) NE mine-uje multi-city — namerno: live strana je dovoljna za validaciju tražnje pre nego što se multi-city mine-ovanje doda u n8n.
- Legovi sa presedanjem su dozvoljeni (jedna Booking ponuda = jedna karta po nozi, nije self-transfer); `booking.com/flights` ONEWAY handoff po nozi.

**Sledeće (3b):** deal feed po lokaciji/vibe filterima (reciklirati pSEO infrastrukturu), multi-city UI u results.html.

## 11. Dodatak — Faza 3b primenjena (2026-07-17): feed + multi-city UI

**Deal feed (po tryp.com modelu), `public/index.html`:**
- Postojeći M4 theme chips proširen: **Vikend** (čet/pet polazak, 2–4 noći — date-filter preko novih `data-departure`/`data-nights` atributa) i **Skriveni dragulji** (destinacije van mainstream skupa FCO/CDG/BCN/LHR/IST/AMS/VIE/PRG/DXB, preko `data-dest`).
- Nov **Polazak (lokacija)** red chips-ova — puni se iz samih podataka (`data-origin` na karticama, origin-i prisutni u katalogu), pa rute iz 52-rutne matrice automatski dobijaju filter. Komponuje se sa tematskim filterom (AND); dodat truthful empty-state.
- Sve client-side nad već dohvaćenih 50 paketa — nulti API rizik.

**Multi-city UI, `public/results.html`:**
- Trip-type toggle (Povratno / Multi-city) — **URL-driven**: klik vodi na `?type=multicity&origin=&city1=&city2=&from=&to=&stayFirst=&pax=`, pa deljeni link restaurira mod. Forma: origin + grad A + grad B (datalist iz LETTO_DESTINATIONS), datumi, opcioni `stayFirst`; client-side validacija ogledalo API pravila.
- U multi-city modu: poziva se `/api/multi-city-search`, kartice prikazuju lanac (BEG→FCO→BCN→BEG), sve 3 noge sa per-leg booking linkovima, oba hotela sa per-stay linkovima (booking.com/hotel URL + checkin/checkout/pax parametri), ukupnu cenu, LETTO score, `why` razloge i **uvek vidljiv** disclosure o 3 nezavisne nezaštićene karte. Nema "choose" CTA — booking je kroz 5 direktnih linkova (nema revalidation podrške za multi-city u Stage 3, svesno).
- Round-trip loader-i (`loadRankedMixes`, `loadAgencyPackages`) imaju guard — ne pale se u multi-city modu (nema duplih upstream poziva). Round-trip mod je netaknut.

**Verifikacija:** svi inline `<script>` blokovi u oba fajla prolaze `node --check`; **83/83 testova** prolazi.

**Šta ostaje van obima:** deal feed "po lokaciji" je korisnički izbor (chips), ne automatska geo detekcija — svesno, GDPR-jednostavnije; multi-city u katalogu (WF01) i dalje ne postoji (validacija tražnje prvo); Faza 3 iz originalnog audita je time kompletna osim OTA/IATA odluke (G8), koja čeka podatke o konverziji.
