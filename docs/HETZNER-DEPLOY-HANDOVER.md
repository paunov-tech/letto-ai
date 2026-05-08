# LETTO ENGINE — HETZNER DEPLOY HANDOVER
**Version:** Definitive (April 25, 2026)
**Operator:** Miroslav Paunov
**Target:** Activate 4 n8n workflows on Hetzner `204.168.153.192`
**Time required:** 20-30 minutes if everything works, 45 if you hit one bug

---

## 0. PREREQUISITES — verify before you start

Open terminal on your laptop. Run these 3 checks:

```bash
# ① Workflow files present locally?
ls ~/letto-ai/workflows/
# Expected: 01-LETTO-MIXING-ENGINE.json  02-LETTO-PRICE-VERIFIER.json
#           03-LETTO-WEEKLY-NEWSLETTER.json  04-LETTO-TELEGRAM-DAILY.json

# ② Secrets present?
ls ~/letto-ai/.secrets/
# Expected: admin-token.env  firebase-admin-sa.json  notify-secret.env

# ③ SSH to Hetzner works?
ssh root@204.168.153.192 "echo OK && docker ps --format '{{.Names}}'"
# Expected: OK + list of containers (n8n, postgres, etc)
```

If all 3 pass → continue.
If ② fails → CC didn't push secrets, stop and tell me.
If ③ fails → SSH key not loaded; run `ssh-add ~/.ssh/id_ed25519` (or whichever key).

---

## 1. PUSH SECRETS TO HETZNER (5 min)

n8n on Hetzner needs the same secrets your local `.env` has, plus the Firebase service account key.

### 1.1 Copy Firebase service account JSON
```bash
scp ~/letto-ai/.secrets/firebase-admin-sa.json \
    root@204.168.153.192:/opt/n8n/letto-server-key.json
```

### 1.2 Build Hetzner env file from local .env
Local `.env` already has all the keys. Push them to Hetzner's n8n env:

```bash
# On YOUR laptop:
cd ~/letto-ai

# Extract the keys n8n needs (Stripe and VITE_ are NOT needed by n8n)
grep -E '^(ANTHROPIC_API_KEY|TRAVELPAYOUTS_TOKEN|TRAVELPAYOUTS_MARKER|RAPIDAPI_KEY|SENDGRID_API_KEY|TELEGRAM_BOT_TOKEN|TELEGRAM_ADMIN_CHAT_ID|TELEGRAM_PUBLIC_CHANNEL_ID|TELEGRAM_PREMIUM_CHANNEL_ID|FIREBASE_PROJECT_ID|VITE_SITE_URL)=' .env > /tmp/n8n-engine.env

# Add the project ID and service account path explicitly
echo "FIREBASE_SERVICE_ACCOUNT=/opt/n8n/letto-server-key.json" >> /tmp/n8n-engine.env
echo "FIREBASE_PROJECT_ID=letto-ai" >> /tmp/n8n-engine.env
echo "FIREBASE_ACCESS_TOKEN=PLACEHOLDER_WILL_REFRESH_VIA_CRON" >> /tmp/n8n-engine.env

# Push to Hetzner
scp /tmp/n8n-engine.env root@204.168.153.192:/opt/n8n/.env.engine

# Cleanup local temp
rm /tmp/n8n-engine.env
```

### 1.3 Merge into n8n's actual .env
SSH into Hetzner:

```bash
ssh root@204.168.153.192
cd /opt/n8n

# Backup current
cp .env .env.bak.$(date +%Y%m%d-%H%M)

# Append engine vars (or replace entirely if .env was empty)
cat .env.engine >> .env

# Sanity check — count distinct vars (should be ~12-15)
sort -u .env | grep -c '^[A-Z]'
```

Don't restart n8n yet. Token refresh script next.

---

## 2. FIREBASE TOKEN REFRESH SCRIPT (5 min)

Firebase access tokens expire after 1 hour. n8n needs a fresh one constantly. Cron rotates it every 50 min.

