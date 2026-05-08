#!/usr/bin/env node
// Push Telegram env vars to Vercel (production + preview) via REST API.
// Reads from .env.telegram (gitignored) or process.env.
//
// .env.telegram format:
//   TELEGRAM_BOT_TOKEN=1234567890:ABCdef...
//   TELEGRAM_PUBLIC_CHANNEL_ID=-1001234567890
//   TELEGRAM_PREMIUM_CHANNEL_ID=-1009876543210

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(new URL('..', import.meta.url).pathname);
const tokenPath = `${process.env.HOME}/.local/share/com.vercel.cli/auth.json`;
if (!existsSync(tokenPath)) { console.error(`❌ Vercel CLI not logged in`); process.exit(1); }
const { token } = JSON.parse(readFileSync(tokenPath, 'utf8'));
const { projectId, orgId } = JSON.parse(readFileSync(`${REPO}/.vercel/project.json`, 'utf8'));

const envFile = `${REPO}/.env.telegram`;
const env = {};
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  console.log(`ℹ Loaded from ${envFile}`);
}

const keys = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_PUBLIC_CHANNEL_ID', 'TELEGRAM_PREMIUM_CHANNEL_ID'];
const missing = keys.filter(k => !(env[k] || process.env[k]));
if (missing.length) {
  console.error(`❌ Missing values: ${missing.join(', ')}`);
  console.error(`   Put them in ${envFile} or export as env vars, then re-run.`);
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
  console.log(r.ok ? `✅ ${key} → ${r.status}` : `❌ ${key} → ${r.status}: ${body.error?.message || JSON.stringify(body)}`);
}

console.log('\nℹ Trigger a new prod deploy with `vercel --prod` to activate.');
