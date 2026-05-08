// api/stripe-checkout.js — Direct Stripe Checkout
// NO email required. Stripe collects email on its own page.
// User clicks ANY CTA → POST { tier } → Stripe URL → user pays → webhook fires → Firestore subscriber created from session.customer_email

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia'
});

const SITE_URL = process.env.VITE_SITE_URL || 'https://letto.live';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tier = 'beta' } = req.body || {};

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

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [lineItem],
        metadata: { tier, source: 'letto', origin: 'mix-stage3' },
        payment_intent_data: {
          metadata: { tier, source: 'letto' }
        },
        allow_promotion_codes: true,
        success_url: `${SITE_URL}/results.html?unlock=aimix&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${SITE_URL}/results.html?cancelled=1`,
        locale: 'auto',
        billing_address_collection: 'auto',
        customer_creation: 'always'
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

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      // NO customer_email — Stripe collects it. THIS is the fix.
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { tier, source: 'letto', origin: 'landing' },
      subscription_data: {
        metadata: { tier, source: 'letto' },
        trial_period_days: 14
      },
      allow_promotion_codes: true,
      // In subscription mode, Stripe creates a Customer automatically; customer_creation is invalid here.
      // payment_method_collection 'always' ensures card is captured even on free trial.
      payment_method_collection: 'always',
      success_url: `${SITE_URL}/dobrodosao.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/?cancelled=1`,
      locale: 'auto',
      billing_address_collection: 'auto'
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
