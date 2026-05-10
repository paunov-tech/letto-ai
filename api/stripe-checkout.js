// api/stripe-checkout.js — Single-tier Stripe Checkout · Letto Premium €9.99/mo + VAT.
//
// As of the May 2026 pricing simplification:
//   - One product, one price (STRIPE_PREMIUM_PRICE_ID, recurring monthly).
//   - mode: 'subscription', tax_behavior: 'exclusive' on the Price → Stripe Tax
//     adds VAT per customer billing address (requires Tax enabled in Dashboard).
//   - The legacy `tier` request field (aimix / beta / premium) is accepted but
//     ignored — every CTA across the frontend now flows here. Frontend doesn't
//     need to be aware of pricing tiers any more.
//   - aimix one-time unlock and beta/premium 3-month variants are gone. Inline
//     price_data is gone. pendingMixes / mixSnapshot path is gone.

import Stripe from 'stripe';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { withSentry } from '../lib/sentry-backend.js';
import { getFirestore } from 'firebase-admin/firestore';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia'
});

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: 'letto-ai',
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
}
// db left initialised in case future per-checkout Firestore writes appear; not used today.
getFirestore();

const SITE_URL = process.env.VITE_SITE_URL || 'https://letto.live';
const EXPECTED_CURRENCY = 'eur';

const priceCurrencyCache = new Map();
async function assertPriceCurrency(priceId) {
  if (priceCurrencyCache.has(priceId)) return priceCurrencyCache.get(priceId);
  const price = await stripe.prices.retrieve(priceId);
  const currency = (price.currency || '').toLowerCase();
  priceCurrencyCache.set(priceId, currency);
  return currency;
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userEmail } = req.body || {};
  // F18 · pre-fill Stripe checkout email when the frontend has it. Limits the
  // Apple Pay / Express edge where wallet flows can omit email entirely.
  const customerEmail = (typeof userEmail === 'string' && userEmail.includes('@'))
    ? userEmail.trim().toLowerCase()
    : undefined;

  const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
  if (!priceId) {
    return res.status(500).json({
      error: 'Price ID not configured',
      details: 'Missing env var STRIPE_PREMIUM_PRICE_ID'
    });
  }

  try {
    // F26 · currency assertion. Hard-fails before checkout creation.
    const subPriceCurrency = await assertPriceCurrency(priceId);
    if (subPriceCurrency !== EXPECTED_CURRENCY) {
      console.error('[stripe-checkout] subscription currency mismatch',
        { priceId, expected: EXPECTED_CURRENCY, actual: subPriceCurrency });
      return res.status(500).json({ error: 'Internal currency configuration error' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { source: 'letto', origin: 'landing' },
      subscription_data: { metadata: { source: 'letto' } },
      allow_promotion_codes: true,
      payment_method_collection: 'always',
      // Stripe Tax computes VAT per customer billing address (requires Tax
      // enabled in dashboard; with tax_behavior=exclusive on the Price, the
      // €9.99 displays + VAT is added at checkout).
      automatic_tax: { enabled: true },
      // Stripe Tax requires billing address to compute VAT per jurisdiction.
      billing_address_collection: 'required',
      success_url: `${SITE_URL}/dobrodosao.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/?cancelled=1`,
      locale: 'auto',
      customer_email: customerEmail
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({
      error: 'Failed to create checkout session',
      details: err.message
    });
  }
}

export default withSentry('stripe-checkout', handler);
