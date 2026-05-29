// api/sitemap-pseo.js — dynamic sitemap for pSEO landing pages (v43-C).
//
// Referenced from public/sitemap.xml (a <sitemapindex> after v43-C). Lists:
//   - every pre-gen slug   (priority 0.8) · always
//   - every on-demand slug (priority 0.6) · only when PSEO_FULL=1 (crawl-budget
//     control — we don't advertise on-demand pages until full mode is live)
//
// Each <url> carries SR↔EN hreflang siblings. Slugs that don't parse are
// skipped defensively. When PSEO_ENABLED!=1 we emit a valid EMPTY urlset
// rather than 404, so the parent sitemap index never reports a fetch error.

import { listIndex } from '../lib/pseo-storage.js';
import { parseSlug, siblingSlug } from '../lib/pseo-slug.js';

const ORIGIN = 'https://letto.live';

function urlEntry(slug, priority) {
  const parsed = parseSlug(slug);
  if (!parsed) return null;
  const sib = siblingSlug(parsed);
  const srSlug = parsed.lang === 'sr' ? slug : sib;
  const enSlug = parsed.lang === 'en' ? slug : sib;
  const srUrl = `${ORIGIN}/${srSlug}`;
  const enUrl = `${ORIGIN}/${enSlug}`;
  const loc = `${ORIGIN}/${slug}`;
  return [
    '  <url>',
    `    <loc>${loc}</loc>`,
    '    <changefreq>weekly</changefreq>',
    `    <priority>${priority}</priority>`,
    `    <xhtml:link rel="alternate" hreflang="sr-Latn" href="${srUrl}" />`,
    `    <xhtml:link rel="alternate" hreflang="en" href="${enUrl}" />`,
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${srUrl}" />`,
    '  </url>',
  ].join('\n');
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  let entries = [];
  if (process.env.PSEO_ENABLED === '1') {
    try {
      const preGen = await listIndex('pre_gen');
      entries = preGen.map(s => urlEntry(s, '0.8')).filter(Boolean);
      if (process.env.PSEO_FULL === '1') {
        const onDemand = await listIndex('on_demand');
        const seen = new Set(preGen);
        entries = entries.concat(
          onDemand.filter(s => !seen.has(s)).map(s => urlEntry(s, '0.6')).filter(Boolean)
        );
      }
    } catch (e) {
      console.error('[sitemap-pseo] listIndex failed:', e.message);
      // fall through to empty urlset — never 500 a sitemap
    }
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    entries.join('\n'),
    '</urlset>',
    '',
  ].join('\n');

  return res.status(200).send(xml);
}
