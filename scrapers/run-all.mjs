#!/usr/bin/env node
// scrapers/run-all.mjs — Orchestrator. Bright Data + Smartproxy fallback (NO Puppeteer).
//
// Architecture per Option A (1500 req/mo budget):
//   Only routes actually operated by each airline are queried in both directions.
//   Cron: 1×/day at 07:00 UTC. Charter pages render in local Chromium and do
//   not consume provider quota.
//
// Required env vars:
//   FIREBASE_SERVICE_ACCOUNT_JSON  OR  /opt/letto-scrapers/firebase-admin-sa.json
//   BRIGHT_DATA_API_KEY (+ optional BRIGHT_DATA_ZONE; auto-discovered otherwise)
//   Optional fallback: SMARTPROXY_AUTH or SMARTPROXY_USER + SMARTPROXY_PASS
//
// Output: JSON to stdout for n8n capture.

import { scrapeWizzair } from './sources/wizzair.mjs';
import { scrapeRyanair } from './sources/ryanair.mjs';
import { scrapePegasus } from './sources/pegasus.mjs';
import { scrapeKontiki } from './sources/kontiki.mjs';
import { scrapeBigBlue } from './sources/bigblue.mjs';
import { getProviderStats } from './lib/smartproxy.mjs';
import { directBookingUrl, inventoryId, pairRoundTrips, SOURCE_ROUTES } from './lib/flight-inventory.mjs';

const SCRAPE_TTL_HOURS = 24;
const FLIGHT_SCRAPES_ENABLED = process.env.FLIGHT_SCRAPES_ENABLED !== 'false';

// Firestore REST helpers (no firebase-admin dep — runs anywhere)
async function getFirestoreToken() {
  const { GoogleAuth } = await import('google-auth-library');
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || (await readKey()));
  const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/datastore'] });
  return (await (await auth.getClient()).getAccessToken()).token;
}
async function readKey() {
  const { readFileSync } = await import('node:fs');
  for (const p of [
    '/letto-server-key.json',
    '/opt/letto-scrapers/firebase-admin-sa.json',
    '/home/zlfzr/letto-ai/.secrets/firebase-admin-sa.json'
  ]) {
    try { return readFileSync(p, 'utf8'); } catch (e) {}
  }
  throw new Error('No SA key found');
}

function toFsValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number' && Number.isInteger(v)) return { integerValue: String(v) };
  if (typeof v === 'number') return { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue).filter(Boolean) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) {
      const fv = toFsValue(val);
      if (fv !== null) fields[k] = fv;
    }
    return { mapValue: { fields } };
  }
  return null;
}

async function fsCreate(token, path, body) {
  const url = `https://firestore.googleapis.com/v1/projects/letto-ai/databases/(default)/documents/${path}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: body })
  });
  return r.ok;
}

async function fsUpsert(token, path, body) {
  const url = `https://firestore.googleapis.com/v1/projects/letto-ai/databases/(default)/documents/${path}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: body })
  });
  if (!r.ok) throw new Error(`Firestore upsert ${r.status}: ${(await r.text()).slice(0, 180)}`);
  return true;
}

async function writeInventoryEntry(token, entry) {
  const fields = {};
  for (const [k, v] of Object.entries(entry)) {
    const fv = toFsValue(v);
    if (fv !== null) fields[k] = fv;
  }
  return fsUpsert(token, `letto_scrape_inventory/${inventoryId(entry)}`, fields);
}

async function main() {
  const startTime = Date.now();
  const summary = { wizzair: 0, ryanair: 0, pegasus: 0, kontiki: 0, bigblue: 0, errors: [] };
  let token;
  try { token = await getFirestoreToken(); } catch (e) { console.error('Firestore auth failed:', e.message); }

  // ─── Charter scrapers (local browser, no provider budget) ───────────
  for (const [src, fn] of [['kontiki', scrapeKontiki], ['bigblue', scrapeBigBlue]]) {
    try {
      const items = await fn();
      for (const it of items) {
        if (token) {
          await writeInventoryEntry(token, {
            source: src,
            type: 'charter_package',
            ...it,
            scrapedAt: new Date().toISOString(),
            validUntil: new Date(Date.now() + SCRAPE_TTL_HOURS * 3600000).toISOString()
          });
        }
      }
      summary[src] = items.length;
      console.error(`[${src}] ${items.length} packages`);
    } catch (e) {
      summary.errors.push(`${src}: ${e.message}`);
      console.error(`[${src}] ERROR ${e.message}`);
    }
  }

  // ─── Direct flight sources ────────────────────────────────────────
  // Query only routes each airline operates and require both directions.
  if (!FLIGHT_SCRAPES_ENABLED) {
    console.error('[flights] disabled by FLIGHT_SCRAPES_ENABLED=false');
  }
  if (FLIGHT_SCRAPES_ENABLED) for (const [src, fn] of [['wizzair', scrapeWizzair], ['ryanair', scrapeRyanair], ['pegasus', scrapePegasus]]) {
    for (const [origin, destination] of SOURCE_ROUTES[src]) {
      try {
        const [outboundRows, returnRows] = await Promise.all([
          fn({ origin, destination, jsRender: true }),
          fn({ origin: destination, destination: origin, jsRender: true })
        ]);
        const pairs = pairRoundTrips(outboundRows, returnRows);
        for (const pair of pairs) {
          if (token) {
            await writeInventoryEntry(token, {
              source: src,
              type: 'roundtrip_flight',
              origin,
              destination,
              outbound: pair.outbound,
              return: pair.inbound,
              nights: pair.nights,
              totalPrice: pair.totalPrice,
              currency: pair.currency,
              bookingUrl: directBookingUrl(src, origin, destination),
              scrapedAt: new Date().toISOString(),
              validUntil: new Date(Date.now() + SCRAPE_TTL_HOURS * 3600000).toISOString()
            });
          }
        }
        summary[src] += pairs.length;
        console.error(`[${src} ${origin}→${destination}] ${pairs.length} round trips (${outboundRows.length}+${returnRows.length} one-way rows)`);
      } catch (e) {
        summary.errors.push(`${src} ${origin}→${destination}: ${e.message.slice(0, 100)}`);
        console.error(`[${src} ${origin}→${destination}] ERROR ${e.message.slice(0, 200)}`);
      }
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  const result = {
    ok: true,
    durationMs: Date.now() - startTime,
    ...getProviderStats(),
    ...summary
  };

  if (token) {
    await fsCreate(token, 'letto_scrape_runs', {
      ranAt: { timestampValue: new Date().toISOString() },
      durationMs: { integerValue: String(result.durationMs) },
      smartproxyCalls: { integerValue: String(result.smartproxyCalls) },
      brightdataCalls: { integerValue: String(result.brightdataCalls) },
      fallbackCalls: { integerValue: String(result.fallbackCalls) },
      counts: toFsValue({
        wizzair: summary.wizzair,
        ryanair: summary.ryanair,
        pegasus: summary.pegasus,
        kontiki: summary.kontiki,
        bigblue: summary.bigblue
      }),
      errors: toFsValue(summary.errors)
    });
  }

  console.log(JSON.stringify(result));
}

main().catch(e => {
  console.error('FATAL:', e);
  console.log(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