### 2.1 Install python google-auth on Hetzner (if not present)
Still SSH'd into Hetzner:

```bash
which python3 || apt install -y python3
pip3 install --break-system-packages google-auth google-auth-oauthlib 2>&1 | tail -3
```

### 2.2 Write the refresh script
```bash
cat > /opt/n8n/refresh-firebase-token.sh <<'BASH_EOF'
#!/bin/bash
set -e

SA_KEY="/opt/n8n/letto-server-key.json"
ENV_FILE="/opt/n8n/.env"

if [ ! -f "$SA_KEY" ]; then
  echo "ERROR: SA key not found at $SA_KEY"
  exit 1
fi

TOKEN=$(python3 - <<'PY_EOF'
from google.oauth2 import service_account
from google.auth.transport.requests import Request
creds = service_account.Credentials.from_service_account_file(
    "/opt/n8n/letto-server-key.json",
    scopes=["https://www.googleapis.com/auth/datastore"]
)
creds.refresh(Request())
print(creds.token)
PY_EOF
)

if [ -z "$TOKEN" ]; then
  echo "ERROR: Failed to mint token"
  exit 1
fi

# Update env file
if grep -q '^FIREBASE_ACCESS_TOKEN=' "$ENV_FILE"; then
  sed -i "s|^FIREBASE_ACCESS_TOKEN=.*|FIREBASE_ACCESS_TOKEN=$TOKEN|" "$ENV_FILE"
else
  echo "FIREBASE_ACCESS_TOKEN=$TOKEN" >> "$ENV_FILE"
fi

# Restart n8n to pick up new env
cd /opt/n8n && docker compose restart n8n > /dev/null 2>&1

echo "[$(date)] Token refreshed and n8n restarted"
BASH_EOF

chmod +x /opt/n8n/refresh-firebase-token.sh
```

### 2.3 Test the script ONCE manually
```bash
/opt/n8n/refresh-firebase-token.sh
# Expected: "[2026-04-25 ...] Token refreshed and n8n restarted"

# Verify token is in .env
grep FIREBASE_ACCESS_TOKEN /opt/n8n/.env | head -c 60
# Expected: FIREBASE_ACCESS_TOKEN=ya29.c.b0AXv0z... (real token, not PLACEHOLDER)
```

If you see a real token starting with `ya29.` → working.
If you see `PLACEHOLDER` or error → stop, debug. Most likely `letto-server-key.json` not on disk or invalid JSON.

### 2.4 Schedule cron every 50 min
```bash
(crontab -l 2>/dev/null | grep -v refresh-firebase-token; echo "*/50 * * * * /opt/n8n/refresh-firebase-token.sh >> /var/log/firebase-refresh.log 2>&1") | crontab -

# Verify cron entry
crontab -l | grep firebase
# Expected: */50 * * * * /opt/n8n/refresh-firebase-token.sh >> /var/log/firebase-refresh.log 2>&1
```

n8n is now restarted with valid token. Stay SSH'd for next step.

---

## 3. UPLOAD WORKFLOW JSONS (2 min)

Open a **second terminal** on your laptop (keep SSH session open in first terminal):

```bash
# In NEW terminal on laptop:
cd ~/letto-ai

scp workflows/01-LETTO-MIXING-ENGINE.json   root@204.168.153.192:/opt/n8n/workflows/
scp workflows/02-LETTO-PRICE-VERIFIER.json  root@204.168.153.192:/opt/n8n/workflows/
scp workflows/03-LETTO-WEEKLY-NEWSLETTER.json root@204.168.153.192:/opt/n8n/workflows/
scp workflows/04-LETTO-TELEGRAM-DAILY.json  root@204.168.153.192:/opt/n8n/workflows/
```

Verify on Hetzner (back in first terminal):
```bash
ls -la /opt/n8n/workflows/*.json
# Expected: 4 files, each 5-20 KB
```

---

