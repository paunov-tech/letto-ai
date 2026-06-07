// lib/pseo-render.js — server-side HTML render for Letto landing pages
// (v43-C pSEO engine + v44-E1 premium template · ONE design, two modes).
//
// Modes (auto-detected by presence of page.origin_code):
//   pSEO mode        · origin→dest pair  → "Letovi iz {origin} za {dest}"
//                      served live by api/pseo-route.js from Firestore.
//   destination mode · dest only (no origin_code) → "Letovi za {dest}"
//                      pre-rendered by scripts/generate-destination-pages.mjs
//                      into the 46 static /letovi-*.html + /flights-*.html.
// Both share every pixel of CSS/JS below — edit once, both surfaces update.
//
// renderPseoPage is SYNCHRONOUS: live prices are NOT baked into the cached HTML
// — they load client-side via the LivePriceCard fetch to /api/packages (with
// the &auth=1 + X-Letto-Session marker, so premium callers don't get a CDN-
// scrubbed response). For SEO/bots, destination pages may pass page.lastKnown
// {flightFrom, hotelFrom} → a grounded "last checked" line is server-rendered
// (S1 anti-thin-content fallback) and KEPT if the live fetch fails.
//
// v44-E1 visual layer: photo hero + duotone + grain, Fraunces/Instrument Serif/
// IBM Plex/JetBrains hierarchy (Cormorant dropped), deal cards with count-up +
// gold skeleton shimmer + burgundy "ulovili smo" badge, compass-rose divider,
// gold-chevron FAQ, image-tile mini-grid, staggered reveal — every animation
// gated by prefers-reduced-motion. Gold text < 18px uses --gold-deep (≈5:1).

import { createRequire } from 'node:module';
import { buildSlug, originByCode, destByIata, ORIGINS } from './pseo-slug.js';
import { DESTINATIONS } from '../scripts/lib/destinations.mjs';
import { VIBES } from '../data/pseo-enums.js';
import { destFacts } from './pseo-data.js';

// Self-hosted hero manifest (scripts/optimize-images.mjs) — { [iata]: {base,
// width, height, credit, creditUrl, altEn} }. require() so Vercel's bundler
// traces it into the lambda and it loads in both Node and the static generator.
const require = createRequire(import.meta.url);
const HERO_MANIFEST = require('../data/dest-hero-manifest.json');

const ORIGIN = 'https://letto.live';
const MONTH_NAMES_SR = ['januar','februar','mart','april','maj','jun','jul','avgust','septembar','oktobar','novembar','decembar'];
const MONTH_NAMES_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const TILE_GRADIENTS = 4;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function vibeByCode(code) { return code ? VIBES.find(v => v.code === code) || null : null; }

