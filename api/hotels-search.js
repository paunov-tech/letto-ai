// api/hotels-search.js — Mix V2 · Hotels.com Provider (RapidAPI Tipsters CO) proxy
//
// Faza 1 of Korak 1 (B1-a path).
//
// Endpoints used (per provider docs):
//   GET /v2/regions          → IATA city → gaiaId
//   GET /v3/hotels/search    → property listings with prices
//
// Currency strategy: domain=DE & locale=de_DE → API returns EUR natively.
// No Frankfurter / FX conversion needed.
//
// Stars: derived as round(guestRating / 2) per master-design Korak 1 spec
//        (Hotels.com Provider doesn't return hotel-class stars in list response).
//
// Edge cache 1h via Cache-Control: s-maxage=3600. With ~14k req/mo plan,
// this absorbs duplicate searches across users on the same dates+destination.

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_HOST = 'hotels-com-provider.p.rapidapi.com';
const TP_MARKER     = process.env.TRAVELPAYOUTS_MARKER || '722287';

// IATA → English city name (mirrors public/js/destinations.js cityEn)
const IATA_TO_CITY_EN = {
  BEG: 'Belgrade', INI: 'Nis', TGD: 'Podgorica', TIV: 'Tivat',
  SJJ: 'Sarajevo', BNX: 'Banja Luka', SKP: 'Skopje', OHD: 'Ohrid',
  PRN: 'Pristina', ZAG: 'Zagreb', SPU: 'Split', DBV: 'Dubrovnik',
  LJU: 'Ljubljana', SOF: 'Sofia', TIA: 'Tirana', BUD: 'Budapest',
  OTP: 'Bucharest', VIE: 'Vienna',
  BER: 'Berlin', MUC: 'Munich', FRA: 'Frankfurt', HAM: 'Hamburg', DUS: 'Dusseldorf',
  ATH: 'Athens', SKG: 'Thessaloniki', HER: 'Heraklion', CFU: 'Corfu', RHO: 'Rhodes',
  IST: 'Istanbul', AYT: 'Antalya', ESB: 'Ankara', BJV: 'Bodrum', DLM: 'Dalaman', IZM: 'Izmir',
  BCN: 'Barcelona', MAD: 'Madrid', PMI: 'Palma de Mallorca', IBZ: 'Ibiza',
  AGP: 'Malaga', ALC: 'Alicante', VLC: 'Valencia', BIO: 'Bilbao',
  LIS: 'Lisbon', OPO: 'Porto', FAO: 'Faro',
  CDG: 'Paris', ORY: 'Paris', NCE: 'Nice', LYS: 'Lyon', MRS: 'Marseille',
  FCO: 'Rome', MXP: 'Milan', VCE: 'Venice', NAP: 'Naples',
  BLQ: 'Bologna', PSA: 'Pisa', FLR: 'Florence',
  LHR: 'London', LGW: 'London', STN: 'London', EDI: 'Edinburgh', DUB: 'Dublin',
  AMS: 'Amsterdam', BRU: 'Brussels', CPH: 'Copenhagen',
  ARN: 'Stockholm', OSL: 'Oslo', HEL: 'Helsinki',
  ZRH: 'Zurich', GVA: 'Geneva',
  PRG: 'Prague', WAW: 'Warsaw', KRK: 'Krakow',
  LCA: 'Larnaca', MLA: 'Malta',
  TLV: 'Tel Aviv', DXB: 'Dubai', CAI: 'Cairo',
  MIR: 'Monastir', TUN: 'Tunis', RBA: 'Rabat', CMN: 'Casablanca',
  TBS: 'Tbilisi', EVN: 'Yerevan'
};

// ── RapidAPI helpers ──
function rapidHeaders() {
  return {
    'X-RapidAPI-Key': RAPIDAPI_KEY,
    'X-RapidAPI-Host': RAPIDAPI_HOST,
    'Accept': 'application/json',
    'User-Agent': 'letto.live-mix/2.0'
  };
}

