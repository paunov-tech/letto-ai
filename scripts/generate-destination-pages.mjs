// scripts/generate-destination-pages.mjs — Build SR + EN landing pages
// for every entry in scripts/lib/destinations.mjs.
//
// Output (34 files):
//   public/letovi-{srSlug}.html   · SR primary
//   public/flights-{enSlug}.html  · EN sibling
//
// Run: `node scripts/generate-destination-pages.mjs`
// Or:  `npm run build:seo` (also runs sitemap generator)
//
// ── Optional runtime enrichment ─────────────────────────────────────
// If env vars are present, the page is enriched. Without them, a
// graceful fallback ships (gradient hero, link to /results for live
// deals, no Pexels image). Pages are SEO-complete either way.
//
//   FIREBASE_ADMIN_*  → top-5 deals per destination read from Firestore
//   PEXELS_KEY        → hero image from Pexels (city query)
//
// (Both are also used by other scripts/api routes · same env layer.)

import fs from 'node:fs';
import path from 'node:path';
import { DESTINATIONS } from './lib/destinations.mjs';
import { FAQ_DATA } from './lib/destinations-faq.mjs';

// v43-A · helpers for FAQPage rendering. Pure functions, no state.
const MONTH_NAMES_SR = ['januar','februar','mart','april','maj','jun','jul','avgust','septembar','oktobar','novembar','decembar'];
const MONTH_NAMES_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDuration(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return m + 'min';
  return m === 0 ? h + 'h' : h + 'h ' + m + 'min';
}

function formatMonths(months, isSr) {
  const names = isSr ? MONTH_NAMES_SR : MONTH_NAMES_EN;
  return months.map(m => names[m - 1]).join(', ');
}

// Builds the 5 FAQ Q/A objects per destination. Same template every page —
// the variation lives in the data (range, duration, months, visa note),
// which is the right level of pSEO repetition: each page has unique
// answers, identical structure → Google sees "consistent FAQ schema",
// users get destination-specific facts.
function buildFaqEntities({ faq, city, isSr }) {
  const dur = formatDuration(faq.flight_duration_min_from_beg);
  const months = formatMonths(faq.best_months, isSr);
  const [fmin, fmax] = faq.flight_price_eur_range_from_beg;
  const [hmin, hmax] = faq.hotel_price_eur_range_per_night;
  const visaText = isSr ? faq.visa_note_sr : faq.visa_note_en;

  if (isSr) return [
    { '@type': 'Question', name: 'Koliko košta let za ' + city + ' iz Beograda?',
      acceptedAnswer: { '@type': 'Answer',
        text: 'Tipičan raspon je €' + fmin + '–€' + fmax + ' u sezoni. Letto skenira deal-ove ispod €' + fmin + ' kad se ukažu (engine osvežava svaka 6 sata).' } },
    { '@type': 'Question', name: 'Koliko traje let Beograd–' + city + '?',
      acceptedAnswer: { '@type': 'Answer',
        text: 'Direktnim letom oko ' + dur + '. Sa presedanjem može biti znatno duže — Letto prikazuje obe opcije.' } },
    { '@type': 'Question', name: 'Kada je najbolja sezona za putovanje u ' + city + '?',
      acceptedAnswer: { '@type': 'Answer',
        text: 'Najpovoljniji meseci su ' + months + '. Tada su i cene i vreme u najboljoj kombinaciji.' } },
    { '@type': 'Question', name: 'Koliko košta hotel u ' + city + ' po noći?',
      acceptedAnswer: { '@type': 'Answer',
        text: 'Hoteli idu od €' + hmin + ' za budget 3★ kategoriju do €' + hmax + '+ za 5★ luksuz, po noći.' } },
    { '@type': 'Question', name: 'Da li je potrebna viza za ' + city + '?',
      acceptedAnswer: { '@type': 'Answer', text: visaText } },
  ];

  return [
    { '@type': 'Question', name: 'How much does a flight to ' + city + ' from Belgrade cost?',
      acceptedAnswer: { '@type': 'Answer',
        text: 'Typical range €' + fmin + '–€' + fmax + ' in season. Letto surfaces deals below €' + fmin + ' when they appear (engine refreshes every 6h).' } },
    { '@type': 'Question', name: 'How long is the Belgrade–' + city + ' flight?',
      acceptedAnswer: { '@type': 'Answer',
        text: 'About ' + dur + ' direct. With a connection it can be significantly longer — Letto shows both options.' } },
    { '@type': 'Question', name: 'When is the best season to visit ' + city + '?',
      acceptedAnswer: { '@type': 'Answer',
        text: 'Best months are ' + months + '. Price and weather align in this window.' } },
    { '@type': 'Question', name: 'How much is a hotel in ' + city + ' per night?',
      acceptedAnswer: { '@type': 'Answer',
        text: 'Hotels range from €' + hmin + ' (3★ budget) up to €' + hmax + '+ (5★ luxury) per night.' } },
    { '@type': 'Question', name: 'Do I need a visa for ' + city + '?',
      acceptedAnswer: { '@type': 'Answer', text: visaText } },
  ];
}

