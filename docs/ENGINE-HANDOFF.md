# LETTO Engine — Handoff za Miroslava

**Sve šta je Claude mogao autonomno je urađeno. Ostaje 4 koraka koje moraš ti.**

Lokalna stanja:
- 4 n8n workflow JSONs spremni: `workflows/01-04-LETTO-*.json`
- Vercel-side `/api/notify-admin` live (n8n alert receiver za Telegram DM)
- Admin metrics dashboard live: https://letto.live/metrics.html (login sa istim ADMIN_TOKEN)
- `NOTIFY_SECRET` + `TELEGRAM_ADMIN_CHAT_ID = 8225971504` već u Vercel env-u
- Helper skript: `scripts/push-engine-env.mjs` (zove se kad ti pošalješ keys)

---

## Tvoj morning checklist (~45 min, bez tehničkog znanja)

### 1. Travelpayouts (5 min, instant approval, FREE) — primary data source

Idi na [travelpayouts.com/users/sign_up](https://www.travelpayouts.com/users/sign_up) → registruj se (može preko Google) → posle login-a:

- **Tools → API Access → "Generate token"** → kopiraj
- (opciono) **Profile → Affiliate marker** → kopiraj (za buduću monetizaciju partner linkova)

### 2. RapidAPI (5 min, instant, FREE tier dovoljan za testiranje)

Idi na [rapidapi.com/auth/sign-up](https://rapidapi.com/auth/sign-up) → registruj se → na dashboardu klikni "Pricing" → kopiraj svoj **X-RapidAPI-Key** (top-right "My Apps").

(Note: Workflow je dizajniran da koristi RapidAPI samo kao **enrichment fallback**. Travelpayouts free tier je primary, što znači RapidAPI free tier od 500 req/mo je dovoljan dok god si na 6h cron-u. Brief preporuka €25/mo Pro nije neophodan za prva 1-2 meseca.)

### 3. SendGrid (15 min, instant signup + DNS verifikacija) — nedeljni newsletter

Idi na [signup.sendgrid.com](https://signup.sendgrid.com/) → free tier 100 emails/dan (dovoljno za prvih 100-200 pretplatnika).

1. **Settings → Sender Authentication → Authenticate Your Domain** → unesi `letto.live`
2. SendGrid daje 3 CNAME zapisa za DNS — **dodaj ih u Namecheap DNS** za letto.live
3. Sačekaj 5-10 min da DNS propagira → klikni Verify
4. **Settings → API Keys → Create API Key** → "Full Access" → kopiraj `SG.xxxxxxx`

### 4. Hetzner SSH za n8n deploy

Trebaće ti par komandi. Otvori terminal:

```bash
# 4.1 Stavi keys u local .env.engine
cat > ~/letto-ai/.env.engine <<'EOF'
RAPIDAPI_KEY=<paste from step 2>
TRAVELPAYOUTS_TOKEN=<paste from step 1>
TRAVELPAYOUTS_MARKER=<paste from step 1, optional>
SENDGRID_API_KEY=<paste from step 3>
ANTHROPIC_API_KEY=<your Claude API key>
EOF
chmod 600 ~/letto-ai/.env.engine

# 4.2 Push to Vercel + generate Hetzner env block
cd ~/letto-ai
node scripts/push-engine-env.mjs

# 4.3 Vercel redeploy (or ask Claude to)
vercel --prod   # confirm Yes

# 4.4 SCP Hetzner env + workflow files
scp ~/letto-ai/.secrets/hetzner-n8n.env root@204.168.153.192:/opt/n8n/.env
scp ~/letto-ai/workflows/*.json root@204.168.153.192:/opt/n8n/workflows/

# 4.5 Restart n8n on Hetzner
ssh root@204.168.153.192 'cd /opt/n8n && docker compose restart n8n'

# 4.6 Setup Firebase token rotation (one-time)
ssh root@204.168.153.192 << 'BASH'
cat > /opt/n8n/refresh-firebase-token.sh <<'EOF'
#!/bin/bash
SA="/opt/n8n/letto-server-key.json"
TOKEN=$(python3 -c "
from google.oauth2 import service_account
from google.auth.transport.requests import Request
c = service_account.Credentials.from_service_account_file('$SA', scopes=['https://www.googleapis.com/auth/datastore'])
c.refresh(Request())
print(c.token)
")
sed -i "s|^FIREBASE_ACCESS_TOKEN=.*|FIREBASE_ACCESS_TOKEN=$TOKEN|" /opt/n8n/.env
docker compose -f /opt/n8n/docker-compose.yml restart n8n
EOF
chmod +x /opt/n8n/refresh-firebase-token.sh
# Bootstrap Firestore admin SA on Hetzner (jednom, kopiraj sa lokalnog)
echo "Now scp ~/letto-ai/.secrets/firebase-admin-sa.json to /opt/n8n/letto-server-key.json"
echo "Then: pip3 install google-auth google-auth-httplib2"
echo "Then: /opt/n8n/refresh-firebase-token.sh (test)"
echo "Then: echo '*/50 * * * * /opt/n8n/refresh-firebase-token.sh' | crontab -"
BASH
```

### 5. Import 4 workflows u n8n UI (10 min)

Otvori `http://204.168.153.192:5678` u browseru:

1. Workflows → Import from File → izaberi `01-LETTO-MIXING-ENGINE.json`
2. Otvori workflow → klikni **Execute Workflow** → posmatraj svaki node:
   - Stage A · Routes — treba 25 items output
   - Stage B Travelpayouts flights — treba response sa cenama
   - Stage B Hotellook hotels — treba response sa hotelima
   - Stage C Mix — treba 5-15 mixed packages koji prolaze >30% threshold
   - Stage D Claude — treba JSON sa rating
   - Stage E Save Firestore — 200 OK
3. Otvori https://letto.live/admin.html → Pending tab → treba da se pojave novi paketi

Ponovi za 02, 03, 04. **NEMOJ aktivirati** dok manual test ne prođe.

Posle uspešnog test-a:
- 01 Active (every 6h)
- 02 Active (every 6h)
- 04 Active (Premium 10:00 + Public 16:00 daily)
- **03 OSTAVI inactive** dok ne dobiješ prvih 100 pretplatnika

---

## Testovi posle aktivacije

```bash
# Provera engine zdravlja kroz Vercel API
TOKEN=$(cat ~/letto-ai/.secrets/admin-token.env | cut -d= -f2)
curl -H "Authorization: Bearer $TOKEN" https://letto.live/api/admin?action=engine-stats | jq .
```

Ili otvori dashboard: https://letto.live/metrics.html

Posle 24h aktivacije očekuj:
- 5-30 packages mined (24h)
- 0 engine_error events (idealno) ili 1-2 izolovana
- Pending review red treba da se popunjava
- Telegram daily push u 10:00 i 16:00

## Ako engine ne mine ništa za 6h

→ `/api/notify-admin` će dobiti `engine_error` od n8n
→ Ti dobiješ Telegram DM sa detaljem
→ Otvori metrics.html i vidi `lastError` blok
→ Najčešći uzroci: RapidAPI rate limit, expired Firebase token (cron failed), bad Travelpayouts response

## Rollback ako engine pravi problem

```bash
ssh root@204.168.153.192 'cd /opt/n8n && docker compose stop n8n'
```

Site nastavlja da radi, samo nema novih paketa. Iduće runs ne idu. Ti debug-uješ logove i opet `start`.

---

**Pitanja koja Miroslav mora da reši pre nego što aktivira workflow 01:**
1. ☐ Imam Travelpayouts token + Anthropic key
2. ☐ DNS records za SendGrid u Namecheap-u (3 CNAME) — verifikuj na sendgrid dashboard
3. ☐ SCP-uvao firebase-admin-sa.json na Hetzner
4. ☐ Cron za Firebase token rotation aktivan (proveri `crontab -l` na Hetzner-u)
