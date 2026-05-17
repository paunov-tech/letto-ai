// lib/telegram-mix-post.js — Post a finished premium Mix into the LETTO
// Premium Telegram channel.
//
// Bot @lettolive_bot (id 8557444574) is an administrator of channel
// TELEGRAM_PREMIUM_CHANNEL_ID (-1003830940800) with can_post_messages:true.
//
// postMixToPremiumChannel is best-effort: the caller (api/save-mix-premium.js)
// treats a failure as non-fatal — the Mix is already saved; the channel post
// is a broadcast bonus, not part of the delivery contract to the buyer.
//
// Q3 (Miroslav 2026-05-17): sendPhoto when the Mix carries a hotel image,
// otherwise sendMessage. sendPhoto also auto-falls-back to sendMessage if
// Telegram rejects the image URL.

const API_BASE = 'https://api.telegram.org';

// Telegram HTML parse_mode: only & < > must be escaped in text nodes.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Short HTML card — used as message text AND as photo caption (caption cap is
// 1024 chars; this is well under).
function buildMixMessage(trip, tripUrl) {
  const r = trip.route || {};
  const f = trip.flight || {};
  const h = trip.hotel || {};
  const cur = trip.currency || 'EUR';
  const dates = f.depart
    ? ` · ${esc(f.depart)}${f.return ? ' – ' + esc(f.return) : ''}`
    : '';
  return [
    '🪙 <b>Nov LETTO Mix</b>',
    '',
    `✈ <b>${esc(r.origin)} → ${esc(r.dest)}</b>${dates}`,
    `🏨 ${esc(h.name)}${h.stars ? ` · ${esc(h.stars)}★` : ''}`,
    '',
    `💶 <b>${esc(trip.grandTotal)} ${esc(cur)}</b> ukupno`,
    '',
    `<a href="${esc(tripUrl)}">Otvori Mix →</a>`,
  ].join('\n');
}

async function tgSend(token, method, payload) {
  const resp = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return resp.json();
}

// Returns { ok, via, messageId } | { ok:false, reason }. Never throws.
export async function postMixToPremiumChannel(trip, tripUrl) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_PREMIUM_CHANNEL_ID;
  if (!token || !chatId) {
    console.warn('[telegram-mix-post] TELEGRAM_BOT_TOKEN / TELEGRAM_PREMIUM_CHANNEL_ID unset — skipping');
    return { ok: false, reason: 'telegram_env_missing' };
  }

  const caption = buildMixMessage(trip, tripUrl);
  const photo = trip.hotel && trip.hotel.image;

  try {
    // sendPhoto when the Mix has a hotel image.
    if (photo) {
      const photoRes = await tgSend(token, 'sendPhoto', {
        chat_id: chatId,
        photo,
        caption,
        parse_mode: 'HTML',
      });
      if (photoRes.ok) {
        return { ok: true, via: 'sendPhoto', messageId: photoRes.result?.message_id || null };
      }
      // Telegram rejected the image URL — fall through to a text post.
      console.warn('[telegram-mix-post] sendPhoto not ok, falling back to sendMessage:',
        JSON.stringify(photoRes).slice(0, 200));
    }

    const msgRes = await tgSend(token, 'sendMessage', {
      chat_id: chatId,
      text: caption,
      parse_mode: 'HTML',
      // preview ON — the /trip envelope page's OG card is the visual hook
      disable_web_page_preview: false,
    });
    if (!msgRes.ok) {
      console.warn('[telegram-mix-post] sendMessage not ok:', JSON.stringify(msgRes).slice(0, 240));
      return { ok: false, reason: 'telegram_api_error', detail: msgRes };
    }
    return { ok: true, via: 'sendMessage', messageId: msgRes.result?.message_id || null };
  } catch (e) {
    console.warn('[telegram-mix-post] post threw:', e.message);
    return { ok: false, reason: e.message };
  }
}
