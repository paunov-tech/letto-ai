// api/telegram-webhook.js — Telegram bot webhook
// Handles: /start, /status, /help, new member detection,
//          callback_query (approval flow), and reply_to (rejection reasons).

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
const PREMIUM_CHANNEL_ID = process.env.TELEGRAM_PREMIUM_CHANNEL_ID;
const PUBLIC_CHANNEL_ID = process.env.TELEGRAM_PUBLIC_CHANNEL_ID;

async function sendMessage(chatId, text, options = {}) {
  return fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...options
    })
  }).then(r => r.json());
}

async function answerCallback(callbackQueryId, text, showAlert = false) {
  return fetch(`${API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: showAlert })
  }).then(r => r.json());
}

async function editMessageReplyMarkup(chatId, messageId, replyMarkup) {
  return fetch(`${API}/editMessageReplyMarkup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: replyMarkup })
  }).then(r => r.json());
}

function formatActivitiesBlock(activities, max = 3) {
  if (!Array.isArray(activities) || activities.length === 0) return '';
  const lines = activities.slice(0, max).map(a => {
    const price = Number(a.fromPrice) ? `€${Math.round(a.fromPrice)}` : '€?';
    const title = String(a.title || '').slice(0, 70);
    return `• <a href="${a.url || '#'}">${title}</a> — ${price}`;
  });
  return `\n\n🎯 <b>Aktivnosti u destinaciji:</b>\n${lines.join('\n')}`;
}

function formatBookingLinksBlock(pkg) {
  const fl = pkg.flight || {};
  const ho = pkg.hotel || {};
  const dates = pkg.dates || {};

  const lines = [];

  const flightUrl = fl.bookingUrl || '';
  const partnerName = fl.bookingPartner || fl.airline || '';
  if (flightUrl && partnerName) {
    lines.push(`✈️ <a href="${flightUrl}">Rezerviši let — ${partnerName}</a>`);
  }

  const hoUrl = ho.bookingUrl || '';
  if (hoUrl && /booking\.com\/hotel\//i.test(hoUrl)) {
    let url = hoUrl;
    try {
      const u = new URL(hoUrl);
      if (dates.departure) u.searchParams.set('checkin', dates.departure);
      if (dates.return) u.searchParams.set('checkout', dates.return);
      u.searchParams.set('group_adults', '2');
      u.searchParams.set('no_rooms', '1');
      url = u.toString();
    } catch (e) {}
    lines.push(`🏨 <a href="${url}">${ho.name || 'Hotel'}</a>`);
  }

  if (lines.length === 0) return '';
  return `\n\n<b>Booking:</b>\n${lines.join('\n')}`;
}

function formatPackageForChannel(pkg) {
  const dest = pkg.destination || {};
  const dates = pkg.dates || {};
  const pricing = pkg.pricing || {};
  const deal = pkg.deal || {};
  const blurbSr = pkg.blurbs?.sr || pkg.metadata?.blurb_sr || pkg.copy?.sr?.meta || '';
  const total = pricing.total || 0;
  const nights = dates.nights || 0;
  const transport = pkg.transport === 'bus' ? '🚌' : '✈️';
  const activitiesBlock = formatActivitiesBlock(pkg.activities);
  const bookingBlock = formatBookingLinksBlock(pkg);
  let dealLine = '';
  if (deal.flightDealRatio != null && deal.flightDealRatio > 0 && deal.flightDealRatio < 1) {
    const pctBelow = Math.round((1 - deal.flightDealRatio) * 100);
    dealLine = `\n🔥 Let je ${pctBelow}% niži od redovne cene`;
  }
  return `${transport} <b>${dest.city || '?'}, ${dest.country || ''}</b>
📅 ${dates.departure || '?'} → ${dates.return || '?'} (${nights} ${nights === 1 ? 'noć' : 'noći'})

💰 <b>€${total}</b>${dealLine}

${blurbSr}${activitiesBlock}${bookingBlock}

<i>Pun paket detalj na letto.live</i>`;
}

