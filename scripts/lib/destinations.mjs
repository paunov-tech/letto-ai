// scripts/lib/destinations.mjs — Master destination map for SEO build (v30).
//
// One source of truth for the 17 destinations covered by per-destination
// landing pages and the sitemap. Add new destinations here, then re-run
// `npm run build:seo` to regenerate sitemap + pages.
//
// Each entry: { iata, country, srSlug, srCity, srIntro, enSlug, enCity, enIntro }
//
// Slugs must be URL-safe (a-z, 0-9, -). They become the routes:
//   /letovi-{srSlug}  → SR landing page
//   /flights-{enSlug} → EN landing page
//
// Intro copy is the seed paragraph for the page hero (~50-80 words).
// Localized; not auto-translated. Edit here to refresh copy site-wide.

export const DESTINATIONS = [
  {
    iata: 'FCO', country: 'IT',
    srSlug: 'rim',        srCity: 'Rim',
    srIntro: 'Letovi za Rim iz Beograda, Niša i regiona. Direktan let do FCO za par sati, hotel u Centro Storico ili Trastevere u nekoliko klikova. Letto skenira 50+ izvora svaka 6h i čuva samo ponude 30%+ ispod tržišnog mediana.',
    enSlug: 'rome',       enCity: 'Rome',
    enIntro: 'Flights to Rome from Belgrade, Niš and the region. Direct routes to FCO in a few hours, hotels in Centro Storico or Trastevere a few clicks away. Letto scans 50+ sources every 6h and keeps only offers 30%+ below the market median.'
  },
  {
    iata: 'PMI', country: 'ES',
    srSlug: 'palma',      srCity: 'Palma de Mallorca',
    srIntro: 'Letovi za Palmu de Mallorku — balearsko ostrvo sa najlepšim plažama Sredozemlja. Sezona maj–oktobar, najbolje ponude rezervisane 60+ dana unapred. Letto pravi paket: let + hotel uz plažu po ceni samog hotela u špici.',
    enSlug: 'palma',      enCity: 'Palma de Mallorca',
    enIntro: 'Flights to Palma de Mallorca — the Balearic island with the Mediterranean’s finest beaches. Season May–October; best deals booked 60+ days ahead. Letto bundles flight + beachside hotel at the price of the hotel alone during peak.'
  },
  {
    iata: 'ATH', country: 'GR',
    srSlug: 'atina',      srCity: 'Atina',
    srIntro: 'Letovi za Atinu iz Beograda — kapija ka Egejskim ostrvima i kolijevka antičke kulture. Akropolj, Plaka, Monastiraki. Letto bira hotele blizu metro stanice za maksimalnu mobilnost i jeftin transfer od ATH.',
    enSlug: 'athens',     enCity: 'Athens',
    enIntro: 'Flights to Athens from Belgrade — gateway to the Aegean islands and cradle of ancient culture. Acropolis, Plaka, Monastiraki. Letto picks hotels near a metro station for max mobility and a cheap transfer from ATH.'
  },
  {
    iata: 'BCN', country: 'ES',
    srSlug: 'barselona',  srCity: 'Barselona',
    srIntro: 'Letovi za Barselonu — Gaudíjev rad, Gotska četvrt, plaže La Barceloneta. Spring i fall su najbolji za odlazak (manje turista, vreme idealno). Letto kombinuje let + hotel u Eixample-u, blizu metroa i tapas bara.',
    enSlug: 'barcelona',  enCity: 'Barcelona',
    enIntro: 'Flights to Barcelona — Gaudí’s legacy, the Gothic Quarter, La Barceloneta beaches. Spring and fall are best (fewer tourists, ideal weather). Letto bundles flight + a hotel in Eixample, near the metro and tapas bars.'
  },
  {
    iata: 'CDG', country: 'FR',
    srSlug: 'pariz',      srCity: 'Pariz',
    srIntro: 'Letovi za Pariz iz Beograda preko Frankfurta, Beča ili direktno. Hotel u Marais-u, Latin Quarter-u ili Montmartre-u, ako budžet dozvoljava. Letto prati i Orly (ORY) i Charles de Gaulle (CDG) — Orly je često 30€ jeftiniji.',
    enSlug: 'paris',      enCity: 'Paris',
    enIntro: 'Flights to Paris from Belgrade via Frankfurt, Vienna, or direct. Hotels in Marais, the Latin Quarter, or Montmartre if budget allows. Letto tracks both Orly (ORY) and Charles de Gaulle (CDG) — Orly is often €30 cheaper.'
  },
  {
    iata: 'MLA', country: 'MT',
    srSlug: 'valeta',     srCity: 'Valeta',
    srIntro: 'Letovi za Maltu (Valeta) — najmanja prestolnica EU sa najveličanstvenijom barocom arhitekturom. Sezona aprilo–oktobar. Letto bira hotele u Valeti, Sliema-i ili St. Julian’s-u — sve u 15min autobusa od MLA.',
    enSlug: 'valletta',   enCity: 'Valletta',
    enIntro: 'Flights to Malta (Valletta) — the EU’s smallest capital with its most striking baroque architecture. Season April–October. Letto picks hotels in Valletta, Sliema, or St. Julian’s — all 15 min by bus from MLA.'
  },
  {
    iata: 'BUD', country: 'HU',
    srSlug: 'budimpesta', srCity: 'Budimpešta',
    srIntro: 'Letovi za Budimpeštu — direktan let iz Beograda za sat i 20min ili autobus za 7-8 sati. Termalna kupatila, Parlament, Riblja četvrt. Letto bira hotele u Pestu (modernija strana) ili Budi (Castle Hill) — biraj po stilu.',
    enSlug: 'budapest',   enCity: 'Budapest',
    enIntro: 'Flights to Budapest — direct from Belgrade in 1h 20min, or a 7–8h bus ride. Thermal baths, the Parliament, the Fisherman’s Bastion. Letto picks hotels in Pest (the modern side) or Buda (Castle Hill) — pick by mood.'
  },
  {
    iata: 'LIS', country: 'PT',
    srSlug: 'lisabon',    srCity: 'Lisabon',
    srIntro: 'Letovi za Lisabon — najzapadnija prestolnica Evrope, Alfama, Belém, Tram 28. Sezona april–oktobar bez ekstremnih vrućina. Letto kombinuje let + hotel u Baixi ili Bairro Alto-u, oba 10min hodanja od centra.',
    enSlug: 'lisbon',     enCity: 'Lisbon',
    enIntro: 'Flights to Lisbon — Europe’s westernmost capital, Alfama, Belém, Tram 28. Season April–October with no extreme heat. Letto bundles flight + a hotel in Baixa or Bairro Alto, both 10 min walk from the centre.'
  },
  {
    iata: 'VIE', country: 'AT',
    srSlug: 'bec',        srCity: 'Beč',
    srIntro: 'Letovi za Beč iz Beograda — sat leta ili 6 sati vozom. Schönbrunn, Belvedere, Naschmarkt, kafane. Letto kombinuje let + hotel u 1. okrugu ili u Mariahilf-u (jeftinije, blizu metroa U3/U4).',
    enSlug: 'vienna',     enCity: 'Vienna',
    enIntro: 'Flights to Vienna from Belgrade — an hour by air or 6h by train. Schönbrunn, Belvedere, Naschmarkt, the coffeehouses. Letto bundles flight + a hotel in the 1st district or in Mariahilf (cheaper, near metro U3/U4).'
  },
  {
    iata: 'DXB', country: 'AE',
    srSlug: 'dubai',      srCity: 'Dubai',
    srIntro: 'Letovi za Dubai — direktan let iz Beograda od ~5h. Burj Khalifa, Marina, pustinja na sat od centra. Sezona novembar–mart (van leta su ekstremne temperature). Letto bira hotele u Marini ili Downtown-u, blizu metroa.',
    enSlug: 'dubai',      enCity: 'Dubai',
    enIntro: 'Flights to Dubai — direct from Belgrade in ~5h. Burj Khalifa, the Marina, desert an hour from centre. Season November–March (outside summer temps are extreme). Letto picks hotels in the Marina or Downtown, near the metro.'
  },
  {
    iata: 'SKG', country: 'GR',
    srSlug: 'solun',      srCity: 'Solun',
    srIntro: 'Letovi za Solun — najjeftinija greška destinacija u Egeju, plaže Chalkidiki-ja na sat. Direktan let iz BEG ili autobus za 6h preko Skoplja. Letto bira hotele u centru blizu Aristotelovog trga.',
    enSlug: 'thessaloniki', enCity: 'Thessaloniki',
    enIntro: 'Flights to Thessaloniki — the cheapest gateway into Greece, Chalkidiki beaches an hour away. Direct from BEG or 6h by bus via Skopje. Letto picks hotels in the centre near Aristotelous Square.'
  },
  {
    iata: 'IST', country: 'TR',
    srSlug: 'istanbul',   srCity: 'Istanbul',
    srIntro: 'Letovi za Istanbul iz Beograda — direktan let za 1h 40min. Hagia Sophia, Topkapı, Bosfor, Grand Bazaar. Letto bira hotele u Sultanahmet-u (istorijsko) ili Beyoğlu/Galata (život noću) — dobar transfer i sa novog IST i sa SAW.',
    enSlug: 'istanbul',   enCity: 'Istanbul',
    enIntro: 'Flights to Istanbul from Belgrade — direct in 1h 40min. Hagia Sophia, Topkapı, the Bosphorus, Grand Bazaar. Letto picks hotels in Sultanahmet (historical) or Beyoğlu/Galata (nightlife) — good transfer from both new IST and SAW.'
  },
  {
    iata: 'MUC', country: 'DE',
    srSlug: 'minhen',     srCity: 'Minhen',
    srIntro: 'Letovi za Minhen — kapija u Alpe i Bavarsku. Marienplatz, Englische Garten, dnevni izleti do Neuschwanstein-a. Letto bira hotele blizu Hauptbahnhof-a (lako stići vozom iz centra MUC).',
    enSlug: 'munich',     enCity: 'Munich',
    enIntro: 'Flights to Munich — gateway to the Alps and Bavaria. Marienplatz, the Englischer Garten, day trips to Neuschwanstein. Letto picks hotels near the Hauptbahnhof (easy train ride from MUC centre).'
  },
  {
    iata: 'SPU', country: 'HR',
    srSlug: 'split',      srCity: 'Split',
    srIntro: 'Letovi za Split — kapija u Dalmaciju, Dioklecijanova palata kao centar grada, lako do Hvara, Brača i Visa. Letto kombinuje let + hotel u staroj jezgri ili Bačvicama (plaža u 10min hodanja).',
    enSlug: 'split',      enCity: 'Split',
    enIntro: 'Flights to Split — gateway to Dalmatia, Diocletian’s Palace as the city centre, easy access to Hvar, Brač and Vis. Letto bundles flight + hotel in the old town or Bačvice (beach 10 min walk away).'
  },
  {
    iata: 'DBV', country: 'HR',
    srSlug: 'dubrovnik',  srCity: 'Dubrovnik',
    srIntro: 'Letovi za Dubrovnik — biser Jadrana, gradske zidine, Lokrum, Cavtat za dnevni izlet. Sezona maj–oktobar (jul/avgust su skupi). Letto bira hotele u Lapadu ili Pile-u za bolju cenu od Stare Jezgre.',
    enSlug: 'dubrovnik',  enCity: 'Dubrovnik',
    enIntro: 'Flights to Dubrovnik — the pearl of the Adriatic, the city walls, Lokrum, day trip to Cavtat. Season May–October (July/August are pricey). Letto picks hotels in Lapad or Pile for a better deal than the Old Town.'
  },
  {
    iata: 'PRG', country: 'CZ',
    srSlug: 'prag',       srCity: 'Prag',
    srIntro: 'Letovi za Prag — najlepša evropska prestolnica koju nije razrušio rat. Karlov most, Stari grad, Pražski hrad. Letto bira hotele u Vinohradi-ma ili Žižkov-u — autentičan život, jeftino, blizu metroa A.',
    enSlug: 'prague',     enCity: 'Prague',
    enIntro: 'Flights to Prague — the prettiest European capital untouched by war. Charles Bridge, Old Town, Prague Castle. Letto picks hotels in Vinohrady or Žižkov — authentic life, cheap, near metro line A.'
  },
  {
    iata: 'TIA', country: 'AL',
    srSlug: 'tirana',     srCity: 'Tirana',
    srIntro: 'Letovi za Tiranu — albanska prestolnica u usponu, kafana po kafani, šetnja po Bllok-u. Lako do plaža Sarande za dnevni izlet. Letto bira hotele blizu Skanderbeg trga ili u Bllok-u (mladi, modernije).',
    enSlug: 'tirana',     enCity: 'Tirana',
    enIntro: 'Flights to Tirana — Albania’s rising capital, cafe after cafe, walks through Blloku. Easy access to the Saranda beaches for a day trip. Letto picks hotels near Skanderbeg Square or in Blloku (younger, more modern).'
  },
  // ── v30.1 additions · spec extension ──
  {
    iata: 'AMS', country: 'NL',
    srSlug: 'amsterdam',  srCity: 'Amsterdam',
    srIntro: 'Letovi za Amsterdam iz Beograda — sat i po direktno, ili preko Beča/Minhena jeftinije. Kanali, Van Gogh muzej, biciklističke staze, Anne Frank kuća. Letto bira hotele u Jordaan-u ili De Pijp-u (autentičnije od Centrum-a, blizu tramvaja).',
    enSlug: 'amsterdam',  enCity: 'Amsterdam',
    enIntro: 'Flights to Amsterdam from Belgrade — 1.5h direct, or cheaper via Vienna/Munich. Canals, Van Gogh Museum, bike lanes, Anne Frank House. Letto picks hotels in Jordaan or De Pijp (more authentic than Centrum, near a tram line).'
  },
  {
    iata: 'CMN', country: 'MA',
    srSlug: 'kazablanka', srCity: 'Kazablanka',
    srIntro: 'Letovi za Kazablanku — najveći grad Maroka, kapija u Marakeš i Fes. Druga najveća džamija na svetu (Hasan II), francusko-kolonijalna arhitektura, Atlantik. Letto bira hotele blizu Hassan II ili u centru, lako do Boulevard Mohammed V.',
    enSlug: 'casablanca', enCity: 'Casablanca',
    enIntro: 'Flights to Casablanca — Morocco’s largest city, gateway to Marrakech and Fez. The world’s second-largest mosque (Hassan II), French colonial architecture, the Atlantic. Letto picks hotels near Hassan II or downtown, walkable to Boulevard Mohammed V.'
  },
  {
    iata: 'HER', country: 'GR',
    srSlug: 'krit',       srCity: 'Krit (Heraklion)',
    srIntro: 'Letovi za Krit (Heraklion) — najveće grčko ostrvo, plaže Elafonisi i Balos, Knossos palata. Sezona maj–oktobar, najbolje cene maja i septembra. Letto bira hotele uz plažu u Hersonissos-u ili u staroj Heraklion luci.',
    enSlug: 'crete',      enCity: 'Crete (Heraklion)',
    enIntro: 'Flights to Crete (Heraklion) — Greece’s largest island, Elafonisi and Balos beaches, the Palace of Knossos. Season May–October, best prices in May and September. Letto picks beachfront hotels in Hersonissos or in the old Heraklion harbour.'
  },
  {
    iata: 'IBZ', country: 'ES',
    srSlug: 'ibiza',      srCity: 'Ibiza',
    srIntro: 'Letovi za Ibizu — balearsko ostrvo legendarno po klubovima i plažama. Maj-oktobar sezona, vrh u julu/avgustu. Stara četvrt Dalt Vila je UNESCO. Letto bira hotele blizu Playa d’en Bossa (party) ili Santa Eulalia (mirnije, porodice).',
    enSlug: 'ibiza',      enCity: 'Ibiza',
    enIntro: 'Flights to Ibiza — the Balearic island legendary for clubs and beaches. Season May–October, peak in July/August. The old Dalt Vila quarter is UNESCO-listed. Letto picks hotels near Playa d’en Bossa (party) or Santa Eulalia (quieter, family).'
  },
  {
    iata: 'LHR', country: 'GB',
    srSlug: 'london',     srCity: 'London',
    srIntro: 'Letovi za London (LHR/LGW/STN) iz Beograda — 3h direktno ili preko Beča. Big Ben, Tower, West End, kafića po kafića u Shoreditch-u. Letto bira hotele blizu metro stanice u Zone 1-2 (Camden, Shoreditch, Bloomsbury) — sve unutar 15min od centra.',
    enSlug: 'london',     enCity: 'London',
    enIntro: 'Flights to London (LHR/LGW/STN) from Belgrade — 3h direct or via Vienna. Big Ben, the Tower, the West End, café after café in Shoreditch. Letto picks hotels near a Zone 1–2 tube station (Camden, Shoreditch, Bloomsbury) — all within 15 min of the centre.'
  },
  {
    iata: 'MAD', country: 'ES',
    srSlug: 'madrid',     srCity: 'Madrid',
    srIntro: 'Letovi za Madrid — španska prestolnica, Prado, Reina Sofía, Retiro park. Tapas u La Latini, fudbal na Bernabéu-u. Letto kombinuje let + hotel u Sol-u, Malasañi ili Chueki — sve blizu metroa i jeftino za Evropu.',
    enSlug: 'madrid',     enCity: 'Madrid',
    enIntro: 'Flights to Madrid — Spain’s capital, the Prado, Reina Sofía, Retiro park. Tapas in La Latina, football at Bernabéu. Letto bundles flight + hotel in Sol, Malasaña, or Chueca — all near the metro and cheap for Europe.'
  }
];

/** Helper · lookup by IATA. */
export function byIata(iata) {
  return DESTINATIONS.find(d => d.iata === iata) || null;
}
