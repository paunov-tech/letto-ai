// scripts/lib/destinations-faq.mjs — extended data for FAQPage + richer
// TouristDestination on every landing page. Keyed by IATA so the generator
// can merge per destination at render-time without touching the canonical
// destinations.mjs source-of-truth.
//
// Fields:
//   flight_duration_min_from_beg   — number of minutes, direct or typical route
//   best_months                    — 1-12 array, used by FAQ Q3 + can drive
//                                    seasonal advice elsewhere
//   visa_required_for_rs           — boolean
//   visa_note_sr / visa_note_en    — one-sentence detail (links not allowed
//                                    inside JSON-LD strings)
//   flight_price_eur_range_from_beg— [min, max], typical (not headline-deal)
//   hotel_price_eur_range_per_night— [min, max], 3* through 5* range
//   attractions                    — optional, 3 entries · localised name
//
// Number ranges and durations are best-effort estimates from public data;
// Miroslav should review + refine after first publish. All visa notes are
// for Serbian biometric-passport holders unless otherwise noted.

export const FAQ_DATA = {
  FCO: {
    flight_duration_min_from_beg: 125,
    best_months: [4, 5, 6, 9, 10],
    visa_required_for_rs: false,
    visa_note_sr: 'Schengen viza nije potrebna za srpske biometrijske pasoše, do 90 dana.',
    visa_note_en: 'No Schengen visa required for Serbian biometric passport holders, up to 90 days.',
    flight_price_eur_range_from_beg: [70, 230],
    hotel_price_eur_range_per_night: [55, 200],
    attractions: [
      { name_sr: 'Koloseum',         name_en: 'Colosseum' },
      { name_sr: 'Vatikan',          name_en: 'Vatican City' },
      { name_sr: 'Fontana di Trevi', name_en: 'Trevi Fountain' },
    ],
  },
  PMI: {
    flight_duration_min_from_beg: 180,
    best_months: [5, 6, 9],
    visa_required_for_rs: false,
    visa_note_sr: 'Schengen viza nije potrebna za srpske biometrijske pasoše, do 90 dana.',
    visa_note_en: 'No Schengen visa required for Serbian biometric passport holders, up to 90 days.',
    flight_price_eur_range_from_beg: [95, 280],
    hotel_price_eur_range_per_night: [60, 250],
    attractions: [
      { name_sr: 'Katedrala La Seu',  name_en: 'La Seu Cathedral' },
      { name_sr: 'Cap de Formentor',  name_en: 'Cap de Formentor' },
      { name_sr: 'Stari grad Palma',  name_en: 'Palma Old Town' },
    ],
  },
  ATH: {
    flight_duration_min_from_beg: 100,
    best_months: [4, 5, 6, 9, 10],
    visa_required_for_rs: false,
    visa_note_sr: 'Schengen viza nije potrebna za srpske biometrijske pasoše, do 90 dana.',
    visa_note_en: 'No Schengen visa required for Serbian biometric passport holders, up to 90 days.',
    flight_price_eur_range_from_beg: [70, 200],
    hotel_price_eur_range_per_night: [50, 180],
    attractions: [
      { name_sr: 'Akropolj',  name_en: 'Acropolis' },
      { name_sr: 'Partenon',  name_en: 'Parthenon' },
      { name_sr: 'Plaka',     name_en: 'Plaka district' },
    ],
  },
  BCN: {
    flight_duration_min_from_beg: 165,
    best_months: [4, 5, 6, 9, 10],
    visa_required_for_rs: false,
    visa_note_sr: 'Schengen viza nije potrebna za srpske biometrijske pasoše, do 90 dana.',
    visa_note_en: 'No Schengen visa required for Serbian biometric passport holders, up to 90 days.',
    flight_price_eur_range_from_beg: [85, 260],
    hotel_price_eur_range_per_night: [65, 220],
    attractions: [
      { name_sr: 'Sagrada Família', name_en: 'Sagrada Família' },
      { name_sr: 'Park Güell',      name_en: 'Park Güell' },
      { name_sr: 'La Rambla',       name_en: 'La Rambla' },
    ],
  },
  CDG: {
    flight_duration_min_from_beg: 170,
    best_months: [4, 5, 6, 9, 10],
    visa_required_for_rs: false,
    visa_note_sr: 'Schengen viza nije potrebna za srpske biometrijske pasoše, do 90 dana.',
    visa_note_en: 'No Schengen visa required for Serbian biometric passport holders, up to 90 days.',
    flight_price_eur_range_from_beg: [95, 280],
    hotel_price_eur_range_per_night: [80, 280],
    attractions: [
      { name_sr: 'Ajfelov toranj', name_en: 'Eiffel Tower' },
      { name_sr: 'Luvr',           name_en: 'Louvre' },
      { name_sr: 'Notr Dam',       name_en: 'Notre-Dame' },
    ],
  },
  MLA: {
    flight_duration_min_from_beg: 175,
    best_months: [5, 6, 9, 10],
    visa_required_for_rs: false,
    visa_note_sr: 'Schengen viza nije potrebna za srpske biometrijske pasoše, do 90 dana.',
    visa_note_en: 'No Schengen visa required for Serbian biometric passport holders, up to 90 days.',
    flight_price_eur_range_from_beg: [100, 250],
    hotel_price_eur_range_per_night: [55, 190],
    attractions: [
      { name_sr: 'Stara Valeta', name_en: 'Valletta Old City' },
      { name_sr: 'Mdina',        name_en: 'Mdina' },
      { name_sr: 'Plava laguna', name_en: 'Blue Lagoon' },
    ],
  },
  BUD: {
    flight_duration_min_from_beg: 55,
    best_months: [4, 5, 6, 9, 10],
    visa_required_for_rs: false,
    visa_note_sr: 'Schengen viza nije potrebna za srpske biometrijske pasoše, do 90 dana.',
    visa_note_en: 'No Schengen visa required for Serbian biometric passport holders, up to 90 days.',
    flight_price_eur_range_from_beg: [60, 180],
    hotel_price_eur_range_per_night: [45, 160],
    attractions: [
      { name_sr: 'Budimski dvorac',       name_en: 'Buda Castle' },
      { name_sr: 'Parlament',             name_en: 'Hungarian Parliament' },
      { name_sr: 'Banja Széchenyi',       name_en: 'Széchenyi Thermal Baths' },
    ],
  },
  LIS: {
    flight_duration_min_from_beg: 195,
    best_months: [4, 5, 6, 9, 10],
    visa_required_for_rs: false,
    visa_note_sr: 'Schengen viza nije potrebna za srpske biometrijske pasoše, do 90 dana.',
    visa_note_en: 'No Schengen visa required for Serbian biometric passport holders, up to 90 days.',
    flight_price_eur_range_from_beg: [100, 290],
    hotel_price_eur_range_per_night: [60, 230],
    attractions: [
      { name_sr: 'Kula Belém', name_en: 'Belém Tower' },
      { name_sr: 'Alfama',     name_en: 'Alfama district' },
      { name_sr: 'Tramvaj 28', name_en: 'Tram 28' },
    ],
  },
  VIE: {
    flight_duration_min_from_beg: 70,
    best_months: [4, 5, 9, 10, 12],
    visa_required_for_rs: false,
    visa_note_sr: 'Schengen viza nije potrebna za srpske biometrijske pasoše, do 90 dana.',
    visa_note_en: 'No Schengen visa required for Serbian biometric passport holders, up to 90 days.',
    flight_price_eur_range_from_beg: [65, 200],
    hotel_price_eur_range_per_night: [70, 220],
    attractions: [
      { name_sr: 'Šenbrun',          name_en: 'Schönbrunn Palace' },
      { name_sr: 'Stefansdom',       name_en: 'Stephansdom' },
      { name_sr: 'Belveder',         name_en: 'Belvedere' },
    ],
  },
  DXB: {
    flight_duration_min_from_beg: 290,
    best_months: [11, 12, 1, 2, 3],
    visa_required_for_rs: true,
    visa_note_sr: 'Viza za UAE se dobija besplatno po dolasku za srpske pasoše, do 90 dana boravka.',
    visa_note_en: 'Visa on arrival, free for Serbian passport holders, up to 90 days stay.',
    flight_price_eur_range_from_beg: [220, 600],
    hotel_price_eur_range_per_night: [80, 400],
    attractions: [
      { name_sr: 'Burdž Halifa',   name_en: 'Burj Khalifa' },
      { name_sr: 'Palm Džumeira',  name_en: 'Palm Jumeirah' },
      { name_sr: 'Dubai Mall',     name_en: 'Dubai Mall' },
    ],
  },
  SKG: {
    flight_duration_min_from_beg: 60,
    best_months: [5, 6, 9, 10],
    visa_required_for_rs: false,
    visa_note_sr: 'Schengen viza nije potrebna za srpske biometrijske pasoše, do 90 dana.',
    visa_note_en: 'No Schengen visa required for Serbian biometric passport holders, up to 90 days.',
    flight_price_eur_range_from_beg: [50, 180],
    hotel_price_eur_range_per_night: [40, 150],
    attractions: [
      { name_sr: 'Bela kula',           name_en: 'White Tower' },
      { name_sr: 'Aristotelov trg',     name_en: 'Aristotelous Square' },
      { name_sr: 'Ano Poli (gornji grad)', name_en: 'Ano Poli (Upper Town)' },
    ],
  },
  IST: {
    flight_duration_min_from_beg: 95,
    best_months: [4, 5, 9, 10, 11],
    visa_required_for_rs: false,
    visa_note_sr: 'Viza nije potrebna za srpske pasoše do 60 dana boravka u Turskoj.',
    visa_note_en: 'No visa required for Serbian passport holders, up to 60 days in Türkiye.',
    flight_price_eur_range_from_beg: [55, 200],
    hotel_price_eur_range_per_night: [40, 180],
    attractions: [
      { name_sr: 'Aja Sofija',     name_en: 'Hagia Sophia' },
      { name_sr: 'Plava džamija',  name_en: 'Blue Mosque' },
      { name_sr: 'Topkapi',        name_en: 'Topkapi Palace' },
    ],
  },
  MUC: {
    flight_duration_min_from_beg: 110,
    best_months: [4, 5, 6, 9, 10],
    visa_required_for_rs: false,
    visa_note_sr: 'Schengen viza nije potrebna za srpske biometrijske pasoše, do 90 dana.',
    visa_note_en: 'No Schengen visa required for Serbian biometric passport holders, up to 90 days.',
    flight_price_eur_range_from_beg: [75, 240],
    hotel_price_eur_range_per_night: [80, 250],
    attractions: [
      { name_sr: 'Marienplatz',     name_en: 'Marienplatz' },
      { name_sr: 'Engleski vrt',    name_en: 'Englischer Garten' },
      { name_sr: 'BMW Welt',        name_en: 'BMW Welt' },
    ],
  },
  SPU: {
    flight_duration_min_from_beg: 75,
    best_months: [5, 6, 7, 8, 9],
    visa_required_for_rs: false,
    visa_note_sr: 'Schengen viza nije potrebna za srpske biometrijske pasoše, do 90 dana.',
    visa_note_en: 'No Schengen visa required for Serbian biometric passport holders, up to 90 days.',
    flight_price_eur_range_from_beg: [60, 200],
    hotel_price_eur_range_per_night: [50, 220],
    attractions: [
      { name_sr: 'Dioklecijanova palata', name_en: "Diocletian's Palace" },
      { name_sr: 'Riva',                  name_en: 'Riva promenade' },
      { name_sr: 'Marjan',                name_en: 'Marjan Hill' },
    ],
  },
  DBV: {
    flight_duration_min_from_beg: 75,
    best_months: [5, 6, 9, 10],
    visa_required_for_rs: false,
    visa_note_sr: 'Schengen viza nije potrebna za srpske biometrijske pasoše, do 90 dana.',
    visa_note_en: 'No Schengen visa required for Serbian biometric passport holders, up to 90 days.',
    flight_price_eur_range_from_beg: [80, 260],
    hotel_price_eur_range_per_night: [70, 280],
    attractions: [
      { name_sr: 'Gradske zidine', name_en: 'Old City Walls' },
      { name_sr: 'Stradun',        name_en: 'Stradun' },
      { name_sr: 'Ostrvo Lokrum',  name_en: 'Lokrum Island' },
    ],
  },
  PRG: {
    flight_duration_min_from_beg: 100,
    best_months: [4, 5, 9, 10, 12],
    visa_required_for_rs: false,
    visa_note_sr: 'Schengen viza nije potrebna za srpske biometrijske pasoše, do 90 dana.',
    visa_note_en: 'No Schengen visa required for Serbian biometric passport holders, up to 90 days.',
    flight_price_eur_range_from_beg: [55, 200],
    hotel_price_eur_range_per_night: [50, 180],
    attractions: [
      { name_sr: 'Karlov most',  name_en: 'Charles Bridge' },
      { name_sr: 'Praški dvorac', name_en: 'Prague Castle' },
      { name_sr: 'Staromjestský trg', name_en: 'Old Town Square' },
    ],
  },
  TIA: {
    flight_duration_min_from_beg: 75,
    best_months: [4, 5, 9, 10],
    visa_required_for_rs: false,
    visa_note_sr: 'Viza nije potrebna za srpske pasoše do 90 dana boravka u Albaniji.',
    visa_note_en: 'No visa required for Serbian passport holders, up to 90 days in Albania.',
    flight_price_eur_range_from_beg: [50, 180],
    hotel_price_eur_range_per_night: [35, 130],
    attractions: [
      { name_sr: 'Trg Skender-bega', name_en: 'Skanderbeg Square' },
      { name_sr: "Bunk'Art",         name_en: "Bunk'Art" },
      { name_sr: 'Planina Dajti',    name_en: 'Mount Dajti' },
    ],
  },
  AMS: {
    flight_duration_min_from_beg: 150,
    best_months: [4, 5, 6, 9, 10],
    visa_required_for_rs: false,
    visa_note_sr: 'Schengen viza nije potrebna za srpske biometrijske pasoše, do 90 dana.',
    visa_note_en: 'No Schengen visa required for Serbian biometric passport holders, up to 90 days.',
    flight_price_eur_range_from_beg: [85, 260],
    hotel_price_eur_range_per_night: [90, 280],
    attractions: [
      { name_sr: 'Rajksmuzeum',         name_en: 'Rijksmuseum' },
      { name_sr: 'Kuća Ane Frank',      name_en: 'Anne Frank House' },
      { name_sr: 'Vondelpark',          name_en: 'Vondelpark' },
    ],
  },
  CMN: {
    flight_duration_min_from_beg: 270,
    best_months: [3, 4, 5, 9, 10, 11],
    visa_required_for_rs: false,
    visa_note_sr: 'Viza nije potrebna za srpske pasoše do 90 dana boravka u Maroku.',
    visa_note_en: 'No visa required for Serbian passport holders, up to 90 days in Morocco.',
    flight_price_eur_range_from_beg: [180, 450],
    hotel_price_eur_range_per_night: [50, 200],
    attractions: [
      { name_sr: 'Hasan II džamija', name_en: 'Hassan II Mosque' },
      { name_sr: 'Stara medina',     name_en: 'Old Medina' },
      { name_sr: 'La Corniche',      name_en: 'La Corniche' },
    ],
  },
  HER: {
    flight_duration_min_from_beg: 130,
    best_months: [5, 6, 9, 10],
    visa_required_for_rs: false,
    visa_note_sr: 'Schengen viza nije potrebna za srpske biometrijske pasoše, do 90 dana.',
    visa_note_en: 'No Schengen visa required for Serbian biometric passport holders, up to 90 days.',
    flight_price_eur_range_from_beg: [80, 250],
    hotel_price_eur_range_per_night: [55, 240],
    attractions: [
      { name_sr: 'Knosos',                  name_en: 'Knossos Palace' },
      { name_sr: 'Stari grad Heraklion',    name_en: 'Heraklion Old Town' },
      { name_sr: 'Elafonisi plaža',         name_en: 'Elafonisi Beach' },
    ],
  },
  IBZ: {
    flight_duration_min_from_beg: 180,
    best_months: [5, 6, 9, 10],
    visa_required_for_rs: false,
    visa_note_sr: 'Schengen viza nije potrebna za srpske biometrijske pasoše, do 90 dana.',
    visa_note_en: 'No Schengen visa required for Serbian biometric passport holders, up to 90 days.',
    flight_price_eur_range_from_beg: [120, 320],
    hotel_price_eur_range_per_night: [80, 350],
    attractions: [
      { name_sr: 'Dalt Vila (stari grad)', name_en: 'Dalt Vila (Old Town)' },
      { name_sr: 'Es Vedrà',               name_en: 'Es Vedrà island' },
      { name_sr: "Cala d'Hort plaža",      name_en: "Cala d'Hort beach" },
    ],
  },
  LHR: {
    flight_duration_min_from_beg: 175,
    best_months: [4, 5, 6, 9],
    visa_required_for_rs: true,
    visa_note_sr: 'UK ETA (electronic travel authorization) je potrebna od 2025 — brza online aplikacija, ~£10, validna 2 godine.',
    visa_note_en: 'UK ETA (electronic travel authorization) required from 2025 — quick online application, ~£10, valid for 2 years.',
    flight_price_eur_range_from_beg: [120, 350],
    hotel_price_eur_range_per_night: [100, 300],
    attractions: [
      { name_sr: 'Big Ben',         name_en: 'Big Ben' },
      { name_sr: 'Tauer Londona',   name_en: 'Tower of London' },
      { name_sr: 'Britanski muzej', name_en: 'British Museum' },
    ],
  },
  MAD: {
    flight_duration_min_from_beg: 170,
    best_months: [4, 5, 6, 9, 10],
    visa_required_for_rs: false,
    visa_note_sr: 'Schengen viza nije potrebna za srpske biometrijske pasoše, do 90 dana.',
    visa_note_en: 'No Schengen visa required for Serbian biometric passport holders, up to 90 days.',
    flight_price_eur_range_from_beg: [90, 270],
    hotel_price_eur_range_per_night: [65, 230],
    attractions: [
      { name_sr: 'Prado',          name_en: 'Prado Museum' },
      { name_sr: 'Kraljevska palata', name_en: 'Royal Palace' },
      { name_sr: 'Plaza Mayor',    name_en: 'Plaza Mayor' },
    ],
  },
};