async function approvePackage(pkgId, tier, cb) {
  const ref = db.collection('letto_packages').doc(pkgId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Package ${pkgId} not found`);

  const pkg = snap.data();
  const newStatus = tier === 'premium' ? 'published_premium' : 'published_public';
  const channelId = tier === 'premium' ? PREMIUM_CHANNEL_ID : PUBLIC_CHANNEL_ID;
  const alreadyAtTarget = pkg.status === newStatus;

  let messageId = pkg.metadata?.channelMessageId || null;
  // Only post to channel if not already published at this tier (idempotent re-approve safe)
  if (!alreadyAtTarget) {
    const tgRes = await sendMessage(channelId, formatPackageForChannel(pkg), { disable_web_page_preview: false });
    if (!tgRes.ok) {
      throw new Error(`Channel post failed: ${tgRes.description || 'unknown'}`);
    }
    messageId = tgRes.result.message_id;
  }

  await ref.update({
    status: newStatus,
    'metadata.approvedAt': FieldValue.serverTimestamp(),
    'metadata.approvedBy': 'miroslav_telegram',
    'metadata.approvedTier': tier,
    ...(messageId ? { 'metadata.channelMessageId': messageId } : {})
  });

  if (cb?.message) {
    const prefix = alreadyAtTarget ? '↻ ' : '';
    const label = tier === 'premium' ? `${prefix}💎 APPROVED · PREMIUM` : `${prefix}✅ APPROVED · PUBLIC`;
    await editMessageReplyMarkup(cb.message.chat.id, cb.message.message_id, {
      inline_keyboard: [[{ text: label, callback_data: 'letto:noop' }]]
    });
  }
}

async function rejectPackage(pkgId, reason, cb) {
  const ref = db.collection('letto_packages').doc(pkgId);
  await ref.update({
    status: 'rejected',
    'metadata.rejectedAt': FieldValue.serverTimestamp(),
    'metadata.rejectionReason': reason || 'no_reason'
  });

  if (cb?.message) {
    const label = reason ? `❌ REJECTED · ${reason.slice(0, 30)}` : '❌ REJECTED';
    await editMessageReplyMarkup(cb.message.chat.id, cb.message.message_id, {
      inline_keyboard: [[{ text: label, callback_data: 'letto:noop' }]]
    });
  }
}

async function promptRejectReason(pkgId, cb) {
  await sendMessage(cb.message.chat.id,
    `REJECT_REASON_FOR:${pkgId}\n\nOdgovori na ovu poruku sa razlogom (kratko):`,
    { reply_markup: { force_reply: true, selective: true } });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // SECURITY: validate Telegram webhook secret_token header.
  // Without this gate, any external POST can spoof callback_query.message.chat.id
  // and bypass the inner admin check, triggering approvePackage / publishToTelegram
  // for arbitrary package IDs. Telegram sets x-telegram-bot-api-secret-token
  // when the webhook is registered via setWebhook(secret_token=...).
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const got = req.headers['x-telegram-bot-api-secret-token'];
    if (got !== expectedSecret) {
      console.warn('[telegram-webhook] rejected: invalid or missing secret_token header');
      return res.status(401).json({ error: 'unauthorized' });
    }
  } else {
    // Fail-closed: if env var not configured, refuse all requests rather than
    // silently accepting unauthenticated traffic. Operator must configure
    // TELEGRAM_WEBHOOK_SECRET + register webhook with secret_token to enable.
    console.error('[telegram-webhook] TELEGRAM_WEBHOOK_SECRET env missing — refusing all webhook traffic');
    return res.status(503).json({ error: 'webhook_not_configured' });
  }

  const update = req.body;
  if (!update) return res.status(200).json({ ok: true });

  try {
    // ─── CALLBACK QUERY (approve/reject inline buttons) ─────────────
    if (update.callback_query) {
      const cb = update.callback_query;
      const data = cb.data || '';
      // Only LETTO callbacks
      if (!data.startsWith('letto:')) return res.status(200).json({ ok: true });
      // Auth: only admin chat may approve
      if (String(cb.message?.chat?.id) !== String(ADMIN_CHAT_ID)) {
        await answerCallback(cb.id, 'Unauthorized', true);
        return res.status(200).json({ ok: true });
      }
      if (data === 'letto:noop') {
        await answerCallback(cb.id, 'Already actioned');
        return res.status(200).json({ ok: true });
      }
      const parts = data.split(':');
      const action = parts[1];
      const pkgId = parts.slice(2).join(':');
      try {
        if (action === 'approve' || action === 'approve_public') {
          await approvePackage(pkgId, 'public', cb);
          await answerCallback(cb.id, '✅ Approved · PUBLIC');
        } else if (action === 'approve_premium') {
          await approvePackage(pkgId, 'premium', cb);
          await answerCallback(cb.id, '💎 Approved · PREMIUM');
        } else if (action === 'reject') {
          await rejectPackage(pkgId, null, cb);
          await answerCallback(cb.id, '❌ Rejected');
        } else if (action === 'reject_reason') {
          await promptRejectReason(pkgId, cb);
          await answerCallback(cb.id, '📝 Reply with reason');
        } else {
          await answerCallback(cb.id, 'Unknown action');
        }
      } catch (e) {
        console.error('[LETTO callback]', action, pkgId, e.message);
        await answerCallback(cb.id, 'Error: ' + e.message.slice(0, 180), true);
      }
      return res.status(200).json({ ok: true });
    }

    // ─── REPLY TO REJECTION REASON PROMPT ───────────────────────────
    if (update.message?.reply_to_message) {
      const replyText = update.message.reply_to_message.text || '';
      const m = replyText.match(/REJECT_REASON_FOR:(pkg_[a-z0-9_]+)/i);
      if (m && String(update.message.chat.id) === String(ADMIN_CHAT_ID)) {
        const pkgId = m[1];
        const reason = (update.message.text || '').slice(0, 200);
        await rejectPackage(pkgId, reason, null);
        await sendMessage(update.message.chat.id, `❌ Rejected <code>${pkgId}</code>: ${reason}`);
        return res.status(200).json({ ok: true });
      }
    }

    // Handle text commands
    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const userId = update.message.from.id;
      const username = update.message.from.username;
      const text = update.message.text.trim();

      if (text.startsWith('/start')) {
        await sendMessage(chatId,
`<b>Dobrodošao u LETTO.LIVE 🧭</b>

Mi pratimo 12.000+ putničkih ponuda dnevno i šaljemo samo one koje su 30%+ ispod proseka.

<b>Šta sad:</b>
• Dnevni dealovi → <a href="https://t.me/letto_live_deals">@letto_live_deals</a>
• Newsletter → <a href="https://letto.live">letto.live</a>
• Premium (€19/3mo beta · €29/3mo) → <a href="https://letto.live/#pricing">letto.live/#pricing</a>

<b>Komande:</b>
/status — proveri svoj pretplatnički status
/help — pomoć

<i>Bez provizije. Bez spama. Tačno ono što je stvarno jeftino.</i>`);
      }
      else if (text === '/status') {
        // Lookup user by telegram_id in Firestore
        const q = await db.collection('letto_subscribers')
          .where('telegramUserId', '==', userId)
          .limit(1).get();

        if (q.empty) {
          await sendMessage(chatId,
`Još uvek nisi registrovan u našoj bazi.

Upiši se besplatno na <a href="https://letto.live">letto.live</a> i dobićeš pristup javnom kanalu + newsletter-u.`);
        } else {
          const user = q.docs[0].data();
          const tierName = user.tier === 'premium' ? '💎 <b>Premium</b>' : '✅ Free';
          await sendMessage(chatId,
`<b>Tvoj status:</b> ${tierName}
<b>Email:</b> ${user.email}
<b>Član od:</b> ${new Date(user.createdAt).toLocaleDateString('sr-RS')}
${user.tier === 'free' ? '\n💡 Upgrade na Premium: https://letto.live/#pricing' : ''}`);
        }
      }
      else if (text === '/help') {
        await sendMessage(chatId,
`<b>LETTO.LIVE pomoć</b>

• /start — ponovni welcome
• /status — pretplatnički status

<b>Dodatna pitanja:</b> info@letto.live
<b>Web:</b> https://letto.live`);
      }
    }

    // Handle chat member updates (auto-detect when user joins channel)
    if (update.chat_member) {
      const { new_chat_member, chat, from } = update.chat_member;
      if (new_chat_member?.status === 'member') {
        // User joined a LETTO channel — log it
        await db.collection('letto_telegram_events').add({
          type: 'joined',
          channelId: chat.id,
          userId: new_chat_member.user.id,
          username: new_chat_member.user.username,
          timestamp: new Date().toISOString()
        });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err);
    return res.status(200).json({ ok: true, error: err.message }); // always 200 to Telegram
  }
}
