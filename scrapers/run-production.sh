#!/usr/bin/env bash
set -euo pipefail

SCRAPER_DIR="${SCRAPER_DIR:-/opt/letto-scrapers}"
ENV_FILE="${ENV_FILE:-/opt/sial-factory/.env}"

# The shared application env contains a human-readable placeholder which is
# not valid shell. Export only the keys used by this process, without eval.
if [[ -r "$ENV_FILE" ]]; then
  while IFS= read -r line; do
    export "$line"
  done < <(grep -E '^(BRIGHT_DATA_|SMARTPROXY_|CHROMIUM_PATH=|FLIGHT_SCRAPES_ENABLED=)' "$ENV_FILE" || true)
fi

# Direct-airline pages currently do not expose stable fare data to the
# provider API. Keep those probes opt-in until their contracts are verified.
export FLIGHT_SCRAPES_ENABLED="${FLIGHT_SCRAPES_ENABLED:-false}"

cd "$SCRAPER_DIR"
exec /usr/bin/node run-all.mjs
