// api/stripe-go.js — Form-POST redirect path to Stripe Checkout.
//
// Why: the JS path (fetch + window.location.href) sometimes fails due to
// browser popup blockers, mobile Safari async-gesture rules, or content
// extensions. Form POST is a synchronous user-gesture navigation that
// every browser respects, so this endpoint accepts a form-encoded `tier`
// and returns a 303 redirect to the Stripe Checkout session URL.
//
// Frontend uses this as a fallback when the fetch/JSON path fails.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia'
});
const SITE_URL = process.env.VITE_SITE_URL || 'https://letto.live';

async function readForm(req) {
  // Accept both x-www-form-urlencoded and pre-parsed JSON bodies (Vercel parses some types).
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  const raw = Buffer.concat(chunks).toString('utf8');
  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (ct.includes('json')) try { return JSON.parse(raw); } catch { return {}; }
  const out = {};
  for (const pair of raw.split('&').filter(Boolean)) {
    const [k, v] = pair.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent((v || '').replace(/\+/g, ' '));
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method not allowed');
  }

  const body = await readForm(req);
  const tier = (body.tier || 'beta').toString().trim();

  try {
    let session;
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
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [lineItem],
        metadata: { tier, source: 'letto', origin: 'mix-stage3-form' },
        payment_intent_data: { metadata: { tier, source: 'letto' } },
        allow_promotion_codes: true,
        success_url: `${SITE_URL}/results.html?unlock=aimix&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${SITE_URL}/results.html?cancelled=1`,
        locale: 'auto',
        billing_address_collection: 'auto',
        customer_creation: 'always'
      });
    } else {
      const priceId = tier === 'premium'
        ? process.env.STRIPE_PREMIUM_PRICE_ID
        : process.env.STRIPE_BETA_PRICE_ID;
      if (!priceId) return res.status(500).send('price_not_configured');
      session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { tier, source: 'letto', origin: 'landing-form' },
        subscription_data: { metadata: { tier, source: 'letto' }, trial_period_days: 14 },
        allow_promotion_codes: true,
        payment_method_collection: 'always',
        success_url: `${SITE_URL}/dobrodosao.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${SITE_URL}/?cancelled=1`,
        locale: 'auto',
        billing_address_collection: 'auto'
      });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(303, session.url);
  } catch (err) {
    console.error('[stripe-go] error:', err.message);
    return res.status(500).send('checkout_failed: ' + err.message);
  }
}
