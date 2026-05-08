// api/mix-mock.js — Local/preview mock for Mix V0.1.
// Returns deterministic synthetic flights + hotels so frontend can render
// without n8n / Travelpayouts. Used when MIX_USE_MOCK=1 is set on /api/mix-search.

const CITIES = {
  ATH: { name: 'Athens', sr: 'Atina' },
  IST: { name: 'Istanbul', sr: 'Istanbul' },
  BCN: { name: 'Barcelona', sr: 'Barselona' },
  LIS: { name: 'Lisbon', sr: 'Lisabon' },
  CDG: { name: 'Paris', sr: 'Pariz' },
  FCO: { name: 'Rome', sr: 'Rim' },
  MAD: { name: 'Madrid', sr: 'Madrid' },
  AMS: { name: 'Amsterdam', sr: 'Amsterdam' },
  BUD: { name: 'Budapest', sr: 'Budimpešta' },
  VIE: { name: 'Vienna', sr: 'Beč' },
  PRG: { name: 'Prague', sr: 'Prag' },
  BER: { name: 'Berlin', sr: 'Berlin' },
  AYT: { name: 'Antalya', sr: 'Antalija' },
  PMI: { name: 'Palma', sr: 'Palma' },
  MLA: { name: 'Valletta', sr: 'Valeta' }
};

const CARRIERS = [
  { code: 'JU', name: 'Air Serbia', tier: 1 },
  { code: 'TK', name: 'Turkish Airlines', tier: 1 },
  { code: 'LH', name: 'Lufthansa', tier: 1 },
  { code: 'OS', name: 'Austrian Airlines', tier: 1 },
  { code: 'W6', name: 'Wizz Air', tier: 2 },
  { code: 'FR', name: 'Ryanair', tier: 2 }
];

const HOTELS = [
  { name: 'Plaza Centro', stars: 4, rating: 8.9, dist: 0.4 },
  { name: 'Akropolis View', stars: 4, rating: 8.7, dist: 1.1 },
  { name: 'Riverside Boutique', stars: 4, rating: 8.4, dist: 0.8 },
  { name: 'Old Town Suites', stars: 3, rating: 8.6, dist: 0.6 },
  { name: 'Skyline Residence', stars: 5, rating: 9.1, dist: 1.6 },
  { name: 'Garden Court', stars: 3, rating: 7.9, dist: 2.1 }
];

function seededRandom(seedStr) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
  return () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 0xffffffff;
  };
}

function nightsBetween(d1, d2) {
  return Math.max(1, Math.ceil((new Date(d2) - new Date(d1)) / 86400000));
}

export function buildMockPayload({ from, to, depart, ret, pax }) {
  const cityMeta = CITIES[to] || { name: to, sr: to };
  const nights = nightsBetween(depart, ret);
  const rand = seededRandom(`${from}-${to}-${depart}-${ret}-${pax}`);

  const flights = CARRIERS.slice(0, 5).map((c, i) => {
    const stopsOut = i < 2 ? 0 : (rand() < 0.5 ? 0 : 1);
    const stopsBack = i < 2 ? 0 : (rand() < 0.5 ? 0 : 1);
    const ppp = Math.round(120 + i * 28 + rand() * 60);
    return {
      id: `fl_${i}_${c.code}_${800 + i * 13}`,
      type: 'flight',
      carrier: c.code,
      carrier_name: c.name,
      flight_number: `${c.code}${800 + i * 13}`,
      depart_at: depart,
      return_at: ret,
      depart_time: ['06:30', '09:15', '14:40', '18:05', '21:30'][i] || '12:00',
      return_time: ['11:00', '13:55', '20:10', '07:45', '23:50'][i] || '14:00',
      duration_outbound: 120 + stopsOut * 90 + Math.round(rand() * 30),
      duration_return: 120 + stopsBack * 90 + Math.round(rand() * 30),
      stops_outbound: stopsOut,
      stops_return: stopsBack,
      price_per_pax: ppp,
      price_total: ppp * pax,
      currency: 'EUR',
      affiliate_url: `https://www.aviasales.com/search/${from}${depart.replace(/-/g, '').slice(2, 8)}${to}${ret.replace(/-/g, '').slice(2, 8)}${pax}?marker=letto-mock`,
      source: 'mock',
      quality_score: Math.round(95 - i * 7 + rand() * 4)
    };
  });

  const hotels = HOTELS.slice(0, 5).map((h, i) => {
    const ppn = Math.round(38 + i * 17 + rand() * 25);
    return {
      id: `ht_${100000 + i * 31}`,
      type: 'hotel',
      name: `${h.name} ${cityMeta.name}`,
      stars: h.stars,
      rating: h.rating,
      location: i === 0 ? `${cityMeta.name} centar` : `${cityMeta.name}`,
      distance_to_center_km: h.dist,
      price_per_night: ppn,
      price_total: ppn * nights,
      currency: 'EUR',
      affiliate_url: `https://search.hotellook.com/?destination=${encodeURIComponent(cityMeta.name)}&checkIn=${depart}&checkOut=${ret}&adults=${pax}&hotelId=${100000 + i * 31}&marker=letto-mock`,
      source: 'mock',
      quality_score: Math.round(92 - i * 5 + rand() * 4)
    };
  });

  flights.sort((a, b) => b.quality_score - a.quality_score);
  hotels.sort((a, b) => b.quality_score - a.quality_score);

  const recommendedFlight = flights[0];
  const recommendedHotel = hotels[0];
  const recommended = recommendedFlight && recommendedHotel ? {
    flight_id: recommendedFlight.id,
    hotel_id: recommendedHotel.id,
    total_price: recommendedFlight.price_total + recommendedHotel.price_total,
    combined_quality_score: Math.round((recommendedFlight.quality_score + recommendedHotel.quality_score) / 2),
    currency: 'EUR'
  } : null;

  const summary = recommendedFlight && recommendedHotel
    ? `Pouzdan let sa ${recommendedFlight.carrier_name} bez presedanja, uz hotel u centru sa ocenom ${recommendedHotel.rating}/10. Balans cene i lokacije za sigurnu osnovu putovanja.`
    : null;

  return {
    query: { from, to, depart, return: ret, pax },
    city: cityMeta,
    nights,
    flights,
    hotels,
    recommended,
    summary,
    cache_hit: false,
    mock: true
  };
}

export default async function handler(req, res) {
  const body = req.method === 'POST' ? (req.body || {}) : req.query;
  const payload = buildMockPayload({
    from: String(body.from || 'BEG').toUpperCase(),
    to: String(body.to || 'ATH').toUpperCase(),
    depart: String(body.depart || '2026-08-15'),
    ret: String(body.return || '2026-08-22'),
    pax: parseInt(body.pax, 10) || 2
  });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(payload);
}
