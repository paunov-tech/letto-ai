// scripts/lib/pexels.mjs — Pexels API helper.
// fetchCityPhoto(city) → { url, photographer, photographerUrl, alt, pexelsId, sourceUrl }
//
// Usage in scrapers/scripts (NodeJS) and Vercel functions.
// Uses landscape orientation, picks first result (most popular).

const ENDPOINT = 'https://api.pexels.com/v1/search';

export async function fetchCityPhoto(city, opts = {}) {
  const apiKey = opts.apiKey || process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error('PEXELS_API_KEY missing');
  if (!city) throw new Error('city required');

  const params = new URLSearchParams({
    query: city,
    per_page: '1',
    orientation: 'landscape'
  });

  const r = await fetch(`${ENDPOINT}?${params}`, {
    headers: { Authorization: apiKey }
  });

  if (!r.ok) throw new Error(`Pexels ${r.status}: ${(await r.text()).slice(0, 200)}`);

  const data = await r.json();
  const p = data.photos?.[0];
  if (!p) return null;

  // Use landscape variant — 1200×627, optimized for hero/card display
  const url = p.src?.landscape || p.src?.large2x || p.src?.large || p.src?.original;

  return {
    url,
    photographer: p.photographer || '',
    photographerUrl: p.photographer_url || '',
    alt: p.alt || `${city} photograph`,
    pexelsId: p.id,
    sourceUrl: p.url || ''
  };
}
