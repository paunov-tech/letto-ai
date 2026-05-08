// scrapers/lib/smartproxy.mjs — Smartproxy Web Scraping API client (uni_scraper target).
// Replaces Puppeteer entirely. ~1500 req/month plan budget.
//
// Auth: Basic base64(user:pass) via SMARTPROXY_AUTH env var (full "Basic xyz==" string)
//       OR via SMARTPROXY_USER + SMARTPROXY_PASS pair.

const ENDPOINT = process.env.SMARTPROXY_ENDPOINT || 'https://scraper.smartproxy.org/v1/query';
const DEFAULT_GEO = process.env.SMARTPROXY_GEO || 'RS';
const DEFAULT_LOCALE = process.env.SMARTPROXY_LOCALE || 'en-US';

function authHeader() {
  if (process.env.SMARTPROXY_AUTH) {
    return process.env.SMARTPROXY_AUTH.startsWith('Basic ')
      ? process.env.SMARTPROXY_AUTH
      : 'Basic ' + process.env.SMARTPROXY_AUTH;
  }
  if (process.env.SMARTPROXY_USER && process.env.SMARTPROXY_PASS) {
    const b64 = Buffer.from(`${process.env.SMARTPROXY_USER}:${process.env.SMARTPROXY_PASS}`).toString('base64');
    return 'Basic ' + b64;
  }
  throw new Error('Smartproxy auth not configured (SMARTPROXY_AUTH or SMARTPROXY_USER+SMARTPROXY_PASS)');
}

/**
 * Scrape a URL via Smartproxy's universal scraper.
 *
 * @param {string} url — target URL
 * @param {object} opts
 * @param {boolean} opts.jsRender — true for headless browser render, false for raw HTML (cheaper)
 * @param {string}  opts.geo — country code (default: RS)
 * @param {string}  opts.locale — locale tag (default: en-US)
 * @param {number}  opts.timeoutMs — request timeout (default: 90000)
 * @returns {Promise<{html?: string, status?: number, results?: any[]}>}
 */
export async function scrape(url, opts = {}) {
  const body = {
    geo: opts.geo || DEFAULT_GEO,
    locale: opts.locale || DEFAULT_LOCALE,
    js_render: opts.jsRender === true,
    format: ['html'],
    context: {
      url,
      screenshot_type: 1
    },
    source: 'uni_scraper'
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 90000);
  let r;
  try {
    r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': authHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
  } finally {
    clearTimeout(timer);
  }

  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Smartproxy ${r.status}: ${txt.slice(0, 300)}`);
  }

  const data = await r.json();
  // Response shape: { results: [{ content: "<html>...</html>", status_code: 200, url: "..." }] }
  // OR: { results: [{ content: {...}, ... }] } if format includes parsed JSON
  const first = data.results?.[0];
  if (!first) return { ...data, html: null };

  return {
    html: typeof first.content === 'string' ? first.content : JSON.stringify(first.content),
    status: first.status_code,
    finalUrl: first.url,
    raw: data
  };
}

/**
 * Per-account quota tracking (best-effort).
 * Smartproxy's API doesn't expose quota in response headers; we count locally.
 */
let _localCount = 0;
export function getLocalQuotaUsed() { return _localCount; }
export function bumpQuotaCounter() { _localCount++; }
