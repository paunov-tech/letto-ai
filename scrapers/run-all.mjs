#!/usr/bin/env node
// scrapers/run-all.mjs — Orchestrator. Smartproxy Web Scraping API based (NO Puppeteer).
//
// Architecture per Option A (1500 req/mo budget):
//   Top 12 BEG routes × 3 flight sources = 36 req/cycle
//   Cron: 1×/day at 07:00 UTC = ~1080 req/month (420 buffer)
//   Charter scrapers (Kontiki, BigBlue) plain HTTP — no quota impact
//
// Required env vars:
//   FIREBASE_SERVICE_ACCOUNT_JSON  OR  /opt/letto-scrapers/firebase-admin-sa.json
//   SMARTPROXY_AUTH (full "Basic xyz==" string)  OR  SMARTPROXY_USER + SMARTPROXY_PASS
//
// Output: JSON to stdout for n8n capture.

import { scrapeWizzair } from './sources/wizzair.mjs';
import { scrapeRyanair } from './sources/ryanair.mjs';
import { scrapePegasus } from './sources/pegasus.mjs';
import { scrapeKontiki } from './sources/kontiki.mjs';
import { scrapeBigBlue } from './sources/bigblue.mjs';
import { getLocalQuotaUsed } from './lib/smartproxy.mjs';

const SCRAPE_TTL_HOURS = 24;
// Top 12 BEG routes (Option A — derived from Air Serbia CJ inventory popularity).
const TOP_ROUTES = [
  { origin: 'BEG', destination: 'IST' },
  { origin: 'BEG', destination: 'FCO' },
  { origin: 'BEG', destination: 'CDG' },
  { origin: 'BEG', destination: 'BCN' },
  { origin: 'BEG', destination: 'MAD' },
  { origin: 'BEG', destination: 'ATH' },
  { origin: 'BEG', destination: 'BUD' },
  { origin: 'BEG', destination: 'VIE' },
  { origin: 'BEG', destination: 'MUC' },
  { origin: 'BEG', destination: 'LHR' },
  { origin: 'BEG', destination: 'AMS' },
  { origin: 'BEG', destination: 'ZRH' }
];

// Firestore REST helpers (no firebase-admin dep — runs anywhere)
async function getFirestoreToken() {
  const { GoogleAuth } = await import('google-auth-library');
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || (await readKey()));
  const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/datastore'] });
  return (await (await auth.getClient()).getAccessToken()).token;
}
async function readKey() {
  const { readFileSync } = await import('node:fs');
  for (const p of ['/opt/letto-scrapers/firebase-admin-sa.json', '/home/zlfzr/letto-ai/.secrets/firebase-admin-sa.json']) {
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

async function writeInventoryEntry(token, entry) {
  const fields = {};
  for (const [k, v] of Object.entries(entry)) {
    const fv = toFsValue(v);
    if (fv !== null) fields[k] = fv;
  }
  return fsCreate(token, 'letto_scrape_inventory', fields);
}

async function main() {
  const startTime = Date.now();
  const summary = { wizzair: 0, ryanair: 0, pegasus: 0, kontiki: 0, bigblue: 0, errors: [] };
  let token;
  try { token = await getFirestoreToken(); } catch (e) { console.error('Firestore auth failed:', e.message); }

  // ─── Charter scrapers (no Smartproxy budget) ─────────────────────
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

  // ─── Flight scrapers via Smartproxy ──────────────────────────────
  // Sequential to respect quota / rate limits (1 req/2s effective)
  for (const route of TOP_ROUTES) {
    for (const [src, fn] of [['wizzair', scrapeWizzair], ['ryanair', scrapeRyanair], ['pegasus', scrapePegasus]]) {
      try {
        const rows = await fn({ ...route, jsRender: false });
        for (const r of rows) {
          if (token) {
            await writeInventoryEntry(token, {
              source: src,
              origin: route.origin,
              destination: route.destination,
              outbound: { date: r.date, price: r.price, currency: r.currency },
              scrapedAt: new Date().toISOString(),
              validUntil: new Date(Date.now() + SCRAPE_TTL_HOURS * 3600000).toISOString()
            });
          }
        }
        summary[src] += rows.length;
        console.error(`[${src} ${route.origin}→${route.destination}] ${rows.length} rows`);
      } catch (e) {
        summary.errors.push(`${src} ${route.origin}→${route.destination}: ${e.message.slice(0, 100)}`);
        console.error(`[${src} ${route.origin}→${route.destination}] ERROR ${e.message.slice(0, 200)}`);
      }
      // Rate limit: ~1 req/2s
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  const result = {
    ok: true,
    durationMs: Date.now() - startTime,
    smartproxyCalls: getLocalQuotaUsed(),
    ...summary
  };

  if (token) {
    await fsCreate(token, 'letto_scrape_runs', {
      ranAt: { timestampValue: new Date().toISOString() },
      durationMs: { integerValue: String(result.durationMs) },
      smartproxyCalls: { integerValue: String(result.smartproxyCalls) },
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
