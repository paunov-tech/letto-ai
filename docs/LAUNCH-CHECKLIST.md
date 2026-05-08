# LETTO.LIVE — Launch Checklist

**Cilj:** Od nule do prvog plaćenog Premium korisnika.
**Vreme potrebno:** 6–8h (podeljeno u 3 sesije)
**Sveukupan trošak pokretanja:** ~$50 za prvi mesec (domen + pre-paid API krediti)

---

## 📅 SESIJA 1 — Landing live (90 min)

Cilj: letto.live je živ, vidljiv, deluje profesionalno.

### ☐ 1.1 Domen (10 min)
- [ ] Kupi `letto.live` preko Cloudflare Registrar (~$16/god, najjeftinije)
  - Alternativa: Namecheap, Porkbun
  - **NE kupuj od GoDaddy** (overpriced + loš customer service)
- [ ] Alternativno razmisli o `letto.app` ili `letto.io` kao defensive registracije (malo verovatno)

### ☐ 1.2 GitHub repo (5 min)
```bash
# Na github.com kreiraj: paunov-tech/letto-ai (Private)
cd /home/claude/letto-ai
git init
git add .
git commit -m "Initial commit: LETTO.LIVE v0.1"
git remote add origin https://github.com/paunov-tech/letto-ai.git
git branch -M main
git push -u origin main
```

