#!/usr/bin/env node
// scripts/populate-destination-images.mjs — Build/refresh letto_destination_images library.
//
// For each known city: run 3-5 specific Pexels queries (landmarks, neighborhoods, vibes),
// aggregate, dedupe by Pexels photo ID, filter min_width=1280 + landscape, save top 10.
//
// Schema: letto_destination_images/{citySlug}
//   { city, slug, images: [{url, photographer, photographerUrl, w, h, sourceUrl, alt, pexelsId, query}], lastUpdated, queriesUsed }
//
// Usage:
//   node scripts/populate-destination-images.mjs               # populate ALL known cities
//   node scripts/populate-destination-images.mjs Istanbul Rome  # specific cities
//
// Run monthly to refresh stale URLs (Pexels CDN URLs are stable but photos can be deleted).

import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'node:fs';

const PEXELS_KEY = readFileSync('/home/zlfzr/letto-ai/.env', 'utf8').match(/PEXELS_API_KEY=(.*)/)[1];

// 3-5 evocative query variants per city. Add more cities as engine produces them.
const QUERY_VARIANTS = {
  Istanbul: ['Istanbul Bosphorus', 'Istanbul Hagia Sophia', 'Istanbul Sultanahmet', 'Istanbul mosque dome', 'Istanbul rooftop sunset'],
  Rome: ['Rome Colosseum', 'Rome Vatican', 'Rome Trevi Fountain', 'Rome Pantheon', 'Rome cobblestone street'],
  Paris: ['Paris Eiffel Tower', 'Paris Louvre', 'Paris Notre Dame', 'Paris Montmartre', 'Paris Seine river'],
  Barcelona: ['Barcelona Sagrada Familia', 'Barcelona Park Guell', 'Barcelona Gothic Quarter', 'Barcelona beach', 'Barcelona Las Ramblas'],
  Dubai: ['Dubai Burj Khalifa', 'Dubai Marina', 'Dubai Palm Jumeirah', 'Dubai desert dune', 'Dubai skyline'],
  Halkidiki: ['Halkidiki beach', 'Halkidiki Sithonia', 'Halkidiki sunset', 'Halkidiki coast aerial', 'Halkidiki Greece olive'],
  Male: ['Maldives overwater bungalow', 'Maldives beach lagoon', 'Maldives palm island', 'Maldives turquoise water', 'Male Maldives capital'],
  Tokyo: ['Tokyo Shibuya crossing', 'Tokyo skyline night', 'Tokyo Shinjuku street', 'Tokyo Senso-ji temple', 'Tokyo cherry blossom'],
  'Cape Town': ['Cape Town Table Mountain', 'Cape Town waterfront harbor', 'Cape Town Camps Bay beach', 'Cape Town aerial coast', 'Cape Town city sunset'],
  Amsterdam: ['Amsterdam canal', 'Amsterdam bicycle bridge', 'Amsterdam tulip', 'Amsterdam Anne Frank', 'Amsterdam architecture'],
  Vienna: ['Vienna Schonbrunn palace', 'Vienna Belvedere', 'Vienna opera house', 'Vienna cafe interior', 'Vienna Christmas market'],
  Budapest: ['Budapest Parliament', 'Budapest Danube bridge', 'Budapest thermal bath', 'Budapest fishermen bastion', 'Budapest castle'],
  Prague: ['Prague Charles Bridge', 'Prague astronomical clock', 'Prague castle hill', 'Prague Old Town square', 'Prague Vltava'],
  Berlin: ['Berlin Brandenburg Gate', 'Berlin Wall', 'Berlin Reichstag', 'Berlin street art', 'Berlin TV tower'],
  Athens: ['Athens Acropolis', 'Athens Parthenon', 'Athens Plaka neighborhood', 'Athens sunset', 'Athens Greek ruins'],
  Munich: ['Munich Marienplatz', 'Munich beer garden', 'Munich BMW museum', 'Munich Englischer Garten', 'Munich Alps view']
};

// Default fallback for unknown cities — generic but specific enough
function fallbackQueries(city) {
  return [
    `${city} landmark`,
    `${city} cityscape`,
    `${city} sunset`,
    `${city} travel`
  ];
}

function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

