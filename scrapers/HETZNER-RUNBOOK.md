# Hetzner runbook — LETTO Scrapers (Smartproxy Web Scraping API)

**Goal:** deploy scrapers to Hetzner, configure Smartproxy auth, activate WF06 cron.

**Server:** sial-workhorse (CPX52, 12 vCPU / 24 GB RAM / 80 GB disk)
**Container:** sial-factory-n8n-1
**Architecture change:** Smartproxy Web Scraping API replaced Puppeteer. **No Chromium install needed.** Memory footprint dropped 6GB → 1GB. Faster setup, ~5 min Hetzner action.

---

## STEP 0 — Prerequisites (Miroslav-side)

- [x] Smartproxy Web Scraping API account (1500 req/mo plan)
- [x] Web Scraping API credentials (provided): user `smart-pcymhfgoa42e`, pass `CahhcDflaIGmSqPr`
- [ ] **Whitelist Hetzner IP in Smartproxy dashboard** — without this, requests from Hetzner hang indefinitely (verified locally: connection accepts but server never responds). Dashboard → Web Scraping API → Authentication → Add IP whitelist → `204.168.153.192`.

---

## STEP 1 — Resource limits (light, since no Chromium)

n8n container can stay within current budget. No changes needed unless you want to formalize:

```yaml
services:
  n8n:
    # ... existing ...
    mem_limit: 2g    # was previously 6g for Puppeteer; now 2g is generous
    cpus: 2
```

Apply: `cd /opt/sial-factory && docker compose up -d n8n`.

---

## STEP 2 — Deploy scraper scripts

From dev machine:
```bash
# scp scrapers/ + Firebase SA key
scp -r ~/letto-ai/scrapers root@204.168.153.192:/opt/letto-scrapers
scp ~/letto-ai/.secrets/firebase-admin-sa.json root@204.168.153.192:/opt/letto-scrapers/firebase-admin-sa.json

# Install deps (only google-auth-library — no Puppeteer!)
ssh root@204.168.153.192 'cd /opt/letto-scrapers && npm install --omit=dev'

# Bind-mount into n8n container
# Edit docker-compose.yml n8n service → volumes:
#   - /opt/letto-scrapers:/opt/letto-scrapers:ro
ssh root@204.168.153.192 'cd /opt/sial-factory && docker compose up -d n8n'

# Verify mount
ssh root@204.168.153.192 'docker exec sial-factory-n8n-1 ls /opt/letto-scrapers'
```

---

## STEP 3 — Configure env vars

Append to Hetzner `/opt/n8n/.env` (or wherever container env file lives):

```bash
# Smartproxy Web Scraping API (1500 req/mo plan)
SMARTPROXY_AUTH=Basic c21hcnQtcGN5bWhmZ29hNDJlOkNhaGhjRGZsYUlHbVNxUHI=
SMARTPROXY_ENDPOINT=https://scraper.smartproxy.org/v1/query
SMARTPROXY_GEO=RS
SMARTPROXY_LOCALE=en-US
```

Restart n8n:
```bash
ssh root@204.168.153.192 'cd /opt/sial-factory && docker compose restart n8n'
```

CC will regenerate `~/letto-ai/.secrets/hetzner-n8n.env` with these vars after Miroslav says "OK setup".

---

## STEP 4 — Smoke test on Hetzner

```bash
ssh root@204.168.153.192
cd /opt/letto-scrapers

# Test Smartproxy connection (1 quota call)
SMARTPROXY_AUTH='Basic c21hcnQtcGN5bWhmZ29hNDJlOkNhaGhjRGZsYUlHbVNxUHI=' \
  node -e "
    import('./lib/smartproxy.mjs').then(async m => {
      const r = await m.scrape('https://httpbin.org/ip', { jsRender: false });
      console.log('status:', r.status, 'html len:', r.html?.length);
      console.log(r.html?.slice(0, 200));
    }).catch(e => console.error('FAIL:', e.message));
  "
```

Expected: `status: 200, html len: ~50` with `{"origin":"<some-IP>"}`.

If hangs → IP not whitelisted (STEP 0 check).
If 401 → auth env var wrong.
If 400 → schema mismatch (rare; client uses validated body).

