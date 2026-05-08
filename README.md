# LETTO.LIVE 🦅

**AI kurator putničkih dealova za Balkan.**

Informacioni servis (ne turistička agencija) koji skenira 12k+ putničkih ponuda dnevno i šalje pretplatnicima samo one koje su stvarno 30%+ ispod proseka. Prodajemo informacije, ne putovanja.

---

## 🏗️ Arhitektura

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (Vercel)                                          │
│  - letto.live landing page                                    │
│  - React 19 + Vite 6 + Tailwind CSS                         │
│  - Stripe Checkout integration                              │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│  EDGE API (Vercel Serverless Functions)                     │
│  - /api/search (Claude Haiku NLP parser)                    │
│  - /api/subscribe (Firestore + Mailchimp)                   │
│  - /api/stripe-checkout (creates session)                   │
│  - /api/stripe-webhook (handles events)                     │
│  - /api/telegram-webhook (bot commands)                     │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│  BACKEND (Hetzner CPX41 — postojeći 204.168.153.192)        │
│  - n8n workflows (deal scanner + publisher)                 │
│  - PostgreSQL (historical prices)                           │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│  DATA                                                       │
│  - Firebase Firestore (deals, subscribers)                  │
│  - Stripe (payments)                                        │
│  - Telegram (2 channels: public + premium)                  │
│  - Mailchimp (newsletter)                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Struktura projekta

```
letto-ai/
├── public/
│   ├── index.html          ← Standalone landing (deploy-ready)
│   ├── favicon.svg
│   ├── logo.svg
│   └── eagle-seal.svg
├── src/
│   ├── main.jsx            ← React entry
│   ├── App.jsx
│   ├── components/         ← Komponente (Ticker done; rest to port)
│   └── styles/
│       └── globals.css     ← Design system + Tailwind
├── api/
│   ├── search.js           ← Claude Haiku NLP parser
│   ├── subscribe.js        ← Free tier signup
│   ├── stripe-checkout.js  ← Premium checkout session
│   ├── stripe-webhook.js   ← Subscription events handler
│   └── telegram-webhook.js ← Bot commands (/start, /status)
├── n8n/
│   ├── 01-deal-scanner.json    ← Every 2h: scan + detect + draft
│   └── 02-deal-publisher.json  ← On approve: publish Premium → wait 6h → public
├── telegram-bot/           ← Standalone bot (alternative to webhook)
├── seed-content/
│   └── 20-seed-deals.json  ← Launch content (20 curated deals)
├── docs/
│   └── BRAND-GUIDELINES.md ← Design system, tone of voice, usage rules
├── .env.example
├── package.json
├── vite.config.js
├── tailwind.config.js
├── vercel.json
└── index.html              ← Vite entry (React build)
```

---

## 🚀 Deployment — korak po korak

### 1. Domen i hosting

```bash
# Kupi domen letto.live preko Cloudflare Registrar (~$16/god)
# Ili preko Namecheap, Porkbun itd.

# Point DNS na Vercel:
# A record: @ → 76.76.21.21
# CNAME: www → cname.vercel-dns.com
```

### 2. Prvi deployment (PRODUKCIJSKI MVP)

```bash
# Clone repo
git clone https://github.com/paunov-tech/letto-ai.git
cd letto-ai

# Instaliraj dependencies
npm install

# Kopiraj env template
cp .env.example .env.local
# Popuni stvarne vrednosti (vidi sekciju 3 ispod)

# Test lokalno
npm run dev
# Otvori http://localhost:5173

# Deploy na Vercel
npm i -g vercel
vercel login
vercel --prod

# Dodaj custom domain u Vercel dashboard:
# Settings → Domains → Add → letto.live
```

**BRZI START:** Ako hoćeš LIVE landing za 10 minuta bez backend-a:
```bash
# Drag-and-drop public/index.html na vercel.com/new
# Statička verzija radi samostalno, bez API-ja
```

### 3. Konfiguracija env varijabli

