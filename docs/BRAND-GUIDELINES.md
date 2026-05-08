# LETTO.LIVE — Brand Guidelines

**Verzija:** 1.0
**Datum:** April 2026
**Vlasnik:** SIAL Consulting d.o.o., Brežice

---

## 1. Brand Essence

**Što smo:** AI kurator putničkih dealova za Balkan, real-time.
**Što nismo:** Turistička agencija. OTA. Booking platforma.

**Arhitektualna metafora:** Privatni izviđač. Oko koje vidi kad je ruta pala 40% ispod proseka. Mi smo golden eagle koji gleda iz visine i juriša na plen tek kada je to pravi plen.

**Domen `.live` ne nosi se slučajno:** mi smo live data product. Cene se menjaju u realnom vremenu. Naš scanner radi svaka 2h. Naš ticker prikazuje "UŽIVO". TLD je semantički siguran ulaz u brand — `letto.live` čita se kao "letovi uživo" ili "Letto, uživo".

**Ton u jednoj rečenici:** *Pouzdan prijatelj koji zna tržište, ne hype marketing.*

---

## 2. Logo

### Primarni mark
- Wordmark "letto" — Fraunces serif, italic, weight 500
- ".live" — Inter, sans, 40% veličine glavnog wordmark-a, color: `--gold`
- Spacing: `.live` diže se za 12px iznad baseline

### Heraldički seal (secondary)
- Zlatni orao sa raširenim krilima držeći traku sa natpisom "LETTO"
- Koristi se kao: favicon, watermark u footer-u, decorative element u sekcijama
- Ne koristiti u veličini manjoj od 80×80px
- Dostupan u 3 varijante: gold foil gradient (primary), single-color gold (fallback), outline (small screen)

### Zabranjeno
- NE menjati proporcije između "letto" i ".live"
- NE koristiti orao bez kruga oko njega
- NE raspolagati na slikama bez dovoljno kontrasta (clearspace = 2× visine wordmark-a)
- NE koristiti drugačije fontove za wordmark

---

## 3. Paleta boja

### Osnova (paper tones)
```
--paper:       #F7F1E3   (primarna pozadina, topla hartija)
--paper-warm:  #EFE5CE   (sekcijska pozadina)
--paper-deep:  #E8DCBC   (trust numbers sekcija)
```

### Ink (tipografija)
```
--ink:         #0C0E10   (headline-i, body-copy primarni)
--ink-soft:    #1F2226   (kartice, dark section bg)
--ink-mid:     #3A3F47   (sekundarni tekst)
--muted:       #726A58   (caption, price strikethrough, eyebrow)
```

### Gold (brand accent)
```
--gold:        #B8863B   (primarni brand accent)
--gold-deep:   #8A5F1F   (hover state, darker element)
--gold-light:  #E4C37A   (light accent, gold foil highlight)
```

### Gold Foil Gradient (signature effect)
```css
background: linear-gradient(135deg,
  #8A5F1F 0%, #B8863B 20%, #E4C37A 40%,
  #F4DE9B 50%, #E4C37A 60%, #B8863B 80%, #8A5F1F 100%);
background-size: 200% 200%;
animation: gold-shimmer 8s ease-in-out infinite;
```
Koristiti SAMO za: velike brojeve (trust numbers, price display), premium badge shimmer, decorative accent. NE za body copy.

### Accent (burgundy)
```
--accent:      #7C1E29   (discount badges, critical emphasis)
--accent-warm: #A63A4A   (secondary accent)
```
Koristiti striktno — za discount procente, urgency, red flags. Nikad kao pozadina na velikim površinama.

### Utility
```
--line:        #D4C9AE   (borders, dividers)
--line-soft:   #E2D8BF   (subtle separators)
--ivory:       #FAF2DE   (text on dark sections)
```

---

## 4. Tipografija

### Display — Fraunces
- Serif, variable weight
- Koristi: svi H1/H2, brojevi, tier titles, display-italic za akcente
- `font-variation-settings: 'opsz' 144, 'SOFT' 100` za velike veličine
- Letter-spacing: `-0.035em` (tighter za display)
- Weight opseg: 300 (light headline), 400 (section), 500 (button/card), 600 (critical)
- Italic: obavezno koristiti za poetske/empathetic momente ("drugi ne vide", "večernji izlazak")