### ☐ 1.3 Vercel deployment (15 min)
- [ ] Idi na [vercel.com/new](https://vercel.com/new)
- [ ] Import from GitHub → odaberi `paunov-tech/letto-ai`
- [ ] Framework: Vite (auto-detektuje)
- [ ] Deploy (zero config potreban — `vercel.json` je već u repo-u)
- [ ] Čekaj ~2 min da build prođe
- [ ] **Dodaj custom domen:** Settings → Domains → Add → `letto.live` i `www.letto.live`
- [ ] Vercel ti daje DNS records; postavi ih u Cloudflare DNS-u:
  - A record: `@` → `76.76.21.21`
  - CNAME: `www` → `cname.vercel-dns.com`
- [ ] Čekaj propagaciju (obično 5–15 min) → `letto.live` je LIVE

**Test:** Otvori letto.live u inkognito mode-u. Standalone `public/index.html` bi trebalo da se prikaže čak i bez env vars. React App će thrott-ovati samo API pozive.

### ☐ 1.4 Email adrese (15 min)
- [ ] Cloudflare Email Routing (besplatno, 5 min setup)
  - Dashboard → Email → Email Routing → Enable
  - Dodaj MX records (Cloudflare radi automatski ako je DNS na Cloudflare-u)
  - Forward: `info@letto.live` → tvoj Gmail
  - Forward: `privacy@letto.live`, `legal@letto.live`, `support@letto.live` → tvoj Gmail
- [ ] Za slanje maila: SendGrid ili Resend (besplatno prvih 100/dan) — setup kasnije kad si spreman da šalješ

### ☐ 1.5 Brzi sanity check (5 min)
- [ ] Mobile view: otvori letto.live na telefonu
- [ ] Svi linkovi funkcionišu (Dealovi, Kako radi, Cena, Manifest)
- [ ] Typography se učitava (Fraunces, Instrument Serif)
- [ ] Animacije (ticker, birds, gold shimmer) rade
- [ ] Lighthouse score: target 85+ performance, 95+ accessibility
  ```
  npx lighthouse https://letto.live --view
  ```

**STATUS NAKON SESIJE 1:** Landing je živ. Ne prima signups još, ali public može videti brand i proizvod.

---

## 📅 SESIJA 2 — Backend & Payments (3h)

Cilj: Ljudi mogu da se pretplate besplatno i plate Premium.

### ☐ 2.1 Firebase projekat (30 min)
- [ ] [console.firebase.google.com](https://console.firebase.google.com) → Create project
- [ ] Name: `letto-ai` (tačno tako, jer je ime u kodu već zakodirano)
- [ ] Enable Firestore Database → **production mode** → region: `europe-west1` (Belgium)
- [ ] **Uvezi Firestore rules:**
  ```bash
  # Instaliraj Firebase CLI
  npm install -g firebase-tools
  firebase login
  firebase use letto-ai
  firebase deploy --only firestore:rules
  ```
  Ili ručno: Console → Firestore → Rules → paste iz `firestore.rules` → Publish
- [ ] **Service account:** Project Settings → Service accounts → Generate new private key
- [ ] Kopiraj `client_email` i `private_key` iz JSON-a → ide u Vercel env vars kao `FIREBASE_ADMIN_CLIENT_EMAIL` i `FIREBASE_ADMIN_PRIVATE_KEY`
  - **VAŽNO:** Private key ima `\n` escape karaktere. Zadrži ih tačno kako jesu (literarno `\n`, ne stvaran newline). Kod automatski parsira.
- [ ] **Web app config:** Project Settings → Web App → Register → kopiraj config object
- [ ] Sve `VITE_FIREBASE_*` ide u Vercel env vars

### ☐ 2.2 Stripe setup (45 min)
- [ ] [dashboard.stripe.com](https://dashboard.stripe.com) → Switch to **Live mode** (gornji desni ugao)
- [ ] Complete business profile (trebaće ti firma Serbia/Slovenia documents)
- [ ] **Kreiraj proizvode:**
  1. Products → Add product
     - Name: `LETTO Premium`
     - Description: `Godišnja pretplata na LETTO.LIVE kurirane dealove`
     - Pricing model: Standard pricing, Recurring, €29 Yearly
     - → Save, kopiraj `price_xxxxxx` ID → `STRIPE_PREMIUM_PRICE_ID`
  2. Products → Add product (duplicate prethodnog)
     - Name: `LETTO Premium Beta`
     - Pricing: €19 Yearly
     - → `STRIPE_BETA_PRICE_ID`
- [ ] **Webhook:**
  - Developers → Webhooks → Add endpoint
  - URL: `https://letto.live/api/stripe-webhook`
  - Events (odaberi tačno ova 3):
    - `checkout.session.completed`
    - `invoice.paid`
    - `customer.subscription.deleted`
  - → Add endpoint
  - Reveal "Signing secret" → `STRIPE_WEBHOOK_SECRET`
- [ ] Developers → API keys
  - Publishable key (`pk_live_...`) → `VITE_STRIPE_PUBLISHABLE_KEY`
  - Secret key (`sk_live_...`) → `STRIPE_SECRET_KEY`
- [ ] **Customer portal:** Settings → Customer portal → Enable
  - Allow: Update payment method, Cancel subscription, View invoices
  - Redirect: `https://letto.live/account`

### ☐ 2.3 Telegram bot (30 min)
- [ ] Otvori Telegram, pronađi `@BotFather`
- [ ] `/newbot`
  - Name: `LETTO.LIVE`
  - Username: `letto_live_bot` (mora završiti na `_bot`)
  - Ako zauzet: `letto_live_bot_2` ili `letto_dealbot` itd.
- [ ] Kopiraj token → `TELEGRAM_BOT_TOKEN`
- [ ] `/setdescription` → "AI kurator putničkih dealova za Balkan. Info: letto.live"
- [ ] `/setuserpic` → upload eagle-seal.svg
- [ ] **Kreiraj 2 kanala:**
  1. `@letto_live_deals` (Public channel)
     - Description: Isti kao bot
     - Photo: eagle-seal.svg
  2. `@letto_live_premium` (Private channel)
     - "Request admin approval" enabled
     - Photo: eagle-seal.svg sa "PREMIUM" badge-om (napravi u Figmi)
- [ ] **Dodaj bota kao admina** u oba kanala sa svim pravima (Post messages, Invite users)
- [ ] **Pronađi chat IDs:** forward-uj poruku iz kanala na `@userinfobot` → dobiješ `-100xxxxxxxxxx` ID-ove
  - → `TELEGRAM_PUBLIC_CHANNEL_ID`, `TELEGRAM_PREMIUM_CHANNEL_ID`
- [ ] **Postavi webhook:**
  ```bash
  curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
    -H "Content-Type: application/json" \
    -d '{"url":"https://letto.live/api/telegram-webhook","allowed_updates":["message","chat_member"]}'
  ```
- [ ] Testiraj: u bot DM-u pošalji `/start` → treba da dobiješ welcome poruku

### ☐ 2.4 Anthropic API key (5 min)
- [ ] [console.anthropic.com](https://console.anthropic.com) → API Keys → Create
- [ ] Dodaj $20 credit ($5 je dovoljno za test, ali scanner će trošiti)
- [ ] Kopiraj sk-ant-... → `ANTHROPIC_API_KEY`

### ☐ 2.5 Kiwi Tequila (može trajati 1–3 dana!)
- [ ] [tequila.kiwi.com/portal/register](https://tequila.kiwi.com/portal/register) → Register
- [ ] Solution type: **Affiliate**
- [ ] Čekaj approval (1-3 dana). U međuvremenu, deal scanner koristi seed podatke.
- [ ] Kad stigne: kopiraj `apikey` → `KIWI_API_KEY`

### ☐ 2.6 Mailchimp (20 min) — OPCIONO za v0.1
- [ ] [mailchimp.com](https://mailchimp.com) → Free tier
- [ ] Kreiraj audience: "LETTO Subscribers"
- [ ] Account → Extras → API keys → Create → `MAILCHIMP_API_KEY`
- [ ] Audience settings → Unique ID → `MAILCHIMP_LIST_ID`
- [ ] Server prefix (npr. `us21` iz URL-a) → `MAILCHIMP_SERVER_PREFIX`

### ☐ 2.7 Popuni Vercel env vars (15 min)
- [ ] Vercel Dashboard → letto-ai → Settings → Environment Variables
- [ ] Kopiraj `.env.example` kao template, popuni sve što si dobio gore
- [ ] **Svaki var** dodaj za sva 3 okruženja: Production, Preview, Development
- [ ] Dodaj: `ADMIN_TOKEN` = generiši random string (npr. `openssl rand -hex 32`)
- [ ] **Redeploy:** Vercel Dashboard → Deployments → najnoviji → Redeploy (da pokupi env vars)

### ☐ 2.8 E2E test plaćanja (15 min)
- [ ] Otvori letto.live/#cena
- [ ] Unesi tvoj pravi email
- [ ] Klikni "Beta €19/god"
- [ ] Na Stripe Checkout: unesi **PRAVU karticu** (za test flow, od $0.50 naplati i vrati)
  - Alternativa: Stripe test mode sa karticom `4242 4242 4242 4242`, ali nećeš videti realan webhook flow
- [ ] Nakon plaćanja:
  - [ ] Preusmerava na `/dobrodosao?session_id=...` (ovu stranicu treba da napraviš — za sad možeš default na `letto.live/?success`)
  - [ ] Proveri Firebase Console → Firestore → `letto_subscribers` → tvoj email → `tier: "premium"`
  - [ ] Proveri email — dobićeš Stripe receipt + (buduće) naš welcome email sa Telegram invitom
  - [ ] Proveri Vercel Functions logs za `api/stripe-webhook` — sve statuse 200

**STATUS NAKON SESIJE 2:** Potpuno funkcionalan sistem. Ljudi mogu da se pretplate besplatno, plate Premium, dobijaju Telegram invite.

---

## 📅 SESIJA 3 — Deal Pipeline & Content (2h)

Cilj: Prvi dealovi objavljeni na Telegram i newsletter.

### ☐ 3.1 Uvezi seed dealove (10 min)
```bash
cd letto-ai
# Postavi env vars lokalno
export FIREBASE_ADMIN_CLIENT_EMAIL="..."
export FIREBASE_ADMIN_PRIVATE_KEY="..."

node scripts/import-seed-deals.js
# ✓ Imported 20 deals successfully.
```

- [ ] Otvori `https://letto.live/admin.html`
- [ ] Login sa `ADMIN_TOKEN`
- [ ] Trebalo bi da vidiš 20 dealova sa statusom "approved"

### ☐ 3.2 Prvi Telegram post (5 min)
- [ ] U admin panelu klikni "Approve & Publish" na prvom dealu (npr. Istanbul)
- [ ] n8n workflow se trigeruje:
  - Odmah → Premium kanal dobija post
  - 6h kasnije → Public kanal dobija teaser
- [ ] Proveri Telegram oba kanala: post je tu

### ☐ 3.3 n8n deploy (30 min)
Na Hetzner serveru gde već radi JADRAN.AI n8n:

- [ ] SSH `root@204.168.153.192`
- [ ] Otvori n8n UI (`https://n8n.paunov.tech` ili port 5678)
- [ ] **Import scanner workflow:**
  - Workflows → New → Import from file → `n8n/01-deal-scanner.json`
  - Podešavanje kredencijala:
    - **Anthropic API** (Langchain Anthropic node): uzme iz env
    - **Firestore** (zameni "Realtime Database" na Firestore Cloud node — n8n ima i jedan i drugi)
    - **HTTP Request** za Kiwi: Header Auth sa `apikey` header-om
  - → Save → Active ON
- [ ] **Import publisher workflow:**
  - Isto, iz `n8n/02-deal-publisher.json`
  - → Save → Active ON (nije schedulovan, čeka webhook)
- [ ] **Test:** trigeraj scanner ručno (Execute workflow)
- [ ] Proveri Firestore za nove dealove sa `status: "pending_review"`

### ☐ 3.4 Newsletter template (30 min) — OPCIONO
- [ ] U Mailchimp: Campaigns → Create → Regular email
- [ ] Template: Email with header (ili custom HTML)
- [ ] Pripremi template koji izvlači 3 deala iz Firestore (kasnija automatizacija)
- [ ] Prvi send ručno: "Dobrodošli u LETTO.LIVE" + 3 dealova

### ☐ 3.5 Launch komunikacija (45 min)
- [ ] **LinkedIn post:**
  > "Pokrećem consumer projekat: LETTO.LIVE — AI kurator putničkih dealova za Balkan. 30%+ ispod proseka ili ne šaljemo. Prvih 100 pretplatnika plaća €19 umesto €29/god. letto.live"
- [ ] **Twitter/X post:** ista poruka, kraća
- [ ] **Telegram:** objavi u 2-3 grupe gde se priča o putovanjima (ne spam, objavi kao corisna preporuka)
- [ ] **Email lista:** ako imaš bivše kontakte od MOLTY/JADRAN/SIAL klijenata koji bi mogli biti zainteresovani — pošalji ličnu poruku (ne masovan blast)
- [ ] **Facebook grupe:** "Jeftina putovanja sa prijateljima" grupa ima 200k+ članova, objavi 1x nedeljno

---

## 🎯 Post-launch metrike (prve 2 nedelje)

Prati svakodnevno:

| Metrika | Cilj Week 1 | Cilj Week 2 |
|---------|-------------|-------------|
| Landing page unique visitors | 500 | 2,000 |
| Email signups (free tier) | 30 | 150 |
| Telegram public channel members | 50 | 300 |
| Premium conversions | 3 | 15 |
| MRR (Premium) | €60 | €285 |
| Churn rate | <5% | <8% |

**Ako:**
- Visitors > 500 ali signups < 20 → problem je u hero/value prop
- Signups > 100 ali premium < 3 → paywall ne konvertuje (test messaging)
- Churn > 15% → sadržaj ne ispunjava obećanja (previše praznih dealova)

---

## 🚨 Troubleshooting

### Build ne prolazi
```bash
npm install
npm run build
# Ako crkne: obriši node_modules i package-lock.json, ponovi
```

### Stripe webhook vraća 400
- Provera: `STRIPE_WEBHOOK_SECRET` je iz TAČNOG endpoint-a (tvog, ne primera)
- Vercel Functions timeout: ako funkcija duže od 10s, webhook timeout — optimizuj ili upgrade Vercel

### Telegram webhook ne hvata poruke
```bash
# Proveri da webhook je postavljen:
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# Ako "pending_update_count" raste: tvoj endpoint puca na 500
# Proveri Vercel Function logs za /api/telegram-webhook
```

### Firestore "Missing or insufficient permissions"
- Rules nisu deploy-ovane, ili
- Service account ne radi (proveri `\n` u PRIVATE_KEY)

### Claude API 401
- Key vraća "invalid" — obično je "sk-ant-api03-..." ispao nekompletan ili ima space

---

## 🗂️ Fajl-index (šta je gde)

```
letto-ai/
├── public/
│   ├── index.html          ← Standalone landing (v1, backup)
│   ├── admin.html          ← Miroslav's daily review UI
│   ├── privacy.html        ← Legal
│   ├── terms.html          ← Legal
│   └── impressum.html      ← Legal
├── src/                    ← React 19 app (proizvodno)
├── api/                    ← Serverless funkcije
├── n8n/                    ← Import u n8n UI
├── scripts/
│   └── import-seed-deals.js ← Run once posle Firebase setup-a
├── seed-content/
│   └── 20-seed-deals.json   ← 20 kuriranih dealova za prvi mesec
├── docs/
│   ├── BRAND-GUIDELINES.md
│   └── LAUNCH-CHECKLIST.md   ← Ovaj dokument
├── firestore.rules         ← Deploy sa firebase CLI
└── .env.example            ← Template za env vars
```

---

## ✅ Konačan test pre objavljivanja

- [ ] letto.live se otvara sa SSL-om (🔒 u browser-u)
- [ ] Mobile view prolazi (iPhone + Android test)
- [ ] Free signup radi → Firestore zapis → Telegram invite link u response
- [ ] Premium checkout radi → Stripe naplati → webhook upiše → email stigne
- [ ] Admin panel radi → mogu da approve-ujem deal → n8n objavljuje
- [ ] Telegram bot odgovara na `/start`, `/status`, `/help`
- [ ] Sve legal pages imaju ispravne podatke (naročito firma podatke)
- [ ] Footer linkovi rade (privacy, terms, impressum)
- [ ] Nema console error-a u browseru

**Kad je sve gore check-irano: LANSIRAJ.**

---

*Ovaj checklist čuvaj kao live document. Označavaj tačke kako završavaš. Sreća, Miroslav. 🦅*
