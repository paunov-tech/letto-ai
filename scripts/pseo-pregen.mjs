// scripts/pseo-pregen.mjs — Top ~560 pre-generation for the pSEO engine (v43-C).
//
// ENUMERATION (≈560, all ≥ the 500 acceptance floor):
//   Phase 1a · base 2-axis : 20 origins × 12 top dests × 2 lang = 480
//   Phase 1b · 3-axis      : [BEG,SJJ,ZAG,LJU] × 5 top dests × 2 top vibes × 2 lang = 80
//
// Per slug: skip if it already exists → coverage probe (letto_packages) →
// Claude gen → setPseoPage(isPreGenerated:true). Sleep 400ms (~2.5 req/s),
// 2s back-off on error. Final tally OK / SKIP / FAIL.
//
// RUN (Phase 2 — needs Anthropic key + writes prod Firestore):
//   source .env.engine && node scripts/pseo-pregen.mjs
//   # or on Vercel where lettoprod + FIREBASE_ADMIN_* are already set
//
// VERIFY WITHOUT COST (safe — no Claude calls, no Firestore writes):
//   node scripts/pseo-pregen.mjs --dry-run
//   node scripts/pseo-pregen.mjs --dry-run --limit 20
//
// The script self-bootstraps local credentials:
//   - FIREBASE_ADMIN_* ← .secrets/firebase-admin-sa.json (if env not already set)
//   - ANTHROPIC_API_KEY ← .env.engine (if neither it nor lettoprod is in env)
// so a bare `node scripts/pseo-pregen.mjs` works from the repo root.

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const limitArg = argv.indexOf('--limit');
const LIMIT = limitArg >= 0 ? parseInt(argv[limitArg + 1], 10) : Infinity;

// ── enumeration config ──
const TOP_DESTS = ['FCO','ATH','BCN','CDG','IST','VIE','BUD','LHR','AMS','MAD','PRG','DXB']; // 12, none are origins → no self-collision
const HIGH_TRAFFIC_ORIGINS = ['BEG','SJJ','ZAG','LJU'];
const TOP_DESTS_3AXIS = ['FCO','ATH','BCN','CDG','IST']; // 5
const TOP_VIBES = ['vikend','romanticno'];               // 2
const SLEEP_MS = 400;
const BACKOFF_MS = 2000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── local credential bootstrap (no-op when env already populated) ──
function bootstrapCreds() {
  if (!process.env.FIREBASE_ADMIN_CLIENT_EMAIL || !process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    const saPath = path.resolve('.secrets/firebase-admin-sa.json');
    if (fs.existsSync(saPath)) {
      try {
        const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
        process.env.FIREBASE_ADMIN_CLIENT_EMAIL = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || sa.client_email;
        process.env.FIREBASE_ADMIN_PRIVATE_KEY = process.env.FIREBASE_ADMIN_PRIVATE_KEY || sa.private_key;
        console.log('· firebase creds hydrated from .secrets/firebase-admin-sa.json');
      } catch (e) { console.warn('· could not parse .secrets/firebase-admin-sa.json:', e.message); }
    }
  }
  if (!process.env.ANTHROPIC_API_KEY && !process.env.lettoprod) {
    const envEngine = path.resolve('.env.engine');
    if (fs.existsSync(envEngine)) {
      const m = fs.readFileSync(envEngine, 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m);
      if (m && m[1].trim()) { process.env.ANTHROPIC_API_KEY = m[1].trim(); console.log('· ANTHROPIC_API_KEY loaded from .env.engine'); }
    }
  }
}

