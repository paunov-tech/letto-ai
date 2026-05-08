#!/usr/bin/env node
// Verify Telegram bot + webhook + channel setup.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(new URL('..', import.meta.url).pathname);
const envFile = `${REPO}/.env.telegram`;
const env = {};
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const token = env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const publicId = env.TELEGRAM_PUBLIC_CHANNEL_ID || process.env.TELEGRAM_PUBLIC_CHANNEL_ID;
const premiumId = env.TELEGRAM_PREMIUM_CHANNEL_ID || process.env.TELEGRAM_PREMIUM_CHANNEL_ID;

let hadError = false;
const report = (ok, label, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) hadError = true;
};

if (!token) { report(false, 'TELEGRAM_BOT_TOKEN', 'missing'); process.exit(1); }

const API = `https://api.telegram.org/bot${token}`;

console.log('── bot identity ──');
const me = await fetch(`${API}/getMe`).then(r => r.json());
if (me.ok) report(true, 'bot /getMe', `@${me.result.username} (id=${me.result.id})`);
else { report(false, 'bot /getMe', me.description); process.exit(1); }

console.log('\n── webhook ──');
const wh = await fetch(`${API}/getWebhookInfo`).then(r => r.json());
const expectedUrl = 'https://letto.live/api/telegram-webhook';
report(wh.result.url === expectedUrl, 'webhook url', wh.result.url || 'not set');
report(!wh.result.last_error_message, 'no recent errors', wh.result.last_error_message || 'clean');
report(wh.result.pending_update_count < 10, 'pending updates', `${wh.result.pending_update_count}`);

const channels = [['public', publicId], ['premium', premiumId]];
for (const [label, id] of channels) {
  console.log(`\n── ${label} channel (${id}) ──`);
  if (!id) { report(false, `${label} channel id`, 'env missing'); continue; }
  const chat = await fetch(`${API}/getChat?chat_id=${id}`).then(r => r.json());
  if (!chat.ok) { report(false, `${label} getChat`, chat.description); continue; }
  report(true, `${label} chat`, `type=${chat.result.type}, title="${chat.result.title}"`);

  const admin = await fetch(`${API}/getChatMember?chat_id=${id}&user_id=${me.result.id}`).then(r => r.json());
  if (!admin.ok) { report(false, `${label} bot membership`, admin.description); continue; }
  const m = admin.result;
  report(m.status === 'administrator', `${label} bot is admin`, `status=${m.status}`);
  if (m.status === 'administrator') {
    report(m.can_post_messages, `${label} can_post_messages`, m.can_post_messages ? 'yes' : 'NO');
    if (label === 'premium') {
      report(m.can_invite_users, `${label} can_invite_users`, m.can_invite_users ? 'yes' : 'NO (critical for premium invites)');
    }
  }
}

console.log('\n' + (hadError ? '❌ some checks failed — see above' : '✅ all checks passed'));
process.exit(hadError ? 1 : 0);
