#!/usr/bin/env node
// scripts/cj-pull-inventory.mjs — Pull all CJ travel inventory + write to Firestore.
// Currently covers Air Serbia (only joined airline with travelExperienceProducts feed).
// Future: when more airlines/hotels are joined, extend `PARTNERS` array.
//
// Run: node scripts/cj-pull-inventory.mjs
// Schedule: daily via WF_CJ_REFRESH workflow (TBD) or Vercel cron.

import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'node:fs';

const env = readFileSync('/home/zlfzr/letto-ai/.env', 'utf8');
const CJ_TOKEN = env.match(/CJ_API_TOKEN=(.*)/)[1];
const CID = 7897692;
const CJ_PID = (env.match(/CJ_PID=(.*)/) || [])[1] || null; // Website Property ID — populated when Miroslav provides

// Joined partners with travelExperienceProducts feed (4 advertisers, only Air Serbia has product feed)
const PARTNERS = [
  { id: '5289333', name: 'Air Serbia', category: 'air' }
  // Future: Vrbo (2691607), World Nomads (6159036), GiannaBellucci (skip — apparel)
];

const sa = JSON.parse(readFileSync('/home/zlfzr/letto-ai/.secrets/firebase-admin-sa.json', 'utf8'));
const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/datastore'] });
const fbToken = (await (await auth.getClient()).getAccessToken()).token;

async function gqlQuery(body) {
  const r = await fetch('https://ads.api.cj.com/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + CJ_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`CJ ${r.status}: ${await r.text()}`);
  return r.json();
}

async function pullPartner(partner) {
  const all = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const linkClause = CJ_PID ? `linkCode(pid: "${CJ_PID}") { clickUrl }` : '';
    const query = `{
      travelExperienceProducts(companyId: ${CID}, partnerIds: ["${partner.id}"], limit: 100, offset: ${offset}) {
        resultList {
          id title brand
          price { amount currency }
          salePrice { amount currency }
          discountPercentage
          originCode destinationCode destinationCity destinationCountry
          stops travelStartDate travelEndDate
          link imageLink promotion
          ${linkClause}
        }
      }
    }`.replace(/\s+/g, ' ').trim();

    const data = await gqlQuery({ query });
    const items = data.data?.travelExperienceProducts?.resultList || [];
    if (items.length === 0) break;
    all.push(...items);
    if (items.length < 100) break;
  }
  return all;
}

function toFsValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number' && Number.isInteger(v)) return { integerValue: String(v) };
  if (typeof v === 'number') return { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
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

async function writeToFirestore(partner, items) {
  let written = 0, failed = 0;
  for (const p of items) {
    if (!p.id) continue;
    const docId = `cj_${partner.id}_${p.id}`.replace(/[^a-zA-Z0-9_-]/g, '');
    const url = `https://firestore.googleapis.com/v1/projects/letto-ai/databases/(default)/documents/letto_cj_inventory/${docId}`;
    const fields = {};
    const map = {
      cjProductId: p.id,
      partnerId: partner.id,
      partnerName: partner.name,
      partnerCategory: partner.category,
      title: p.title,
      brand: p.brand,
      originCode: p.originCode,
      destinationCode: p.destinationCode,
      destinationCity: p.destinationCity,
      destinationCountry: p.destinationCountry,
      priceAmount: p.price ? parseFloat(p.price.amount) : null,
      priceCurrency: p.price?.currency,
      salePriceAmount: p.salePrice ? parseFloat(p.salePrice.amount) : null,
      salePriceCurrency: p.salePrice?.currency,
      discountPercentage: p.discountPercentage,
      stops: p.stops ? parseInt(p.stops) : null,
      travelStartDate: p.travelStartDate,
      travelEndDate: p.travelEndDate,
      directLink: p.link,
      affiliateLink: p.linkCode?.clickUrl || null,
      imageLink: p.imageLink,
      promotion: p.promotion,
      lastSyncedAt: new Date().toISOString()
    };
    for (const [k, v] of Object.entries(map)) {
      const fv = toFsValue(v);
      if (fv !== null) fields[k] = fv;
    }
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + fbToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
    if (r.ok) written++;
    else { failed++; if (failed <= 3) console.error(`  ${docId}: ${r.status} ${(await r.text()).slice(0, 200)}`); }
  }
  return { written, failed };
}

console.log(`CJ inventory pull — CID ${CID}, PID ${CJ_PID || '(not configured)'}`);
console.log(`PARTNERS: ${PARTNERS.map(p => p.name).join(', ')}`);
if (!CJ_PID) console.log('NOTE: CJ_PID missing in .env — pulling product data without affiliate clickUrls.');
console.log();

const startTime = Date.now();
let totalItems = 0;

for (const partner of PARTNERS) {
  process.stdout.write(`[${partner.name}] pulling… `);
  const items = await pullPartner(partner);
  console.log(`${items.length} items`);
  process.stdout.write(`[${partner.name}] writing to Firestore… `);
  const r = await writeToFirestore(partner, items);
  console.log(`written=${r.written}, failed=${r.failed}`);
  totalItems += r.written;
}

console.log(`\nDone in ${((Date.now() - startTime) / 1000).toFixed(1)}s. Total written: ${totalItems}.`);
