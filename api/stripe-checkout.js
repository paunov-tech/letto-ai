// api/stripe-checkout.js — Direct Stripe Checkout
// NO email required. Stripe collects email on its own page.
// User clicks ANY CTA → POST { tier, mixSnapshot? } → Stripe URL → user pays
// → webhook fires → Firestore subscriber created from session.customer_email
// + (for aimix tier) purchasedMixes record created from snapshot.

import Stripe from 'stripe';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { withSentry } from '../lib/sentry-backend.js';
import { getFirestore } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';

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

// F26 · expected currency for the entire Letto product line. Any divergence
// (Price ID flipped to USD, inline price_data typo, etc.) must hard-fail
// here before the Stripe session is created so we never collect money in
// a currency we can't reconcile.
const EXPECTED_CURRENCY = 'eur';

// Cache resolved Price → currency lookups for the warm function lifetime so
// repeated checkouts don't pay an extra Stripe API call each.
const priceCurrencyCache = new Map();
async function assertPriceCurrency(priceId) {
  if (priceCurrencyCache.has(priceId)) return priceCurrencyCache.get(priceId);
  const price = await stripe.prices.retrieve(priceId);
  const currency = (price.currency || '').toLowerCase();
  priceCurrencyCache.set(priceId, currency);
  return currency;
}

// Stripe metadata is limited to 50 keys × 500 chars per value, so we can't
// stuff a full mix snapshot (bookingUrls alone exceed that). Instead we
// persist the snapshot to Firestore pendingMixes/{pendingMixId} and put just
// the short ID in metadata. Webhook reads ID → fetches snapshot → finalizes
// purchasedMixes record.
async function persistPendingMix(mixSnapshot) {
  const pendingMixId = randomBytes(8).toString('hex'); // 16-char hex
  await db.collection('pendingMixes').doc(pendingMixId).set({
    snapshot: mixSnapshot,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString() // 24h TTL hint
  });
  return pendingMixId;
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tier = 'beta', mixSnapshot, userEmail } = req.body || {};
  // F18 · pre-fill Stripe checkout email when the frontend has it (currently
  // optional; Stripe still collects on its hosted page if missing). Limits
  // the Apple Pay / Express edge where wallet flows can omit email entirely.
  const customerEmail = (typeof userEmail === 'string' && userEmail.includes('@'))
    ? userEmail.trim().toLowerCase()
    : undefined;

  try {
    // aimix = €7.99 one-time unlock for Stage 3 AI Mix review (Mix V2)
    if (tier === 'aimix') {
      const aimixPriceId = process.env.STRIPE_AIMIX_PRICE_ID;
      const lineItem = aimixPriceId
        ? { price: aimixPriceId, quantity: 1 }
        : {
            price_data: {
              currency: 'eur',
              unit_amount: 799,
              product_data: {
                name: 'LETTO · Otključaj AI Mix',
                description: 'Jednokratan otključaj za AI Mix · pun pregled leta i hotela.'
              }
            },
            quantity: 1
          };

      // F26 · currency assertion. Inline path can typo `currency`; Price ID
      // path can drift in dashboard. Verify both shapes before we hand the
      // line item to Stripe.
      const inlineCurrency = lineItem.price_data && lineItem.price_data.currency;
      if (inlineCurrency && inlineCurrency.toLowerCase() !== EXPECTED_CURRENCY) {
        console.error('[stripe-checkout] currency mismatch (inline)',
          { expected: EXPECTED_CURRENCY, actual: inlineCurrency });
        return res.status(500).json({ error: 'Internal currency configuration error' });
      }
      if (lineItem.price) {
        const priceCurrency = await assertPriceCurrency(lineItem.price);
        if (priceCurrency !== EXPECTED_CURRENCY) {
          console.error('[stripe-checkout] currency mismatch (Price ID)',
            { priceId: lineItem.price, expected: EXPECTED_CURRENCY, actual: priceCurrency });
          return res.status(500).json({ error: 'Internal currency configuration error' });
        }
      }

      const metadata = { tier, source: 'letto', origin: 'mix-stage3' };
      if (mixSnapshot && typeof mixSnapshot === 'object') {
        metadata.pendingMixId = await persistPendingMix(mixSnapshot);
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [lineItem],
        metadata,
        payment_intent_data: { metadata: { ...metadata } },
        allow_promotion_codes: true,
        success_url: `${SITE_URL}/results.html?unlock=aimix&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${SITE_URL}/results.html?cancelled=1`,
        locale: 'auto',
        billing_address_collection: 'auto',
        customer_creation: 'always',
        customer_email: customerEmail
      });

      return res.status(200).json({ url: session.url, sessionId: session.id });
    }

    // beta = €19/3mo (first 100), premium = €29/3mo (full price)
    const priceId = tier === 'premium'
      ? process.env.STRIPE_PREMIUM_PRICE_ID
      : process.env.STRIPE_BETA_PRICE_ID;

    if (!priceId) {
      return res.status(500).json({
        error: 'Price ID not configured',
        details: `Missing env var STRIPE_${tier.toUpperCase()}_PRICE_ID`
      });
    }

    // F26 · currency assertion on the subscription Price ID.
    const subPriceCurrency = await assertPriceCurrency(priceId);
    if (subPriceCurrency !== EXPECTED_CURRENCY) {
      console.error('[stripe-checkout] subscription currency mismatch',
        { tier, priceId, expected: EXPECTED_CURRENCY, actual: subPriceCurrency });
      return res.status(500).json({ error: 'Internal currency configuration error' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { tier, source: 'letto', origin: 'landing' },
      subscription_data: {
        metadata: { tier, source: 'letto' },
        trial_period_days: 14
      },
      allow_promotion_codes: true,
      payment_method_collection: 'always',
      success_url: `${SITE_URL}/dobrodosao.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/?cancelled=1`,
      locale: 'auto',
      billing_address_collection: 'auto',
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
