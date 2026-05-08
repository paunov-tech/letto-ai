#!/usr/bin/env node
// Push Stripe env vars to Vercel (production + preview) via REST API.
// Avoids the `vercel env add` CLI quirks (trailing newlines from echo,
// git_branch_required prompt in non-interactive mode).
//
// Usage:
//   Set STRIPE_* values below via a local .env.stripe file or CLI flags,
//   then: node scripts/push-stripe-env.mjs
//
// The .env.stripe file format (gitignored):
//   STRIPE_SECRET_KEY=sk_live_...
//   STRIPE_WEBHOOK_SECRET=whsec_...
//   STRIPE_PREMIUM_PRICE_ID=price_...
//   STRIPE_BETA_PRICE_ID=price_...
//   VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(new URL('..', import.meta.url).pathname);

const tokenPath = `${process.env.HOME}/.local/share/com.vercel.cli/auth.json`;
if (!existsSync(tokenPath)) {
  console.error(`❌ Vercel CLI auth not found at ${tokenPath}. Run: vercel login`);
  process.exit(1);
}
const { token } = JSON.parse(readFileSync(tokenPath, 'utf8'));

const projPath = `${REPO}/.vercel/project.json`;
if (!existsSync(projPath)) {
  console.error(`❌ Project not linked. Run from repo root after vercel link.`);
  process.exit(1);
}
const { projectId, orgId } = JSON.parse(readFileSync(projPath, 'utf8'));

const envFilePath = `${REPO}/.env.stripe`;
const env = {};
if (existsSync(envFilePath)) {
  for (const line of readFileSync(envFilePath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  console.log(`ℹ Loaded from ${envFilePath}`);
} else {
  console.log(`ℹ .env.stripe not found at ${envFilePath} — reading from process.env`);
}

const keys = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PREMIUM_PRICE_ID',
  'STRIPE_BETA_COUPON_ID',
  'VITE_STRIPE_PUBLISHABLE_KEY'
];

const missing = keys.filter(k => !(env[k] || process.env[k]));
if (missing.length) {
  console.error(`❌ Missing values: ${missing.join(', ')}`);
  console.error(`   Put them in ${envFilePath} or export as env vars, then re-run.`);
  process.exit(1);
}

for (const key of keys) {
  const value = env[key] || process.env[key];
  const r = await fetch(
    `https://api.vercel.com/v10/projects/${projectId}/env?teamId=${orgId}&upsert=true`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value, type: 'encrypted', target: ['production', 'preview'] })
    }
  );
  const body = await r.json();
  if (r.ok) {
    console.log(`✅ ${key} → HTTP ${r.status}`);
  } else {
    console.log(`❌ ${key} → HTTP ${r.status}: ${body.error?.message || JSON.stringify(body)}`);
  }
}

console.log('\nℹ Env vars pushed. Trigger a new prod deploy with `vercel --prod` to activate.');
