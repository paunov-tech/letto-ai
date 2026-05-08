#!/usr/bin/env node
// scripts/run-baselines.mjs — Pull Travelpayouts price calendar for each route, compute median, save to letto_route_baselines.
// Idempotent: re-running overwrites with fresh data.

import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'node:fs';

const TP_TOKEN = readFileSync('/home/zlfzr/letto-ai/.secrets/hetzner-n8n.env', 'utf8')
  .split('\n').find(l => l.startsWith('TRAVELPAYOUTS_TOKEN=')).split('=')[1].trim();

const ROUTES = [
  ['BEG','IST','TR','Istanbul'],
  ['BEG','FCO','IT','Rome'],
  ['BEG','CDG','FR','Paris'],
  ['BEG','BCN','ES','Barcelona'],
  ['BEG','DXB','AE','Dubai'],
  ['BEG','ATH','GR','Athens'],
  ['BEG','AMS','NL','Amsterdam'],
  ['BEG','VIE','AT','Vienna'],
  ['BEG','BUD','HU','Budapest'],
  ['BEG','PRG','CZ','Prague'],
  ['BEG','SKG','GR','Thessaloniki'],
  ['BEG','PMI','ES','Palma'],
  ['BEG','MLA','MT','Valletta'],
  ['BEG','AYT','TR','Antalya'],
  ['BEG','SPU','HR','Split'],
  ['BEG','TIV','ME','Tivat'],
  ['ZAG','BCN','ES','Barcelona'],
  ['ZAG','FCO','IT','Rome'],
  ['SJJ','IST','TR','Istanbul'],
  ['SKP','IST','TR','Istanbul'],
  ['INI','IST','TR','Istanbul'],
  ['BEG','TLV','IL','Tel Aviv'],
  ['BEG','LHR','GB','London'],
  ['BEG','LIS','PT','Lisbon'],
  ['BEG','HKT','TH','Phuket']
];

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid];
}

const sa = JSON.parse(readFileSync('/home/zlfzr/letto-ai/.secrets/firebase-admin-sa.json', 'utf8'));
const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/datastore'] });
const fbToken = (await (await auth.getClient()).getAccessToken()).token;

const monthQuery = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 7);

let ok = 0, empty = 0, failed = 0;

for (const [origin, dest, country, city] of ROUTES) {
  const url = `https://api.travelpayouts.com/v1/prices/calendar?origin=${origin}&destination=${dest}&currency=EUR&depart_date=${monthQuery}&calendar_type=departure_date&token=${TP_TOKEN}`;
  try {
    const r = await fetch(url);
    const j = await r.json();
    const data = j.data || {};
    const prices = Object.values(data).map(e => e?.price).filter(p => Number.isFinite(p) && p > 0);
    if (!prices.length) {
      empty++;
      console.log(`  [${origin}→${dest}] empty calendar, skip`);
      continue;
    }
    const med = median(prices);
    const min = Math.min(...prices);
    const max = Math.max(...prices);

    const docId = `${origin}_${dest}`;
    const patchUrl = `https://firestore.googleapis.com/v1/projects/letto-ai/databases/(default)/documents/letto_route_baselines/${docId}`;
    const body = {
      fields: {
        origin: { stringValue: origin },
        destination: { stringValue: dest },
        country: { stringValue: country },
        city: { stringValue: city },
        medianFlightPrice: { integerValue: String(med) },
        minFlightPrice: { integerValue: String(min) },
        maxFlightPrice: { integerValue: String(max) },
        sampleSize: { integerValue: String(prices.length) },
        lastUpdated: { timestampValue: new Date().toISOString() },
        source: { stringValue: 'travelpayouts_calendar' }
      }
    };
    const pr = await fetch(patchUrl, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + fbToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (pr.ok) {
      ok++;
      console.log(`  [${origin}→${dest}] median=€${med} (n=${prices.length}, min=${min}, max=${max}) ✓`);
    } else {
      failed++;
      console.error(`  [${origin}→${dest}] PATCH ${pr.status}: ${(await pr.text()).slice(0, 150)}`);
    }
    await new Promise(r => setTimeout(r, 250));
  } catch (e) {
    failed++;
    console.error(`  [${origin}→${dest}] error: ${e.message}`);
  }
}

console.log(`\nDone. ok=${ok}, empty=${empty}, failed=${failed}`);