// v42 · per-IATA enrichment for Schema.org TouristDestination.
// City-centre coords (Wikipedia) + Schema.org-aligned tourist-type tags.
// Lookup kept here (not in destinations.mjs) so the SEO marketing
// categorisation can evolve independently of the route source-of-truth.
const GEO_TYPE_BY_IATA = {
  FCO: { lat: 41.9028, lng: 12.4964, types: ['Cultural travel', 'City breaks', 'Romantic getaways'] },
  PMI: { lat: 39.5696, lng:  2.6502, types: ['Beach holidays',  'Family travel', 'Mediterranean coast'] },
  ATH: { lat: 37.9838, lng: 23.7275, types: ['Cultural travel', 'Historical sites', 'City breaks'] },
  BCN: { lat: 41.3851, lng:  2.1734, types: ['City breaks',     'Cultural travel', 'Beach holidays'] },
  CDG: { lat: 48.8566, lng:  2.3522, types: ['Romantic getaways','Cultural travel', 'City breaks'] },
  MLA: { lat: 35.8989, lng: 14.5146, types: ['Cultural travel', 'Mediterranean coast', 'Historical sites'] },
  BUD: { lat: 47.4979, lng: 19.0402, types: ['City breaks',     'Wellness travel', 'Cultural travel'] },
  LIS: { lat: 38.7223, lng: -9.1393, types: ['City breaks',     'Cultural travel', 'Beach holidays'] },
  VIE: { lat: 48.2082, lng: 16.3738, types: ['Cultural travel', 'City breaks',     'Historical sites'] },
  DXB: { lat: 25.2048, lng: 55.2708, types: ['Luxury travel',   'Shopping',        'Family travel'] },
  SKG: { lat: 40.6401, lng: 22.9444, types: ['City breaks',     'Mediterranean coast', 'Cultural travel'] },
  IST: { lat: 41.0082, lng: 28.9784, types: ['Cultural travel', 'Historical sites', 'City breaks'] },
  MUC: { lat: 48.1351, lng: 11.5820, types: ['City breaks',     'Cultural travel', 'Food and drink'] },
  SPU: { lat: 43.5081, lng: 16.4402, types: ['Beach holidays',  'Adriatic coast',  'Cultural travel'] },
  DBV: { lat: 42.6507, lng: 18.0944, types: ['Cultural travel', 'Adriatic coast',  'Beach holidays'] },
  PRG: { lat: 50.0755, lng: 14.4378, types: ['Cultural travel', 'City breaks',     'Historical sites'] },
  TIA: { lat: 41.3275, lng: 19.8187, types: ['City breaks',     'Cultural travel', 'Mediterranean coast'] },
  AMS: { lat: 52.3676, lng:  4.9041, types: ['City breaks',     'Cultural travel', 'Nightlife'] },
  CMN: { lat: 33.5731, lng: -7.5898, types: ['Cultural travel', 'Beach holidays',  'City breaks'] },
  HER: { lat: 35.3387, lng: 25.1442, types: ['Beach holidays',  'Mediterranean coast', 'Cultural travel'] },
  IBZ: { lat: 38.9067, lng:  1.4206, types: ['Beach holidays',  'Nightlife',       'Mediterranean coast'] },
  LHR: { lat: 51.5074, lng: -0.1278, types: ['City breaks',     'Cultural travel', 'Shopping'] },
  MAD: { lat: 40.4168, lng: -3.7038, types: ['City breaks',     'Cultural travel', 'Nightlife'] },
};

