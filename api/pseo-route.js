// api/pseo-route.js — pSEO landing-page handler (v43-C).
//
// Runtime: NODE (not Edge). firebase-admin uses gRPC/Node net APIs and is not
// Edge-compatible; the s-maxage=86400 CDN cache below means cache HITs still
// serve from the edge cache, so the Node TTFB only matters on cold MISS.
//
// Hybrid cache:
//   1. Firestore HIT  → render stored page (pre-gen OR previously on-demand).
//   2. MISS + PSEO_FULL=1 → parse + validate + coverage-probe + Claude gen +
//      async cache write, then render. MISS + PSEO_FULL=0 → 404.
//
// Feature flags (lib gate · all routes 404 unless explicitly enabled):
//   PSEO_ENABLED != 1            → 404 everything (full kill / default)
//   PSEO_ENABLED=1, PSEO_FULL=0  → only Firestore HITs (pre-gen) served
//   PSEO_ENABLED=1, PSEO_FULL=1  → on-demand cache-miss generation enabled
//
// Slug arrives via vercel.json rewrite (?slug=...). parseSlug derives lang.

import { getFirestore } from 'firebase-admin/firestore';
import { getPseoPage, setPseoPage } from '../lib/pseo-storage.js'; // top-level initializeApp runs on import
import { withSentry } from '../lib/sentry-backend.js';
import { parseSlug } from '../lib/pseo-slug.js';
import { renderPseoPage } from '../lib/pseo-render.js';
import { generatePageContent, hasApiKey } from '../lib/pseo-claude-gen.js';
import { monthBySlug } from '../data/pseo-enums.js';

const db = getFirestore();

function notFound(res) {
  res.setHeader('Cache-Control', 'public, s-maxage=300');
  return res.status(404).send('Not found');
}

// Coverage probe · does the live catalog hold ≥1 package for this origin→dest?
// We never mint a page for a route we can't actually sell. 2.5s race so a slow
// Firestore read can't stall the on-demand path; on timeout/error → false
// (conservative — skip generation rather than create a thin, inventory-less page).
async function hasCoverage(originCode, destIata) {
  const probe = db.collection('letto_packages')
    .where('origin.code', '==', originCode)
    .where('destination.code', '==', destIata)
    .limit(1).get()
    .then(snap => !snap.empty)
    .catch(() => false);
  const timeout = new Promise(resolve => setTimeout(() => resolve(false), 2500));
  return Promise.race([probe, timeout]);
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('method_not_allowed');
  }
  if (process.env.PSEO_ENABLED !== '1') return notFound(res);

  const slug = (req.query.slug || '').toString().trim().toLowerCase();
  if (!slug) return notFound(res);

  let page = null;
  try {
    page = await getPseoPage(slug);
  } catch (e) {
    console.error('[pseo-route] getPseoPage failed:', e.message);
    return res.status(500).send('internal');
  }

  if (!page) {
    // ── on-demand path ──
    if (process.env.PSEO_FULL !== '1') return notFound(res);
    if (!hasApiKey()) { console.warn('[pseo-route] PSEO_FULL=1 but no Anthropic key'); return notFound(res); }

    const parsed = parseSlug(slug);
    if (!parsed) return notFound(res);
    // refuse arbitrary/past months on the mint path (cache HITs are exempt)
    if (parsed.monthSlug && !monthBySlug(parsed.monthSlug)) return notFound(res);
    if (!(await hasCoverage(parsed.origin.code, parsed.dest.iata))) return notFound(res);

    try {
      const content = await generatePageContent(parsed);
      page = {
        slug,
        lang: parsed.lang,
        origin_code: parsed.origin.code,
        dest_iata: parsed.dest.iata,
        vibe_code: parsed.vibe ? parsed.vibe.code : null,
        monthSlug: parsed.monthSlug || null,
        copy: content.copy,
        faqs: content.faqs,
        isPreGenerated: false,
        generatedAt: Date.now(),
      };
      setPseoPage(slug, page).catch(e => console.error('[pseo-route] cache write failed:', e.message));
    } catch (e) {
      console.error('[pseo-route] generation failed for', slug, '·', e.message);
      return notFound(res);
    }
  }

  let html;
  try {
    html = renderPseoPage(page);
  } catch (e) {
    console.error('[pseo-route] render failed for', slug, '·', e.message);
    return res.status(500).send('internal');
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('X-Pseo-Source', page.isPreGenerated ? 'pre-gen' : 'on-demand');
  return res.status(200).send(html);
}

export default withSentry('pseo-route', handler);
