// api/notify-admin.js — Receives engine alerts from n8n and pushes them to admin Telegram DM.
// Auth: Bearer token = NOTIFY_SECRET env var.
// Body: { event: string, workflow: string, detail: object }
//
// Events handled:
//   engine_error              — Stage failure inside any workflow
//   newsletter_sent           — Successful weekly send
//   telegram_skipped_empty    — Daily push had no packages to send
//   custom                    — Anything else

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: 'letto-ai',
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
}
const db = getFirestore();

const ICONS = {
  engine_error: '🔥',
  newsletter_sent: '📧',
  telegram_skipped_empty: '🟡',
  rate_limit_hit: '🚦',
  package_published: '🚀',
  default: 'ℹ️'
};

function checkAuth(req) {
  const got = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  return got && process.env.NOTIFY_SECRET && got === process.env.NOTIFY_SECRET;
}

async function sendTelegram(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return { ok: false, error: 'token_or_chatid_missing' };
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })
  });
  return r.json();
}

function summarize(event, workflow, detail) {
  const icon = ICONS[event] || ICONS.default;
  const head = `${icon} <b>${event}</b> · ${workflow || 'unknown'}`;
  let body;
  switch (event) {
    case 'newsletter_sent':
      body = `Recipients: <b>${detail?.recipients ?? '?'}</b>\nPackages: <b>${detail?.packages ?? '?'}</b>\nSubject: ${detail?.subject || '?'}`;
      break;
    case 'telegram_skipped_empty':
      body = `Tier <b>${detail?.tier || '?'}</b> had no published packages — push skipped.`;
      break;
    case 'engine_error':
      body = `<pre>${(JSON.stringify(detail || {})).slice(0, 1500)}</pre>`;
      break;
    case 'rate_limit_hit':
      body = `Provider: <b>${detail?.provider || '?'}</b> · falling back: <b>${detail?.fallback || 'none'}</b>`;
      break;
    default:
      body = `<pre>${(JSON.stringify(detail || {})).slice(0, 1500)}</pre>`;
  }
  return `${head}\n\n${body}\n\n<i>${new Date().toISOString()}</i>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const { event, workflow, detail } = req.body || {};
  if (!event) return res.status(400).json({ error: 'event_required' });

  const message = summarize(event, workflow, detail);
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  let tgResp = null;
  if (adminChatId) {
    tgResp = await sendTelegram(adminChatId, message);
  }

  // Persist for audit trail (24h retention by client query)
  try {
    await db.collection('letto_engine_events').add({
      event,
      workflow: workflow || null,
      detail: detail || {},
      ts: new Date().toISOString(),
      telegramSent: !!tgResp?.ok
    });
  } catch (err) {
    console.error('audit write failed:', err.message);
  }

  return res.status(200).json({ ok: true, telegram: tgResp });
}
