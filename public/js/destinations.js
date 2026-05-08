/* Letto search bar destinations — V0.2
 * 80+ entries: Balkan + EU mainstream + popular MENA/CIS connections.
 * Used by ODAKLE / KUDA combo dropdowns on index.html and by the
 * Mix V2 right pane to deeplink to Hotellook with EN city names.
 *
 * Fields:
 *   iata    — 3-letter airport code
 *   city    — Serbian/Latin local name (UI display)
 *   country — Serbian/Latin country name (UI display)
 *   cityEn  — English name (fed to search.hotellook.com `destination=`)
 */
window.LETTO_DESTINATIONS = [
  // ── Balkan / Adriatic / Pannonian (origin priority) ──
  { iata: 'BEG', city: 'Beograd',     country: 'Srbija',              cityEn: 'Belgrade' },
  { iata: 'INI', city: 'Niš',         country: 'Srbija',              cityEn: 'Nis' },
  { iata: 'TGD', city: 'Podgorica',   country: 'Crna Gora',           cityEn: 'Podgorica' },
  { iata: 'TIV', city: 'Tivat',       country: 'Crna Gora',           cityEn: 'Tivat' },
  { iata: 'SJJ', city: 'Sarajevo',    country: 'BiH',                 cityEn: 'Sarajevo' },
  { iata: 'BNX', city: 'Banja Luka',  country: 'BiH',                 cityEn: 'Banja Luka' },
  { iata: 'SKP', city: 'Skoplje',     country: 'Severna Makedonija',  cityEn: 'Skopje' },
  { iata: 'OHD', city: 'Ohrid',       country: 'Severna Makedonija',  cityEn: 'Ohrid' },
  { iata: 'PRN', city: 'Priština',    country: 'Kosovo',              cityEn: 'Pristina' },
  { iata: 'ZAG', city: 'Zagreb',      country: 'Hrvatska',            cityEn: 'Zagreb' },
  { iata: 'SPU', city: 'Split',       country: 'Hrvatska',            cityEn: 'Split' },
  { iata: 'DBV', city: 'Dubrovnik',   country: 'Hrvatska',            cityEn: 'Dubrovnik' },
  { iata: 'LJU', city: 'Ljubljana',   country: 'Slovenija',           cityEn: 'Ljubljana' },
  { iata: 'SOF', city: 'Sofija',      country: 'Bugarska',            cityEn: 'Sofia' },
  { iata: 'TIA', city: 'Tirana',      country: 'Albanija',            cityEn: 'Tirana' },
  { iata: 'BUD', city: 'Budimpešta',  country: 'Mađarska',            cityEn: 'Budapest' },
  { iata: 'OTP', city: 'Bukurešt',    country: 'Rumunija',            cityEn: 'Bucharest' },
  { iata: 'VIE', city: 'Beč',         country: 'Austrija',            cityEn: 'Vienna' },
  // ── DE/AT ──
  { iata: 'BER', city: 'Berlin',      country: 'Nemačka',             cityEn: 'Berlin' },
  { iata: 'MUC', city: 'Minhen',      country: 'Nemačka',             cityEn: 'Munich' },
  { iata: 'FRA', city: 'Frankfurt',   country: 'Nemačka',             cityEn: 'Frankfurt' },
  { iata: 'HAM', city: 'Hamburg',     country: 'Nemačka',             cityEn: 'Hamburg' },
  { iata: 'DUS', city: 'Diseldorf',   country: 'Nemačka',             cityEn: 'Dusseldorf' },
  // ── Greece ──
  { iata: 'ATH', city: 'Atina',       country: 'Grčka',               cityEn: 'Athens' },
  { iata: 'SKG', city: 'Solun',       country: 'Grčka',               cityEn: 'Thessaloniki' },
  { iata: 'HER', city: 'Iraklion',    country: 'Grčka',               cityEn: 'Heraklion' },
  { iata: 'CFU', city: 'Krf',         country: 'Grčka',               cityEn: 'Corfu' },
  { iata: 'RHO', city: 'Rodos',       country: 'Grčka',               cityEn: 'Rhodes' },
  // ── Turkey ──
  { iata: 'IST', city: 'Istanbul',    country: 'Turska',              cityEn: 'Istanbul' },
  { iata: 'AYT', city: 'Antalija',    country: 'Turska',              cityEn: 'Antalya' },
  { iata: 'ESB', city: 'Ankara',      country: 'Turska',              cityEn: 'Ankara' },
  { iata: 'BJV', city: 'Bodrum',      country: 'Turska',              cityEn: 'Bodrum' },
  { iata: 'DLM', city: 'Dalaman',     country: 'Turska',              cityEn: 'Dalaman' },
  { iata: 'IZM', city: 'Izmir',       country: 'Turska',              cityEn: 'Izmir' },
  // ── Spain ──
  { iata: 'BCN', city: 'Barcelona',   country: 'Španija',             cityEn: 'Barcelona' },
  { iata: 'MAD', city: 'Madrid',      country: 'Španija',             cityEn: 'Madrid' },
  { iata: 'PMI', city: 'Palma',       country: 'Španija',             cityEn: 'Palma de Mallorca' },
  { iata: 'IBZ', city: 'Ibiza',       country: 'Španija',             cityEn: 'Ibiza' },
  { iata: 'AGP', city: 'Malaga',      country: 'Španija',             cityEn: 'Malaga' },
  { iata: 'ALC', city: 'Alikante',    country: 'Španija',             cityEn: 'Alicante' },
  { iata: 'VLC', city: 'Valensija',   country: 'Španija',             cityEn: 'Valencia' },
  { iata: 'BIO', city: 'Bilbao',      country: 'Španija',             cityEn: 'Bilbao' },
  // ── Portugal ──
  { iata: 'LIS', city: 'Lisabon',     country: 'Portugal',            cityEn: 'Lisbon' },
  { iata: 'OPO', city: 'Porto',       country: 'Portugal',            cityEn: 'Porto' },
  { iata: 'FAO', city: 'Faro',        country: 'Portugal',            cityEn: 'Faro' },
  // ── France ──
  { iata: 'CDG', city: 'Pariz CDG',   country: 'Francuska',           cityEn: 'Paris' },
  { iata: 'ORY', city: 'Pariz Orly',  country: 'Francuska',           cityEn: 'Paris' },
  { iata: 'NCE', city: 'Nica',        country: 'Francuska',           cityEn: 'Nice' },
  { iata: 'LYS', city: 'Lion',        country: 'Francuska',           cityEn: 'Lyon' },
  { iata: 'MRS', city: 'Marsej',      country: 'Francuska',           cityEn: 'Marseille' },
  // ── Italy ──
  { iata: 'FCO', city: 'Rim',         country: 'Italija',             cityEn: 'Rome' },
  { iata: 'MXP', city: 'Milano',      country: 'Italija',             cityEn: 'Milan' },
  { iata: 'VCE', city: 'Venecija',    country: 'Italija',             cityEn: 'Venice' },
  { iata: 'NAP', city: 'Napulj',      country: 'Italija',             cityEn: 'Naples' },
  { iata: 'BLQ', city: 'Bolonja',     country: 'Italija',             cityEn: 'Bologna' },
  { iata: 'PSA', city: 'Piza',        country: 'Italija',             cityEn: 'Pisa' },
  { iata: 'FLR', city: 'Firenca',     country: 'Italija',             cityEn: 'Florence' },
  // ── UK & Ireland ──
  { iata: 'LHR', city: 'London Heathrow', country: 'UK',              cityEn: 'London' },
  { iata: 'LGW', city: 'London Gatwick',  country: 'UK',              cityEn: 'London' },
  { iata: 'STN', city: 'London Stansted', country: 'UK',              cityEn: 'London' },
  { iata: 'EDI', city: 'Edinburgh',   country: 'UK',                  cityEn: 'Edinburgh' },
  { iata: 'DUB', city: 'Dublin',      country: 'Irska',               cityEn: 'Dublin' },
  // ── BeNeLux / Nordics ──
  { iata: 'AMS', city: 'Amsterdam',   country: 'Holandija',           cityEn: 'Amsterdam' },
  { iata: 'BRU', city: 'Brisel',      country: 'Belgija',             cityEn: 'Brussels' },
  { iata: 'CPH', city: 'Kopenhagen',  country: 'Danska',              cityEn: 'Copenhagen' },
  { iata: 'ARN', city: 'Stockholm',   country: 'Švedska',             cityEn: 'Stockholm' },
  { iata: 'OSL', city: 'Oslo',        country: 'Norveška',            cityEn: 'Oslo' },
  { iata: 'HEL', city: 'Helsinki',    country: 'Finska',              cityEn: 'Helsinki' },
  // ── Switzerland ──
  { iata: 'ZRH', city: 'Cirih',       country: 'Švajcarska',          cityEn: 'Zurich' },
  { iata: 'GVA', city: 'Ženeva',      country: 'Švajcarska',          cityEn: 'Geneva' },
  // ── Central Europe ──
  { iata: 'PRG', city: 'Prag',        country: 'Češka',               cityEn: 'Prague' },
  { iata: 'WAW', city: 'Varšava',     country: 'Poljska',             cityEn: 'Warsaw' },
  { iata: 'KRK', city: 'Krakov',      country: 'Poljska',             cityEn: 'Krakow' },
  // ── Mediterranean islands ──
  { iata: 'LCA', city: 'Larnaka',     country: 'Kipar',               cityEn: 'Larnaca' },
  { iata: 'MLA', city: 'Malta',       country: 'Malta',               cityEn: 'Malta' },
  // ── Levant / Gulf / N. Africa ──
  { iata: 'TLV', city: 'Tel Aviv',    country: 'Izrael',              cityEn: 'Tel Aviv' },
  { iata: 'DXB', city: 'Dubai',       country: 'UAE',                 cityEn: 'Dubai' },
  { iata: 'CAI', city: 'Kairo',       country: 'Egipat',              cityEn: 'Cairo' },
  { iata: 'MIR', city: 'Monastir',    country: 'Tunis',               cityEn: 'Monastir' },
  { iata: 'TUN', city: 'Tunis',       country: 'Tunis',               cityEn: 'Tunis' },
  { iata: 'RBA', city: 'Rabat',       country: 'Maroko',              cityEn: 'Rabat' },
  { iata: 'CMN', city: 'Casablanca',  country: 'Maroko',              cityEn: 'Casablanca' },
  // ── Caucasus ──
  { iata: 'TBS', city: 'Tbilisi',     country: 'Gruzija',             cityEn: 'Tbilisi' },
  { iata: 'EVN', city: 'Jerevan',     country: 'Jermenija',           cityEn: 'Yerevan' }
];
