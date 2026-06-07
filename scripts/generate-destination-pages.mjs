// scripts/generate-destination-pages.mjs — build SR + EN landing pages for
// every entry in scripts/lib/destinations.mjs, using the SHARED v44-E1 premium
// template (lib/pseo-render.js · destination mode). One design across the 46
// static landings AND the live pSEO engine — edit the template once.
//
// Output (46 files):
//   public/letovi-{srSlug}.html   · SR primary
//   public/flights-{enSlug}.html  · EN sibling
//
// Run: `node scripts/generate-destination-pages.mjs`
// Or:  `npm run build:seo` (also runs the sitemap generator)
//
// Data sources (no network at build time — deterministic):
//   scripts/lib/destinations.mjs       · route source-of-truth (city, slugs, intro)
//   scripts/lib/destinations-faq.mjs   · 5 grounded FAQ facts + price ranges per IATA
//   data/dest-heroes.json              · Pexels hero per IATA (scripts/fetch-dest-heroes.mjs)
//
// S1 anti-thin-content: each page server-renders a grounded "last checked:
// flights from €X · hotels from €Y/night" line (from the FAQ price ranges) so
// bots get real information gain — the client then refreshes it with live
// /api/packages deals, and keeps the static line if that fetch fails.

import fs from 'node:fs';
import path from 'node:path';
import { DESTINATIONS } from './lib/destinations.mjs';
import { FAQ_DATA } from './lib/destinations-faq.mjs';
import { renderDestinationPage } from '../lib/pseo-render.js';

const TODAY_MS = Date.now();
const MONTH_NAMES_SR = ['januar','februar','mart','april','maj','jun','jul','avgust','septembar','oktobar','novembar','decembar'];
const MONTH_NAMES_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDuration(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h === 0) return m + 'min';
  return m === 0 ? h + 'h' : h + 'h ' + m + 'min';
}
function formatMonths(months, isSr) {
  const names = isSr ? MONTH_NAMES_SR : MONTH_NAMES_EN;
  return months.map(m => names[m - 1]).join(', ');
}

// 5 grounded FAQ {q,a} pairs per destination. The renderer builds BOTH the
// visible accordion and the FAQPage JSON-LD from these — one source. Identical
// question shape across all 23 dests (consistent schema), destination-specific
// answers (unique information gain).
function buildFaqPairs({ faq, city, isSr }) {
  const dur = formatDuration(faq.flight_duration_min_from_beg);
  const months = formatMonths(faq.best_months, isSr);
  const [fmin, fmax] = faq.flight_price_eur_range_from_beg;
  const [hmin, hmax] = faq.hotel_price_eur_range_per_night;
  const visaText = isSr ? faq.visa_note_sr : faq.visa_note_en;
  if (isSr) return [
    { q: `Koliko košta let za ${city} iz Beograda?`, a: `Tipičan raspon je €${fmin}–€${fmax} u sezoni. Letto skenira deal-ove ispod €${fmin} kad se ukažu (engine osvežava svaka 6 sata).` },
    { q: `Koliko traje let Beograd–${city}?`, a: `Direktnim letom oko ${dur}. Sa presedanjem može biti znatno duže — Letto prikazuje obe opcije.` },
    { q: `Kada je najbolja sezona za putovanje u ${city}?`, a: `Najpovoljniji meseci su ${months}. Tada su i cene i vreme u najboljoj kombinaciji.` },
    { q: `Koliko košta hotel u ${city} po noći?`, a: `Hoteli idu od €${hmin} za budget 3★ kategoriju do €${hmax}+ za 5★ luksuz, po noći.` },
    { q: `Da li je potrebna viza za ${city}?`, a: visaText },
  ];
  return [
    { q: `How much does a flight to ${city} from Belgrade cost?`, a: `Typical range €${fmin}–€${fmax} in season. Letto surfaces deals below €${fmin} when they appear (engine refreshes every 6h).` },
    { q: `How long is the Belgrade–${city} flight?`, a: `About ${dur} direct. With a connection it can be significantly longer — Letto shows both options.` },
    { q: `When is the best season to visit ${city}?`, a: `Best months are ${months}. Price and weather align in this window.` },
    { q: `How much is a hotel in ${city} per night?`, a: `Hotels range from €${hmin} (3★ budget) up to €${hmax}+ (5★ luxury) per night.` },
    { q: `Do I need a visa for ${city}?`, a: visaText },
  ];
}

// ── hero library (committed, deterministic) ──
const heroesPath = path.resolve('data/dest-heroes.json');
const HEROES = fs.existsSync(heroesPath) ? JSON.parse(fs.readFileSync(heroesPath, 'utf8')) : {};

async function main() {
  console.log(`=== generate-destination-pages · ${new Date(TODAY_MS).toISOString().slice(0,10)} ===`);
  console.log(`  template: lib/pseo-render.js (v44-E1 · destination mode)`);
  console.log(`  heroes:   ${Object.keys(HEROES).length}/${DESTINATIONS.length} from data/dest-heroes.json\n`);

  const outDir = path.resolve('public');
  let total = 0, withHero = 0;
  for (const dest of DESTINATIONS) {
    const faq = FAQ_DATA[dest.iata] || null;
    const heroRaw = HEROES[dest.iata] || null;
    const hero = heroRaw ? { url: heroRaw.url, alt: heroRaw.alt, credit: heroRaw.credit, creditUrl: heroRaw.creditUrl } : null;
    const lastKnown = faq ? { flightFrom: faq.flight_price_eur_range_from_beg[0], hotelFrom: faq.hotel_price_eur_range_per_night[0] } : null;
    if (hero) withHero++;

    for (const lang of ['sr', 'en']) {
      const isSr = lang === 'sr';
      const city = isSr ? dest.srCity : dest.enCity;
      const page = {
        lang,
        dest_iata: dest.iata,
        copy: isSr ? dest.srIntro : dest.enIntro,
        faqs: faq ? buildFaqPairs({ faq, city, isSr }) : [],
        hero,
        lastKnown,
        generatedAt: TODAY_MS,
      };
      const html = renderDestinationPage(page);
      const file = isSr ? `letovi-${dest.srSlug}.html` : `flights-${dest.enSlug}.html`;
      fs.writeFileSync(path.join(outDir, file), html);
      total++;
    }
    console.log(`  ${dest.iata}  ${dest.srSlug.padEnd(12)} ${dest.enSlug.padEnd(15)} ${hero ? '🖼' : '·'} ${faq ? '❓5' : '·'}`);
  }
  console.log(`\n✓ ${total} pages written · ${withHero}/${DESTINATIONS.length} with hero photo`);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
