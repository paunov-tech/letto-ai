// scripts/optimize-images.mjs — v44-C / P3: self-host destination heroes.
//
// Reads data/dest-heroes.json (Pexels masters), downloads a high-res master per
// destination, and emits AVIF + WebP + JPEG at 3 widths (480/900/1600) into
// public/img/dest/{enSlug}-{w}.{avif,webp,jpg}. Writes data/dest-hero-manifest.json
// consumed by lib/pseo-render.js to render a <picture> srcset (zero external
// image domains; ~60-70% smaller bytes via AVIF). Committed to the repo.
//
// RUN:  node scripts/optimize-images.mjs            (skips dests already done)
//       node scripts/optimize-images.mjs --force    (re-encode all)
//       node scripts/optimize-images.mjs --only FCO,BCN
//
// Idempotent: skips a dest if all 9 output files exist (unless --force).

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { DESTINATIONS } from './lib/destinations.mjs';

const HEROES = JSON.parse(fs.readFileSync(path.resolve('data/dest-heroes.json'), 'utf8'));
const WIDTHS = [480, 900, 1600];
const OUT_DIR = path.resolve('public/img/dest');
const MANIFEST = path.resolve('data/dest-hero-manifest.json');

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const onlyIdx = argv.indexOf('--only');
const ONLY = onlyIdx >= 0 ? (argv[onlyIdx + 1] || '').split(',').map(s => s.trim().toUpperCase()) : null;

// Build a high-res master URL from the stored Pexels url (request w=2000 crop).
function masterUrl(u) {
  const base = u.split('?')[0];
  return `${base}?auto=compress&cs=tinysrgb&fit=crop&w=2000&h=1046`;
}

async function download(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

function outFiles(slug) {
  const f = [];
  for (const w of WIDTHS) for (const ext of ['avif', 'webp', 'jpg']) f.push(path.join(OUT_DIR, `${slug}-${w}.${ext}`));
  return f;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  const targets = DESTINATIONS.filter(d => HEROES[d.iata] && (!ONLY || ONLY.includes(d.iata)));
  console.log(`=== optimize-images · ${targets.length} dests · widths ${WIDTHS.join('/')} · force=${FORCE} ===\n`);

  let done = 0, skipped = 0, failed = 0;
  for (const d of targets) {
    const slug = d.enSlug;
    if (!FORCE && outFiles(slug).every(f => fs.existsSync(f)) && manifest[d.iata]) { console.log(`  SKIP ${d.iata} ${slug} (exists)`); skipped++; continue; }
    try {
      const master = await download(masterUrl(HEROES[d.iata].url));
      let h1600 = 1046;
      for (const w of WIDTHS) {
        const img = sharp(master).resize({ width: w });
        const meta = await sharp(master).resize({ width: w }).metadata();
        if (w === 1600) h1600 = meta.height || Math.round(w / 1.913);
        await img.clone().avif({ quality: 52 }).toFile(path.join(OUT_DIR, `${slug}-${w}.avif`));
        await img.clone().webp({ quality: 74 }).toFile(path.join(OUT_DIR, `${slug}-${w}.webp`));
        await img.clone().jpeg({ quality: 78, mozjpeg: true }).toFile(path.join(OUT_DIR, `${slug}-${w}.jpg`));
      }
      manifest[d.iata] = {
        slug, base: `/img/dest/${slug}`,
        width: 1600, height: h1600,
        credit: HEROES[d.iata].credit || '', creditUrl: HEROES[d.iata].creditUrl || '',
        altEn: HEROES[d.iata].alt || `${d.enCity} cityscape`,
      };
      console.log(`  OK   ${d.iata} ${slug.padEnd(14)} 1600×${h1600}`);
      done++;
    } catch (e) { console.error(`  FAIL ${d.iata} ${slug} · ${e.message}`); failed++; }
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\n✓ done ${done} · skip ${skipped} · fail ${failed} · manifest ${Object.keys(manifest).length} dests → ${path.relative(process.cwd(), MANIFEST)}`);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
