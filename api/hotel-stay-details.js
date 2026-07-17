import { withSentry } from '../lib/sentry-backend.js';
import { applyRateLimit } from '../lib/rate-limit.js';
import { propertyPageStayDetails } from '../lib/hotel-page-details.js';
import { isBrightDataConfigured, scrapeWithBrightData } from '../scrapers/lib/brightdata.mjs';

function isSupportedPropertyUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (
      /(^|\.)booking\.com$/i.test(url.hostname) ||
      /(^|\.)hotels\.com$/i.test(url.hostname)
    );
  } catch (_) {
    return false;
  }
}

function isLettoOrigin(value) {
  try {
    const host = new URL(value).hostname;
    return host === 'letto.live' || host === 'www.letto.live' || host.endsWith('.vercel.app');
  } catch (_) {
    return false;
  }
}

async function handler(req, res) {
  const origin = req.headers.origin || req.headers.referer || '';
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!isLettoOrigin(origin)) return res.status(403).json({ error: 'forbidden_origin' });
  if (applyRateLimit(req, res, { scope: 'hotel-stay-details', limit: 10, windowMs: 60_000 })) return;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  const bookingUrl = String(req.body?.bookingUrl || '');
  if (!isSupportedPropertyUrl(bookingUrl)) return res.status(400).json({ error: 'invalid_property_url' });
  if (!isBrightDataConfigured()) return res.status(503).json({ error: 'detail_provider_unavailable' });
  try {
    const page = await scrapeWithBrightData(bookingUrl, { geo: 'rs', timeoutMs: 45000 });
    return res.status(200).json({
      stayDetails: propertyPageStayDetails(page.html),
      checkedAt: new Date().toISOString(),
      source: page.provider
    });
  } catch (error) {
    console.warn('[hotel-stay-details] source unavailable:', error.message);
    return res.status(200).json({
      stayDetails: { amenities: [], source: 'unavailable', scope: 'property_only' },
      checkedAt: new Date().toISOString(), source: 'brightdata_unavailable'
    });
  }
}

export default withSentry('hotel-stay-details', handler);