Then full smoke test:
```bash
SMARTPROXY_AUTH='Basic ...' node /opt/letto-scrapers/run-all.mjs 2>/tmp/scrape-stderr.log
```

Expect ~3-5 min runtime (12 routes × 3 sources × ~5s/req + sleeps), JSON summary to stdout. Healthy:
```json
{"ok":true,"durationMs":280000,"smartproxyCalls":36,"wizzair":120,"ryanair":80,"pegasus":40,"kontiki":15,"bigblue":12,"errors":[]}
```

---

## STEP 5 — Import + activate WF06 workflow

```bash
# Import via n8n UI:
# 1. n8n → Workflows → Import from File
# 2. Upload ~/letto-ai/workflows/06-LETTO-SCRAPE-REFRESH.json
# 3. Activate workflow

# OR via n8n API (CC handles after smoke test):
N8N_API_KEY=...
curl -X POST "http://204.168.153.192:5678/api/v1/workflows" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d @~/letto-ai/workflows/06-LETTO-SCRAPE-REFRESH.json

# Activate
WF06_ID=$(curl -s "http://204.168.153.192:5678/api/v1/workflows" -H "X-N8N-API-KEY: $N8N_API_KEY" | jq -r '.data[] | select(.name == "06-LETTO-SCRAPE-REFRESH") | .id')
curl -X POST "http://204.168.153.192:5678/api/v1/workflows/$WF06_ID/activate" -H "X-N8N-API-KEY: $N8N_API_KEY"
```

Cron: `0 7 * * *` UTC = 09:00 CET (1×/day, 1h before WF_CJ_REFRESH at 5:30 → wait, CJ refresh runs at 30 5,11,17,23 UTC; scrape runs once at 7:00 UTC).

---

## STEP 6 — Monitor

`https://letto.live/admin-scraping.html` (token-protected) shows:
- Total inventory count
- Per-source breakdown
- Last 5 runs with errors
- **Smartproxy quota tracking** (calls per cycle)

Plus Telegram DM after each cycle: `event: scrape_cycle_complete` with counts + errors.

---

## QUOTA BUDGET (Option A — current config)

| | per cycle | per day | per month |
|---|---|---|---|
| Flight scrapers (Wizz/Ryanair/Pegasus) | 36 calls | 36 (1×/day) | **1080** |
| Charter scrapers (Kontiki/BigBlue) | 0 (plain HTTP) | 0 | 0 |
| **Smartproxy quota used** | | | **1080 / 1500 mo** |
| Buffer (retries, ad-hoc tests) | | | 420 |

If yield drops or Wizz starts rejecting `js_render: false`, flip to `jsRender: true` in `run-all.mjs` (per-call cost may double — verify with Smartproxy account first).

If 1500/mo is too tight for Option A and you upgrade plan: increase `TOP_ROUTES` to top 20-25 (= 60-75/cycle = 1800-2250/mo), or run 2×/day.

---

## ROLLBACK

```bash
# Deactivate WF06 (instant)
N8N_API_KEY=...
WF06_ID=$(curl -s ... | jq -r '...')
curl -X POST "http://204.168.153.192:5678/api/v1/workflows/$WF06_ID/deactivate" -H "X-N8N-API-KEY: $N8N_API_KEY"

# Optional: clean up volumes
ssh root@204.168.153.192 'rm -rf /opt/letto-scrapers'
```

WF01-04 + WF_CJ_REFRESH unaffected.

---

## TIMELINE EXPECTATIONS

| Step | Owner | Duration |
|---|---|---|
| 0 (IP whitelist) | Miroslav | 2 min |
| 1 (resource limits) | Miroslav SSH | 2 min |
| 2 (scp + npm install) | Miroslav | 3 min |
| 3 (env vars) | Miroslav SSH | 2 min |
| 4 (smoke test) | Miroslav SSH | 5 min |
| 5 (import + activate) | CC | 1 min |
| **Total** | | **~15 min Miroslav-side** (was 40 with Puppeteer) |

Once WF06 active, first cron tick fires within 24h (next 07:00 UTC). DM lands ~3-5 min after start.
