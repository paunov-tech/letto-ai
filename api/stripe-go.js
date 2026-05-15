// api/stripe-go.js — Form-POST redirect path to Stripe Checkout.
//
// Why: the JS path (fetch + window.location.href) sometimes fails due to
// browser popup blockers, mobile Safari async-gesture rules, or content
// extensions. Form POST is a synchronous user-gesture navigation that
// every browser respects, so this endpoint accepts a form-encoded body
// and returns a 303 redirect to the Stripe Checkout session URL.
//
// As of the May 2026 pricing simplification: single tier (Premium €9.99/mo
// + VAT). The legacy `tier` form field is accepted but ignored.

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
  const userEmail = (body.userEmail && typeof body.userEmail === 'string' && body.userEmail.includes('@'))
    ? body.userEmail.trim().toLowerCase()
    : undefined;

  const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
  if (!priceId) return res.status(500).send('price_not_configured');

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { source: 'letto', origin: 'landing-form' },
      subscription_data: { metadata: { source: 'letto' } },
      allow_promotion_codes: true,
      payment_method_collection: 'always',
      automatic_tax: { enabled: true },
      billing_address_collection: 'required',
      success_url: `${SITE_URL}/dobrodosao.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/?cancelled=1`,
      locale: 'auto',
      customer_email: userEmail
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(303, session.url);
  } catch (err) {
    // Log full err for debugging; response stays generic — Stripe errors can
    // include price/customer/account IDs that help attacker enumeration.
    console.error('[stripe-go] error:', err);
    return res.status(500).send('checkout_failed');
  }
}
