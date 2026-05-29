// data/pseo-enums.js — pSEO 4-axis enumerations (v43-C).
//
// Two enumerable axes beyond origin × destination:
//   VIBES  — 5 fixed travel-intent slugs (confirmed with Miroslav 2026-05-29)
//   MONTHS — 24 rolling calendar months from "now", numeric slug `YYYY-MM`
//
// Slug formats are PERMANENT once indexed — do not rename codes/slugs without
// a redirect plan. Vibe slugs differ SR↔EN (vikend/weekend, budzet/budget);
// month slug is locale-neutral numeric, displayed localised at render time.
//
// Consumed by lib/pseo-slug.js (parse/validate) and scripts/pseo-pregen.mjs
// (enumerate 3-axis combos). Kept dependency-free so both Edge-ish and Node
// contexts can import it.

export const VIBES = [
  { code: 'vikend',     slug_sr: 'vikend',     slug_en: 'weekend',  name_sr: 'Vikend',         name_en: 'Weekend getaway' },
  { code: 'porodicno',  slug_sr: 'porodicno',  slug_en: 'family',   name_sr: 'Porodično',      name_en: 'Family trip' },
  { code: 'romanticno', slug_sr: 'romanticno', slug_en: 'romantic', name_sr: 'Romantično',     name_en: 'Romantic getaway' },
  { code: 'solo',       slug_sr: 'solo',       slug_en: 'solo',     name_sr: 'Solo putovanje', name_en: 'Solo travel' },
  { code: 'budget',     slug_sr: 'budzet',     slug_en: 'budget',   name_sr: 'Budžet odmor',   name_en: 'Budget trip' },
];

// All known vibe slugs in either language — used by the parser to peel the
// optional vibe token off a slug tail without ambiguity.
export const VIBE_SLUGS_SR = VIBES.map(v => v.slug_sr);
export const VIBE_SLUGS_EN = VIBES.map(v => v.slug_en);

/** Resolve a vibe by either-language slug. @returns {object|null} */
export function vibeBySlug(slug, lang) {
  if (!slug) return null;
  const key = lang === 'en' ? 'slug_en' : 'slug_sr';
  return VIBES.find(v => v[key] === slug) || VIBES.find(v => v.slug_sr === slug || v.slug_en === slug) || null;
}

const MONTH_NAMES_SR = ['januar','februar','mart','april','maj','jun','jul','avgust','septembar','oktobar','novembar','decembar'];
const MONTH_NAMES_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function pad2(n) { return String(n).padStart(2, '0'); }

/**
 * 24 rolling months starting at `from`'s month.
 * @param {Date} [from=new Date()]  base date (param makes it testable/deterministic)
 * @param {number} [count=24]
 * @returns {{slug:string, year:number, month:number, name_sr:string, name_en:string}[]}
 *   slug is numeric `YYYY-MM`; name_* are "jul 2026" / "July 2026".
 */
export function getActiveMonths(from = new Date(), count = 24) {
  const out = [];
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth(); // 0-11
  for (let i = 0; i < count; i++) {
    const month = m + 1; // 1-12
    out.push({
      slug:    `${y}-${pad2(month)}`,
      year:    y,
      month:   month,
      name_sr: `${MONTH_NAMES_SR[m]} ${y}`,
      name_en: `${MONTH_NAMES_EN[m]} ${y}`,
    });
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return out;
}

/**
 * Validate a numeric month slug and return its display forms, or null.
 * Accepts only months within the active rolling window (no past months,
 * no absurd-future) so on-demand cannot mint pages for arbitrary dates.
 * @param {string} slug  e.g. "2026-07"
 * @param {Date} [now=new Date()]
 */
export function monthBySlug(slug, now = new Date()) {
  if (!slug || !/^\d{4}-\d{2}$/.test(slug)) return null;
  const window = getActiveMonths(now);
  return window.find(mo => mo.slug === slug) || null;
}