async function pexelsSearch(query) {
  const params = new URLSearchParams({ query, per_page: '15', orientation: 'landscape' });
  const r = await fetch(`https://api.pexels.com/v1/search?${params}`, { headers: { Authorization: PEXELS_KEY } });
  if (!r.ok) throw new Error(`Pexels ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  return (d.photos || []).map(p => ({
    pexelsId: p.id,
    url: p.src?.landscape || p.src?.large2x || p.src?.large,
    photographer: p.photographer || '',
    photographerUrl: p.photographer_url || '',
    w: p.width,
    h: p.height,
    sourceUrl: p.url || '',
    alt: p.alt || '',
    avgColor: p.avg_color || ''
  }));
}

async function gatherForCity(city) {
  const queries = QUERY_VARIANTS[city] || fallbackQueries(city);
  const all = [];
  const seen = new Set();
  for (const q of queries) {
    let results;
    try { results = await pexelsSearch(q); }
    catch (e) { console.error(`  [${city}] query "${q}" failed: ${e.message}`); continue; }
    for (const p of results) {
      if (!p.url || !p.pexelsId) continue;
      if (p.w < 1280) continue; // min_width filter
      if (seen.has(p.pexelsId)) continue;
      seen.add(p.pexelsId);
      all.push({ ...p, query: q });
    }
    // Throttle
    await new Promise(r => setTimeout(r, 250));
  }
  // Sort by descending image area (larger = generally higher quality), take top 10
  all.sort((a, b) => (b.w * b.h) - (a.w * a.h));
  return { queries, images: all.slice(0, 10) };
}

async function main() {
  const sa = JSON.parse(readFileSync('/home/zlfzr/letto-ai/.secrets/firebase-admin-sa.json', 'utf8'));
  const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/datastore'] });
  const t = (await (await auth.getClient()).getAccessToken()).token;

  // Determine cities to process: CLI args, OR all known cities, OR cities in letto_packages inventory
  const args = process.argv.slice(2);
  let cities;
  if (args.length > 0) {
    cities = args;
  } else {
    // Read unique cities from letto_packages
    const r = await fetch('https://firestore.googleapis.com/v1/projects/letto-ai/databases/(default)/documents/letto_packages?pageSize=200', { headers: { Authorization: 'Bearer ' + t }});
    const j = await r.json();
    const seen = new Set();
    for (const d of (j.documents || [])) {
      const c = d.fields?.destination?.mapValue?.fields?.city?.stringValue;
      if (c) seen.add(c);
    }
    cities = [...seen];
  }

  console.log(`Populating letto_destination_images for ${cities.length} cities: ${cities.join(', ')}`);
  let totalImages = 0;
  for (const city of cities) {
    process.stdout.write(`[${city}] gathering... `);
    const { queries, images } = await gatherForCity(city);
    console.log(`${images.length} images from ${queries.length} queries`);
    if (images.length === 0) continue;
    totalImages += images.length;

    const slug = slugify(city);
    const url = `https://firestore.googleapis.com/v1/projects/letto-ai/databases/(default)/documents/letto_destination_images/${slug}`;
    const fields = {
      city: { stringValue: city },
      slug: { stringValue: slug },
      lastUpdated: { timestampValue: new Date().toISOString() },
      queriesUsed: { arrayValue: { values: queries.map(q => ({ stringValue: q })) } },
      images: {
        arrayValue: {
          values: images.map(p => ({ mapValue: { fields: {
            pexelsId: { integerValue: String(p.pexelsId) },
            url: { stringValue: p.url },
            photographer: { stringValue: p.photographer },
            photographerUrl: { stringValue: p.photographerUrl },
            w: { integerValue: String(p.w) },
            h: { integerValue: String(p.h) },
            sourceUrl: { stringValue: p.sourceUrl },
            alt: { stringValue: p.alt },
            avgColor: { stringValue: p.avgColor },
            query: { stringValue: p.query }
          } } }))
        }
      }
    };
    const r = await fetch(`${url}?updateMask.fieldPaths=city&updateMask.fieldPaths=slug&updateMask.fieldPaths=lastUpdated&updateMask.fieldPaths=queriesUsed&updateMask.fieldPaths=images`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
    if (!r.ok) console.error(`  [${city}] PATCH ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  console.log(`\nDone. ${cities.length} cities, ${totalImages} total images stored.`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