Svaku popuni u `.env.local` (lokalno) i u Vercel Dashboard → Settings → Environment Variables:

#### 3.1 Claude API
```bash
# Idi na https://console.anthropic.com/
# Settings → API Keys → Create Key
ANTHROPIC_API_KEY=sk-ant-api03-...
```

#### 3.2 Stripe
```bash
# Idi na https://dashboard.stripe.com/
# Switch to LIVE mode (ne Test)

# Kreiranje proizvoda:
# Products → Add product
#   Name: "LETTO Premium"
#   Pricing: Recurring, €29/year
#   → Save, kopiraj price_xxx ID

# Kreiranje beta price-a:
# Duplicate gornji, cena €19/year
#   → kopiraj price_xxx ID

STRIPE_SECRET_KEY=sk_live_...
STRIPE_PREMIUM_PRICE_ID=price_...
STRIPE_BETA_PRICE_ID=price_...
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Webhook:
# Developers → Webhooks → Add endpoint
#   URL: https://letto.live/api/stripe-webhook
#   Events: checkout.session.completed, invoice.paid, customer.subscription.deleted
#   → Reveal signing secret
STRIPE_WEBHOOK_SECRET=whsec_...
```

#### 3.3 Firebase
```bash
# Idi na https://console.firebase.google.com/
# Create project: "letto-ai"
# Enable Firestore: Start in production mode
# Enable Authentication (optional, za buduće login funkcionalnosti)

# Project Settings → General → Web App → Register App
# Kopiraj config:
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=letto-ai.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=letto-ai
# itd.

# Service Account (za backend API):
# Project Settings → Service accounts → Generate new private key
# Sačuvaj JSON, izvuci:
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-...@letto-ai.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
# Napomena: \n mora biti literarni, ne actual line break!
```

**Firestore Security Rules** (kopiraj u Firestore Console → Rules):
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Deals — public read, admin only write
    match /letto_deals/{dealId} {
      allow read: if true;
      allow write: if false; // Only via server-side API
    }

    // Subscribers — no public access
    match /letto_subscribers/{email} {
      allow read, write: if false;
    }

    // Telegram events — no public
    match /letto_telegram_events/{eventId} {
      allow read, write: if false;
    }
  }
}
```

#### 3.4 Telegram Bot
```bash
# Otvori Telegram, dodaj @BotFather
# /newbot
# Name: LETTO.LIVE
# Username: letto_live_bot (mora da se završi sa _bot)
# Kopiraj token:
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...

# Kreiraj 2 kanala:
# Public: @letto_live_deals (public)
# Premium: @letto_live_premium (private)

# Dodaj bota kao admin u oba
# Za ID kanala: forward poruku iz kanala na @userinfobot, kopiraj ID (sa -100 prefiksom)
TELEGRAM_PUBLIC_CHANNEL_ID=-100...
TELEGRAM_PREMIUM_CHANNEL_ID=-100...

# Postavi webhook (zameni DOMAIN):
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://letto.live/api/telegram-webhook","allowed_updates":["message","chat_member"]}'
```

#### 3.5 Kiwi.com Tequila
```bash
# Idi na https://tequila.kiwi.com/portal/register
# Solution Type: Affiliate
# Affiliate ID: biće dodeljen nakon review-a (1-3 dana)

KIWI_API_KEY=your-tequila-api-key
```

#### 3.6 Mailchimp (newsletter)
```bash
# https://mailchimp.com/ — Free tier (do 500 subscribers)
# Audience → Create Audience "LETTO Subscribers"
# Account → Extras → API keys → Create key

MAILCHIMP_API_KEY=...
MAILCHIMP_LIST_ID=...
MAILCHIMP_SERVER_PREFIX=us21  # vidi u URL-u nakon login-a
```

### 4. n8n workflow setup

Na Hetzner serveru (gde već radi JADRAN.AI n8n):

```bash
# SSH na server
ssh root@204.168.153.192