async function searchRegion(cityEn) {
  const url = new URL('https://' + RAPIDAPI_HOST + '/v2/regions');
  url.searchParams.set('query', cityEn);
  url.searchParams.set('domain', 'DE');
  url.searchParams.set('locale', 'de_DE');
  const r = await fetch(url, {
    headers: rapidHeaders(),
    signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined
  });
  const text = await r.text();
  if (!r.ok) {
    return { error: 'region_lookup_failed', status: r.status, body: text.slice(0, 200) };
  }
  let j;
  try { j = JSON.parse(text); } catch (e) {
    return { error: 'region_non_json', body: text.slice(0, 200) };
  }
  const results = (j && Array.isArray(j.data)) ? j.data : [];
  // Pick best match: prefer CITY type. (winnerReasoning isn't always present.)
  let winner = results.find(r => r.type === 'CITY');
  if (!winner) winner = results[0];
  if (!winner) return { error: 'no_city_match', results: results.length };
  return {
    regionId: winner.gaiaId,
    cityFullName: winner.regionNames && winner.regionNames.fullName,
    coords: winner.coordinates ? { lat: Number(winner.coordinates.lat), lng: Number(winner.coordinates.long) } : null
  };
}

// Per-hotel detail (Faza 5: distance for top 5)
// Module-level cache keyed by hotelId — survives the warm function lifetime.
var hotelDetailCache = new Map();
var DETAIL_CACHE_TTL_MS = 60 * 60 * 1000;

async function fetchHotelDetail(hotelId) {
  var cached = hotelDetailCache.get(hotelId);
  if (cached && (Date.now() - cached.fetchedAt < DETAIL_CACHE_TTL_MS)) {
    return cached.data;
  }
  var url = new URL('https://' + RAPIDAPI_HOST + '/v2/hotels/details');
  url.searchParams.set('hotel_id', String(hotelId));
  url.searchParams.set('domain', 'DE');
  url.searchParams.set('locale', 'de_DE');
  try {
    var r = await fetch(url, {
      headers: rapidHeaders(),
      signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined
    });
    if (!r.ok) return null;
    var json = await r.json();
    var coords = json && json.summary && json.summary.location && json.summary.location.coordinates;
    if (!coords || coords.latitude == null || coords.longitude == null) return null;
    var data = {
      lat: Number(coords.latitude),
      lng: Number(coords.longitude),
      addressLine: (json.summary.location.address && json.summary.location.address.addressLine) || null
    };
    hotelDetailCache.set(hotelId, { data, fetchedAt: Date.now() });
    return data;
  } catch (e) {
    return null;
  }
}

// Haversine distance in km between two lat/lng pairs
function haversineKm(lat1, lng1, lat2, lng2) {
  var R = 6371; // Earth radius in km
  var toRad = function (d) { return d * Math.PI / 180; };
  var dLat = toRad(lat2 - lat1);
  var dLng = toRad(lng2 - lng1);
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2))
        * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function searchProperties({ regionId, checkIn, checkOut, adults, childrenAges, sortOrder }) {
  const url = new URL('https://' + RAPIDAPI_HOST + '/v3/hotels/search');
  url.searchParams.set('domain', 'DE');             // EUR currency
  url.searchParams.set('locale', 'de_DE');          // EUR formatting
  url.searchParams.set('region_id', String(regionId));
  url.searchParams.set('checkin_date', checkIn);
  url.searchParams.set('checkout_date', checkOut);
  url.searchParams.set('adults_number', String(adults));
  url.searchParams.set('sort_order', sortOrder || 'PRICE_LOW_TO_HIGH');
  url.searchParams.set('available_filter', 'SHOW_AVAILABLE_ONLY');
  if (childrenAges) url.searchParams.set('children_ages', childrenAges);

  const r = await fetch(url, {
    headers: rapidHeaders(),
    signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
  });
  const text = await r.text();
  if (!r.ok) {
    return { error: 'properties_failed', status: r.status, body: text.slice(0, 200) };
  }
  let j;
  try { j = JSON.parse(text); } catch (e) {
    return { error: 'properties_non_json', body: text.slice(0, 200) };
  }
  return {
    json: j,
    rateLimit: {
      limit:     r.headers.get('x-ratelimit-requests-limit'),
      remaining: r.headers.get('x-ratelimit-requests-remaining'),
      reset:     r.headers.get('x-ratelimit-requests-reset')
    }
  };
}

