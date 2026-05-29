// lib/pseo-slug.js — 4-axis pSEO slug parser + builder (v43-C).
//
// Slug grammar (SR primary, EN sibling):
//   SR  letovi-iz-{origin}-za-{dest}[-{vibe}][-{YYYY}-{MM}]
//   EN  flights-from-{origin}-to-{dest}[-{vibe}][-{YYYY}-{MM}]
//
// CRITICAL: origin/dest slugs may themselves contain hyphens
// (banje-luke, banja-luka). A pure greedy regex mis-splits these, so we
// instead split on the literal `-za-` / `-to-` separator (no slug contains
// it), peel the optional month then vibe off the tail, and VALIDATE every
// axis against the canonical data. Anything that doesn't resolve → null.
//
// Origins:      data/pseo-origins.json  (20 ex-YU airports)
// Destinations: scripts/lib/destinations.mjs  (the existing 24 landing dests)
//
// parseSlug returns the RESOLVED objects (not just codes) so callers get
// name_sr_gen / geo / iata without a second lookup.

import { createRequire } from 'node:module';
import { DESTINATIONS } from '../scripts/lib/destinations.mjs';
import { VIBES, vibeBySlug } from '../data/pseo-enums.js';

// require() (not import-assert) loads the JSON robustly across the Node
// toolchain AND lets Vercel's bundler trace + include the file in the lambda.
const require = createRequire(import.meta.url);
export const ORIGINS = require('../data/pseo-origins.json');

const SR = { prefix: 'letovi-iz-', sep: '-za-', lang: 'sr' };
const EN = { prefix: 'flights-from-', sep: '-to-', lang: 'en' };

// ── lookup maps ──
const ORIGIN_BY_SR = new Map(ORIGINS.map(o => [o.slug_sr, o]));
const ORIGIN_BY_EN = new Map(ORIGINS.map(o => [o.slug_en, o]));
const ORIGIN_BY_CODE = new Map(ORIGINS.map(o => [o.code, o]));
const DEST_BY_SR = new Map(DESTINATIONS.map(d => [d.srSlug, d]));
const DEST_BY_EN = new Map(DESTINATIONS.map(d => [d.enSlug, d]));
const DEST_BY_IATA = new Map(DESTINATIONS.map(d => [d.iata, d]));

export function originByCode(code) { return ORIGIN_BY_CODE.get(code) || null; }
export function destByIata(iata)   { return DEST_BY_IATA.get(iata) || null; }

const MONTH_TAIL = /-(\d{4})-(0[1-9]|1[0-2])$/; // valid YYYY-MM only

/**
 * Parse a pSEO slug into resolved axes.
 * @param {string} slug
 * @returns {{
 *   lang:'sr'|'en', slug:string,
 *   origin:object, dest:object,
 *   vibe:object|null, year:number|null, month:number|null, monthSlug:string|null
 * } | null}  null if the slug is malformed or names an unknown origin/dest,
 *            or if origin === dest.
 */
export function parseSlug(slug) {
  if (!slug || typeof slug !== 'string') return null;
  const cfg = slug.startsWith(SR.prefix) ? SR
            : slug.startsWith(EN.prefix) ? EN
            : null;
  if (!cfg) return null;

  const body = slug.slice(cfg.prefix.length);
  const sepIdx = body.indexOf(cfg.sep);
  if (sepIdx < 0) return null;
  const originSlug = body.slice(0, sepIdx);
  let rest = body.slice(sepIdx + cfg.sep.length);
  if (!originSlug || !rest) return null;

  // peel optional month tail (-YYYY-MM)
  let year = null, month = null, monthSlug = null;
  const mMatch = rest.match(MONTH_TAIL);
  if (mMatch) {
    year = parseInt(mMatch[1], 10);
    month = parseInt(mMatch[2], 10);
    monthSlug = `${mMatch[1]}-${mMatch[2]}`;
    rest = rest.slice(0, mMatch.index);
  }

  // peel optional vibe tail
  let vibe = null;
  const vibeSlugs = cfg.lang === 'en' ? VIBES.map(v => v.slug_en) : VIBES.map(v => v.slug_sr);
  for (const vs of vibeSlugs) {
    if (rest === vs) return null;            // dest can't be empty
    if (rest.endsWith('-' + vs)) {
      vibe = vibeBySlug(vs, cfg.lang);
      rest = rest.slice(0, rest.length - vs.length - 1);
      break;
    }
  }

  const destSlug = rest;
  const origin = (cfg.lang === 'en' ? ORIGIN_BY_EN : ORIGIN_BY_SR).get(originSlug);
  const dest   = (cfg.lang === 'en' ? DEST_BY_EN   : DEST_BY_SR).get(destSlug);
  if (!origin || !dest) return null;
  if (origin.code === dest.iata) return null;  // no X→X route

  return { lang: cfg.lang, slug, origin, dest, vibe: vibe || null, year, month, monthSlug };
}

/**
 * Build a canonical slug from resolved axes. Inverse of parseSlug.
 * @param {{lang:'sr'|'en', origin:object, dest:object, vibe?:object|null, monthSlug?:string|null}}
 * @returns {string}
 */
export function buildSlug({ lang, origin, dest, vibe = null, monthSlug = null }) {
  const cfg = lang === 'en' ? EN : SR;
  const oSlug = lang === 'en' ? origin.slug_en : origin.slug_sr;
  const dSlug = lang === 'en' ? dest.enSlug : dest.srSlug;
  let s = `${cfg.prefix}${oSlug}${cfg.sep}${dSlug}`;
  if (vibe)      s += '-' + (lang === 'en' ? vibe.slug_en : vibe.slug_sr);
  if (monthSlug) s += '-' + monthSlug;
  return s;
}

/**
 * The SR↔EN sibling slug for a parsed page (for hreflang + language toggle).
 * @param {object} parsed  output of parseSlug
 * @returns {string}
 */
export function siblingSlug(parsed) {
  const otherLang = parsed.lang === 'en' ? 'sr' : 'en';
  return buildSlug({ lang: otherLang, origin: parsed.origin, dest: parsed.dest, vibe: parsed.vibe, monthSlug: parsed.monthSlug });
}
