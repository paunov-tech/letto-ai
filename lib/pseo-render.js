// lib/pseo-render.js — server-side HTML render for a pSEO landing page (v43-C).
//
// Input is the stored PseoPage doc (see lib/pseo-storage.js) — identity by
// CODES (origin_code, dest_iata, vibe_code, monthSlug) plus generated content
// (copy, faqs). We reconstruct the full origin/dest/vibe objects in-memory so
// the Firestore doc stays small. Output is a complete, self-contained HTML
// document that visually matches the existing /letovi-* landing pages.
//
// renderPseoPage is SYNCHRONOUS: live prices are NOT baked into the cached
// HTML — they load client-side via the LivePriceCard fetch to /api/packages
// (with the &auth=1 + X-Letto-Session marker, so premium callers don't get a
// CDN-scrubbed response). Schema Offer uses the destination's grounded EUR
// ranges, not live prices, so the cached doc and the JSON-LD never drift.

import { buildSlug, originByCode, destByIata, ORIGINS } from './pseo-slug.js';
import { DESTINATIONS } from '../scripts/lib/destinations.mjs';
import { VIBES } from '../data/pseo-enums.js';
import { destFacts } from './pseo-data.js';

const ORIGIN = 'https://letto.live';
const MONTH_NAMES_SR = ['januar','februar','mart','april','maj','jun','jul','avgust','septembar','oktobar','novembar','decembar'];
const MONTH_NAMES_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

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

// Deterministic related routes: N other dests on the same origin, N other
// origins to the same dest. Self excluded; always base 2-axis links.
function relatedRoutes({ lang, origin, dest }, n = 3) {
  const sameOrigin = DESTINATIONS
    .filter(d => d.iata !== dest.iata && d.iata !== origin.code)
    .slice(0, n)
    .map(d => ({
      slug: buildSlug({ lang, origin, dest: d }),
      label: lang === 'en' ? d.enCity : d.srCity,
    }));
  const sameDest = ORIGINS
    .filter(o => o.code !== origin.code && o.code !== dest.iata)
    .slice(0, n)
    .map(o => ({
      slug: buildSlug({ lang, origin: o, dest }),
      label: lang === 'en'
        ? `${o.name_en} → ${dest.enCity}`
        : `${o.name_sr} → ${dest.srCity}`,
    }));
  return { sameOrigin, sameDest };
}

/**
 * Render a stored PseoPage to a full HTML document string.
 * @param {object} page  PseoPage doc
 * @returns {string} HTML
 */
