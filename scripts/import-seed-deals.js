#!/usr/bin/env node
// scripts/import-seed-deals.js
// Import 20 curated seed deals into Firestore letto_deals collection
// Run: node scripts/import-seed-deals.js
//
// Requires:
//   - FIREBASE_ADMIN_CLIENT_EMAIL
//   - FIREBASE_ADMIN_PRIVATE_KEY
//   - (seed file at ../seed-content/20-seed-deals.json)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Init Firebase
initializeApp({
  credential: cert({
    projectId: 'letto-ai',
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
  })
});

const db = getFirestore();

async function main() {
  const seedPath = path.join(__dirname, '../seed-content/20-seed-deals.json');
  const raw = fs.readFileSync(seedPath, 'utf-8');
  const { deals } = JSON.parse(raw);

  console.log(`Importing ${deals.length} deals into letto_deals...`);

  const batch = db.batch();
  let count = 0;

  for (const deal of deals) {
    const ref = db.collection('letto_deals').doc(deal.id);
    batch.set(ref, {
      ...deal,
      status: 'approved', // ready for publish
      createdAt: new Date().toISOString(),
      importedAt: new Date().toISOString(),
      source: 'seed'
    });
    count++;

    // Firestore batch limit is 500, we're at 20 so single batch is fine
  }

  await batch.commit();
  console.log(`✓ Imported ${count} deals successfully.`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Open admin.html and verify deals are visible');
  console.log('  2. Click Approve on the first 2-3 to trigger Telegram publish flow');
  console.log('  3. Check @letto_live_premium channel for new posts');
  console.log('  4. 6h later check @letto_live_deals public channel');

  process.exit(0);
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