async function main() {
  bootstrapCreds();

  // dynamic imports AFTER creds are in env (libs init firebase-admin on import)
  const { buildSlug, originByCode, destByIata } = await import('../lib/pseo-slug.js');
  const { VIBES } = await import('../data/pseo-enums.js');

  // build the work list
  const work = [];
  const langs = ['sr', 'en'];
  // 1a · base 2-axis
  for (const o of (await import('../lib/pseo-slug.js')).ORIGINS) {
    for (const di of TOP_DESTS) {
      if (o.code === di) continue; // no X→X
      const dest = destByIata(di);
      if (!dest) continue;
      for (const lang of langs) {
        work.push({ lang, origin: o, dest, vibe: null, monthSlug: null, axis: 2 });
      }
    }
  }
  // 1b · 3-axis (high-traffic origins × top dests × top vibes)
  for (const oc of HIGH_TRAFFIC_ORIGINS) {
    const o = originByCode(oc);
    if (!o) continue;
    for (const di of TOP_DESTS_3AXIS) {
      if (o.code === di) continue;
      const dest = destByIata(di);
      if (!dest) continue;
      for (const vc of TOP_VIBES) {
        const vibe = VIBES.find(v => v.code === vc);
        for (const lang of langs) {
          work.push({ lang, origin: o, dest, vibe, monthSlug: null, axis: 3 });
        }
      }
    }
  }

  const all = work.map(w => ({ ...w, slug: buildSlug(w) }));
  const targets = isFinite(LIMIT) ? all.slice(0, LIMIT) : all;

  console.log(`\n=== pseo-pregen · ${DRY_RUN ? 'DRY RUN' : 'LIVE'} ===`);
  console.log(`  enumerated: ${all.length} (base 2-axis + 3-axis) · running: ${targets.length}\n`);

  if (DRY_RUN) {
    targets.forEach((t, i) => { if (i < 10 || i >= targets.length - 5) console.log(`  ${String(i + 1).padStart(3)} [${t.axis}ax] ${t.slug}`); else if (i === 10) console.log('  …'); });
    console.log(`\n  DRY RUN · ${targets.length} slugs would be generated. No Claude calls, no writes.`);
    console.log(`  base 2-axis: ${all.filter(t => t.axis === 2).length} · 3-axis: ${all.filter(t => t.axis === 3).length}`);
    return;
  }

  // ── LIVE path ──
  const { getFirestore } = await import('firebase-admin/firestore');
  const { setPseoPage, pseoPageExists } = await import('../lib/pseo-storage.js');
  const { generatePageContent, hasApiKey } = await import('../lib/pseo-claude-gen.js');
  if (!hasApiKey()) { console.error('FATAL · no Anthropic key (ANTHROPIC_API_KEY | lettoprod). Aborting.'); process.exit(1); }
  const db = getFirestore();

  async function hasCoverage(originCode, destIata) {
    try {
      const snap = await db.collection('letto_packages')
        .where('origin.code', '==', originCode)
        .where('destination.code', '==', destIata)
        .limit(1).get();
      return !snap.empty;
    } catch (e) { console.warn('  coverage probe error:', e.message); return false; }
  }

  let ok = 0, skip = 0, fail = 0;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const n = `${i + 1}/${targets.length}`;
    try {
      if (await pseoPageExists(t.slug)) { console.log(`  SKIP  ${n} ${t.slug} (exists)`); skip++; continue; }
      if (!(await hasCoverage(t.origin.code, t.dest.iata))) { console.log(`  SKIP  ${n} ${t.slug} (no coverage)`); skip++; continue; }
      const parsed = { lang: t.lang, origin: t.origin, dest: t.dest, vibe: t.vibe, monthSlug: t.monthSlug };
      const content = await generatePageContent(parsed);
      const page = {
        slug: t.slug, lang: t.lang,
        origin_code: t.origin.code, dest_iata: t.dest.iata,
        vibe_code: t.vibe ? t.vibe.code : null, monthSlug: t.monthSlug || null,
        copy: content.copy, faqs: content.faqs,
        isPreGenerated: true, generatedAt: Date.now(),
      };
      await setPseoPage(t.slug, page);
      console.log(`  OK    ${n} ${t.slug}`);
      ok++;
      await sleep(SLEEP_MS);
    } catch (e) {
      console.error(`  FAIL  ${n} ${t.slug} · ${e.message}`);
      fail++;
      await sleep(BACKOFF_MS);
    }
  }

  console.log(`\n=== tally · OK ${ok} · SKIP ${skip} · FAIL ${fail} · total ${targets.length} ===`);
  process.exit(fail > 0 && ok === 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
