#!/usr/bin/env node
// One-shot backfill: rewrite stale Aviasales bookingUrls in Firestore.
//
// Mining engine v4 produced URLs embedding TP partner fare tokens that
// expire in ~24-48h. This script visits every existing record, runs each
// flight.bookingUrl through cleanAviasalesUrl (which keeps the canonical
// /search/{ROUTE} path and drops the fare tokens), and persists the result.
//
// Idempotent: already-clean URLs round-trip unchanged and are skipped.
// Run via:  node scripts/backfill-aviasales-urls.mjs

import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import { cleanAviasalesUrl } from '../lib/aviasales-url.js';

const sa = JSON.parse(readFileSync('.secrets/firebase-admin-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function backfill(collection, urlPath) {
  console.log(`Scanning ${collection}...`);
  const snap = await db.collection(collection).get();
  let updated = 0;
  let skipped = 0;
  let batch = db.batch();
  let n = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const parts = urlPath.split('.');
    let val = data;
    for (const p of parts) val = val?.[p];
    const newUrl = cleanAviasalesUrl(val);
    if (val && newUrl && val !== newUrl) {
      const updateData = {};
      updateData[urlPath] = newUrl;
      updateData['metadata.aviasalesNormalizedAt'] = admin.firestore.FieldValue.serverTimestamp();
      batch.update(doc.ref, updateData);
      updated++;
      n++;
      if (n === 400) { await batch.commit(); batch = db.batch(); n = 0; }
    } else {
      skipped++;
    }
  }
  if (n > 0) await batch.commit();
  console.log(`  ${collection}: ${updated} updated · ${skipped} unchanged · ${snap.size} total`);
  return updated;
}

const pkgs = await backfill('letto_packages', 'flight.bookingUrl');
const mixes = await backfill('purchasedMixes', 'flight.bookingUrl');
console.log(`\nTotal: ${pkgs} letto_packages + ${mixes} purchasedMixes normalized`);
process.exit(0);
