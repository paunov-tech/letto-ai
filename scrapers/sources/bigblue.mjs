// Big Blue uses the same public structured search platform as Kontiki, on its
// own domain and inventory. Reuse the API chain, never Kontiki's result data.
import { scrapeStructuredPackages } from './kontiki.mjs';
import { renderHtml } from '../lib/browser-render.mjs';
import { parseCharterCards } from '../lib/charter-html.mjs';

const BASE = 'https://bigblue.rs';
export async function scrapeBigBlue() {
  const [structured, catalog] = await Promise.allSettled([
    scrapeStructuredPackages(BASE),
    renderHtml(BASE).then(html => parseCharterCards(html, { baseUrl: BASE }))
  ]);
  const rows = [
    ...(catalog.status === 'fulfilled' ? catalog.value : []),
    ...(structured.status === 'fulfilled' ? structured.value : [])
  ];
  if (!rows.length) throw (structured.reason || catalog.reason || new Error('Big Blue returned no offers'));
  return rows;
}
