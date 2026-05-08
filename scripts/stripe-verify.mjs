#!/usr/bin/env node
// Verify Stripe infrastructure is wired correctly end-to-end.
// Runs after Miroslav has created products + webhook in dashboard and
// Claude has pushed env vars to Vercel production.
//
// Usage:
//   node scripts/stripe-verify.mjs
// Reads env from process.env (run via `vercel env pull` first, then `dotenv`
// or just `export $(xargs < .env.local)`).

import Stripe from 'stripe';

const required = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PREMIUM_PRICE_ID',
  'STRIPE_BETA_COUPON_ID',
  'VITE_STRIPE_PUBLISHABLE_KEY'
];

let hadError = false;
const report = (ok, label, detail = '') => {
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) hadError = true;
};

console.log('\n── env vars ──');
for (const k of required) {
  report(!!process.env[k], k, process.env[k] ? 'present' : 'MISSING');
}

if (!process.env.STRIPE_SECRET_KEY) {
  console.log('\nFatal: STRIPE_SECRET_KEY missing. Aborting.');
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia'
});

console.log('\n── stripe api ──');
try {
  const acct = await stripe.accounts.retrieve();
  report(true, 'account reachable', `${acct.id} (${acct.country})`);
  const mode = process.env.STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST';
  report(mode === 'LIVE', `mode = ${mode}`, mode === 'TEST' ? 'switch to sk_live_... before launch' : '');
} catch (e) {
  report(false, 'account fetch failed', e.message);
}

console.log('\n── price ──');
const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
if (priceId) {
  try {
    const p = await stripe.prices.retrieve(priceId, { expand: ['product'] });
    const currency = p.currency.toUpperCase();
    const amount = (p.unit_amount / 100).toFixed(2);
    const interval = p.recurring ? `/${p.recurring.interval_count}${p.recurring.interval[0]}` : ' one-time';
    const active = p.active ? 'active' : 'ARCHIVED';
    const expected3mo = p.recurring?.interval === 'month' && p.recurring?.interval_count === 3;
    report(p.active && expected3mo, 'premium price', `${amount} ${currency}${interval}, product="${p.product.name}", ${active}${expected3mo ? '' : ' — EXPECTED 3-month recurring'}`);
  } catch (e) {
    report(false, 'premium price', `${priceId} → ${e.message}`);
  }
}

console.log('\n── beta coupon ──');
const couponId = process.env.STRIPE_BETA_COUPON_ID;
if (couponId) {
  try {
    const c = await stripe.coupons.retrieve(couponId);
    const discount = c.amount_off
      ? `${(c.amount_off / 100).toFixed(2)} ${c.currency?.toUpperCase()} off`
      : `${c.percent_off}% off`;
    const usage = c.max_redemptions
      ? `${c.times_redeemed}/${c.max_redemptions} used`
      : `${c.times_redeemed} used (unlimited)`;
    report(c.valid, 'coupon', `${c.id}: ${discount}, ${usage}, valid=${c.valid}`);
  } catch (e) {
    report(false, 'coupon', `${couponId} → ${e.message}`);
  }
}

console.log('\n── webhook ──');
try {
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const prod = endpoints.data.find(e => e.url === 'https://letto.live/api/stripe-webhook');
  if (!prod) {
    report(false, 'webhook endpoint', 'not found at https://letto.live/api/stripe-webhook — create it in dashboard');
  } else {
    report(prod.status === 'enabled', `endpoint ${prod.id}`, `status=${prod.status}`);
    const expected = new Set(['checkout.session.completed', 'invoice.paid', 'customer.subscription.deleted']);
    const missing = [...expected].filter(e => !prod.enabled_events.includes(e) && !prod.enabled_events.includes('*'));
    const extra = prod.enabled_events.filter(e => !expected.has(e) && e !== '*');
    report(missing.length === 0, 'required events enabled', missing.length ? `missing: ${missing.join(', ')}` : `${prod.enabled_events.length} events`);
    if (extra.length) console.log(`   ℹ extra events (OK, just noisy): ${extra.join(', ')}`);
  }
} catch (e) {
  report(false, 'webhook list failed', e.message);
}

console.log('\n── live endpoint ping ──');
try {
  const r = await fetch('https://letto.live/api/stripe-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'stripe-verify@letto.live', tier: 'beta' })
  });
  const body = await r.json().catch(() => ({}));
  if (r.ok && body.url?.startsWith('https://checkout.stripe.com/')) {
    report(true, 'POST /api/stripe-checkout', `200 → ${body.url.slice(0, 60)}...`);
  } else {
    report(false, 'POST /api/stripe-checkout', `HTTP ${r.status}: ${JSON.stringify(body).slice(0, 200)}`);
  }
} catch (e) {
  report(false, 'POST /api/stripe-checkout', e.message);
}

console.log('\n' + (hadError ? '❌ some checks failed — see above' : '✅ all checks passed'));
process.exit(hadError ? 1 : 0);
