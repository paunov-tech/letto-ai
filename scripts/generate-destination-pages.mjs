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

  // ── JSON-LD: Place + BreadcrumbList + ItemList ──
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Place',
        '@id':   canonical + '#place',
        name:    city,
        address: { '@type': 'PostalAddress', addressCountry: dest.country }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Letto', item: ORIGIN + '/' },
          { '@type': 'ListItem', position: 2, name: city, item: canonical }
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
</style>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
<noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=2513952102382319&ev=PageView&noscript=1"/></noscript>

<header class="hero">
  <p class="tag">${isSr ? 'Letto · pronalazimo ponude koje vredi videti' : 'Letto · we find deals worth seeing'}</p>
  <h1>${esc(t.h1)}</h1>
  ${heroCredit}
</header>

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