// ── Normalizer (DE locale: "108 €", comma decimal "5,4") ──
function parseDeNumber(s) {
  if (!s) return 0;
  // Strip everything except digits, comma, and dot. Then comma→dot for parseFloat.
  const cleaned = String(s).replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : 0;
}

function pickPrice(prop) {
  const ps = prop && prop.price && prop.price.priceSummary;
  if (!ps) return { total: 0, perNight: 0 };
  // LEAD displayPrice = total (for de_DE), e.g. "108 €"
  let total = 0, perNight = 0;
  for (const dp of (ps.displayPrices || [])) {
    if (dp.role === 'LEAD' && dp.price && dp.price.formatted) {
      total = parseDeNumber(dp.price.formatted);
    }
    if (dp.state === 'BREAKOUT_TYPE_AVERAGE_NIGHTLY_PRICE' && dp.value) {
      perNight = parseDeNumber(dp.value);
    }
  }
  // Fallback: priceSummary.definition.displayPrice if displayPrices missing LEAD
  if (!total && ps.definition && ps.definition.displayPrice) {
    total = parseDeNumber(ps.definition.displayPrice);
  }
  return { total, perNight };
}

function pickPhoto(prop) {
  const ms = prop && prop.mediaSection;
  if (!ms) return null;
  // v3 direct API: { mediaSection: { media: [{url, ...}] } }
  if (Array.isArray(ms.media) && ms.media[0] && ms.media[0].url) return ms.media[0].url;
  // Nested fallback (some plans/locales): { gallery: { media: [{media: {url}}] } }
  const nested = ms.gallery && ms.gallery.media;
  if (Array.isArray(nested) && nested[0] && nested[0].media && nested[0].media.url) {
    return nested[0].media.url;
  }
  return null;
}

function pickReviewCount(prop) {
  const phrases = prop && prop.guestRating && prop.guestRating.phrases;
  if (!Array.isArray(phrases)) return null;
  for (const p of phrases) {
    const m = String(p).match(/(\d+(?:[. ,]\d{3})*)/);
    if (m) return parseInt(m[1].replace(/[. ,]/g, ''), 10);
  }
  return null;
}

function normalizeProperty(prop) {
  if (!prop || !prop.id || !prop.name) return null;
  const guestRating = prop.guestRating ? parseDeNumber(prop.guestRating.rating) : null;
  const stars = (guestRating != null && guestRating > 0) ? Math.round(guestRating / 2) : null;
  const neighborhood = (Array.isArray(prop.messages) && prop.messages[0])
    ? String(prop.messages[0]) : null;
  const { total, perNight } = pickPrice(prop);
  const photo = pickPhoto(prop);
  const reviewCount = pickReviewCount(prop);

  return {
    id: String(prop.id),
    name: String(prop.name),
    stars: (stars != null && stars >= 1 && stars <= 5) ? stars : null,
    guestRating,
    reviewCount,
    neighborhood,
    photo,
    pricePerNight: Math.round(perNight),
    priceTotal:    Math.round(total),
    currency: 'EUR',
    distanceToCenter: null // populated by Faza 5
  };
}

// ── Main handler ──
const ALLOWED_ORIGINS = ['https://letto.live', 'https://www.letto.live'];