### Body-copy Lead — Instrument Serif
- Serif, single weight
- Koristi: lead paragraphs, body tekst na landing, FAQ odgovori
- `font-style: italic` za quote-like moments
- Letter-spacing: `-0.01em`
- Size: 17–22px

### Monospace — JetBrains Mono
- Koristi: cene, kod, ticker, technical data
- Letter-spacing: `-0.02em`
- Weight: 400 (default), 500 (emphasized), 600 (price display)
- Features: `tnum` (tabular numerals) za cene

### UI / Utility — Inter
- Sans-serif
- Koristi: buttons, navigation, form inputs, eyebrows
- Eyebrow style: 11px, 0.28em letter-spacing, uppercase, 500 weight

### Skale
```
Hero mega headline:    clamp(64px, 11vw, 200px) — Fraunces 300
Display headline:      clamp(48px, 7.5vw, 104px) — Fraunces 300
Section headline:      clamp(36px, 5vw, 76px) — Fraunces 400
Card title:            40px — Fraunces 400
Body lead:             22px — Instrument Serif
Body copy:             17–18px — Instrument Serif
Eyebrow:               11px — Inter 500
Button:                14px — Inter 500
Price display:         48–84px — Fraunces + Mono hybrid
```

---

## 5. Ton glasa

### Smernice

**JESMO:**
- Direktni ("Ovo je retka cena. Ne razmišljaj dugo.")
- Znalački ("Posle 15. juna skoči 40%")
- Lokalno autentični ("Kafana Csendes na Kiraly ulici", "Paella u Casa Roberto")
- Sa merljivim datama ("42% ispod proseka", "65€/noć")
- Povremeno ironični, nikad ciničan
- Ostavljamo prostor za čitalačev izbor ("ovo radi, ali ne za svakoga")

**NISMO:**
- Marketingo-pretenciozni ("magic moments", "journey of discovery")
- Overpromise ("najbolja ponuda ikada")
- Generski ("travel enthusiast", "wanderlust")
- Superlative-centric (nikad "najbolji", "najlepši", "najekskluzivniji")
- Klikbajt ("NEĆEŠ VEROVATI KAKO JEFTIN!")
- Emotikonski pretrpani (maks 1-2 po blurb-u)

### Primeri

❌ **Loše:**
> "Pronašli smo za vas neverovatnu ponudu za romantični vikend u Parizu! Prepusti te se magiji Grada svetlosti i stvarajte uspomene koje ćete pamtiti zauvek!"

✅ **Dobro:**
> "🇫🇷 Pariz za 98€ povratno — Wizz Air direktno iz Beograda, 18–22. novembar. Ovo je retka cena za Pariz. Novembar je najbolji tajni mesec — lišće na Tuileries, muzeji prazni (Orsay posle 18h = magija). Crème brûlée u Le Bouillon Chartier za 4€. Ne dešava se često."

---

## 6. Vizuelne osnove

### Fotografije
- **Editorial style**, ne stock-photo klišei
- Aspect ratio za deal cards: **3:4 portrait**
- Color grade: topla senka, blagi film look, **nema HDR**
- Ljudi u kadar: OK ali **ne turisti sa selfijima**, samo siluete ili leđa
- Preferiraju se: jutarnja/popodnevna svetlost, arhitektura, fakture hrane
- Izvor: Unsplash (free), Pexels (free), Shutterstock samo za hero
- **NIKAD:** postprodukcija sa preteranim kontrastom, orange-teal tonemap, Instagramovi filteri

### Grafički elementi
- **Gold foil shimmer** za brojeve i CTA dugmad
- **Heraldički kornerski ornament** u box-ovima (subtle, 0.6 opacity)
- **Grain overlay** (8% opacity, SVG fractalNoise) za papir osećaj
- **Circular rule/rule ornament** pre sekcijskih naslova
- **Letka ptica SVG** — jato od 4-5 ptica kao watermark kroz hero (10% opacity)