# Uvezi workflow preko n8n UI:
# https://n8n.paunov.tech/workflow/new → Import from File
# Odaberi n8n/01-deal-scanner.json
# → Save
# → Active ON

# Postavi env varijable u n8n (Settings → Credentials):
# - Kiwi API Key (HTTP Header Auth: apikey)
# - Anthropic API Key (Credential node)
# - Firebase Service Account JSON
# - Telegram Bot Token (HTTP Header Auth)

# Ponovi za 02-deal-publisher.json
```

### 5. Prvi test — E2E flow

```bash
# 1. Učitaj seed dealove u Firestore
# Iz Firebase Console → Firestore → Import data
# Ili preko skripte:
node scripts/import-seed-deals.js  # TODO napisati

# 2. Ručno aktiviraj prvi deal:
# POST https://n8n.paunov.tech/webhook/letto-approve-deal
# Body: {"id": "seed_001_istanbul_may"}
# → Publisher workflow pokrene:
#   - Post u Premium Telegram odmah
#   - Čeka 6h
#   - Post u Public Telegram kao teaser
#   - Firestore deal.status = "published"

# 3. Test Stripe checkout:
# Otvori letto.live/#cena → Klikni "Postani Premium"
# Test karticu: 4242 4242 4242 4242, future date, any CVC
# → Proverava da webhook radi (Firestore user.tier = premium)
# → Telegram invite link sent via email
```

---

## 🧪 Testiranje

### Lokalno
```bash
npm run dev          # Dev server
npm run build        # Production build test
npm run preview      # Preview production build
```

### API endpoint tests
```bash
# Search API
curl -X POST http://localhost:5173/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"Letovanje u Grčkoj za dvoje, do 1500€, jul"}'

# Subscribe API
curl -X POST http://localhost:5173/api/subscribe \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","source":"landing"}'
```

---

## 📊 Monitoring & Analytics

Preporuka (postaviti nakon launch-a):
- **Plausible** ili **Simple Analytics** za privacy-first analytics (€9/mo)
- **Sentry** za error tracking (free tier dovoljno za start)
- **Stripe Dashboard** za financial metrics
- **Firebase Console** za user growth

KPI dashboard (custom na Firestore):
- Daily Active Users
- Free → Premium conversion rate
- Churn rate (mesečno)
- Deal CTR (koliko ljudi klikne na affiliate link u blurb-u)
- Najbolje rute po engagement-u

---

## 🔒 Bezbednost

- **Sve API ključeve** čuvati ISKLJUČIVO u Vercel Environment Variables, nikad u kod
- Stripe webhook potpisi obavezno validirati (vidi `api/stripe-webhook.js`)
- Firestore rules postavljene da svi reads/writes idu kroz API (ne client-side)
- CORS headeri postavljeni kroz `vercel.json`
- GDPR: cookie consent banner (TODO: dodati)

---

## 📝 TODO — v0.2 features

- [ ] Implementirati React komponente (trenutno u public/index.html, treba portovati u src/components/)
- [ ] Personalizacija home airport u Premium dashboard-u
- [ ] Email welcome flow sa Mailchimp automations
- [ ] Admin UI za Miroslava (/admin) — pregled pending dealova
- [ ] Mobile optimizacija (currently desktop-first)
- [ ] Programatske SEO stranice (`/deal/[routeKey]`, `/destinacija/[grad]`)
- [ ] Mesečni AI putovanje planer (PDF generation)
- [ ] A/B test €19 vs €29 vs €39 price point
- [ ] Referral program (free month za svaki uspeli referral)

---

## 🤝 Contributing

Ovo je SIAL Consulting d.o.o. interni repo. Eksterni contributors po pozivu.

---

## 📄 License

Proprietary. © 2026 SIAL Consulting d.o.o., Brežice, Slovenija.

---

## 📞 Kontakt

- **Web:** https://letto.live
- **Email:** info@letto.live
- **Telegram:** [@letto_live_deals](https://t.me/letto_ai_deals)
- **Owner:** Miroslav Paunov
