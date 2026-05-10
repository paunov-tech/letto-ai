// FAZA · P0 · Aviasales URL regeneration.
//
// Mining engine v4 produced bookingUrls embedding TP partner fare tokens
// (expected_price_uuid, static_fare_key, search_date, t=) that expire after
// ~24-48h. After expiry the Aviasales SPA cannot resolve the fare and
// falls back to the homepage / origin-only search — broken UX visible on
// every package older than 2 days.
//
// Fix: strip every query token, keep the canonical /search/{ROUTE} path
// (which encodes origin+destination+dates+pax inline), append the
// affiliate marker. Aviasales SPA bootstraps the search from the path
// alone, so the cleaned URL is durable indefinitely.
//
// Aviasales accepts two date encodings in the path:
//   /search/{ORG3}{DDMM}{DST3}{DDMM}{ADULTS}[{CHILDREN}[{INFANTS}]]
//     e.g. BEG1306LIS15061 — BEG, 13 Jun, LIS, 15 Jun, 1 adult (year inferred)
//   /search/{ORG3}{YYMMDD}{DST3}{YYMMDD}{ADULTS}[{CHILDREN}[{INFANTS}]]
//     e.g. BEG260520ATH2605231 — BEG, 2026-05-20, ATH, 2026-05-23, 1 adult
// We accept either with \d{4,6} on each date segment.

const PATH_RE = /^\/search\/[A-Z]{3}\d{4,6}[A-Z]{3}\d{4,6}\d{1,3}$/;

export function cleanAviasalesUrl(originalUrl, marker = '722287') {
  if (!originalUrl || typeof originalUrl !== 'string') return originalUrl;
  if (!originalUrl.includes('aviasales.com/search/')) return originalUrl;
  try {
    const u = new URL(originalUrl);
    // Path must be /search/{ROUTE}; if it's just /search/ (no encoded route)
    // we have nothing to keep — return original so we don't silently produce
    // a worse URL.
    if (!PATH_RE.test(u.pathname)) {
      return originalUrl;
    }
    return `https://www.aviasales.com${u.pathname}?marker=${marker}`;
  } catch {
    return originalUrl;
  }
}
