#!/usr/bin/env node
// scripts/backfill-null-savings.mjs — Null out fabricated agencyReference / savingsPercent / savings
// on all packages with status published_public OR published_premium.
// Fields live under pricing.* (per Stage C engine output), not metadata.*.

import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'node:fs';

const sa = JSON.parse(readFileSync('/home/zlfzr/letto-ai/.secrets/firebase-admin-sa.json', 'utf8'));
const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/datastore'] });
const t = (await (await auth.getClient()).getAccessToken()).token;

const r = await fetch('https://firestore.googleapis.com/v1/projects/letto-ai/databases/(default)/documents/letto_packages?pageSize=200', {
  headers: { Authorization: 'Bearer ' + t }
});
const docs = (await r.json()).documents || [];
console.log(`Found ${docs.length} packages.`);

const targetStatuses = new Set(['published_public', 'published_premium']);
let success = 0, skipped = 0, failed = 0;

for (const d of docs) {
  const id = d.name.split('/').pop();
  const status = d.fields?.status?.stringValue;
  if (!targetStatuses.has(status)) { skipped++; continue; }

  const patchUrl = `https://firestore.googleapis.com/v1/projects/letto-ai/databases/(default)/documents/letto_packages/${id}`
    + `?updateMask.fieldPaths=pricing.agencyReference`
    + `&updateMask.fieldPaths=pricing.savingsPercent`
    + `&updateMask.fieldPaths=pricing.savings`;

  const body = {
    fields: {
      pricing: {
        mapValue: {
          fields: {
            agencyReference: { nullValue: null },
            savingsPercent: { nullValue: null },
            savings: { nullValue: null }
          }
        }
      }
    }
  };

  const pr = await fetch(patchUrl, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (pr.ok) {
    success++;
    console.log(`  [${id}] (${status}) → nulled ✓`);
  } else {
    failed++;
    console.error(`  [${id}] PATCH ${pr.status}: ${(await pr.text()).slice(0, 200)}`);
  }
}

console.log(`\nDone. success=${success}, skipped=${skipped}, failed=${failed}`);
