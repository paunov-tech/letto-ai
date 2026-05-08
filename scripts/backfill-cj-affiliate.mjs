#!/usr/bin/env node
// scripts/backfill-cj-affiliate.mjs — Backfill letto_packages.affiliate field for legacy packages.
// Looks up letto_cj_inventory by origin+destination, sets affiliate.{source,partnerId,partnerName,url}.
// Equivalent to WF01 Stage F but applied to all existing packages (idempotent).

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

let success = 0, noMatch = 0, alreadyHas = 0, missingRoute = 0, failed = 0;

for (const d of docs) {
  const id = d.name.split('/').pop();
  const f = d.fields;
  const origin = f.origin?.mapValue?.fields?.code?.stringValue;
  const dest = f.destination?.mapValue?.fields?.code?.stringValue;
  if (!origin || !dest) { missingRoute++; console.log(`  [${id}] missing origin/dest, skip`); continue; }
  if (f.affiliate?.mapValue?.fields?.url?.stringValue) { alreadyHas++; console.log(`  [${id}] already has affiliate, skip`); continue; }

  // Lookup CJ inventory matching origin+destination
  const queryBody = {
    structuredQuery: {
      from: [{ collectionId: 'letto_cj_inventory' }],
      where: { compositeFilter: { op: 'AND', filters: [
        { fieldFilter: { field: { fieldPath: 'originCode' }, op: 'EQUAL', value: { stringValue: origin } } },
        { fieldFilter: { field: { fieldPath: 'destinationCode' }, op: 'EQUAL', value: { stringValue: dest } } }
      ] } },
      limit: 1
    }
  };
  const lr = await fetch('https://firestore.googleapis.com/v1/projects/letto-ai/databases/(default)/documents:runQuery', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
    body: JSON.stringify(queryBody)
  });
  const rows = await lr.json();
  const match = (Array.isArray(rows) ? rows : []).find(r => r.document);

  if (!match) {
    noMatch++;
    console.log(`  [${id}] (${origin}→${dest}) → no CJ match, skip`);
    continue;
  }

  const cj = match.document.fields || {};
  const affiliateUrl = cj.affiliateLink?.stringValue;
  const partnerId = cj.partnerId?.stringValue;
  const partnerName = cj.partnerName?.stringValue;
  if (!affiliateUrl) {
    noMatch++;
    console.log(`  [${id}] (${origin}→${dest}) → CJ entry has no affiliateLink, skip`);
    continue;
  }

  // PATCH letto_packages.affiliate
  const patchUrl = `https://firestore.googleapis.com/v1/projects/letto-ai/databases/(default)/documents/letto_packages/${id}?updateMask.fieldPaths=affiliate`;
  const body = {
    fields: {
      affiliate: {
        mapValue: {
          fields: {
            source: { stringValue: 'cj' },
            partnerId: { stringValue: partnerId || '' },
            partnerName: { stringValue: partnerName || '' },
            url: { stringValue: affiliateUrl },
            addedAt: { timestampValue: new Date().toISOString() }
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
    console.log(`  [${id}] (${origin}→${dest}) → ${partnerName} affiliate ✓`);
  } else {
    failed++;
    console.error(`  [${id}] PATCH ${pr.status}: ${(await pr.text()).slice(0, 200)}`);
  }
}

console.log(`\nDone. success=${success}, alreadyHas=${alreadyHas}, noMatch=${noMatch}, missingRoute=${missingRoute}, failed=${failed}`);
