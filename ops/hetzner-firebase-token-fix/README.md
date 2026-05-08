# Hetzner Firebase Token Fix — Workflow 01 Telegram Recovery

**Problem:** `refresh-firebase-token.sh` recreates n8n container every 50 min via
`sed` on docker-compose.yml + `docker compose up -d`. Container uptime never
exceeds 50 min, so Workflow 01's "Every 2h" cron trigger never fires. No new
deals scanned → no Telegram pending push.

**Fix (Option A):** Move token from env var (which requires container recreate
to update) into a shared volume file (which workflows read at runtime, no
restart needed).

**Outcome:** Container persists, Workflow 01 fires every 2h, deals flow.

---

## Order of operations on Hetzner (204.168.153.192)

### 0. Snapshot first
```bash
sudo cp /opt/sial-factory/refresh-firebase-token.sh /opt/sial-factory/refresh-firebase-token.sh.bak-2026-04-28
sudo cp /opt/sial-factory/docker-compose.yml /opt/sial-factory/docker-compose.yml.bak-2026-04-28
```

If anything breaks, restore from .bak files.

### 1. Replace `refresh-firebase-token.sh`
Copy `ops/hetzner-firebase-token-fix/refresh-firebase-token.sh` from this repo
to `/opt/sial-factory/refresh-firebase-token.sh` on Hetzner.

```bash
sudo chmod +x /opt/sial-factory/refresh-firebase-token.sh
```

### 2. Bootstrap initial token file
```bash
sudo /opt/sial-factory/refresh-firebase-token.sh
sudo cat /opt/sial-factory/firebase-token.txt | wc -c
# expect: ~1500 chars
sudo ls -la /opt/sial-factory/firebase-token.txt
# expect: -rw-r--r-- root root ~1500
```

### 3. Patch `docker-compose.yml`
Follow `docker-compose.patch.md` step by step. Three changes:
- REMOVE: `FIREBASE_ACCESS_TOKEN=...` env var line
- ADD:    `NODE_FUNCTION_ALLOW_BUILTIN=fs` env var
- ADD:    `/opt/sial-factory/firebase-token.txt:/firebase-token.txt:ro` volume mount

### 4. Refactor Workflow 01 in n8n UI
Follow `n8n-workflow-pattern.md`. Adds "Read Firebase Token" Code node at start,
swaps env var reference to that node's output in HTTP Request to Firestore.

### 5. Recreate container ONCE
```bash
cd /opt/sial-factory && docker compose up -d n8n
docker ps --filter name=n8n --format '{{.Names}}\t{{.Status}}'
# expect: Up X seconds
```

### 6. Verify env var landed
```bash
docker exec $(docker ps -q --filter name=n8n) env | grep -E 'NODE_FUNCTION|FIREBASE'
# expect:
#   NODE_FUNCTION_ALLOW_BUILTIN=fs
# expect NOT:
#   FIREBASE_ACCESS_TOKEN=ya29.xxx     ← must be GONE
```

### 7. Verify token file mounted in container
```bash
docker exec $(docker ps -q --filter name=n8n) cat /firebase-token.txt | head -c 50
# expect: first 50 chars of the token (starts with 'ya29.' for OAuth2)
```

### 8. Manually test Workflow 01
n8n UI → Workflow 01 → "Execute Workflow" button.
- "Read Firebase Token" node should emit `{ token: "ya29.xxxx..." }`
- "Write to Firestore" node should return 200
- Final node "Notify Miroslav for review" should send Telegram message
- Check Firestore for new package documents with createdAt = now

### 9. Confirm container uptime grows past 50 min
```bash
# 60 min later:
docker ps --filter name=n8n --format '{{.Status}}'
# expect: Up About an hour      ← uptime exceeds 50 min, NO recreate happened

# 70 min later:
tail /var/log/firebase-refresh.log
# expect: "Token refreshed (len=1500), written to /opt/sial-factory/firebase-token.txt"
# expect NOT: "n8n recreated" / "docker compose up -d n8n"
```

### 10. Wait 2h+ for first scheduled cron run
```bash
# n8n UI → Executions tab → Workflow 01 should show successful run at scheduled time

# Public verification (no SSH needed):
curl -s 'https://letto.live/api/packages?limit=3' | python3 -c "
import json, sys, datetime
d = json.load(sys.stdin)
for p in d.get('packages', []):
    sec = p.get('metadata', {}).get('createdAt', {}).get('_seconds', 0)
    dt = datetime.datetime.fromtimestamp(sec)
    print(p.get('destination', {}).get('city'), '←', dt)
"
# expect: at least one package with timestamp from today
```

### 11. Telegram pending push verification
Within 10 min of Workflow 01 successful run, Miroslav receives Telegram
notification with pending deal for review. **This is the ultimate signal.**

---

## Rollback

If anything breaks within 30 min of recreate:
```bash
sudo cp /opt/sial-factory/refresh-firebase-token.sh.bak-2026-04-28 /opt/sial-factory/refresh-firebase-token.sh
sudo cp /opt/sial-factory/docker-compose.yml.bak-2026-04-28 /opt/sial-factory/docker-compose.yml
sudo /opt/sial-factory/refresh-firebase-token.sh   # regenerates token, runs old sed
cd /opt/sial-factory && docker compose up -d n8n
# Old behavior restored: container recreates every 50 min, but Telegram pings are back
```

n8n workflow rollback: revert "Write to Firestore" node Authorization header
back to `Bearer {{ $env.FIREBASE_ACCESS_TOKEN }}`.

---

## Why this works

| Before (broken) | After (fixed) |
|---|---|
| Token in env var | Token in file |
| Updating token requires container recreate | Updating token = file rewrite, no restart |
| `sed` + `docker compose up -d` every 50 min | Just `echo > file` every 50 min |
| Container uptime: 0-50 min | Container uptime: indefinite |
| Workflow 01 (Every 2h) never fires | Workflow 01 fires on schedule |
| 0 new deals/day | Multiple deals scanned every 2h |

---

## Estimated time on Hetzner

- File copies + bootstrap: 5 min
- docker-compose edit + recreate: 5 min
- Workflow 01 refactor in UI: 10-15 min
- Verification (test execution): 5 min
- Wait for first scheduled cron + Telegram message: up to 2h (passive)

Active hands-on time: **~25 min**. Passive verification: 2h.