### Zlatni orao (heraldic eagle)
- **Samo gold foil gradient** za glavne upotrebe
- Minimalna veličina: 80×80px
- Clearspace: 2× visine elementa
- Pozicija: uvek centered ili u gornjem/donjem desnom uglu sekcije
- **Nema** flat rendering ili pixelart verzija

---

## 7. Motion

### Prijatelji:
- **Gold shimmer** animacija na brojevima i CTA (8s loop, ease-in-out)
- **Bar fill** animacija na price chart-u (2s cubic-bezier, staggered)
- **Float** animacije na drift badges (7s loop, -3s/-5s delay)
- **Fly-across** animacije ptica (18-25s loop, različiti delays)
- **Ticker scroll** (50s linear, seamless loop)
- **Fade-in reveal** na scroll (1s ease, 30px upward translate)

### Neprijatelji:
- Bounce animacije (kitsch)
- Rainbow gradients
- Lottie animacije sa karikaturama
- Parallax koji ometa scroll
- Paginacija ikona rotaciju od 360°

---

## 8. Latinski tagline

**"Ad meliora · volare"** — *Ka boljim stvarima · leteti*

Koristiti:
- Footer brand-mark
- Brand seal (ispod orla na traci)
- Email signature

**Ne koristiti u hero ili body copy** — mora ostati retka, ceremonijalna prisutnost, kao pečat na dokumentu.

---

## 9. Pravna komunikacija

Svaka stranica mora imati jasnu indikaciju da **LETTO.LIVE nije turistička agencija**. Predefinisani tekstovi:

### Footer disclaimer
> "LETTO.LIVE ne prodaje putovanja. Nije turistička agencija. Mi smo informacioni servis. Sve rezervacije se vrše direktno kod partnera — Kiwi, Booking, avio-kompanija. Ne držimo tvoj novac, ne uzimamo proviziju od rezervacija."

### Meta tag (svaka stranica)
> "SIAL Consulting d.o.o., Brežice, Slovenija. Online informacioni servis. Ne prodaje putovanja."

---

## 10. Aplikovanje

### Landing page
Svi elementi iz sekcija 2-9 aplikovani.

### Email newsletter
- Istog gold-foil mark u header-u (svetla pozadina)
- Fraunces za naslov, Instrument Serif za body
- Subject line: max 50 karaktera, bez emotikona
- Primer subject: "3 nova deala ove sedmice — Istanbul, Rim, Halkidiki"

### Telegram kanal
- Channel avatar: golden eagle seal bez teksta
- Pinned welcome: tekst manifesta + link na letto.live
- Svaki post završava sa HTML formatted CTA ka linku

### Social media (Instagram/Twitter)
- Avatar: golden eagle mark (bez teksta, jer se postavi mali)
- Bio: "AI kurator putničkih dealova za Balkan · letto.live"
- Grid: prekrsti sekciju između "Deal posters" (serif naslov + price) i "Quote cards" (italic manifest lines na paper bg)

---

## 11. Checklist pre objavljivanja

- [ ] Logo na paper pozadini, nikad preko fotografije (osim watermark)
- [ ] Gold-foil efekat samo na CTA i brojevima, ne na body
- [ ] Ne prelaz preko 2 akcentna emojija po tekst bloku
- [ ] Discount badge samo ako je stvarno preko 30%
- [ ] Footer disclaimer prisutan
- [ ] Cene uvek sa `€` pre broja, nikad posle (srpski standard)
- [ ] Datumi u formatu "14. maj 2026" (srpski), ne "May 14, 2026"
- [ ] IATA kodovi uvek velikim (BEG, IST, ne beg, ist)
- [ ] Brand seal prisutan u footer-u
- [ ] Alt tekst na svim slikama (za accessibility)

---

## 12. Kontakt

**Brand odluke:** Miroslav Paunov, SIAL Consulting d.o.o.
**Design system repo:** paunov-tech/letto-ai (branch: main)
**Pitanja:** info@letto.live