function isValidIso(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); }

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || '';
  let allow = false;
  try {
    allow = ALLOWED_ORIGINS.includes(origin) || /\.vercel\.app$/.test(new URL(origin || 'https://x.local').hostname);
  } catch (e) {}
  if (allow) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  if (!RAPIDAPI_KEY) {
    return res.status(500).json({ error: 'Server is missing RAPIDAPI_KEY' });
  }

  // Validate
  const q = req.query || {};
  const destinationRaw = String(q.destination || '').trim().toUpperCase();
  const checkIn  = String(q.checkIn  || '').trim();
  const checkOut = String(q.checkOut || '').trim();
  const adults   = Math.min(Math.max(parseInt(q.adults, 10) || 2, 1), 7);
  const children = Math.min(Math.max(parseInt(q.children, 10) || 0, 0), 6);
  const limit    = Math.min(Math.max(parseInt(q.limit, 10) || 20, 1), 50);
  const debug    = q.debug === '1';

  if (!/^[A-Z]{3}$/.test(destinationRaw)) {
    return res.status(400).json({ error: 'destination must be a 3-letter IATA code' });
  }
  if (!isValidIso(checkIn) || !isValidIso(checkOut)) {
    return res.status(400).json({ error: 'checkIn and checkOut must be YYYY-MM-DD' });
  }
  if (new Date(checkIn) >= new Date(checkOut)) {
    return res.status(400).json({ error: 'checkOut must be after checkIn' });
  }
  const cityEn = IATA_TO_CITY_EN[destinationRaw];
  if (!cityEn) {
    return res.status(400).json({ error: 'Unknown destination IATA: ' + destinationRaw });
  }

  // Region lookup
  const region = await searchRegion(cityEn);
  if (region.error) {
    return res.status(502).json({
      error: 'Region lookup failed',
      detail: region.error,
      hotels: [],
      destination: { iata: destinationRaw, cityEn },
      ...(debug ? { debug: region } : {})
    });
  }

  // Properties search
  const childrenAges = children > 0 ? Array(children).fill('8').join(',') : '';
  const propsResult = await searchProperties({
    regionId: region.regionId,
    checkIn, checkOut, adults, childrenAges,
    sortOrder: 'PRICE_LOW_TO_HIGH'
  });

  if (propsResult.error) {
    return res.status(502).json({
      error: 'Property search failed',
      detail: propsResult.error,
      hotels: [],
      destination: { iata: destinationRaw, cityEn, regionId: region.regionId },
      ...(debug ? { debug: { region, props: propsResult } } : {})
    });
  }

  const properties = propsResult.json && propsResult.json.data && propsResult.json.data.properties;
  const hotelsAll = (Array.isArray(properties) ? properties : [])
    .map(normalizeProperty)
    .filter(Boolean);

  // Slice to requested limit (provider returns up to ~200)
  const hotels = hotelsAll.slice(0, limit);

  // Faza 5 · Per-hotel distance fetch for top 5 (parallel, with city-center
  // coords from /v2/regions). Hotels 6-N stay with distanceToCenter: null.
  // Use allSettled so a single slow / failed detail call doesn't take down
  // the whole batch (each fetchHotelDetail returns null on error already,
  // but allSettled is the belt+braces guarantee).
  let distancesEnriched = 0;
  if (region.coords && hotels.length > 0) {
    const top5 = hotels.slice(0, Math.min(5, hotels.length));
    const settled = await Promise.allSettled(top5.map(h => fetchHotelDetail(h.id)));
    for (let i = 0; i < top5.length; i++) {
      const r = settled[i];
      const d = (r && r.status === 'fulfilled') ? r.value : null;
      if (d && isFinite(d.lat) && isFinite(d.lng)) {
        const km = haversineKm(region.coords.lat, region.coords.lng, d.lat, d.lng);
        top5[i].distanceToCenter = Math.round(km * 10) / 10; // 1 decimal place
        distancesEnriched++;
      }
    }
  }

  // Edge cache 1h. Vercel-specific CDN-Cache-Control engages the edge cache
  // even when the browser-facing Cache-Control says "always revalidate"
  // (which is what we want — prices can shift, browser shouldn't pin).
  res.setHeader('CDN-Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');

  return res.status(200).json({
    hotels,
    destination: {
      iata: destinationRaw,
      cityEn,
      regionId: region.regionId,
      coords: region.coords
    },
    meta: {
      totalReturned: hotelsAll.length,
      limit,
      marker: TP_MARKER,
      distancesEnriched,
      ...(debug ? { rateLimit: propsResult.rateLimit } : {})
    }
  });
}
