# docker-compose.yml — patch instructions

Apply ONE TIME on Hetzner. After this, container persists indefinitely
(until you intentionally restart for unrelated reasons).

## Edit `/opt/sial-factory/docker-compose.yml`

### 1. REMOVE the `FIREBASE_ACCESS_TOKEN` env var line

Find the n8n service block. It currently has something like:

```yaml
services:
  n8n:
    environment:
      - FIREBASE_ACCESS_TOKEN=${FIREBASE_ACCESS_TOKEN}     # ← REMOVE THIS LINE
      - N8N_HOST=...
      - DB_TYPE=postgresdb
      ...
```

Delete the `FIREBASE_ACCESS_TOKEN` line.

### 2. ADD `NODE_FUNCTION_ALLOW_BUILTIN=fs` env var

In the same `environment:` block, add:

```yaml
    environment:
      - NODE_FUNCTION_ALLOW_BUILTIN=fs    # ← ADD THIS — lets Code nodes read token file
      - N8N_HOST=...
      ...
```

This lets n8n Code/Function nodes use `require('fs')` to read the token file.
By default n8n blocks built-in modules for security; `fs` is opt-in via this env.

### 3. ADD volume mount for the token file

In the `volumes:` block of n8n service:

```yaml
    volumes:
      - n8n_data:/home/node/.n8n
      - /opt/sial-factory/firebase-token.txt:/firebase-token.txt:ro    # ← ADD THIS
```

The `:ro` (read-only) flag is critical — n8n shouldn't modify the token file.

### 4. Initial token bootstrap BEFORE first `docker compose up`

```bash
# Generate the token file once before starting the container.
# After this initial bootstrap, cron handles refresh.
sudo /opt/sial-factory/refresh-firebase-token.sh
ls -la /opt/sial-factory/firebase-token.txt    # verify it exists, ~1KB, 644 perms
```

### 5. Apply changes — single recreate

```bash
cd /opt/sial-factory
docker compose up -d n8n
docker ps --filter name=n8n --format '{{.Names}}\t{{.Status}}'
# expect: n8n  Up X seconds (healthy)
```

### 6. Verify after 5 minutes

```bash
docker ps --filter name=n8n --format '{{.Status}}'
# uptime should be increasing (>5 min, climbing). NO recreate happens.
tail -f /var/log/firebase-refresh.log
# should see new entries every 50 min, BUT no docker recreate logs
```

### 7. Verify after 2h+

Workflow 01 (Every 2h) must execute. Check:
- n8n UI → Executions tab → Workflow 01 runs at scheduled time
- New packages in Firestore with createdAt = today
- Telegram notification arrives for review