## 4. IMPORT WORKFLOWS IN N8N UI (10 min)

### 4.1 Open n8n UI in browser
URL: **`http://204.168.153.192:5678`**

If basic auth → enter credentials (CC set them, check `~/letto-ai/.secrets/` if you forgot, or `cat /opt/n8n/.env | grep N8N_BASIC_AUTH` on Hetzner).

### 4.2 Import each workflow
For each of the 4 JSON files:

1. Top right → **"+"** menu → **"Import from File"** (or right-click in workflow list → Import)
2. Browse to `/opt/n8n/workflows/01-LETTO-MIXING-ENGINE.json`
   - **NOTE**: n8n's file browser is on the **server**, not your laptop. The JSONs need to be in `/opt/n8n/workflows/` on Hetzner (you did this in step 3).
   - Alternative: copy-paste JSON content. Open JSON locally, copy all, in n8n UI use "Paste from clipboard" option in import dialog.
3. After import → workflow opens → **Save** (Cmd+S or top-right Save button)
4. **DO NOT activate yet** — toggle stays gray
5. Repeat for 02, 03, 04

### 4.3 Verify environment variables resolve
In any imported workflow, click any HTTP Request node. Check that `{{$env.RAPIDAPI_KEY}}` style references show actual values when you "Execute Node" preview.

If they show as literal `{{$env.X}}` (not resolved) → restart n8n once more:
```bash
ssh root@204.168.153.192 "cd /opt/n8n && docker compose restart n8n"
```
Wait 30 sec, refresh browser.

---

## 5. MANUAL TEST WORKFLOW 01 (10 min)

This is the **critical test**. If this works, everything else will work.

### 5.1 Open `01-LETTO-MIXING-ENGINE`
Click **Execute Workflow** (top right, lightning bolt icon).

### 5.2 Watch each node light up
Watch the visual flow:

| Node | Expected | If fails |
|------|----------|----------|
| Cron Every 6h | Auto-skipped on manual | ✅ |
| Stage A · 25 Routes | Green, 25 items output | Bug in JS code, paste into me |
| Split into batches | Green, 1 item/batch | Should always pass |
| Stage B · Flights (Travelpayouts) | Green, JSON response | 401 → TRAVELPAYOUTS_TOKEN bad |
| Stage B · Hotels (booking-com15) | Green, JSON response | 403 → RAPIDAPI_KEY bad |
| Stage C · Mix Engine | Green OR `{skip:true}` | Most route batches skip — that's normal |
| Filter skipped | Routes with no skip continue | ✅ |
| Stage D · Claude | Green | 401 → ANTHROPIC_API_KEY bad |
| Parse Claude | Green | JSON parse fail — Claude returned non-JSON |
| Stage E · Firestore | 200 OK | 401 → FIREBASE_ACCESS_TOKEN expired (run refresh script) |
| Telegram Admin Alert | 200 OK | Bot/chat ID misconfigured — non-critical |

**Expected outcome:** Of 25 batches, 5-15 will produce viable packages. Rest skip (no flights, no hotels, savings <30%).

### 5.3 Verify in Firestore
Open Firebase Console → letto-ai → Firestore → `letto_packages` collection.

Should see new docs with status `pending`, e.g. `pkg_beg_ist_20260601_5n`.

If you see new docs → **🟢 ENGINE WORKS.**

### 5.4 Activate workflow 01
Back in n8n UI for `01-LETTO-MIXING-ENGINE`:
- Toggle **"Active"** in top-right (should turn green)
- Save

Cron now runs every 6 hours. Next automatic run: ~6h from now.

---

## 6. ACTIVATE OTHER WORKFLOWS

### Workflow 02 — Price Verifier
Manual test first:
- Open `02-LETTO-PRICE-VERIFIER`
- Execute Workflow
- It fetches all `published_*` packages — at this point you have 0 published, only `pending`. So it will return empty and complete cleanly.
- Activate.

