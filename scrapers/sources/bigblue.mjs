// Big Blue Travel charter packages. Prices are populated client-side, so the
// unified scraping provider must return rendered HTML.
import { renderHtml } from '../lib/browser-render.mjs';
import { parseCharterCards } from '../lib/charter-html.mjs';

const BASE = 'https://bigblue.rs';

export async function scrapeBigBlue() {
  const html = await renderHtml(`${BASE}/`);
  if (!html) throw new Error('BigBlue rendered an empty document');
  return parseCharterCards(html, { baseUrl: BASE });
}
