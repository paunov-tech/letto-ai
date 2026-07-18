import { withSentry } from '../lib/sentry-backend.js';
import { applyRateLimit } from '../lib/rate-limit.js';
import { searchBookingHotelDestinations } from '../lib/booking-destination-provider.js';

// City autocomplete for the hotel-only path. This is intentionally separate
// from /api/destination-search: that endpoint returns only airports and is
// correct for flights, but wrong for a stay in a place without an airport.
async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (applyRateLimit(req, res, { scope: 'hotel-destination-search', limit: 40, windowMs: 60_000 })) return;
  const query = String(req.query?.q || '').trim();
  if (query.length < 2 || query.length > 80) {
    return res.status(400).json({ error: 'query_must_be_2_to_80_characters' });
  }
  const result = await searchBookingHotelDestinations(query);
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).json({
    cities: result.destinations,
    count: result.destinations.length,
    provider: 'booking-com15',
    error: result.error || null
  });
}

export default withSentry('hotel-destination-search', handler);
