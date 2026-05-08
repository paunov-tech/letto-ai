#!/bin/bash
# refresh-firebase-token.sh — generates fresh Firebase access token, writes to shared file.
# n8n container reads token from this file at workflow runtime.
# NO MORE container recreate. Container uptime persists indefinitely.
#
# Schedule from cron (every 50 min):
#   */50 * * * * /opt/sial-factory/refresh-firebase-token.sh
#
# Token file is mounted into n8n container as /firebase-token.txt (read-only).

set -euo pipefail

SA_KEY="/opt/sial-factory/letto-server-key.json"
TOKEN_FILE="/opt/sial-factory/firebase-token.txt"
LOG_FILE="/var/log/firebase-refresh.log"

if [ ! -f "$SA_KEY" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: service account key missing at $SA_KEY" >> "$LOG_FILE"
  exit 1
fi

# Generate fresh access token (1h validity)
TOKEN=$(python3 - <<'PYEOF' 2>/dev/null
from google.oauth2 import service_account
from google.auth.transport.requests import Request

creds = service_account.Credentials.from_service_account_file(
    "/opt/sial-factory/letto-server-key.json",
    scopes=["https://www.googleapis.com/auth/datastore"]
)
creds.refresh(Request())
print(creds.token)
PYEOF
)

if [ -z "$TOKEN" ] || [ ${#TOKEN} -lt 100 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: empty/short token (len=${#TOKEN})" >> "$LOG_FILE"
  exit 1
fi

# Write atomically (write to .tmp then rename — prevents n8n reading half-written file)
echo -n "$TOKEN" > "${TOKEN_FILE}.tmp"
chmod 644 "${TOKEN_FILE}.tmp"
mv -f "${TOKEN_FILE}.tmp" "$TOKEN_FILE"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Token refreshed (len=${#TOKEN}), written to $TOKEN_FILE" >> "$LOG_FILE"
