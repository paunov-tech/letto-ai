import { withSentry } from '../lib/sentry-backend.js';
import { applyRateLimit } from '../lib/rate-limit.js';
import { searchGlobalAirports } from '../lib/booking-destination-provider.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (applyRateLimit(req, res, { scope: 'destination-search', limit: 40, windowMs: 60_000 })) return;
  const query = String(req.query?.q || '').trim();
  if (query.length < 2 || query.length > 80) {
    return res.status(400).json({ error: 'query_must_be_2_to_80_characters' });
  }
  const result = await searchGlobalAirports(query);
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).json({
    airports: result.airports.slice(0, 12),
    count: Math.min(result.airports.length, 12),
    provider: result.provider,
    error: result.error || null
  });
}

export default withSentry('destination-search', handler);
