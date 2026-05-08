#!/usr/bin/env node
// Push engine env vars to Vercel + emit Hetzner-side .env block for n8n.
// Reads from .env.engine (gitignored) or process.env.
//
// Required keys:
//   RAPIDAPI_KEY              — single key for Skyscanner/Booking/Hotels.com on RapidAPI
//   TRAVELPAYOUTS_TOKEN       — primary flight + hotel data source (free, unlimited)
//   TRAVELPAYOUTS_MARKER      — affiliate ID (optional, monetization later)
//   SENDGRID_API_KEY          — newsletter sending (Workflow 03)
//   ANTHROPIC_API_KEY         — Claude rating in mixing engine (Workflow 01 Stage D)
//
// Vercel-side already configured (re-pushed for consistency):
//   NOTIFY_SECRET             — n8n → /api/notify-admin auth
//   TELEGRAM_ADMIN_CHAT_ID    — admin DM target

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const REPO = resolve(new URL('..', import.meta.url).pathname);
const envFile = `${REPO}/.env.engine`;
const env = {};
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  console.log(`ℹ Loaded ${Object.keys(env).length} keys from ${envFile}`);
}

const required = ['RAPIDAPI_KEY', 'TRAVELPAYOUTS_TOKEN', 'SENDGRID_API_KEY', 'ANTHROPIC_API_KEY'];
const optional = ['TRAVELPAYOUTS_MARKER'];

const all = [...required, ...optional];
const missing = required.filter(k => !(env[k] || process.env[k]));
if (missing.length) {
  console.error(`\n❌ Missing required keys: ${missing.join(', ')}`);
  console.error(`   Put them in ${envFile} (or export as env vars), then re-run.\n`);
  process.exit(1);
}

console.log('\n── Vercel push (production) ──');
function pushVercel(key, value) {
  return new Promise((resolveP) => {
    const proc = spawn('vercel', ['env', 'add', key, 'production'], { cwd: REPO });
    let stderr = '';
    proc.stdout.on('data', () => {});
    proc.stderr.on('data', d => stderr += d);
    proc.stdin.write(value);
    proc.stdin.end();
    proc.on('close', code => {
      console.log(`  ${code === 0 ? '✅' : '❌'} ${key} → exit ${code}${stderr && code !== 0 ? ': ' + stderr.slice(0, 100) : ''}`);
      resolveP();
    });
  });
}

for (const key of all) {
  const value = env[key] || process.env[key];
  if (!value) continue;
  await pushVercel(key, value);
}

// Hetzner block — write a ready-to-paste snippet for n8n /opt/n8n/.env
const adminToken = (() => {
  try {
    return readFileSync(`${REPO}/.secrets/admin-token.env`, 'utf8').match(/ADMIN_TOKEN=(.*)/)?.[1] || '<missing>';
  } catch { return '<missing>'; }
})();
const notifySecret = (() => {
  try {
    return readFileSync(`${REPO}/.secrets/notify-secret.env`, 'utf8').match(/NOTIFY_SECRET=(.*)/)?.[1] || '<missing>';
  } catch { return '<missing>'; }
})();
const tgEnv = (() => {
  try { return readFileSync(`${REPO}/.env.telegram`, 'utf8'); } catch { return ''; }
})();
const tgToken = tgEnv.match(/TELEGRAM_BOT_TOKEN=(.*)/)?.[1] || '<from telegram setup>';
const tgPub = tgEnv.match(/TELEGRAM_PUBLIC_CHANNEL_ID=(.*)/)?.[1] || '<from telegram setup>';
const tgPrem = tgEnv.match(/TELEGRAM_PREMIUM_CHANNEL_ID=(.*)/)?.[1] || '<from telegram setup>';

const hetznerBlock = `# /opt/n8n/.env  — Hetzner-side env for n8n workflows
# Paste these into the n8n container's environment.

# ─── Anthropic (Claude rating in workflow 01 Stage D) ───
ANTHROPIC_API_KEY=${env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || ''}

# ─── Travelpayouts (primary flight + hotel data) ───
TRAVELPAYOUTS_TOKEN=${env.TRAVELPAYOUTS_TOKEN || process.env.TRAVELPAYOUTS_TOKEN || ''}
TRAVELPAYOUTS_MARKER=${env.TRAVELPAYOUTS_MARKER || process.env.TRAVELPAYOUTS_MARKER || ''}

# ─── RapidAPI (Skyscanner/Booking enrichment fallback) ───
RAPIDAPI_KEY=${env.RAPIDAPI_KEY || process.env.RAPIDAPI_KEY || ''}

# ─── SendGrid (workflow 03 newsletter) ───
SENDGRID_API_KEY=${env.SENDGRID_API_KEY || process.env.SENDGRID_API_KEY || ''}

# ─── Telegram (workflow 04 daily push + alerts) ───
TELEGRAM_BOT_TOKEN=${tgToken}
TELEGRAM_PUBLIC_CHANNEL_ID=${tgPub}
TELEGRAM_PREMIUM_CHANNEL_ID=${tgPrem}
TELEGRAM_ADMIN_CHAT_ID=8225971504

# ─── Letto admin / notify (back-end calls to letto.live) ───
NOTIFY_SECRET=${notifySecret}
LETTO_API_BASE=https://letto.live

# ─── Firebase access token (rotated by refresh-firebase-token.sh cron) ───
FIREBASE_ACCESS_TOKEN=<populated by /opt/n8n/refresh-firebase-token.sh>
`;

const outPath = `${REPO}/.secrets/hetzner-n8n.env`;
const fs = await import('node:fs');
fs.writeFileSync(outPath, hetznerBlock, { mode: 0o600 });
console.log(`\n── Hetzner-side n8n env block written to ${outPath} ──`);
console.log('\nNext: Miroslav scp to Hetzner:');
console.log(`  scp ${outPath} root@204.168.153.192:/opt/n8n/.env`);
console.log(`  ssh root@204.168.153.192 'cd /opt/n8n && docker compose restart n8n'`);
console.log('\nThen import workflows from letto-engine/*.json via n8n UI.');
