// Kontiki Travel charter packages. Prices are populated client-side, so these
// pages are rendered in the host's isolated headless Chromium.
import { renderHtml } from '../lib/browser-render.mjs';
import { parseCharterCards } from '../lib/charter-html.mjs';

const BASE = 'https://kontiki.rs';

export async function scrapeKontiki() {
  const html = await renderHtml(`${BASE}/`);
  if (!html) throw new Error('Kontiki rendered an empty document');
  return parseCharterCards(html, { baseUrl: BASE });
}
