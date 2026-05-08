#!/usr/bin/env node
// scripts/backfill-viator-activities.mjs — One-shot backfill of activities into existing letto_packages.
// For each package, calls /api/viator-activities?city={destination.city} and PATCHes the doc with activities array.

import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'node:fs';

const sa = JSON.parse(readFileSync('/home/zlfzr/letto-ai/.secrets/firebase-admin-sa.json', 'utf8'));
const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/datastore'] });
const t = (await (await auth.getClient()).getAccessToken()).token;

const PROJECT = 'letto-ai';
const COLL = 'letto_packages';
const API = 'https://letto.live/api/viator-activities';

const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${COLL}?pageSize=200`, {
  headers: { Authorization: 'Bearer ' + t }
});
const j = await r.json();
const docs = j.documents || [];
console.log(`Found ${docs.length} packages.`);

let success = 0, missingCity = 0, noActivities = 0, failed = 0;
for (const d of docs) {
  const id = d.name.split('/').pop();
  const city = d.fields?.destination?.mapValue?.fields?.city?.stringValue;
  if (!city) { missingCity++; console.log(`  [${id}] no city, skip`); continue; }

  // Fetch activities
  let activities = [];
  try {
    const ar = await fetch(`${API}?city=${encodeURIComponent(city)}`);
    const aj = await ar.json();
    activities = aj.activities || [];
    if (activities.length === 0) { noActivities++; console.log(`  [${id}] (${city}) → no activities`); continue; }
  } catch (e) {
    failed++; console.error(`  [${id}] (${city}) → fetch fail: ${e.message}`); continue;
  }

  // PATCH letto_packages.activities + activitiesUpdatedAt
  const valuesArr = activities.slice(0, 3).map(a => ({ mapValue: { fields: {
    productCode: { stringValue: a.productCode || '' },
    title: { stringValue: a.title || '' },
    rating: { doubleValue: Number(a.rating) || 0 },
    reviewsCount: { integerValue: String(a.reviewsCount || 0) },
    fromPrice: { doubleValue: Number(a.fromPrice) || 0 },
    currency: { stringValue: a.currency || 'EUR' },
    durationMinutes: { integerValue: String(a.durationMinutes || 0) },
    url: { stringValue: a.url || '' },
    image: { stringValue: a.image || '' }
  } } }));
  const patchUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${COLL}/${id}?updateMask.fieldPaths=activities&updateMask.fieldPaths=activitiesUpdatedAt`;
  const body = { fields: {
    activities: { arrayValue: { values: valuesArr } },
    activitiesUpdatedAt: { timestampValue: new Date().toISOString() }
  } };
  const pr = await fetch(patchUrl, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (pr.ok) {
    success++;
    console.log(`  [${id}] (${city}) → ${activities.length} activities ✓`);
  } else {
    failed++;
    console.error(`  [${id}] (${city}) → PATCH ${pr.status}: ${(await pr.text()).slice(0, 200)}`);
  }
  // Small throttle to be nice to Vercel/Viator
  await new Promise(r => setTimeout(r, 250));
}

console.log(`\nDone. success=${success}, missingCity=${missingCity}, noActivities=${noActivities}, failed=${failed}`);
