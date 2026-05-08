import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'node:fs';

const sa = JSON.parse(readFileSync('/home/zlfzr/letto-ai/.secrets/firebase-admin-sa.json','utf8'));
const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/datastore'] });
const t = (await (await auth.getClient()).getAccessToken()).token;
const NOW = new Date().toISOString();

// Helpers to build typed Firestore values matching Dubai's exact field set
const s = stringValue => ({ stringValue });
const i = n => ({ integerValue: String(n) });
const d = doubleValue => ({ doubleValue });
const b = booleanValue => ({ booleanValue });
const ts = timestampValue => ({ timestampValue });
const m = fields => ({ mapValue: { fields } });
const arr = vals => ({ arrayValue: { values: vals } });

function buildPkg(p) {
  return {
    fields: {
      id: s(p.id),
      status: s('published_premium'),
      transport: s('flight'),
      category: s(p.category),
      metadata: m({
        claudeRating: d(p.claudeRating),
        source: s('manual_seed_v8'),
        mvpSeed: b(false),
        createdAt: ts(NOW),
      }),
      origin: m({ code: s('BEG'), city: s('Belgrade') }),
      destination: m({ country: s(p.dest.country), city: s(p.dest.city), code: s(p.dest.code) }),
      dates: m({ departure: s(p.dates.departure), return: s(p.dates.return), nights: i(p.dates.nights) }),
      outbound: m({
        airline: s(p.outbound.airline),
        flightNumber: s(p.outbound.flightNumber),
        departureTime: s(p.outbound.departureTime),
        arrivalTime: s(p.outbound.arrivalTime),
        duration: s(p.outbound.duration),
        stops: i(p.outbound.stops),
        price: i(p.outbound.price),
        bookingPartner: s(p.outbound.bookingPartner),
        bookingUrl: s(p.outbound.bookingUrl),
      }),
      return: m({
        airline: s(p.return.airline),
        flightNumber: s(p.return.flightNumber),
        departureTime: s(p.return.departureTime),
        arrivalTime: s(p.return.arrivalTime),
        duration: s(p.return.duration),
        stops: i(p.return.stops),
        price: i(p.return.price),
        bookingPartner: s(p.return.bookingPartner),
        bookingUrl: s(p.return.bookingUrl),
      }),
      hotel: m({
        name: s(p.hotel.name),
        rating: i(p.hotel.rating),
        location: s(p.hotel.location),
        pricePerNight: i(p.hotel.pricePerNight),
        totalPrice: i(p.hotel.totalPrice),
        includes: arr(p.hotel.includes.map(s)),
        bookingPartner: s(p.hotel.bookingPartner),
        bookingUrl: s(p.hotel.bookingUrl),
      }),
      pricing: m({
        total: i(p.pricing.total),
        agencyReference: i(p.pricing.agencyReference),
        savings: i(p.pricing.savings),
        savingsPercent: i(p.pricing.savingsPercent),
      }),
      copy: m({
        en: m({
          meta: s(p.copy.en.meta),
          month: s(p.copy.en.month),
          outbound: s(p.copy.en.outbound),
          return: s(p.copy.en.return),
          stay: s(p.copy.en.stay),
        }),
        sr: m({
          meta: s(p.copy.sr.meta),
          month: s(p.copy.sr.month),
          outbound: s(p.copy.sr.outbound),
          return: s(p.copy.sr.return),
          stay: s(p.copy.sr.stay),
        }),
      }),
    },
  };
}

