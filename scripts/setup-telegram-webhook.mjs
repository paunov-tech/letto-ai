#!/usr/bin/env node
// Register the Telegram webhook for LETTO bot.
// Reads TELEGRAM_BOT_TOKEN from .env.telegram or process.env.
// Reads TELEGRAM_WEBHOOK_SECRET from .secrets/telegram-webhook-secret.env or process.env.
// The secret_token is REQUIRED — /api/telegram-webhook rejects unauthenticated traffic.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(new URL('..', import.meta.url).pathname);

const envFile = `${REPO}/.env.telegram`;
let token = process.env.TELEGRAM_BOT_TOKEN;
if (!token && existsSync(envFile)) {
  const m = readFileSync(envFile, 'utf8').match(/^TELEGRAM_BOT_TOKEN=(.*)$/m);
  if (m) token = m[1].replace(/^"|"$/g, '');
}
if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN not set (.env.telegram or env)');
  process.exit(1);
}

const secretFile = `${REPO}/.secrets/telegram-webhook-secret.env`;
let secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!secret && existsSync(secretFile)) {
  const m = readFileSync(secretFile, 'utf8').match(/^TELEGRAM_WEBHOOK_SECRET=(.*)$/m);
  if (m) secret = m[1].replace(/^"|"$/g, '');
}
if (!secret) {
  console.error('❌ TELEGRAM_WEBHOOK_SECRET not set (.secrets/telegram-webhook-secret.env or env)');
  console.error('   Set the same value in Vercel env so /api/telegram-webhook accepts the traffic.');
  process.exit(1);
}

const WEBHOOK_URL = 'https://letto.live/api/telegram-webhook';

const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: WEBHOOK_URL,
    secret_token: secret,
    allowed_updates: ['message', 'chat_member', 'channel_post'],
    drop_pending_updates: true
  })
});
const body = await r.json();
if (body.ok) {
  console.log(`✅ Webhook set to ${WEBHOOK_URL}`);
} else {
  console.error(`❌ setWebhook failed: ${JSON.stringify(body)}`);
  process.exit(1);
}

const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then(r => r.json());
console.log(`\n── current webhook state ──`);
console.log(`url: ${info.result.url}`);
console.log(`pending_update_count: ${info.result.pending_update_count}`);
console.log(`last_error: ${info.result.last_error_message || 'none'}`);
console.log(`allowed_updates: ${JSON.stringify(info.result.allowed_updates)}`);
