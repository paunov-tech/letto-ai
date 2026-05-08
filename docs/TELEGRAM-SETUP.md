# LETTO.LIVE — Telegram Setup

Bot služi trima stvarima: (1) welcome + `/status` command u DM-u, (2) distribucija premium dealova u privatni kanal (6h pre javnog), (3) generacija one-time invite linkova kad neko plati Premium.

---

## 1. Kreiraj bota (Miroslav, preko @BotFather)

Otvori [t.me/BotFather](https://t.me/BotFather) u Telegram-u.

1. `/newbot`
2. **Name (display):** `LETTO.LIVE` *(može sa tačkom, prikazuje se korisnicima)*
3. **Username:** `letto_live_bot` *(mora završavati na `bot`; ako zauzeto: `letto_ai_bot`, `letto_deals_bot`, itd.)*
4. BotFather šalje token oblika `1234567890:ABCdefGhIJkLmNoPQRstuVwxyZ0123456789` — **kopiraj, ovo je TELEGRAM_BOT_TOKEN**
5. Dodatne komande (opciono, u BotFather-u):
   - `/setdescription` → "AI kurator putničkih dealova za Balkan. 30%+ ispod proseka. letto.live"
   - `/setabouttext` → "LETTO.LIVE — kurirani travel dealovi za Balkan"
   - `/setuserpic` → upload `public/eagle-seal.svg` *(Telegram ne prihvata SVG — konvertuj u 512x512 PNG pre upload-a)*
   - `/setcommands` → paste:
     ```
     start - Welcome poruka
     status - Proveri svoj pretplatnički status
     help - Pomoć
     ```

---

## 2. Kreiraj 2 kanala (Miroslav, u Telegram aplikaciji)

### Kanal A — PUBLIC
- Telegram → New Channel → **Public**
- **Name:** `LETTO.LIVE Deals`
- **Description:** `Kurirani travel dealovi za Balkan. 3 deala nedeljno, besplatno. Premium: letto.live`
- **Username (public link):** `letto_live_deals` *(ako zauzet: `letto_ai_deals`)*
- **Photo:** eagle-seal.svg → konvertuj u PNG prvo

### Kanal B — PRIVATE (Premium)
- Telegram → New Channel → **Private**
- **Name:** `LETTO Premium 💎`
- **Description:** `Premium dealovi, 6h pre javnog kanala. Za pretplatnike na letto.live/#cena.`
- **Photo:** eagle-seal sa gold border / "PREMIUM" badge
- **Bez public link-a** — pristup samo preko one-time invite-a koje bot generiše

---

## 3. Dodaj bota kao admina u OBA kanala

Za SVAKI kanal:
1. Otvori kanal → klikni ime kanala gore → **Administrators** → **Add Admin**
2. Pretraži bota po usernameu (`@letto_live_bot`) → dodaj
3. **Permissions — obavezne:**
   - ☑ Post Messages
   - ☑ Edit Messages of Others *(za ispravke)*
   - ☑ Delete Messages *(za cleanup)*
   - ☑ **Invite Users via Link** *(kritično za premium kanal — bot mora da može da generiše invite linkove)*
   - ☐ Add Admins *(ne daj ovo, hygiene)*

---

## 4. Dobij chat ID-jeve oba kanala

Telegram chat IDs za kanale su negativni brojevi u formatu `-100xxxxxxxxxx`.

**Metod (Miroslav):**
1. U bilo kom od 2 kanala, **forward neku poruku** (bilo koju) na [@userinfobot](https://t.me/userinfobot) *(treći-party bot, proveri da postoji)*.
2. Bot vraća: `Forwarded from LETTO.LIVE Deals` + **`Chat ID: -1001234567890`**
3. Kopiraj taj `-100...` broj.

**Ako @userinfobot ne radi:** pošalji mi token čim ga imaš, ja ću pozvati `getUpdates` API i izvući ID-jeve čim bot vidi aktivnost u kanalima (postuj npr. "test" u svaki kanal, pa će moj API poziv uhvatiti).

---

## 5. Pošalji mi 3 vrednosti:

```
TELEGRAM_BOT_TOKEN          = 1234567890:ABCdef...
TELEGRAM_PUBLIC_CHANNEL_ID  = -1001234567890
TELEGRAM_PREMIUM_CHANNEL_ID = -1009876543210
```

---

## 6. Šta ja radim (čim pošalješ):

```bash
# 1. Push env vars u Vercel (production + preview)
node scripts/push-telegram-env.mjs

# 2. Registruj webhook
node scripts/setup-telegram-webhook.mjs

# 3. Verifikacija
node scripts/telegram-verify.mjs

# 4. Redeploy prod da runtime pokupi nove env vars
vercel --prod  # traži allow
```

Verify skript proverava:
- Bot reaguje na `/getMe` sa ispravnim username-om
- Webhook postavljen na `https://letto.live/api/telegram-webhook`, status OK, `pending_update_count < 5`
- Bot je admin u oba kanala sa potrebnim permisijama (`can_post_messages`, `can_invite_users`)
- Javni kanal ima `letto_live_deals` username (ili potvrđeni alias)
- Privatni kanal ima `is_forum: false` i bot može da kreira invite link (test poziv `createChatInviteLink` sa `member_limit: 1`, `expire_date: now+60s` — odmah se briše)

---

## 7. E2E test (Miroslav)

1. U Telegram-u otvori bota `@letto_live_bot` → `/start` → treba welcome poruka sa linkovima
2. `/help` → treba kratak help
3. `/status` → "Još uvek nisi registrovan" (jer tvoj Telegram username nije povezan sa Firestore-om — to je OK za sada; kasnije premium payment povezuje userId)
4. Pridruži se javnom kanalu → bot vidi chat_member update → Firestore `letto_telegram_events` ima novi doc sa `type: 'joined'`

---

## Arhitekturne napomene

- Webhook endpoint: `https://letto.live/api/telegram-webhook`. Telegram POST-uje **svaki** update iz svih chat-ova gde je bot. Endpoint uvek vraća 200 (čak i na errore) — to je Telegram-ova preporuka, inače retry-uje i spamuje Vercel.
- Bot trenutno ne prosleđuje deal content iz admin panela u kanale — to radi n8n workflow `02-deal-publisher.json` kroz `telegram-webhook` ili direktno preko Bot API-ja. n8n je scope Faze 7+.
- Premium invite linkovi: generišu se u `api/stripe-webhook.js` pri `checkout.session.completed` (7 dana valid, 1 upotreba). Zato je `Invite Users via Link` permisija kritična.
- `/status` command radi lookup po `telegramUserId` u `letto_subscribers`. Trenutno ništa ne popunjava to polje — treba dodati user-bot connect flow (npr. posle plaćanja, bot traži user da pošalje `/link <email>`). To je TODO za v0.2.