const ORIGIN = 'https://letto.live';
const TODAY  = new Date().toISOString().slice(0, 10);
const PEXELS_KEY = process.env.PEXELS_KEY || '';
const FIREBASE_OK = !!(process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY);

// ── Optional Firestore — lazy-load only if env present ──
let _db = null;
async function getDb() {
  if (_db) return _db;
  if (!FIREBASE_OK) return null;
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: 'letto-ai',
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n')
      })
    });
  }
  _db = getFirestore();
  return _db;
}

// ── Optional Pexels — fetch one hero image per city ──
async function fetchPexelsHero(city) {
  if (!PEXELS_KEY) return null;
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(city)}&per_page=1&orientation=landscape`;
    const r = await fetch(url, { headers: { Authorization: PEXELS_KEY } });
    if (!r.ok) return null;
    const j = await r.json();
    const p = j.photos && j.photos[0];
    if (!p) return null;
    return {
      url: p.src.large2x || p.src.large || p.src.original,
      photographer: p.photographer || '',
      photographerUrl: p.photographer_url || '',
      alt: p.alt || city
    };
  } catch (e) {
    console.warn(`  ⚠ pexels fetch failed for ${city}:`, e.message);
    return null;
  }
}

// ── Optional Firestore deals — top 5 per IATA ──
async function fetchDeals(iata) {
  const db = await getDb();
  if (!db) return [];
  try {
    const snap = await db.collection('letto_packages')
      .where('destination_iata', '==', iata)
      .where('locked', '==', false)
      .orderBy('discount_pct', 'desc')
      .limit(5)
      .get();
    return snap.docs.map(d => ({
      city:    d.data().destination_city || iata,
      nights:  d.data().nights || 0,
      price:   d.data().pricing && d.data().pricing.total ? Math.round(d.data().pricing.total) : null,
      hotel:   d.data().hotel && d.data().hotel.name ? d.data().hotel.name : null,
      month:   d.data().dates && d.data().dates.depart ? d.data().dates.depart.slice(0, 7) : null,
      discount: d.data().discount_pct || null
    }));
  } catch (e) {
    console.warn(`  ⚠ firestore deals query failed for ${iata}:`, e.message);
    return [];
  }
}

// ── Escape helpers ──
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Page template ──
function renderPage({ dest, lang, hero, deals, otherDests }) {
  const isSr = lang === 'sr-Latn';
  const slug = isSr ? `letovi-${dest.srSlug}` : `flights-${dest.enSlug}`;
  const otherSlug = isSr ? `flights-${dest.enSlug}` : `letovi-${dest.srSlug}`;
  const city = isSr ? dest.srCity : dest.enCity;
  const intro = isSr ? dest.srIntro : dest.enIntro;
  const t = isSr ? {
    title:        `Letovi za ${city} iz Beograda · Letto`,
    description:  `Letovi za ${city} iz Beograda — Letto AI pronalazi sve ponude 30%+ ispod proseka. Premium pristup hotelima, Mix paketima, daily deals.`,
    h1:           `Letovi za ${city}`,
    dealsHeading: 'Trenutne ponude',
    cta:          `Plus paketi za ${city} →`,
    seeAll:       `Vidi sve ponude za ${city}`,
    otherTitle:   'Drugi gradovi',
    noDeals:      `Trenutno proveravamo ponude za ${city} — najbrži način je da odeš direktno na pretragu.`,
    perPerson:    'po osobi',
    nights:       n => n + ' noći'
  } : {
    title:        `Flights to ${city} from Belgrade · Letto`,
    description:  `Flights to ${city} from Belgrade — Letto AI finds every offer 30%+ below average. Premium access to hotels, Mix packages, daily deals.`,
    h1:           `Flights to ${city}`,
    dealsHeading: 'Current offers',
    cta:          `More packages to ${city} →`,
    seeAll:       `See all offers for ${city}`,
    otherTitle:   'Other cities',
    noDeals:      `We're refreshing offers for ${city} — fastest way is to jump straight into search.`,
    perPerson:    'per person',
    nights:       n => n + (n === 1 ? ' night' : ' nights')
  };
  const canonical = `${ORIGIN}/${slug}`;
  const altUrl    = `${ORIGIN}/${otherSlug}`;
  const resultsUrl = `${ORIGIN}/results?destination_iata=${dest.iata}`;

  // ── Hero block: Pexels image if available, otherwise CSS gradient ──
  const heroStyle = hero
    ? `background-image: linear-gradient(rgba(10,13,17,0.45), rgba(10,13,17,0.55)), url('${esc(hero.url)}'); background-size: cover; background-position: center;`
    : `background: linear-gradient(135deg, #1a2a3a 0%, #b8863b 50%, #1a2a3a 100%);`;
  const heroCredit = hero && hero.photographer
    ? `<p class="hero-credit">Photo: <a href="${esc(hero.photographerUrl)}" rel="noopener nofollow">${esc(hero.photographer)}</a> / Pexels</p>`
    : '';

  // ── Deals list ──
  const dealsHtml = deals && deals.length
    ? `<ul class="deals-list">${deals.map(d => `
      <li class="deal">
        <div class="deal-meta">${d.discount ? '−' + d.discount + '% · ' : ''}${d.nights ? t.nights(d.nights) + ' · ' : ''}${d.month || ''}</div>
        ${d.hotel ? `<div class="deal-hotel">${esc(d.hotel)}</div>` : ''}
        ${d.price ? `<div class="deal-price">€${d.price} <span>${t.perPerson}</span></div>` : ''}
      </li>`).join('')}</ul>`
    : `<p class="deals-empty">${t.noDeals}</p>`;

  // ── Other destinations ──
  const otherLinks = otherDests.map(o => {
    const oSlug = isSr ? `letovi-${o.srSlug}` : `flights-${o.enSlug}`;
    const oCity = isSr ? o.srCity : o.enCity;
    return `<a href="/${oSlug}">${esc(oCity)}</a>`;
  }).join(' · ');

  // ── JSON-LD: Place + TouristDestination + FAQPage + BreadcrumbList + ItemList ──
  // v42 · TouristDestination is the rich-result-friendly type Google uses
  // for travel SERP features (city carousel, "things to do"). Place stays
  // for the basic geo entity reference; TouristDestination layers on
  // touristType + description + attractions for marketing categorisation.
  // v43-A · FAQPage adds the 5-Q/A block for FAQ rich results + AI Overview
  // citation eligibility.
  const geo = GEO_TYPE_BY_IATA[dest.iata];
  const faq = FAQ_DATA[dest.iata];
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Place',
        '@id':   canonical + '#place',
        name:    city,
        address: { '@type': 'PostalAddress', addressCountry: dest.country },
        ...(geo ? { geo: { '@type': 'GeoCoordinates', latitude: geo.lat, longitude: geo.lng } } : {})
      },
      ...(geo ? [{
        '@type':              'TouristDestination',
        '@id':                canonical + '#destination',
        name:                 city,
        description:          intro,
        url:                  canonical,
        image:                ORIGIN + '/og.png',   // v43-A · single shared OG until per-dest pipeline (v44+)
        isAccessibleForFree:  false,
        publicAccess:         true,
        address:              { '@type': 'PostalAddress', addressCountry: dest.country },
        geo:                  { '@type': 'GeoCoordinates', latitude: geo.lat, longitude: geo.lng },
        touristType:          geo.types,
        includesAttraction:   (faq && faq.attractions && faq.attractions.length)
          ? faq.attractions.map(a => ({ '@type': 'TouristAttraction', name: isSr ? a.name_sr : a.name_en }))
          : { '@id': canonical + '#place' },
      }] : []),
      // v43-A · FAQPage · 5 Q/A per destination, data sourced from
      // FAQ_DATA[iata]. Identical question shape across all 23 destinations
      // gives Google a consistent schema to crawl; the answers are
      // destination-specific so each page carries unique information gain.
      ...(faq ? [{
        '@type':    'FAQPage',
        '@id':      canonical + '#faq',
        mainEntity: buildFaqEntities({ faq, city, isSr }),
      }] : []),
      {
        // v41 · 3-level breadcrumb · Home → All deals (#deals anchor) → city.
        // /#deals is a real anchor on the homepage carousel, so the middle
        // crumb is a clickable hop, not a 404 trap (we don't have a
        // dedicated /destinations index page).
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: isSr ? 'Početna' : 'Home',          item: ORIGIN + '/' },
          { '@type': 'ListItem', position: 2, name: isSr ? 'Sve ponude' : 'All deals', item: ORIGIN + '/#deals' },
          { '@type': 'ListItem', position: 3, name: city,                                item: canonical }
        ]
      },
      ...(deals && deals.length ? [{
        '@type': 'ItemList',
        name: t.dealsHeading + ' · ' + city,
        numberOfItems: deals.length,
        itemListElement: deals.map((d, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: (d.hotel || city) + (d.nights ? ', ' + d.nights + ' nights' : '')
        }))
      }] : [])
    ]
  };

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(t.title)}</title>
<meta name="description" content="${esc(t.description)}" />
<link rel="canonical" href="${canonical}" />
<link rel="alternate" hreflang="sr-Latn"   href="${isSr ? canonical : altUrl}" />
<link rel="alternate" hreflang="en"        href="${isSr ? altUrl : canonical}" />
<link rel="alternate" hreflang="x-default" href="${isSr ? canonical : altUrl}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${esc(t.title)}" />
<meta property="og:description" content="${esc(t.description)}" />
<meta property="og:url" content="${canonical}" />
${hero ? `<meta property="og:image" content="${esc(hero.url)}" />` : ''}
<script src="/consent.js" defer></script>
<script src="/pixel.js" defer></script>
<script src="/ga4.js" defer></script>
<script src="/gtm.js" defer></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'IBM Plex Sans', -apple-system, sans-serif; color: #1f1a16; background: #fffdf7; line-height: 1.5; }
  a { color: #A17433; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .hero { ${heroStyle} color: #fff; padding: 80px 24px; text-align: center; min-height: 320px; display: flex; flex-direction: column; justify-content: center; }
  .hero h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: clamp(36px, 6vw, 64px); font-weight: 500; margin-bottom: 12px; text-shadow: 0 2px 12px rgba(0,0,0,0.4); }
  .hero p.tag { font-family: 'JetBrains Mono', monospace; font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; opacity: 0.85; margin-bottom: 24px; }
  .hero-credit { font-size: 11px; opacity: 0.6; margin-top: auto; }
  main { max-width: 720px; margin: 0 auto; padding: 48px 24px; }
  .intro { font-size: 18px; line-height: 1.65; color: #3d342c; margin-bottom: 40px; }
  h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 28px; font-weight: 500; margin-bottom: 20px; color: #1f1a16; }
  .deals-list { list-style: none; }
  .deal { border-top: 1px solid #e8dfca; padding: 16px 0; display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; }
  .deal:last-child { border-bottom: 1px solid #e8dfca; }
  .deal-meta { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #8a8076; }
  .deal-hotel { font-weight: 500; font-size: 15px; }
  .deal-price { font-family: 'JetBrains Mono', monospace; font-size: 18px; color: #7C5B22; font-weight: 600; text-align: right; }
  .deal-price span { font-size: 11px; color: #8a8076; font-weight: 400; display: block; }
  .deals-empty { color: #8a8076; font-style: italic; padding: 16px 0; }
  .cta-wrap { margin: 40px 0 32px; text-align: center; }
  .cta { display: inline-block; background: linear-gradient(135deg, #f0c674 0%, #b8863b 100%); color: #1f1a16; padding: 16px 32px; border-radius: 10px; font-weight: 600; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; box-shadow: 0 6px 20px rgba(184, 134, 59, 0.32); transition: transform 0.2s; }
  .cta:hover { transform: translateY(-2px); text-decoration: none; }
  .other { border-top: 1px solid #e8dfca; padding-top: 32px; margin-top: 48px; }
  .other h2 { font-size: 18px; margin-bottom: 12px; }
  .other-links { font-size: 14px; color: #8a8076; line-height: 1.9; }
  .other-links a { color: #A17433; }
  footer { text-align: center; padding: 32px 24px 48px; color: #8a8076; font-size: 12px; }
  footer a { color: #A17433; }
  /* v41 · breadcrumb nav · slim line between hero and main content. */
  .breadcrumbs { padding: 12px 16px; font-size: 13px; color: #5C6470; max-width: 720px; margin: 0 auto; }
  .breadcrumbs ol { list-style: none; padding: 0; margin: 0; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .breadcrumbs li { display: flex; align-items: center; }
  .breadcrumbs li + li::before { content: "›"; margin-right: 8px; color: #b8b1a0; font-size: 16px; }
  .breadcrumbs a { color: #5C6470; text-decoration: none; }
  .breadcrumbs a:hover { color: #A17433; text-decoration: underline; }
  .breadcrumbs li[aria-current="page"] { color: #1F2226; font-weight: 500; }
  @media (max-width: 480px) { .breadcrumbs { font-size: 12px; padding: 10px 14px; } }
</style>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-TR2FLLW8" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=2513952102382319&ev=PageView&noscript=1"/></noscript>

<header class="hero">
  <p class="tag">${isSr ? 'Letto · pronalazimo ponude koje vredi videti' : 'Letto · we find deals worth seeing'}</p>
  <h1>${esc(t.h1)}</h1>
  ${heroCredit}
</header>

<nav class="breadcrumbs" aria-label="${isSr ? 'Putanja' : 'Breadcrumb'}">
  <ol>
    <li><a href="/">${isSr ? 'Početna' : 'Home'}</a></li>
    <li><a href="/#deals">${isSr ? 'Sve ponude' : 'All deals'}</a></li>
    <li aria-current="page">${esc(city)}</li>
  </ol>
</nav>

<main>
  <p class="intro">${esc(intro)}</p>

  <h2>${esc(t.dealsHeading)}</h2>
  ${dealsHtml}

  <div class="cta-wrap">
    <a class="cta" href="${resultsUrl}">${esc(t.cta)}</a>
  </div>

  <section class="other">
    <h2>${esc(t.otherTitle)}</h2>
    <p class="other-links">${otherLinks}</p>
  </section>
</main>

<footer>
  <p><a href="/">${isSr ? 'Početna' : 'Home'}</a> · <a href="/results">${isSr ? 'Sve ponude' : 'All offers'}</a> · <a href="/about">${isSr ? 'O nama' : 'About'}</a></p>
  <p style="margin-top:8px;">© ${new Date().getFullYear()} SIAL Consulting d.o.o. · Brežice, Slovenia</p>
</footer>
</body>
</html>
`;
}

// ── Main loop ──
async function main() {
  console.log(`=== generate-destination-pages · ${TODAY} ===`);
  console.log(`  Pexels enrichment: ${PEXELS_KEY ? 'ON' : 'OFF (no PEXELS_KEY)'}`);
  console.log(`  Firestore deals:   ${FIREBASE_OK ? 'ON' : 'OFF (no FIREBASE_ADMIN_*)'}`);
  console.log('');

  const outDir = path.resolve('public');
  let total = 0;
  for (const dest of DESTINATIONS) {
    const [hero, deals] = await Promise.all([
      fetchPexelsHero(dest.enCity),
      fetchDeals(dest.iata)
    ]);
    const otherDests = DESTINATIONS.filter(d => d.iata !== dest.iata).slice(0, 8);

    const srHtml = renderPage({ dest, lang: 'sr-Latn', hero, deals, otherDests });
    const enHtml = renderPage({ dest, lang: 'en',      hero, deals, otherDests });
    const srPath = path.join(outDir, `letovi-${dest.srSlug}.html`);
    const enPath = path.join(outDir, `flights-${dest.enSlug}.html`);
    fs.writeFileSync(srPath, srHtml);
    fs.writeFileSync(enPath, enHtml);
    total += 2;

    const tags = [
      hero ? '🖼' : '·',
      deals.length ? `📋${deals.length}` : '·'
    ].join(' ');
    console.log(`  ${dest.iata}  ${dest.srSlug.padEnd(12)} ${dest.enSlug.padEnd(15)} ${tags}`);
  }
  console.log(`\n✓ ${total} pages written to public/letovi-*.html + public/flights-*.html`);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