// Three premium packages — each ≥45% off, exotic/long-haul, claudeRating ≥ 8.0
const packages = [
  {
    id: 'pkg_beg_mle_20260601_5n',
    category: 'luxury',
    claudeRating: 8.5,
    dest: { country: 'Maldives', city: 'Male', code: 'MLE' },
    dates: { departure: '2026-06-01', return: '2026-06-06', nights: 5 },
    outbound: { airline: 'Qatar Airways', flightNumber: 'QR230/QR676', departureTime: '15:55', arrivalTime: '06:25', duration: '13h30m', stops: 1, price: 320, bookingPartner: 'qatarairways.com', bookingUrl: 'https://www.qatarairways.com' },
    return: { airline: 'Qatar Airways', flightNumber: 'QR677/QR229', departureTime: '08:00', arrivalTime: '20:10', duration: '13h10m', stops: 1, price: 310, bookingPartner: 'qatarairways.com', bookingUrl: 'https://www.qatarairways.com' },
    hotel: { name: 'Adaaran Select Hudhuranfushi', rating: 4, location: 'North Malé Atoll', pricePerNight: 96, totalPrice: 480, includes: ['all-inclusive','beach','wifi','snorkel'], bookingPartner: 'booking.com', bookingUrl: 'https://www.booking.com/hotel/mv/adaaran-select-hudhuran-fushi.html' },
    pricing: { total: 1110, agencyReference: 2150, savings: 1040, savingsPercent: 48 },
    copy: {
      en: { meta: 'Maldives · Beach', month: 'June 2026', outbound: 'Belgrade → Male · 1 stop · evening', return: 'Male → Belgrade · 1 stop · morning', stay: '5-night resort · 4★ · all-inclusive' },
      sr: { meta: 'Maldivi · Plaža', month: 'jun 2026', outbound: 'Beograd → Male · 1 presedanje · uveče', return: 'Male → Beograd · 1 presedanje · ujutro', stay: '5 noći resort · 4★ · all-inclusive' },
    },
  },
  {
    id: 'pkg_beg_nrt_20261105_7n',
    category: 'culture',
    claudeRating: 8.7,
    dest: { country: 'Japan', city: 'Tokyo', code: 'NRT' },
    dates: { departure: '2026-11-05', return: '2026-11-12', nights: 7 },
    outbound: { airline: 'Lufthansa', flightNumber: 'LH1411/LH710', departureTime: '06:45', arrivalTime: '11:25', duration: '15h40m', stops: 1, price: 360, bookingPartner: 'lufthansa.com', bookingUrl: 'https://www.lufthansa.com' },
    return: { airline: 'Lufthansa', flightNumber: 'LH711/LH1416', departureTime: '11:55', arrivalTime: '23:35', duration: '17h40m', stops: 1, price: 380, bookingPartner: 'lufthansa.com', bookingUrl: 'https://www.lufthansa.com' },
    hotel: { name: 'Shinjuku Granbell Hotel', rating: 4, location: 'Shinjuku', pricePerNight: 75, totalPrice: 525, includes: ['wifi','breakfast','metro-access'], bookingPartner: 'booking.com', bookingUrl: 'https://www.booking.com/hotel/jp/shinjuku-granbell.html' },
    pricing: { total: 1265, agencyReference: 2400, savings: 1135, savingsPercent: 47 },
    copy: {
      en: { meta: 'Japan · Culture', month: 'November 2026', outbound: 'Belgrade → Tokyo · 1 stop · morning', return: 'Tokyo → Belgrade · 1 stop · noon', stay: '7-night hotel · 4★ · Shinjuku' },
      sr: { meta: 'Japan · Kultura', month: 'novembar 2026', outbound: 'Beograd → Tokio · 1 presedanje · ujutro', return: 'Tokio → Beograd · 1 presedanje · u podne', stay: '7 noći hotel · 4★ · Shinjuku' },
    },
  },
  {
    id: 'pkg_beg_cpt_20261015_7n',
    category: 'adventure',
    claudeRating: 8.2,
    dest: { country: 'South Africa', city: 'Cape Town', code: 'CPT' },
    dates: { departure: '2026-10-15', return: '2026-10-22', nights: 7 },
    outbound: { airline: 'Qatar Airways', flightNumber: 'QR230/QR1369', departureTime: '15:55', arrivalTime: '13:50', duration: '17h55m', stops: 1, price: 340, bookingPartner: 'qatarairways.com', bookingUrl: 'https://www.qatarairways.com' },
    return: { airline: 'Qatar Airways', flightNumber: 'QR1368/QR229', departureTime: '17:25', arrivalTime: '20:10', duration: '17h45m', stops: 1, price: 330, bookingPartner: 'qatarairways.com', bookingUrl: 'https://www.qatarairways.com' },
    hotel: { name: 'The Commodore Hotel', rating: 4, location: 'V&A Waterfront', pricePerNight: 70, totalPrice: 490, includes: ['wifi','pool','breakfast','harbor-view'], bookingPartner: 'booking.com', bookingUrl: 'https://www.booking.com/hotel/za/the-commodore.html' },
    pricing: { total: 1160, agencyReference: 2150, savings: 990, savingsPercent: 46 },
    copy: {
      en: { meta: 'South Africa · Adventure', month: 'October 2026', outbound: 'Belgrade → Cape Town · 1 stop · evening', return: 'Cape Town → Belgrade · 1 stop · evening', stay: '7-night hotel · 4★ · V&A Waterfront' },
      sr: { meta: 'Južna Afrika · Avantura', month: 'oktobar 2026', outbound: 'Beograd → Kejptaun · 1 presedanje · uveče', return: 'Kejptaun → Beograd · 1 presedanje · uveče', stay: '7 noći hotel · 4★ · V&A Waterfront' },
    },
  },
];

const results = [];
for (const p of packages) {
  const url = `https://firestore.googleapis.com/v1/projects/letto-ai/databases/(default)/documents/letto_packages?documentId=${p.id}`;
  const body = buildPkg(p);
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  results.push({ id: p.id, http: r.status, ok: r.status === 200, name: j.name, error: j.error?.message });
  console.log(`[${p.id}] HTTP ${r.status} ${r.status === 200 ? 'OK' : 'ERR: ' + JSON.stringify(j.error)}`);
}
console.log('\n=== summary ===');
console.log(JSON.stringify(results, null, 2));
