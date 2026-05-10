// api/customer-portal.js — Stripe Billing Portal session creator.
//
// On-demand self-serve cancellation / payment-method update for paid
// subscribers. Replaces the broken `<a href="#">Stripe portal</a>`
// placeholder in /dobrodosao.html and the same pattern anywhere else we
// surface a "manage subscription" link.
//
// Two resolution paths, in order of preference:
//   1. sessionId  → stripe.checkout.sessions.retrieve → session.customer
//      (most accurate, comes from localStorage the welcome page wrote
//      when the user landed via Stripe success_url with ?session_id=...)
//   2. email      → stripe.customers.list({email}) → first customer
//      (fallback — useful when sessionId is missing but user can type
//      their email manually, e.g. from a future "manage" form)
//
// On success: returns { url } pointing at Stripe-hosted portal.
// On failure: 4xx / 5xx with { error } string — frontend shows it.

import Stripe from 'stripe';
import { withSentry } from '../lib/sentry-backend.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia'
});

const PORTAL_RETURN_URL = (process.env.VITE_SITE_URL || 'https://letto.live') + '/dobrodosao.html';

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  const { email, sessionId } = req.body || {};

  if (!email && !sessionId) {
    return res.status(400).json({ error: 'email or sessionId required' });
  }
  if (sessionId && (typeof sessionId !== 'string' || !sessionId.startsWith('cs_'))) {
    return res.status(400).json({ error: 'sessionId must be a Stripe Checkout Session id (cs_...)' });
  }
  if (email && (typeof email !== 'string' || !email.includes('@'))) {
    return res.status(400).json({ error: 'email must contain @' });
  }

  try {
    let customerId = null;

    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      // Source guard — same Stripe account is shared with jadran.ai.
      if (session.metadata?.source && session.metadata.source !== 'letto') {
        return res.status(403).json({ error: 'session not from letto' });
      }
      customerId = session.customer;
      if (!customerId) {
        return res.status(404).json({ error: 'session has no associated customer (likely never paid)' });
      }
    } else {
      const customers = await stripe.customers.list({ email: email.toLowerCase(), limit: 1 });
      if (!customers.data.length) {
        return res.status(404).json({ error: 'no Stripe customer for that email' });
      }
      customerId = customers.data[0].id;
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: PORTAL_RETURN_URL
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (err) {
    console.error('[customer-portal]', err.message);
    return res.status(500).json({ error: err.message });
  }
}

export default withSentry('customer-portal', handler);