function monthDisplay(monthSlug, isSr) {
  if (!monthSlug) return null;
  const m = monthSlug.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const names = isSr ? MONTH_NAMES_SR : MONTH_NAMES_EN;
  return `${names[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

function fmtDate(ms, isSr) {
  const d = new Date(ms || Date.now());
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return isSr ? `${dd}.${mm}.${yyyy}.` : `${yyyy}-${mm}-${dd}`;
}

// Hero image resolution (v44-C). Prefers the self-hosted AVIF/WebP/JPEG set from
// HERO_MANIFEST[iata] (rendered as a <picture> srcset). Falls back to an explicit
// page.hero {url,alt,...}, then to the convention JPEG path. Alt is per-language
// (S3): EN uses the descriptive Pexels caption; SR gets a clean Serbian alt
// (generic-but-accurate "panorama grada" — never the English "Beautiful view…").
function resolveHero(page, dest, city, isSr) {
  const alt = isSr ? `${city} — panorama grada` : null;
  const m = HERO_MANIFEST[dest.iata];
  if (m) {
    return {
      mode: 'picture', base: m.base, width: m.width, height: m.height,
      credit: m.credit || null, creditUrl: m.creditUrl || null,
      alt: alt || m.altEn || `${city} skyline`,
      ogImage: ORIGIN + m.base + '-1600.jpg',
    };
  }
  if (page.hero && page.hero.url) {
    return {
      mode: 'img', url: page.hero.url, alt: page.hero.alt || alt || `${city} skyline`,
      credit: page.hero.credit || null, creditUrl: page.hero.creditUrl || null,
      ogImage: page.hero.url.startsWith('http') ? page.hero.url : ORIGIN + page.hero.url,
    };
  }
  const conv = `/img/dest/${dest.enSlug}-900.jpg`;
  return { mode: 'img', url: conv, alt: alt || `${city} skyline`, credit: null, creditUrl: null, ogImage: ORIGIN + conv };
}

// <picture> srcset markup (AVIF → WebP → JPEG fallback) or a plain <img>.
function heroMarkup(hero) {
  const common = `class="hero-img" alt="${esc(hero.alt)}" fetchpriority="high" decoding="async"`;
  if (hero.mode === 'picture') {
    const ss = ext => `${hero.base}-480.${ext} 480w, ${hero.base}-900.${ext} 900w, ${hero.base}-1600.${ext} 1600w`;
    return `<picture>
    <source type="image/avif" srcset="${ss('avif')}" sizes="100vw">
    <source type="image/webp" srcset="${ss('webp')}" sizes="100vw">
    <img ${common} src="${hero.base}-900.jpg" srcset="${ss('jpg')}" sizes="100vw" width="${hero.width}" height="${hero.height}">
  </picture>`;
  }
  return `<img ${common} src="${esc(hero.url)}" width="1200" height="627">`;
}

// Dest-landing slug for a destination in a given language.
function destLandingSlug(d, isSr) { return isSr ? `letovi-${d.srSlug}` : `flights-${d.enSlug}`; }

// Compact compass-rose divider (self-contained; no shared SVG sprite needed).
const COMPASS_DIVIDER = `<svg class="compass-divider" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <defs><linearGradient id="cdg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#7C5B22"/><stop offset="35%" stop-color="#D9A94A"/>
          <stop offset="50%" stop-color="#F0D795"/><stop offset="65%" stop-color="#D9A94A"/>
          <stop offset="100%" stop-color="#7C5B22"/></linearGradient></defs>
        <circle cx="50" cy="50" r="46" fill="none" stroke="url(#cdg)" stroke-width="1"/>
        <circle cx="50" cy="50" r="40" fill="none" stroke="url(#cdg)" stroke-width="0.4" opacity="0.6"/>
        <g stroke="url(#cdg)" stroke-width="1.4"><line x1="50" y1="6" x2="50" y2="94"/><line x1="6" y1="50" x2="94" y2="50"/></g>
        <g stroke="url(#cdg)" stroke-width="0.6" opacity="0.7"><line x1="19" y1="19" x2="81" y2="81"/><line x1="81" y1="19" x2="19" y2="81"/></g>
        <circle cx="50" cy="50" r="4" fill="url(#cdg)"/>
      </svg>`;
const divider = () => `<div class="divider"><span class="rule"></span>${COMPASS_DIVIDER}<span class="rule"></span></div>`;

/**
 * Render a stored PseoPage (pSEO mode) OR a destination-landing page object
 * (destination mode, no origin_code) to a full HTML document string.
 * @param {object} page
 * @returns {string} HTML
 */
export function renderPseoPage(page) {
  const lang = page.lang === 'en' ? 'en' : 'sr';
  const isSr = lang === 'sr';
  const isDest = !page.origin_code; // destination-landing mode

  const dest = destByIata(page.dest_iata);
  if (!dest) throw new Error(`renderPseoPage · unknown dest in page ${page.slug || page.dest_iata}`);
  const origin = isDest ? null : originByCode(page.origin_code);
  if (!isDest && !origin) throw new Error(`renderPseoPage · unknown origin in page ${page.slug}`);

  const vibe = isDest ? null : vibeByCode(page.vibe_code);
  const monthSlug = isDest ? null : (page.monthSlug || null);
  const monthName = monthDisplay(monthSlug, isSr);
  const facts = destFacts(dest.iata, lang);

  const city = isSr ? dest.srCity : dest.enCity;
  const originGen = origin ? (isSr ? origin.name_sr_gen : origin.name_en) : null;
  const originNom = origin ? (isSr ? origin.name_sr : origin.name_en) : null;
  const hero = resolveHero(page, dest, city, isSr);

  // ── slugs / canonical / hreflang sibling ──
  const slug = page.slug || (isDest
    ? destLandingSlug(dest, isSr)
    : buildSlug({ lang, origin, dest, vibe, monthSlug }));
  const siblingSlug = isDest
    ? destLandingSlug(dest, !isSr)
    : buildSlug({ lang: isSr ? 'en' : 'sr', origin, dest, vibe, monthSlug });
  const canonical = `${ORIGIN}/${slug}`;
  const siblingHref = `${ORIGIN}/${siblingSlug}`;

  // ── H1 / title / description ──
  const base = isDest
    ? (isSr ? `Letovi za ${city}` : `Flights to ${city}`)
    : (isSr ? `Letovi iz ${originGen} za ${city}` : `Flights from ${originNom} to ${city}`);
  const suffixParts = [vibe ? (isSr ? vibe.name_sr : vibe.name_en) : null, monthName].filter(Boolean);
  const h1 = suffixParts.length ? `${base} · ${suffixParts.join(' · ')}` : base;
  const title = `${h1} · Letto`;
  const tagline = isSr
    ? (facts.durationText ? `Direktan let ~${facts.durationText} · ponude ~30% ispod proseka` : 'Ponude ~30% ispod proseka, osvežene svakih 6h')
    : (facts.durationText ? `Direct ~${facts.durationText} · deals ~30% below average` : 'Deals ~30% below average, refreshed every 6h');
  const description = isSr
    ? `${base}${monthName ? ' (' + monthName + ')' : ''} — Letto skenira 50+ izvora svaka 6h i čuva samo ponude ~30% ispod proseka. Plus hoteli, Mix paketi, daily deals.`
    : `${base}${monthName ? ' (' + monthName + ')' : ''} — Letto scans 50+ sources every 6h and keeps only offers ~30% below average. Plus hotels, Mix packages, daily deals.`;

  // ── copy → paragraphs ──
  const copyHtml = String(page.copy || '')
    .split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p>${esc(p)}</p>`).join('\n      ');

  // ── FAQ accordion + FAQPage schema entities ──
  const faqs = Array.isArray(page.faqs) ? page.faqs.filter(f => f && f.q && f.a) : [];
  const faqHtml = faqs.map(f => `
        <details class="faq-item reveal">
          <summary>${esc(f.q)}<span class="faq-chev" aria-hidden="true"></span></summary>
          <div class="faq-a">${esc(f.a)}</div>
        </details>`).join('');
  const faqEntities = faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }));

  // ── localized strings ──
  const t = isSr ? {
    crumbHome: 'Početna', crumbAll: 'Sve ponude',
    priceHeading: 'Trenutne ponude', perPkg: 'paket',
    priceEmpty: `Trenutno proveravamo ponude za ${city} — najbrži način je da otvoriš Mix.`,
    lastChecked: (f, h) => `Poslednja provera: ${f ? 'let od €' + f : ''}${f && h ? ' · ' : ''}${h ? 'hotel od €' + h + '/noć' : ''}`,
    dealBadge: 'Ulovili smo %PCT% ispod proseka',
    byline: `Urednik: Miroslav Paunov · Ažurirano ${fmtDate(page.generatedAt, true)}`,
    faqHeading: 'Česta pitanja', relHeading: 'Drugi gradovi', relSameDest: `Za ${city} iz drugih gradova`,
    cta: 'Otvori Letto Mix →',
    nlHeading: 'Dobij najbolje ponude na email', nlCopy: 'Šaljemo 1–3 odabrana deala nedeljno. Bez spama, 1 klik odjava.',
    nlBtn: 'Prijavi se', nlPh: 'email@adresa.com', nlDone: 'Hvala — prijava primljena.',
    footerHome: 'Početna', footerAll: 'Sve ponude', footerAbout: 'O nama', photoBy: 'Foto',
  } : {
    crumbHome: 'Home', crumbAll: 'All deals',
    priceHeading: 'Current offers', perPkg: 'package',
    priceEmpty: `We're checking offers for ${city} — fastest way is to open Mix.`,
    lastChecked: (f, h) => `Last checked: ${f ? 'flights from €' + f : ''}${f && h ? ' · ' : ''}${h ? 'hotels from €' + h + '/night' : ''}`,
    dealBadge: 'Caught %PCT% below average',
    byline: `Editor: Miroslav Paunov · Updated ${fmtDate(page.generatedAt, false)}`,
    faqHeading: 'Frequently asked', relHeading: 'Other cities', relSameDest: `To ${city} from other cities`,
    cta: 'Open Letto Mix →',
    nlHeading: 'Get the best deals by email', nlCopy: 'We send 1–3 hand-picked deals a week. No spam, one-click unsubscribe.',
    nlBtn: 'Sign up', nlPh: 'email@address.com', nlDone: 'Thanks — you\'re signed up.',
    footerHome: 'Home', footerAll: 'All offers', footerAbout: 'About', photoBy: 'Photo',
  };

  // ── related routes / mini-grid ──
  let tiles, relRowHtml = '';
  if (isDest) {
    tiles = DESTINATIONS.filter(d => d.iata !== dest.iata).slice(0, 6)
      .map((d, i) => ({ slug: destLandingSlug(d, isSr), label: isSr ? d.srCity : d.enCity, g: i % TILE_GRADIENTS }));
  } else {
    tiles = DESTINATIONS.filter(d => d.iata !== dest.iata && d.iata !== origin.code).slice(0, 6)
      .map((d, i) => ({ slug: buildSlug({ lang, origin, dest: d }), label: isSr ? d.srCity : d.enCity, g: i % TILE_GRADIENTS }));
    const sameDest = ORIGINS.filter(o => o.code !== origin.code && o.code !== dest.iata).slice(0, 3)
      .map(o => `<a href="/${buildSlug({ lang, origin: o, dest })}">${esc(isSr ? `${o.name_sr} → ${city}` : `${o.name_en} → ${city}`)}</a>`).join(' · ');
    relRowHtml = `<p class="rel-row"><strong>${esc(t.relSameDest)}:</strong> ${sameDest}</p>`;
  }
  const tileHtml = tiles.map(r => `
          <a class="tile tile-g${r.g}" href="/${r.slug}"><span class="tile-name">${esc(r.label)}</span></a>`).join('');

  // ── JSON-LD @graph: Place + TouristDestination + FAQPage + Offer + BreadcrumbList ──
  const geo = facts.geo;
  const heroAbs = hero.ogImage;
  const flightLow = facts.flightRange ? facts.flightRange[0] : null;
  const flightHigh = facts.flightRange ? facts.flightRange[1] : null;
  const hotelHigh = facts.hotelRange ? facts.hotelRange[1] : null;
  // priceValidUntil at RENDER time (now + 30d), NOT generatedAt-derived — pre-gen
  // writes generatedAt once but pages live for months; render-time keeps the
  // CDN-refreshed Offer from going permanently "expired" (which Google suppresses).
  const validUntil = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const graph = [
    { '@type': 'Place', '@id': canonical + '#place', name: city,
      address: { '@type': 'PostalAddress', addressCountry: dest.country },
      ...(geo ? { geo: { '@type': 'GeoCoordinates', latitude: geo.lat, longitude: geo.lng } } : {}) },
    ...(geo ? [{
      '@type': 'TouristDestination', '@id': canonical + '#destination',
      name: city, description, url: canonical, image: heroAbs,
      isAccessibleForFree: false, publicAccess: true,
      address: { '@type': 'PostalAddress', addressCountry: dest.country },
      geo: { '@type': 'GeoCoordinates', latitude: geo.lat, longitude: geo.lng },
      touristType: geo.types,
      includesAttraction: facts.attractions.length
        ? facts.attractions.map(a => ({ '@type': 'TouristAttraction', name: a }))
        : { '@id': canonical + '#place' },
    }] : []),
    ...(faqEntities.length ? [{ '@type': 'FAQPage', '@id': canonical + '#faq', mainEntity: faqEntities }] : []),
    ...(flightLow != null ? [{
      '@type': 'Offer', '@id': canonical + '#offer', name: base,
      priceCurrency: 'EUR', price: String(flightLow), priceValidUntil: validUntil,
      availability: 'https://schema.org/InStock', url: canonical,
      priceSpecification: { '@type': 'PriceSpecification', priceCurrency: 'EUR', minPrice: flightLow,
        ...(flightHigh != null && hotelHigh != null ? { maxPrice: flightHigh + hotelHigh } : {}) },
      itemOffered: { '@id': canonical + '#destination' },
    }] : []),
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: isSr ? 'Početna' : 'Home', item: ORIGIN + '/' },
      { '@type': 'ListItem', position: 2, name: isSr ? 'Sve ponude' : 'All deals', item: ORIGIN + '/#deals' },
      { '@type': 'ListItem', position: 3, name: h1, item: canonical },
    ] },
  ];
  const ld = { '@context': 'https://schema.org', '@graph': graph };

  // ── live-deals server content: last-known line (S1) or skeletons ──
  const lk = page.lastKnown || null;
  const dealsInner = (lk && (lk.flightFrom || lk.hotelFrom))
    ? `<p class="deals-note">${esc(t.lastChecked(lk.flightFrom, lk.hotelFrom))}</p>`
    : `<div class="skel"></div><div class="skel"></div><div class="skel"></div>`;

  const mixUrl = isDest ? `${ORIGIN}/results?destination_iata=${dest.iata}` : `${ORIGIN}/results?origin=${origin.code}&dest=${dest.iata}`;
  const contentId = isDest ? dest.iata : `${origin.code}-${dest.iata}`;
  const contentType = isDest ? 'destination' : 'pseo_destination';

  return `<!DOCTYPE html>
<html lang="${isSr ? 'sr-Latn' : 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${canonical}" />
<link rel="alternate" hreflang="sr-Latn"   href="${isSr ? canonical : siblingHref}" />
<link rel="alternate" hreflang="en"        href="${isSr ? siblingHref : canonical}" />
<link rel="alternate" hreflang="x-default" href="${isSr ? canonical : siblingHref}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${esc(heroAbs)}" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://images.pexels.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,900;1,9..144,400&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<script src="/consent.js" defer></script>
<script src="/pixel.js" defer></script>
<script src="/ga4.js" defer></script>
<script src="/gtm.js" defer></script>
<style>
  :root {
    --paper: #F5EFE0; --paper-warm: #EEE4CB; --paper-deep: #E4D6B5;
    --ink: #0A0D11; --ink-soft: #191D22; --ink-mid: #333840;
    --line-soft: #DCD1B3;
    --gold-deep: #7C5B22; --gold: #A17433; --gold-mid: #C9963E; --gold-light: #D9A94A; --gold-bright: #F0D795;
    --burgundy: #6B1A25; --burgundy-warm: #8B2A3A;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'IBM Plex Sans', -apple-system, sans-serif; color: var(--ink-soft); background: var(--paper); line-height: 1.6; -webkit-font-smoothing: antialiased; }
  a { color: var(--gold-deep); text-decoration: none; }
  a:hover { text-decoration: underline; }
  ::selection { background: var(--gold); color: var(--ink); }
  .grain::after { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 1; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.92' numOctaves='3'/%3E%3CfeColorMatrix values='0 0 0 0 0.05 0 0 0 0 0.04 0 0 0 0 0.03 0 0 0 0.08 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E"); opacity: 0.5; mix-blend-mode: multiply; }

  .hero { position: relative; min-height: 55vh; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; background: linear-gradient(135deg, #1A1F25, #0A0D11); }
  .hero-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
  .hero::before { content: ''; position: absolute; inset: 0; z-index: 2; background:
    linear-gradient(180deg, rgba(10,13,17,0.55) 0%, rgba(10,13,17,0.15) 45%, rgba(10,13,17,0.78) 100%),
    radial-gradient(120% 80% at 50% 30%, transparent 55%, rgba(124,91,34,0.35) 100%); }
  .hero-inner { position: relative; z-index: 3; max-width: 1100px; width: 100%; margin: 0 auto; padding: 0 32px 44px; }
  .hero .eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.26em; text-transform: uppercase; color: var(--gold-light); margin-bottom: 14px; }
  .hero h1 { font-family: 'Fraunces', Georgia, serif; font-weight: 900; font-size: clamp(2.6rem, 7vw, 5rem); line-height: 1.02; color: var(--paper); text-shadow: 0 2px 24px rgba(0,0,0,0.5); letter-spacing: -0.01em; }
  .hero .tagline { font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-size: clamp(1.1rem, 2.4vw, 1.6rem); color: var(--gold-light); margin-top: 12px; text-shadow: 0 1px 12px rgba(0,0,0,0.5); }
  .photo-credit { position: absolute; right: 12px; bottom: 8px; z-index: 3; font-size: 10px; color: rgba(245,239,224,0.6); }
  .photo-credit a { color: rgba(245,239,224,0.75); }

  .breadcrumbs { background: var(--paper-warm); border-bottom: 1px solid var(--line-soft); }
  .breadcrumbs ol { list-style: none; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; max-width: 1100px; margin: 0 auto; padding: 11px 32px; font-size: 13px; color: var(--ink-mid); }
  .breadcrumbs li { display: flex; align-items: center; }
  .breadcrumbs li + li::before { content: "›"; margin-right: 8px; color: var(--gold); }
  .breadcrumbs a { color: var(--ink-mid); }
  .breadcrumbs li[aria-current="page"] { color: var(--gold-deep); font-weight: 600; }

  main { max-width: 760px; margin: 0 auto; padding: 52px 32px; }
  h2 { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: clamp(1.6rem, 3.4vw, 2.1rem); color: var(--ink); margin-bottom: 22px; letter-spacing: -0.01em; }
  .intro { font-size: 1.075rem; line-height: 1.72; color: var(--ink-mid); }
  .intro p { margin-bottom: 16px; }
  .byline { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.04em; color: var(--gold-deep); margin: 4px 0 8px; }

  .divider { display: flex; align-items: center; justify-content: center; gap: 18px; margin: 48px 0; }
  .divider .rule { height: 1px; flex: 1; background: linear-gradient(90deg, transparent, var(--line-soft), transparent); }
  .compass-divider { width: 48px; height: 48px; opacity: 0.45; flex: none; }
  @media (prefers-reduced-motion: no-preference) { .compass-divider { animation: spin 90s linear infinite; } }
  @keyframes spin { to { transform: rotate(360deg); } }

  .deals { display: grid; gap: 14px; }
  .deal { position: relative; display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; background: var(--paper-warm); border: 1px solid var(--gold-deep); border-radius: 14px; padding: 18px 20px; transition: transform .25s cubic-bezier(.16,1,.3,1), box-shadow .25s, border-color .25s; }
  .deal:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(161,116,51,0.18); border-color: var(--gold); }
  .deal-meta { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-mid); }
  .deal-badge { display: inline-flex; align-items: center; gap: 5px; margin-top: 8px; background: var(--burgundy); color: var(--paper); font-size: 10px; font-weight: 600; letter-spacing: 0.04em; padding: 3px 9px; border-radius: 999px; }
  .deal-badge svg { width: 11px; height: 11px; stroke: var(--gold-light); fill: none; }
  .deal-price { font-family: 'JetBrains Mono', monospace; font-size: 1.5rem; color: var(--gold-deep); font-weight: 600; text-align: right; white-space: nowrap; }
  .deal-price .per { display: block; font-size: 10px; color: var(--ink-mid); font-weight: 400; letter-spacing: 0.04em; }
  .deal-price .deal-rsd { display: block; font-size: 12px; font-weight: 400; color: var(--ink-mid); margin-top: 2px; }
  .deals-empty { color: var(--ink-mid); font-style: italic; padding: 8px 0; }
  .deals-note { color: var(--gold-deep); font-family: 'JetBrains Mono', monospace; font-size: 13px; letter-spacing: 0.02em; padding: 14px 16px; background: var(--paper-warm); border: 1px dashed var(--gold-deep); border-radius: 12px; }
  .skel { height: 78px; border-radius: 14px; background: linear-gradient(100deg, var(--paper-warm) 30%, var(--paper-deep) 50%, var(--paper-warm) 70%); background-size: 200% 100%; }
  @media (prefers-reduced-motion: no-preference) { .skel { animation: shimmer 1.3s ease-in-out infinite; } }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  .cta-wrap { margin: 40px 0 8px; text-align: center; }
  .cta { display: inline-block; position: relative; overflow: hidden; background: linear-gradient(135deg, #7C5B22, #A17433 30%, #F0D795 50%, #A17433 70%, #7C5B22); background-size: 200% 100%; color: var(--ink); padding: 16px 34px; border-radius: 12px; font-weight: 600; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; box-shadow: 0 6px 22px rgba(124,91,34,0.32); transition: transform .2s; }
  .cta:hover { transform: translateY(-2px); text-decoration: none; }
  @media (prefers-reduced-motion: no-preference) { .cta:hover { animation: foil .8s ease; } }
  @keyframes foil { 0% { background-position: 0% 0; } 100% { background-position: 100% 0; } }

  .faq { margin-top: 8px; }
  .faq-item { border-top: 1px solid var(--line-soft); }
  .faq-item:last-child { border-bottom: 1px solid var(--line-soft); }
  .faq-item summary { cursor: pointer; padding: 16px 0; font-family: 'Instrument Serif', Georgia, serif; font-size: 1.25rem; color: var(--ink); list-style: none; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .faq-item summary::-webkit-details-marker { display: none; }
  .faq-chev { width: 12px; height: 12px; border-right: 2px solid var(--gold); border-bottom: 2px solid var(--gold); transform: rotate(45deg); transition: transform .25s ease; flex: none; }
  .faq-item[open] .faq-chev { transform: rotate(225deg); }
  .faq-item[open] { background: var(--paper-deep); border-radius: 10px; padding: 0 14px; margin: 0 -14px; }
  .faq-a { padding: 0 0 18px; color: var(--ink-mid); font-size: 0.98rem; line-height: 1.65; }

  .tile-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .tile { position: relative; aspect-ratio: 4 / 3; border-radius: 12px; overflow: hidden; display: flex; align-items: flex-end; padding: 12px; border: 1px solid var(--line-soft); transition: transform .25s, box-shadow .25s; }
  .tile:hover { transform: translateY(-3px); box-shadow: 0 10px 26px rgba(10,13,17,0.18); text-decoration: none; }
  .tile::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 35%, rgba(10,13,17,0.7)); }
  .tile-name { position: relative; z-index: 1; font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.05rem; color: var(--paper); text-shadow: 0 1px 8px rgba(0,0,0,0.5); }
  .tile-g0 { background: linear-gradient(135deg, #1A2A3A, #6B1A25); }
  .tile-g1 { background: linear-gradient(135deg, #7C5B22, #1A1F25); }
  .tile-g2 { background: linear-gradient(135deg, #333840, #A17433); }
  .tile-g3 { background: linear-gradient(135deg, #6B1A25, #C9963E); }
  .rel-row { margin-top: 18px; font-size: 0.9rem; color: var(--ink-mid); }
  .rel-row a { color: var(--gold-deep); }

  .newsletter { background: var(--paper-warm); border: 1px solid var(--line-soft); border-radius: 16px; padding: 28px; margin-top: 8px; }
  .newsletter h2 { font-size: 1.4rem; margin-bottom: 6px; }
  .newsletter p { font-size: 0.92rem; color: var(--ink-mid); margin-bottom: 14px; }
  .nl-form { display: flex; gap: 8px; flex-wrap: wrap; }
  .nl-form input { flex: 1 1 220px; min-width: 0; background: var(--paper); border: 1px solid var(--gold-deep); border-radius: 9px; padding: 12px 14px; font-family: inherit; font-size: 14px; color: var(--ink); }
  .nl-form input:focus { outline: 2px solid var(--gold); border-color: var(--gold); }
  .nl-form button { background: var(--ink); color: var(--paper); border: 0; border-radius: 9px; padding: 12px 22px; font-weight: 600; font-size: 14px; cursor: pointer; }
  .nl-done { color: #2f6b3a; font-size: 14px; margin-top: 10px; }

  footer { text-align: center; padding: 36px 24px 52px; color: var(--ink-mid); font-size: 12px; border-top: 1px solid var(--line-soft); margin-top: 56px; }
  footer a { color: var(--gold-deep); }

  .reveal { opacity: 0; transform: translateY(16px); transition: opacity .6s ease, transform .6s ease; }
  .reveal.in { opacity: 1; transform: none; }
  .hero .eyebrow, .hero h1, .hero .tagline { opacity: 0; animation: fadeUp .7s cubic-bezier(.16,1,.3,1) forwards; }
  .hero .eyebrow { animation-delay: 0ms; } .hero h1 { animation-delay: 80ms; } .hero .tagline { animation-delay: 160ms; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

  @media (prefers-reduced-motion: reduce) {
    .reveal, .hero .eyebrow, .hero h1, .hero .tagline { opacity: 1 !important; transform: none !important; animation: none !important; transition: none !important; }
    .compass-divider, .skel, .cta { animation: none !important; }
  }
  @media (max-width: 600px) { .tile-grid { grid-template-columns: repeat(2, 1fr); } main { padding: 40px 22px; } }
</style>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-TR2FLLW8" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=2513952102382319&ev=PageView&noscript=1"/></noscript>

<header class="hero grain">
  ${heroMarkup(hero)}
  <div class="hero-inner">
    <p class="eyebrow">Letto · ${esc(isSr ? 'pronalazimo ponude koje vredi videti' : 'we find deals worth seeing')}</p>
    <h1>${esc(h1)}</h1>
    <p class="tagline">${esc(tagline)}</p>
  </div>
  ${hero.credit ? `<p class="photo-credit">${esc(t.photoBy)}: ${hero.creditUrl ? `<a href="${esc(hero.creditUrl)}" rel="nofollow noopener" target="_blank">${esc(hero.credit)}</a>` : esc(hero.credit)} / Pexels</p>` : ''}
</header>

<nav class="breadcrumbs" aria-label="${isSr ? 'Putanja' : 'Breadcrumb'}">
  <ol>
    <li><a href="/">${t.crumbHome}</a></li>
    <li><a href="/#deals">${t.crumbAll}</a></li>
    <li aria-current="page">${esc(base)}</li>
  </ol>
</nav>

<main>
  <section class="intro reveal">
      ${copyHtml || ''}
  </section>
  <p class="byline">${esc(t.byline)}</p>

  ${divider()}

  <section class="reveal">
    <h2>${esc(t.priceHeading)}</h2>
    <div id="live-prices" class="deals" data-origin="${origin ? origin.code : ''}" data-dest="${dest.iata}"
         data-perpkg="${esc(t.perPkg)}" data-empty="${esc(t.priceEmpty)}" data-badge="${esc(t.dealBadge)}">
      ${dealsInner}
    </div>
    <div class="cta-wrap"><a class="cta" href="${esc(mixUrl)}">${esc(t.cta)}</a></div>
  </section>

  ${divider()}

  <section class="faq reveal">
    <h2>${esc(t.faqHeading)}</h2>
    ${faqHtml}
  </section>

  ${divider()}

  <section class="reveal">
    <h2>${esc(t.relHeading)}</h2>
    <div class="tile-grid">${tileHtml}</div>
    ${relRowHtml}
  </section>

  <section class="newsletter reveal">
    <h2>${esc(t.nlHeading)}</h2>
    <p>${esc(t.nlCopy)}</p>
    <form class="nl-form" id="nl-form" novalidate>
      <input type="email" name="email" placeholder="${esc(t.nlPh)}" required aria-label="${esc(t.nlPh)}">
      <button type="submit">${esc(t.nlBtn)}</button>
    </form>
    <p class="nl-done" id="nl-done" hidden>${esc(t.nlDone)}</p>
  </section>
</main>

<footer>
  <p><a href="/">${t.footerHome}</a> · <a href="/results">${t.footerAll}</a> · <a href="/about">${t.footerAbout}</a></p>
  <p style="margin-top:8px;">© ${new Date().getUTCFullYear()} SIAL Consulting d.o.o. · Brežice, Slovenia</p>
</footer>

<script>
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var reveals = [].slice.call(document.querySelectorAll('.reveal'));
  if (reduce || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  }

  function countUp(el, value) {
    if (reduce || !value) { el.textContent = '€' + value; return; }
    var start = null, dur = 600;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = '€' + Math.round(value * eased);
      if (p < 1) requestAnimationFrame(step); else el.textContent = '€' + value;
    }
    requestAnimationFrame(step);
  }

  function fireVC(tries) {
    if (window.lettoTrackPixel && window.fbq && window.fbq.loaded) {
      window.lettoTrackPixel('ViewContent', { content_type: '${contentType}', content_ids: ['${contentId}'] });
    } else if ((tries || 0) < 40) {
      setTimeout(function () { fireVC((tries || 0) + 1); }, 150);
    }
  }
  fireVC(0);

  // LivePriceCard · keeps any server-rendered last-known note (S1) if the live
  // fetch returns nothing / fails — only swaps to the empty message when there
  // was no server note to preserve.
  var box = document.getElementById('live-prices');
  if (box) {
    var origin = box.getAttribute('data-origin');
    var dest = box.getAttribute('data-dest');
    var perPkg = box.getAttribute('data-perpkg');
    var emptyMsg = box.getAttribute('data-empty');
    var badgeTpl = box.getAttribute('data-badge');
    var hadNote = !!box.querySelector('.deals-note');
    function keepOrEmpty() { if (!hadNote) box.innerHTML = '<p class="deals-empty">' + emptyMsg + '</p>'; }
    var sid = null;
    try { sid = localStorage.getItem('letto_premium_session') || localStorage.getItem('letto_mix_session'); } catch (e) {}
    var qs = (origin ? 'origin=' + encodeURIComponent(origin) + '&' : '') + 'dest=' + encodeURIComponent(dest) + '&limit=3' + (sid ? '&auth=1' : '');
    var opts = { headers: { 'Accept': 'application/json' } };
    if (sid) opts.headers['X-Letto-Session'] = sid;
    fetch('/api/packages?' + qs, opts)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        var arr = (data && Array.isArray(data.packages)) ? data.packages : [];
        if (!arr.length) { keepOrEmpty(); return; }
        box.innerHTML = '';
        arr.slice(0, 3).forEach(function (p) {
          var price = p && p.pricing && p.pricing.total ? Math.round(p.pricing.total) : null;
          var nights = (p && p.nights) || (p && p.dates && p.dates.nights) || null;
          var disc = (p && (p.discountPct || p.savingsPct)) || (p && p.pricing && p.pricing.discountPct) || null;
          var dep = (p && p.dates && p.dates.departure) ? p.dates.departure : '';
          var meta = [nights ? (nights + (${isSr ? "' noći'" : "(nights === 1 ? ' night' : ' nights')"})) : '', dep].filter(Boolean).join(' · ');
          var badge = disc ? '<span class="deal-badge"><svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>' + badgeTpl.replace('%PCT%', Math.round(disc) + '%') + '</span>' : '';
          var el = document.createElement('div');
          el.className = 'deal';
          ${isSr
            ? "var rsd = price ? '<span class=\"deal-rsd\">\\u2248 ' + (Math.round(price * 117.2 / 100) * 100).toLocaleString('de-DE') + ' RSD</span>' : '';"
            : "var rsd = '';"}
          el.innerHTML = '<div><div class="deal-meta">' + meta + '</div>' + badge + '</div>' +
            '<div class="deal-price"><span class="amt">' + (price ? '€' + price : '—') + '</span>' + rsd + '<span class="per">' + perPkg + '</span></div>';
          box.appendChild(el);
          if (price) countUp(el.querySelector('.amt'), price);
        });
      })
      .catch(function () { keepOrEmpty(); });
  }

  var nf = document.getElementById('nl-form');
  if (nf) {
    nf.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = (nf.email.value || '').trim();
      if (!email || email.indexOf('@') < 1) return;
      if (window.lettoSetPixelEmail) window.lettoSetPixelEmail(email);
      fetch('/api/lead-capture', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, source: 'catalog' }) }).catch(function () {});
      if (window.lettoTrackPixel) window.lettoTrackPixel('Lead', { content_name: 'pseo_newsletter' });
      nf.hidden = true;
      var done = document.getElementById('nl-done'); if (done) done.hidden = false;
    });
  }
})();
</script>
</body>
</html>
`;
}

// Thin alias for the static generator — same renderer, destination mode.
export function renderDestinationPage(page) { return renderPseoPage(page); }
