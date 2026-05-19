// scripts/generate-sitemap.mjs — Re-generate public/sitemap.xml.
//
// Source of URLs:
//   - User-facing pages (hardcoded · 9 entries · matches v29 SEO P0 set)
//   - Destination landing pages (from scripts/lib/destinations.mjs · 17 × SR + 17 × EN)
// Output: public/sitemap.xml · XHTML hreflang sibling links per URL.
//
// Run: `node scripts/generate-sitemap.mjs`
// Or:  `npm run build:seo` (also runs destination-page generator)
//
// No env vars required · purely deterministic from the destinations map.
import fs from 'node:fs';
import path from 'node:path';
import { DESTINATIONS } from './lib/destinations.mjs';

const ORIGIN = 'https://letto.live';
const TODAY  = new Date().toISOString().slice(0, 10);   // YYYY-MM-DD for <lastmod>

// User-facing pages with priority/freshness hints.
// /me, /trip, /results stay OUT — they're personalized / dynamic
// query-param driven, indexing them adds noise without value.
const STATIC_PAGES = [
  { slug: '',           priority: '1.0', changefreq: 'daily',   lang: 'sr-Latn' },
  { slug: 'about',      priority: '0.6', changefreq: 'monthly', lang: 'en'      },
  { slug: 'dobrodosao', priority: '0.5', changefreq: 'monthly', lang: 'sr-Latn' },
  { slug: 'impressum',  priority: '0.2', changefreq: 'yearly',  lang: 'sr-Latn' },
  { slug: 'privacy',    priority: '0.2', changefreq: 'yearly',  lang: 'sr-Latn' },
  { slug: 'terms',      priority: '0.2', changefreq: 'yearly',  lang: 'sr-Latn' }
];

function urlEntry({ loc, lastmod, priority, changefreq, hreflang }) {
  const lines = ['  <url>'];
  lines.push(`    <loc>${loc}</loc>`);
  if (lastmod)    lines.push(`    <lastmod>${lastmod}</lastmod>`);
  if (changefreq) lines.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority)   lines.push(`    <priority>${priority}</priority>`);
  if (hreflang) {
    for (const h of hreflang) {
      lines.push(`    <xhtml:link rel="alternate" hreflang="${h.lang}" href="${h.href}" />`);
    }
  }
  lines.push('  </url>');
  return lines.join('\n');
}

function buildStaticEntries() {
  return STATIC_PAGES.map(p => {
    const base = p.slug ? `${ORIGIN}/${p.slug}` : `${ORIGIN}/`;
    return urlEntry({
      loc: base,
      lastmod: TODAY,
      priority: p.priority,
      changefreq: p.changefreq,
      hreflang: [
        { lang: 'sr-Latn',   href: base },
        { lang: 'en',        href: base + (p.slug ? '?lang=en' : '?lang=en') },
        { lang: 'x-default', href: base }
      ]
    });
  });
}

function buildDestinationEntries() {
  const entries = [];
  for (const d of DESTINATIONS) {
    const srUrl = `${ORIGIN}/letovi-${d.srSlug}`;
    const enUrl = `${ORIGIN}/flights-${d.enSlug}`;
    const hreflang = [
      { lang: 'sr-Latn',   href: srUrl },
      { lang: 'en',        href: enUrl },
      { lang: 'x-default', href: srUrl }   // SR is primary
    ];
    entries.push(urlEntry({
      loc: srUrl, lastmod: TODAY, priority: '0.8', changefreq: 'daily', hreflang
    }));
    entries.push(urlEntry({
      loc: enUrl, lastmod: TODAY, priority: '0.7', changefreq: 'daily', hreflang
    }));
  }
  return entries;
}

const entries = [...buildStaticEntries(), ...buildDestinationEntries()];

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
  '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  entries.join('\n'),
  '</urlset>',
  ''
].join('\n');

const out = path.resolve('public/sitemap.xml');
fs.writeFileSync(out, xml);
console.log(`✓ sitemap.xml written · ${entries.length} URLs · ${xml.length} bytes`);
console.log(`  - ${STATIC_PAGES.length} static pages`);
console.log(`  - ${DESTINATIONS.length * 2} destination pages (SR + EN)`);
console.log(`  → ${out}`);
