// scripts/fetch-dest-heroes.mjs — fetch one curated hero photo per destination
// from Pexels and persist to data/dest-heroes.json (v44-A).
//
// Why a committed JSON (not live Pexels at every build):
//   - deterministic builds (same hero every regen, no SERP drift)
//   - Miroslav's vetoes/swaps are durable — edit the JSON, rebuild
//   - generate-destination-pages.mjs reads this file; no API dep at build time
//
// Hero selection rules (v44-A GO): landscape orientation, architecture /
// panorama / landmark motif, avoid close-up people. We bias the query toward
// "{city} skyline" (cityscapes rarely foreground faces) and fall back to the
// bare city name if that yields nothing. Final veto is human (Slack spot-check).
//
// RUN:  source .env && node scripts/fetch-dest-heroes.mjs            (all dests)
//       node scripts/fetch-dest-heroes.mjs --only FCO,BCN           (subset)
//       node scripts/fetch-dest-heroes.mjs --force                  (re-fetch existing)
//
// Needs PEXELS_API_KEY (or PEXELS_KEY) in env. Existing entries are kept unless
// --force, so a veto-edit isn't clobbered by a later full run.

import fs from 'node:fs';
import path from 'node:path';
import { DESTINATIONS } from './lib/destinations.mjs';

const KEY = process.env.PEXELS_API_KEY || process.env.PEXELS_KEY || '';
if (!KEY) { console.error('FATAL · PEXELS_API_KEY (or PEXELS_KEY) missing'); process.exit(1); }

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const onlyIdx = argv.indexOf('--only');
const ONLY = onlyIdx >= 0 ? (argv[onlyIdx + 1] || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : null;

const OUT = path.resolve('data/dest-heroes.json');
const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function search(query) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
  const r = await fetch(url, { headers: { Authorization: KEY } });
  if (!r.ok) throw new Error(`Pexels ${r.status}`);
  const j = await r.json();
  return (j.photos && j.photos[0]) || null;
}

async function fetchHero(city) {
  let p = await search(`${city} skyline`).catch(() => null);
  if (!p) p = await search(city).catch(() => null);
  if (!p) return null;
  return {
    url: p.src.landscape || p.src.large2x || p.src.large || p.src.original,
    alt: p.alt || `${city}`,
    credit: p.photographer || '',
    creditUrl: p.photographer_url || '',
    pexelsId: p.id,
    sourceUrl: p.url || '',
  };
}

async function main() {
  const targets = DESTINATIONS.filter(d => !ONLY || ONLY.includes(d.iata));
  console.log(`=== fetch-dest-heroes · ${targets.length} dests · force=${FORCE} ===\n`);
  const review = [];
  for (const d of targets) {
    if (existing[d.iata] && !FORCE) { console.log(`  SKIP ${d.iata} ${d.enCity} (exists)`); continue; }
    try {
      const hero = await fetchHero(d.enCity);
      if (!hero) { console.log(`  MISS ${d.iata} ${d.enCity} (no result)`); continue; }
      existing[d.iata] = hero;
      review.push(`${d.iata}  ${d.enCity.padEnd(14)} ${hero.sourceUrl}  (${hero.credit})`);
      console.log(`  OK   ${d.iata} ${d.enCity.padEnd(14)} ${hero.url.slice(0, 70)}`);
      await sleep(350);
    } catch (e) { console.error(`  FAIL ${d.iata} ${d.enCity} · ${e.message}`); }
  }
  fs.writeFileSync(OUT, JSON.stringify(existing, null, 2) + '\n');
  console.log(`\n✓ wrote ${OUT} · ${Object.keys(existing).length} heroes total`);
  if (review.length) {
    console.log(`\n── REVIEW LIST (Slack #letto-build · veto by editing data/dest-heroes.json) ──`);
    review.forEach(l => console.log('  ' + l));
  }
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
