#!/usr/bin/env node
// scripts/backfill-approval-dms.mjs — One-shot DM bootstrap.
// Sends an approval DM (with inline buttons) to admin chat for every existing
// package, oldest first, so admin can clean inventory in one batch.
//
// Filters: by default sends DMs only for `pending_review`. Override with
// SOURCE=all to also include seed_v7 / manual_seed_v8 / etc. (re-approval).

import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'node:fs';

const sa = JSON.parse(readFileSync('/home/zlfzr/letto-ai/.secrets/firebase-admin-sa.json', 'utf8'));
const tg = readFileSync('/home/zlfzr/letto-ai/.env.telegram', 'utf8');
const TG_TOKEN = tg.match(/TELEGRAM_BOT_TOKEN=(.*)/)[1];
const ADMIN_CHAT_ID = tg.match(/TELEGRAM_ADMIN_CHAT_ID=(.*)/)[1];

const PROJECT = 'letto-ai';
const COLL = 'letto_packages';
const FILTER_MODE = process.env.SOURCE || 'pending_review';

const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/datastore'] });
const client = await auth.getClient();
const t = (await client.getAccessToken()).token;

const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${COLL}?pageSize=200`, {
  headers: { Authorization: 'Bearer ' + t }
});
const j = await r.json();

let docs = (j.documents || []).map(d => ({
  id: d.name.split('/').pop(),
  createTime: d.createTime,
  fields: d.fields
}));

// Filter
if (FILTER_MODE === 'pending_review') {
  docs = docs.filter(d => d.fields?.status?.stringValue === 'pending_review');
} else if (FILTER_MODE !== 'all') {
  console.error(`Unknown SOURCE=${FILTER_MODE}. Use 'pending_review' (default) or 'all'.`);
  process.exit(1);
}

// Sort oldest first
docs.sort((a, b) => a.createTime.localeCompare(b.createTime));
console.log(`Found ${docs.length} packages to send for approval (filter=${FILTER_MODE}).`);

function pickField(map, ...path) {
  let cur = map;
  for (const k of path) {
    if (!cur) return undefined;
    cur = cur.mapValue?.fields?.[k] ?? cur[k];
  }
  return cur;
}

function val(field) {
  if (!field) return null;
  return field.stringValue ?? field.integerValue ?? field.doubleValue ?? field.booleanValue ?? null;
}

function activitiesBlock(f, max = 3) {
  const arr = f.activities?.arrayValue?.values || [];
  if (arr.length === 0) return '';
  const lines = arr.slice(0, max).map(v => {
    const af = v.mapValue?.fields || {};
    const title = (af.title?.stringValue || '').slice(0, 70);
    const price = af.fromPrice?.doubleValue ?? af.fromPrice?.integerValue;
    const url = af.url?.stringValue || '#';
    return `• <a href="${url}">${title}</a> — €${price ? Math.round(Number(price)) : '?'}`;
  });
  return `\n\n🎯 <b>Aktivnosti u destinaciji:</b>\n${lines.join('\n')}`;
}

function buildText(pkg) {
  const f = pkg.fields;
  const city = val(f.destination?.mapValue?.fields?.city);
  const country = val(f.destination?.mapValue?.fields?.country);
  const dep = val(f.dates?.mapValue?.fields?.departure);
  const ret = val(f.dates?.mapValue?.fields?.return);
  const nights = val(f.dates?.mapValue?.fields?.nights);
  const totalRaw = val(f.pricing?.mapValue?.fields?.total);
  const total = totalRaw != null ? Math.round(Number(totalRaw)) : '?';
  const flightMedian = val(f.deal?.mapValue?.fields?.flightMedian);
  const flightDealRatio = val(f.deal?.mapValue?.fields?.flightDealRatio);
  const pctBelow = flightDealRatio != null ? Math.round((1 - Number(flightDealRatio)) * 100) : null;
  const rating = val(f.metadata?.mapValue?.fields?.claudeRating);
  const blurb_sr = val(f.blurbs?.mapValue?.fields?.sr) || val(f.copy?.mapValue?.fields?.sr?.mapValue?.fields?.meta) || '';
  const source = val(f.metadata?.mapValue?.fields?.source) || '?';
  const status = val(f.status) || '?';
  const transport = val(f.transport) === 'bus' ? '🚌' : '✈️';
  const dealLine = (pctBelow != null && flightMedian)
    ? `\n📉 Let −${pctBelow}% ispod 90-dnevnog mediana (€${flightMedian})`
    : '';

  return `🆕 <b>${pkg.id}</b>
${transport} <b>${city}, ${country}</b>
📅 ${dep} → ${ret} (${nights} ${nights === 1 ? 'noć' : 'noći'})
💰 <b>€${total}</b>${dealLine}
⭐ Rating: ${rating}/10 · source: <code>${source}</code> · status: <code>${status}</code>

${blurb_sr}${activitiesBlock(f)}`;
}

function inlineKb(id) {
  return {
    inline_keyboard: [[
      { text: '✅ Public', callback_data: `letto:approve_public:${id}` },
      { text: '💎 Premium', callback_data: `letto:approve_premium:${id}` }
    ], [
      { text: '❌ Reject', callback_data: `letto:reject:${id}` },
      { text: '📝 Reject + razlog', callback_data: `letto:reject_reason:${id}` }
    ]]
  };
}

let sent = 0, failed = 0;
for (const pkg of docs) {
  const text = buildText(pkg);
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: ADMIN_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: inlineKb(pkg.id)
    })
  });
  const j = await r.json();
  if (j.ok) {
    sent++;
    console.log(`[${pkg.id}] ✅ sent (msg ${j.result.message_id})`);
  } else {
    failed++;
    console.error(`[${pkg.id}] ❌ ${j.description}`);
  }
  // Throttle: Telegram ~30 msg/s. Pause 200ms between sends to be safe.
  await new Promise(r => setTimeout(r, 200));
}
console.log(`\nDone. sent=${sent}, failed=${failed}.`);
