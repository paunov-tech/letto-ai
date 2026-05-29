// scripts/test-pseo-slug.mjs — unit test for lib/pseo-slug.js.
//
// No env / network — pure parser logic. Run: node scripts/test-pseo-slug.mjs
// Focus: the hyphenated-slug edge cases the spec calls out as KRITIČNO, plus
// vibe/month axes and build↔parse round-trips.

import { parseSlug, buildSlug, siblingSlug } from '../lib/pseo-slug.js';

let pass = 0, fail = 0;
function ok(label, cond, detail = '') {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else { console.error('  ✗ ' + label + (detail ? '  ·  ' + detail : '')); fail++; }
}

console.log('═══ pseo-slug parser test ═══\n');

// 1 · base 2-axis SR
{
  const p = parseSlug('letovi-iz-beograda-za-rim');
  ok('base SR letovi-iz-beograda-za-rim', p && p.lang === 'sr' && p.origin.code === 'BEG' && p.dest.iata === 'FCO' && !p.vibe && !p.monthSlug, JSON.stringify(p && { o: p.origin.code, d: p.dest.iata }));
}
// 2 · base 2-axis EN
{
  const p = parseSlug('flights-from-belgrade-to-rome');
  ok('base EN flights-from-belgrade-to-rome', p && p.lang === 'en' && p.origin.code === 'BEG' && p.dest.iata === 'FCO');
}
// 3 · hyphenated ORIGIN (banje-luke) — the KRITIČNO case
{
  const p = parseSlug('letovi-iz-banje-luke-za-rim');
  ok('hyphenated origin banje-luke → BNX, dest rim', p && p.origin.code === 'BNX' && p.dest.iata === 'FCO', JSON.stringify(p && { o: p.origin.code, d: p.dest.iata }));
}
// 4 · 3-axis with vibe
{
  const p = parseSlug('letovi-iz-beograda-za-rim-vikend');
  ok('3-axis vibe vikend', p && p.origin.code === 'BEG' && p.dest.iata === 'FCO' && p.vibe && p.vibe.code === 'vikend' && !p.monthSlug);
}
// 5 · 4-axis vibe + month
{
  const p = parseSlug('letovi-iz-beograda-za-rim-romanticno-2026-07');
  ok('4-axis vibe+month', p && p.vibe.code === 'romanticno' && p.monthSlug === '2026-07' && p.year === 2026 && p.month === 7);
}
// 6 · EN budget vibe slug (slug_en differs from code)
{
  const p = parseSlug('flights-from-belgrade-to-rome-budget');
  ok('EN budget vibe maps to code "budget"', p && p.vibe && p.vibe.code === 'budget');
}
// 7 · month-only (no vibe) 4-ish
{
  const p = parseSlug('letovi-iz-nisa-za-atina-2026-12');
  ok('origin niš + month, no vibe', p && p.origin.code === 'INI' && p.dest.iata === 'ATH' && !p.vibe && p.monthSlug === '2026-12');
}
// 8 · reject unknown origin
ok('reject unknown origin', parseSlug('letovi-iz-marsa-za-rim') === null);
// 9 · reject unknown dest
ok('reject unknown dest', parseSlug('letovi-iz-beograda-za-mars') === null);
// 10 · reject X→X (split origin → split dest)
ok('reject SPU→SPU', parseSlug('letovi-iz-splita-za-split') === null);
// 11 · reject malformed (no separator)
ok('reject no -za- separator', parseSlug('letovi-iz-beogradarim') === null);
// 12 · reject invalid month (month 13)
{
  const p = parseSlug('letovi-iz-beograda-za-rim-2026-13');
  // 2026-13 is not a valid month tail → treated as part of dest slug → unknown dest → null
  ok('reject invalid month 2026-13', p === null);
}
// 13 · dest containing "za" letters but not separator (kazablanka)
{
  const p = parseSlug('letovi-iz-beograda-za-kazablanka');
  ok('dest kazablanka parses (no false -za- split)', p && p.dest.iata === 'CMN');
}
// 14 · build ↔ parse round-trip (4-axis)
{
  const p = parseSlug('letovi-iz-banje-luke-za-dubrovnik-solo-2027-01');
  const rebuilt = buildSlug({ lang: p.lang, origin: p.origin, dest: p.dest, vibe: p.vibe, monthSlug: p.monthSlug });
  ok('round-trip build==parse input', rebuilt === 'letovi-iz-banje-luke-za-dubrovnik-solo-2027-01', rebuilt);
}
// 15 · sibling slug (SR→EN) flips prefix + slugs
{
  const p = parseSlug('letovi-iz-beograda-za-rim-vikend');
  ok('siblingSlug SR→EN', siblingSlug(p) === 'flights-from-belgrade-to-rome-weekend', siblingSlug(p));
}

console.log('\n═══ ' + pass + ' pass · ' + fail + ' fail ═══');
process.exit(fail === 0 ? 0 : 1);
