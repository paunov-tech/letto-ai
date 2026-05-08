// api/spots-remaining.js — Public read endpoint for Beta scarcity counter.
// Counts active+trialing subs on STRIPE_BETA_PRICE_ID, returns 100 - sold.
// CDN-cached 5 min; on Stripe error, returns null so client can hide the number.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia'
});

const BETA_LIMIT = 100;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  try {
    const priceId = process.env.STRIPE_BETA_PRICE_ID;
    if (!priceId) {
      return res.status(500).json({ error: 'beta_price_not_configured' });
    }

    let sold = 0;
    for (const status of ['active', 'trialing']) {
      const subs = await stripe.subscriptions.list({ price: priceId, status, limit: 100 });
      sold += subs.data.length;
    }

    const remaining = Math.max(0, BETA_LIMIT - sold);
    return res.status(200).json({ remaining, sold, limit: BETA_LIMIT });
  } catch (e) {
    console.error('[LETTO API] /spots-remaining error:', e.message);
    return res.status(500).json({ remaining: null, error: 'stripe_unreachable' });
  }
}