### Workflow 04 — Telegram Daily
Manual test:
- Open `04-LETTO-TELEGRAM-DAILY`
- Execute Workflow
- Will try to fetch best `published_premium` and `published_public` — none yet, so will skip cleanly.
- Activate.

### Workflow 03 — Weekly Newsletter
**DO NOT ACTIVATE.** Wait until you have 100+ reviewed packages. Otherwise you'd send empty newsletter to 550 emails.

Keep in n8n but toggle **stays inactive** until I tell you green light.

---

## 7. VERIFY HEALTH (5 min)

### 7.1 Check Hetzner cron working
After ~50 min from now (mark a calendar reminder):
```bash
ssh root@204.168.153.192 "tail -5 /var/log/firebase-refresh.log"
# Expected: "Token refreshed and n8n restarted" entries every 50 min
```

### 7.2 Check workflow 01 next auto-run
6 hours from activation:
- n8n UI → Executions tab → see automatic execution at scheduled time
- Should produce 5-15 new `pending` packages in Firestore

### 7.3 Telegram alerts working
You should receive Telegram message "📦 New package mined" for each successful package mining. If not:
- Check `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ADMIN_CHAT_ID` env vars
- Test manually: `curl -X POST "https://api.telegram.org/bot<TOKEN>/sendMessage" -d "chat_id=<CHAT_ID>&text=test"`

---

## TROUBLESHOOTING

**n8n UI won't load:**
```bash
ssh root@204.168.153.192 "docker ps --format 'table {{.Names}}\t{{.Status}}'"
# n8n container should be Up. If not:
ssh root@204.168.153.192 "cd /opt/n8n && docker compose up -d"
```

**Workflow execution stuck:**
- Click stop, refresh page, click Execute again
- If still stuck → restart n8n: `docker compose restart n8n`

**Stage E Firestore returns 401:**
- Token expired or invalid
- Run: `ssh root@204.168.153.192 "/opt/n8n/refresh-firebase-token.sh"`
- Re-execute workflow

**No packages produced after 24h despite activation:**
- Check Executions tab in n8n — were workflows actually triggered?
- If no executions: cron not running. Check `crontab -l` on Hetzner.
- If executions but all skip: Travelpayouts/RapidAPI may be returning empty for our 25 routes. Cross-check by hitting one API manually.

**Claude returns garbage instead of JSON:**
- Stage D has fallback: rating 0, package still saved to Firestore. Not blocking.
- Long-term fix: tighten prompt in workflow JSON, but don't worry about it now.

---

## SUCCESS CRITERIA

When you can answer YES to all of these → engine is live:

- [ ] Workflow 01 activated, ran manually, produced ≥1 package in Firestore
- [ ] Workflow 02 activated (no errors when run manually)
- [ ] Workflow 04 activated (no errors when run manually)
- [ ] Workflow 03 imported but **inactive** (correct state for now)
- [ ] Firebase token refresh cron scheduled (`crontab -l | grep firebase`)
- [ ] At least 1 Telegram alert received during test
- [ ] Firestore shows new `pkg_*` docs in `letto_packages` collection

---

## WHAT HAPPENS NEXT (without your action)

- **Every 6h:** Workflow 01 mines 5-15 new packages → Firestore as `pending`
- **Every 2h:** Workflow 02 verifies prices, expires stale packages
- **Daily 10:00 + 16:00:** Workflow 04 posts top package to Telegram channels
- **You review pending packages via admin.html** → approve to public/premium
- **After 100 reviewed:** Activate workflow 03 (Monday newsletter)

---

## WHEN IT'S DONE

Tell me:
1. Number of packages in `letto_packages` after first manual run
2. Any node that failed (paste error message)
3. Whether Telegram alert worked

I'll then:
- Sample-review 3 random packages for quality
- Tune thresholds if needed (savings %, Claude rating cutoff)
- Push v9 visual fix (ticker removed, dropdown menu, about page) once engine is stable

---

**Open terminal. Begin at section 0. The engine waits.** 🧭