export function renderPseoPage(page) {
  const lang = page.lang === 'en' ? 'en' : 'sr';
  const isSr = lang === 'sr';
  const origin = originByCode(page.origin_code);
  const dest = destByIata(page.dest_iata);
  if (!origin || !dest) {
    // Should never happen (handler validates on write) — fail loud, not silent.
    throw new Error(`renderPseoPage · unknown origin/dest in stored page ${page.slug}`);
  }
  const vibe = vibeByCode(page.vibe_code);
  const monthSlug = page.monthSlug || null;
  const monthName = monthDisplay(monthSlug, isSr);
  const facts = destFacts(dest.iata, lang);

  const slug = page.slug || buildSlug({ lang, origin, dest, vibe, monthSlug });
  const canonical = `${ORIGIN}/${slug}`;
  const siblingHref = `${ORIGIN}/${buildSlug({ lang: isSr ? 'en' : 'sr', origin, dest, vibe, monthSlug })}`;

  const originGen = isSr ? origin.name_sr_gen : origin.name_en;
  const originNom = isSr ? origin.name_sr : origin.name_en;
  const city = isSr ? dest.srCity : dest.enCity;

  // ── H1 / title / description ──
  const base = isSr ? `Letovi iz ${originGen} za ${city}` : `Flights from ${originNom} to ${city}`;
  const suffixParts = [vibe ? (isSr ? vibe.name_sr : vibe.name_en) : null, monthName].filter(Boolean);
  const h1 = suffixParts.length ? `${base} · ${suffixParts.join(' · ')}` : base;
  const title = `${h1} · Letto`;
  const description = isSr
    ? `${base}${monthName ? ' (' + monthName + ')' : ''} — Letto skenira 50+ izvora svaka 6h i čuva samo ponude ~30% ispod proseka. Plus hoteli, Mix paketi, daily deals.`
    : `${base}${monthName ? ' (' + monthName + ')' : ''} — Letto scans 50+ sources every 6h and keeps only offers ~30% below average. Plus hotels, Mix packages, daily deals.`;

  // ── copy → paragraphs ──
  const copyHtml = String(page.copy || '')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${esc(p)}</p>`)
    .join('\n      ');

  // ── FAQ accordion + FAQPage schema entities ──
  const faqs = Array.isArray(page.faqs) ? page.faqs.filter(f => f && f.q && f.a) : [];
  const faqHtml = faqs.map(f => `
      <details class="faq-item">
        <summary>${esc(f.q)}</summary>
        <div class="faq-a">${esc(f.a)}</div>
      </details>`).join('');
  const faqEntities = faqs.map(f => ({
    '@type': 'Question', name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  }));

  // ── related routes ──
  const related = relatedRoutes({ lang, origin, dest });
  const relatedOriginHtml = related.sameOrigin.map(r => `<a href="/${r.slug}">${esc(r.label)}</a>`).join(' · ');
  const relatedDestHtml = related.sameDest.map(r => `<a href="/${r.slug}">${esc(r.label)}</a>`).join(' · ');

  // ── JSON-LD @graph: Place + TouristDestination + FAQPage + Offer + BreadcrumbList ──
  const geo = facts.geo;
  const flightLow = facts.flightRange ? facts.flightRange[0] : null;
  const flightHigh = facts.flightRange ? facts.flightRange[1] : null;
  const hotelHigh = facts.hotelRange ? facts.hotelRange[1] : null;
  const validUntil = new Date((page.generatedAt || Date.now()) + 30 * 86400000).toISOString().slice(0, 10);

  const graph = [
    {
      '@type': 'Place', '@id': canonical + '#place', name: city,
      address: { '@type': 'PostalAddress', addressCountry: dest.country },
      ...(geo ? { geo: { '@type': 'GeoCoordinates', latitude: geo.lat, longitude: geo.lng } } : {}),
    },
    ...(geo ? [{
      '@type': 'TouristDestination', '@id': canonical + '#destination',
      name: city, description, url: canonical, image: ORIGIN + '/og.png',
      isAccessibleForFree: false, publicAccess: true,
      address: { '@type': 'PostalAddress', addressCountry: dest.country },
      geo: { '@type': 'GeoCoordinates', latitude: geo.lat, longitude: geo.lng },
      touristType: geo.types,
      includesAttraction: facts.attractions.length
        ? facts.attractions.map(a => ({ '@type': 'TouristAttraction', name: a }))
        : { '@id': canonical + '#place' },
    }] : []),
    ...(faqEntities.length ? [{
      '@type': 'FAQPage', '@id': canonical + '#faq', mainEntity: faqEntities,
    }] : []),
    ...(flightLow != null ? [{
      '@type': 'Offer', '@id': canonical + '#offer',
      name: base,
      priceCurrency: 'EUR',
      price: String(flightLow),
      priceValidUntil: validUntil,
      availability: 'https://schema.org/InStock',
      url: canonical,
      priceSpecification: {
        '@type': 'PriceSpecification', priceCurrency: 'EUR',
        minPrice: flightLow,
        ...(flightHigh != null && hotelHigh != null ? { maxPrice: flightHigh + hotelHigh } : {}),
      },
      itemOffered: { '@id': canonical + '#destination' },
    }] : []),
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: isSr ? 'Početna' : 'Home', item: ORIGIN + '/' },
        { '@type': 'ListItem', position: 2, name: isSr ? 'Sve ponude' : 'All deals', item: ORIGIN + '/#deals' },
        { '@type': 'ListItem', position: 3, name: h1, item: canonical },
      ],
    },
  ];
  const ld = { '@context': 'https://schema.org', '@graph': graph };

  // ── localized strings ──
  const t = isSr ? {
    tag: 'Letto · pronalazimo ponude koje vredi videti',
    crumbHome: 'Početna', crumbAll: 'Sve ponude',
    priceHeading: 'Trenutne ponude', priceLoading: `Učitavam aktuelne ponude za ${city}…`,
    priceEmpty: `Trenutno proveravamo ponude za ${city} — najbrži način je da otvoriš Mix.`,
    perPkg: 'paket', nights: n => n + ' noći',
    byline: `Urednik: Miroslav Paunov · Ažurirano ${fmtDate(page.generatedAt, true)}`,
    faqHeading: 'Česta pitanja', relHeading: 'Povezane rute',
    relSameOrigin: `Iz ${originGen} još`, relSameDest: `Za ${city} iz drugih gradova`,
    cta: 'Otvori Letto Mix →',
    nlHeading: 'Dobij najbolje ponude na email',
    nlCopy: 'Šaljemo 1–3 odabrana deala nedeljno. Bez spama, 1 klik odjava.',
    nlBtn: 'Prijavi se', nlPh: 'email@adresa.com', nlDone: 'Hvala — prijava primljena.',
    footerHome: 'Početna', footerAll: 'Sve ponude', footerAbout: 'O nama',
  } : {
    tag: 'Letto · we find deals worth seeing',
    crumbHome: 'Home', crumbAll: 'All deals',
    priceHeading: 'Current offers', priceLoading: `Loading current offers for ${city}…`,
    priceEmpty: `We're checking offers for ${city} — fastest way is to open Mix.`,
    perPkg: 'package', nights: n => n + (n === 1 ? ' night' : ' nights'),
    byline: `Editor: Miroslav Paunov · Updated ${fmtDate(page.generatedAt, false)}`,
    faqHeading: 'Frequently asked', relHeading: 'Related routes',
    relSameOrigin: `More from ${originNom}`, relSameDest: `To ${city} from other cities`,
    cta: 'Open Letto Mix →',
    nlHeading: 'Get the best deals by email',
    nlCopy: 'We send 1–3 hand-picked deals a week. No spam, one-click unsubscribe.',
    nlBtn: 'Sign up', nlPh: 'email@address.com', nlDone: 'Thanks — you\'re signed up.',
    footerHome: 'Home', footerAll: 'All offers', footerAbout: 'About',
  };

  const mixUrl = `${ORIGIN}/results?origin=${origin.code}&dest=${dest.iata}`;
  const contentId = `${origin.code}-${dest.iata}`;

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
<meta property="og:image" content="${ORIGIN}/og.png" />
<script src="/consent.js" defer></script>
<script src="/pixel.js" defer></script>
<script src="/ga4.js" defer></script>
<script src="/gtm.js" defer></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'IBM Plex Sans', -apple-system, sans-serif; color: #1f1a16; background: #fffdf7; line-height: 1.5; }
  a { color: #A17433; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .hero { background: linear-gradient(135deg, #1a2a3a 0%, #b8863b 50%, #1a2a3a 100%); color: #fff; padding: 72px 24px; text-align: center; min-height: 300px; display: flex; flex-direction: column; justify-content: center; }
  .hero h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: clamp(32px, 5.5vw, 58px); font-weight: 500; margin-bottom: 12px; text-shadow: 0 2px 12px rgba(0,0,0,0.4); }
  .hero p.tag { font-family: 'JetBrains Mono', monospace; font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; opacity: 0.85; margin-bottom: 24px; }
  main { max-width: 720px; margin: 0 auto; padding: 40px 24px; }
  .intro { font-size: 18px; line-height: 1.65; color: #3d342c; margin-bottom: 16px; }
  .intro p { margin-bottom: 16px; }
  .byline { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.04em; color: #8a8076; margin: 0 0 40px; }
  h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 28px; font-weight: 500; margin-bottom: 20px; color: #1f1a16; }
  .price-list { list-style: none; }
  .deal { border-top: 1px solid #e8dfca; padding: 16px 0; display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; }
  .deal:last-child { border-bottom: 1px solid #e8dfca; }
  .deal-meta { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #8a8076; }
  .deal-price { font-family: 'JetBrains Mono', monospace; font-size: 18px; color: #7C5B22; font-weight: 600; text-align: right; }
  .deal-price span { font-size: 11px; color: #8a8076; font-weight: 400; display: block; }
  .deals-empty { color: #8a8076; font-style: italic; padding: 16px 0; }
  .cta-wrap { margin: 36px 0 12px; text-align: center; }
  .cta { display: inline-block; background: linear-gradient(135deg, #f0c674 0%, #b8863b 100%); color: #1f1a16; padding: 16px 32px; border-radius: 10px; font-weight: 600; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; box-shadow: 0 6px 20px rgba(184, 134, 59, 0.32); transition: transform 0.2s; }
  .cta:hover { transform: translateY(-2px); text-decoration: none; }
  .faq { margin-top: 48px; }
  .faq-item { border-top: 1px solid #e8dfca; padding: 4px 0; }
  .faq-item:last-child { border-bottom: 1px solid #e8dfca; }
  .faq-item summary { cursor: pointer; padding: 14px 0; font-weight: 500; font-size: 16px; list-style: none; }
  .faq-item summary::-webkit-details-marker { display: none; }
  .faq-item summary::after { content: '+'; float: right; color: #A17433; font-size: 20px; line-height: 1; }
  .faq-item[open] summary::after { content: '−'; }
  .faq-a { padding: 0 0 16px; color: #3d342c; font-size: 15px; line-height: 1.6; }
  .related { border-top: 1px solid #e8dfca; padding-top: 32px; margin-top: 48px; }
  .related h2 { font-size: 18px; margin-bottom: 8px; }
  .related h3 { font-size: 12px; font-family: 'JetBrains Mono', monospace; letter-spacing: 0.06em; text-transform: uppercase; color: #8a8076; margin: 16px 0 6px; }
  .related-links { font-size: 14px; color: #8a8076; line-height: 1.9; }
  .newsletter { border-top: 1px solid #e8dfca; padding-top: 32px; margin-top: 48px; }
  .newsletter h2 { font-size: 18px; margin-bottom: 6px; }
  .newsletter p { font-size: 14px; color: #5C6470; margin-bottom: 14px; }
  .nl-form { display: flex; gap: 8px; flex-wrap: wrap; }
  .nl-form input { flex: 1 1 220px; min-width: 0; background: #fff; border: 1px solid #E4D9BC; border-radius: 8px; padding: 11px 14px; font-family: inherit; font-size: 14px; color: #1F2226; }
  .nl-form input:focus { outline: 1px solid #A17433; border-color: #A17433; }
  .nl-form button { background: #1f1a16; color: #fff; border: 0; border-radius: 8px; padding: 11px 20px; font-weight: 600; font-size: 14px; cursor: pointer; }
  .nl-done { color: #4a7c46; font-size: 14px; margin-top: 10px; }
  footer { text-align: center; padding: 32px 24px 48px; color: #8a8076; font-size: 12px; }
  footer a { color: #A17433; }
  .breadcrumbs { padding: 12px 16px; font-size: 13px; color: #5C6470; max-width: 720px; margin: 0 auto; }
  .breadcrumbs ol { list-style: none; padding: 0; margin: 0; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .breadcrumbs li { display: flex; align-items: center; }
  .breadcrumbs li + li::before { content: "›"; margin-right: 8px; color: #b8b1a0; font-size: 16px; }
  .breadcrumbs a { color: #5C6470; }
  .breadcrumbs li[aria-current="page"] { color: #1F2226; font-weight: 500; }
  @media (max-width: 480px) { .breadcrumbs { font-size: 12px; padding: 10px 14px; } }
</style>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-TR2FLLW8" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=2513952102382319&ev=PageView&noscript=1"/></noscript>

<header class="hero">
  <p class="tag">${esc(t.tag)}</p>
  <h1>${esc(h1)}</h1>
</header>

<nav class="breadcrumbs" aria-label="${isSr ? 'Putanja' : 'Breadcrumb'}">
  <ol>
    <li><a href="/">${t.crumbHome}</a></li>
    <li><a href="/#deals">${t.crumbAll}</a></li>
    <li aria-current="page">${esc(base)}</li>
  </ol>
</nav>

<main>
  <section class="intro">
      ${copyHtml || ''}
  </section>
  <p class="byline">${esc(t.byline)}</p>

  <h2>${esc(t.priceHeading)}</h2>
  <div id="live-prices" data-origin="${origin.code}" data-dest="${dest.iata}">
    <p class="deals-empty">${esc(t.priceLoading)}</p>
  </div>

  <div class="cta-wrap">
    <a class="cta" href="${esc(mixUrl)}">${esc(t.cta)}</a>
  </div>

  <section class="faq">
    <h2>${esc(t.faqHeading)}</h2>
    ${faqHtml}
  </section>

  <section class="related">
    <h2>${esc(t.relHeading)}</h2>
    <h3>${esc(t.relSameOrigin)}</h3>
    <p class="related-links">${relatedOriginHtml}</p>
    <h3>${esc(t.relSameDest)}</h3>
    <p class="related-links">${relatedDestHtml}</p>
  </section>

  <section class="newsletter">
    <h2>${esc(t.nlHeading)}</h2>
    <p>${esc(t.nlCopy)}</p>
    <form class="nl-form" id="nl-form" novalidate>
      <input type="email" name="email" placeholder="${esc(t.nlPh)}" required>
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
  // ── Pixel ViewContent (consent-gated via lettoTrackPixel) ──
  function fireVC(tries) {
    if (window.lettoTrackPixel && window.fbq && window.fbq.loaded) {
      window.lettoTrackPixel('ViewContent', { content_type: 'pseo_destination', content_ids: ['${contentId}'] });
    } else if ((tries || 0) < 40) {
      setTimeout(function () { fireVC((tries || 0) + 1); }, 150);
    }
  }
  fireVC(0);

  // ── LivePriceCard · fetch /api/packages with the &auth=1 + X-Letto-Session
  //    marker so premium callers don't hit the CDN-scrubbed cache key. ──
  var box = document.getElementById('live-prices');
  if (box) {
    var origin = box.getAttribute('data-origin');
    var dest = box.getAttribute('data-dest');
    var sid = null;
    try { sid = localStorage.getItem('letto_premium_session') || localStorage.getItem('letto_mix_session'); } catch (e) {}
    var qs = 'origin=' + encodeURIComponent(origin) + '&dest=' + encodeURIComponent(dest) + '&limit=3' + (sid ? '&auth=1' : '');
    var opts = { headers: { 'Accept': 'application/json' } };
    if (sid) opts.headers['X-Letto-Session'] = sid;
    fetch('/api/packages?' + qs, opts)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        var arr = (data && Array.isArray(data.packages)) ? data.packages : [];
        if (!arr.length) { box.innerHTML = '<p class="deals-empty">${esc(t.priceEmpty)}</p>'; return; }
        var rows = arr.slice(0, 3).map(function (p) {
          var price = p && p.pricing && p.pricing.total ? Math.round(p.pricing.total) : null;
          var nights = (p && p.nights) || (p && p.dates && p.dates.nights) || null;
          var meta = [nights ? (${isSr ? 'nights + " noći"' : 'nights + (nights === 1 ? " night" : " nights")'}) : '', (p && p.dates && p.dates.departure) ? p.dates.departure : ''].filter(Boolean).join(' · ');
          return '<li class="deal"><div class="deal-meta">' + meta + '</div>' +
                 (price ? '<div class="deal-price">€' + price + ' <span>${t.perPkg}</span></div>' : '') + '</li>';
        }).join('');
        box.innerHTML = '<ul class="price-list">' + rows + '</ul>';
      })
      .catch(function () { box.innerHTML = '<p class="deals-empty">${esc(t.priceEmpty)}</p>'; });
  }

  // ── Newsletter signup → /api/lead-capture (source: catalog) ──
  var nf = document.getElementById('nl-form');
  if (nf) {
    nf.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = (nf.email.value || '').trim();
      if (!email || email.indexOf('@') < 1) return;
      if (window.lettoSetPixelEmail) window.lettoSetPixelEmail(email);
      fetch('/api/lead-capture', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, source: 'catalog' })
      }).catch(function () {});
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
