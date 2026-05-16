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
const db = getFirestore();

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

  const contentType = (req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ error: 'content_type_required' });
  }

  const referer = req.headers.referer;
  if (referer && !referer.startsWith('https://letto.live')) {
    return res.status(403).json({ error: 'forbidden_origin' });
  }

  // Tier is a no-op post-66f0162 — only the 'premium' SKU exists. Hard-fail any
  // explicit non-premium value so a future multi-tier reintroduction can't
  // silently misroute, and probing clients can't spam default-tier sessions.
  const tier = (req.body && req.body.tier) ?? 'premium';
  if (tier !== 'premium') {
    return res.status(400).json({ error: 'unknown_tier' });
  }

  const { userEmail } = req.body || {};
  // F18 · pre-fill Stripe checkout email when the frontend has it. Limits the
  // Apple Pay / Express edge where wallet flows can omit email entirely.
  const customerEmail = (typeof userEmail === 'string' && userEmail.includes('@'))
    ? userEmail.trim().toLowerCase()
    : undefined;

  // Optional tripId — a Mix persisted via /api/save-mix just before checkout.
  // Verify it points at a live pending_mixes doc and reject early on a stale
  // or bogus id, so we never mint a Stripe session whose success_url can't
  // resolve to a real trip.
  let tripId = (req.body && typeof req.body.tripId === 'string' && /^[a-f0-9]{16}$/.test(req.body.tripId))
    ? req.body.tripId
    : null;
  if (tripId) {
    const pendingDoc = await db.collection('pending_mixes').doc(tripId).get();
    if (!pendingDoc.exists) return res.status(400).json({ error: 'mix_not_found' });
    const pd = pendingDoc.data();
    const exp = pd.expiresAt && typeof pd.expiresAt.toDate === 'function' ? pd.expiresAt.toDate() : null;
    if (exp && exp < new Date()) return res.status(400).json({ error: 'mix_expired' });
    if (pd.status && pd.status !== 'pending') return res.status(400).json({ error: 'mix_invalid_status' });
  }

  const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
  if (!priceId) {
    console.error('[stripe-checkout] Missing env var STRIPE_PREMIUM_PRICE_ID');
    return res.status(500).json({ error: 'configuration_error' });
  }

  try {
    // F26 · currency assertion. Hard-fails before checkout creation.
    const subPriceCurrency = await assertPriceCurrency(priceId);
    if (subPriceCurrency !== EXPECTED_CURRENCY) {
      console.error('[stripe-checkout] subscription currency mismatch',
        { priceId, expected: EXPECTED_CURRENCY, actual: subPriceCurrency });
      return res.status(500).json({ error: 'Internal currency configuration error' });
    }

    // With a tripId, land the buyer on their Mix (/trip/{tripId}); without
    // one, the legacy direct-subscribe landing (/dobrodosao.html).
    const successUrl = tripId
      ? `${SITE_URL}/trip/${tripId}?session={CHECKOUT_SESSION_ID}`
      : `${SITE_URL}/dobrodosao.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = tripId
      ? `${SITE_URL}/results.html?cancelled=1&trip=${tripId}`
      : `${SITE_URL}/?cancelled=1`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { source: 'letto', origin: 'landing', ...(tripId ? { tripId } : {}) },
      subscription_data: { metadata: { source: 'letto' } },
      allow_promotion_codes: true,
      payment_method_collection: 'always',
      // Stripe Tax computes VAT per customer billing address (requires Tax
      // enabled in dashboard; with tax_behavior=exclusive on the Price, the
      // €9.99 displays + VAT is added at checkout).
      automatic_tax: { enabled: true },
      // Stripe Tax requires billing address to compute VAT per jurisdiction.
      billing_address_collection: 'required',
      success_url: successUrl,
      cancel_url: cancelUrl,
      locale: 'auto',
      customer_email: customerEmail
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    // Log full err for debugging in Vercel logs + Sentry (withSentry wrapper
    // captures the throw). Response keeps a generic message — Stripe errors
    // can include price IDs, customer IDs, "no such customer cus_XXX", etc.
    console.error('[stripe-checkout] error:', err);
    return res.status(500).json({
      error: 'checkout_failed',
      message: 'Could not create checkout session. Please try again or contact info@letto.live.'
    });
  }
}

export default withSentry('stripe-checkout', handler);
