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
// Aviasales SPA only accepts the 4-digit DDMM date encoding in path:
//   /search/{ORG3}{DDMM}{DST3}{DDMM}{ADULTS}[{CHILDREN}[{INFANTS}]]
//     e.g. BEG1306LIS15061 — BEG, 13 Jun, LIS, 15 Jun, 1 adult
//
// The 6-digit YYMMDD form some seeds use (BEG260615IST2606191 = 2026-06-15)
// is rejected by the SPA hydration with "Oops, the search failed to launch".
// We convert YYMMDD → DDMM in-place so all downstream consumers see the
// canonical form.

const SIX_DIGIT_RE = /^\/search\/([A-Z]{3})(\d{2})(\d{2})(\d{2})([A-Z]{3})(\d{2})(\d{2})(\d{2})(\d+)$/;
const FOUR_DIGIT_RE = /^\/search\/[A-Z]{3}\d{4}[A-Z]{3}\d{4}\d+$/;

export function cleanAviasalesUrl(originalUrl, marker = '722287') {
  if (!originalUrl || typeof originalUrl !== 'string') return originalUrl;
  if (!originalUrl.includes('aviasales.com/search/')) return originalUrl;
  try {
    const u = new URL(originalUrl);
    let pathname = u.pathname;

    // Step 1 · convert 6-digit YYMMDD format → 4-digit DDMM format.
    // Pattern: /search/{ORG}{YY}{MM}{DD}{DST}{YY}{MM}{DD}{trailing pax digits}
    const sixDigit = pathname.match(SIX_DIGIT_RE);
    if (sixDigit) {
      // eslint-disable-next-line no-unused-vars
      const [, org1, _yy1, mm1, dd1, org2, _yy2, mm2, dd2, trail] = sixDigit;
      pathname = `/search/${org1}${dd1}${mm1}${org2}${dd2}${mm2}${trail}`;
    }

    // Step 2 · validate final shape is the 4-digit form Aviasales accepts.
    // If it isn't (junk path, only /search/, etc.) bail out with the
    // original URL — better to ship something that might work than a URL
    // we know is malformed.
    if (!FOUR_DIGIT_RE.test(pathname)) {
      return originalUrl;
    }

    return `https://www.aviasales.com${pathname}?marker=${marker}`;
  } catch {
    return originalUrl;
  }
}

// Build a canonical Aviasales URL from package fields (origin, destination,
// dates, pax). Used as a fallback when mining engine writes a package without
// a flight.bookingUrl — frontend would otherwise click into the void.
//
// Returns null if any required field is missing — caller decides whether to
// pass through an empty string or skip the CTA entirely.
//
// Pkg shape (Letto canonical):
//   {
//     origin:      { code: 'BEG' },
//     destination: { code: 'IST' },
//     dates:       { departure: 'YYYY-MM-DD', return: 'YYYY-MM-DD' },
//     pax: optional. If absent, defaults to 1 adult.
//   }
function ddmmFromIso(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return m[3] + m[2]; // DDMM
}

export function buildAviasalesUrl(pkg, marker = '722287') {
  if (!pkg || typeof pkg !== 'object') return null;
  const origin = pkg.origin && pkg.origin.code;
  const dest = pkg.destination && pkg.destination.code;
  const dates = pkg.dates || {};
  const departDDMM = ddmmFromIso(dates.departure);
  const returnDDMM = ddmmFromIso(dates.return);
  if (!origin || !/^[A-Z]{3}$/.test(origin)) return null;
  if (!dest || !/^[A-Z]{3}$/.test(dest)) return null;
  if (!departDDMM || !returnDDMM) return null;
  // Adults default 1; ignore children/infants in the URL until we have a
  // proven multi-pax format that Aviasales SPA accepts (the trailing-digits
  // pattern is poorly documented and we already saw 6-digit dates blow up).
  const pax = '1';
  const path = `/search/${origin}${departDDMM}${dest}${returnDDMM}${pax}`;
  return `https://www.aviasales.com${path}?marker=${marker}`;
}
