#!/usr/bin/env node
// Local Firestore snapshot — captures every important collection as JSON
// to a timestamped folder under ~/letto-ai-backups for ad-hoc rollback /
// forensic diff. Independent of the daily Vercel cron in
// /api/admin?action=daily-firestore-export (which writes to GCS); this is
// the manual "I'm about to do something risky, freeze state" tool.
//
// Usage:
//   node scripts/firestore-snapshot.mjs                  → folder = today
//   node scripts/firestore-snapshot.mjs <label>          → folder suffix
//
// Collections list reflects current Letto schema. Missing/empty collections
// are reported but don't abort the snapshot.

import admin from 'firebase-admin';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

const sa = JSON.parse(readFileSync('.secrets/firebase-admin-sa.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const COLLECTIONS = [
  'letto_packages',         // 71 published + draft mining-engine output
  'letto_subscribers',      // free / premium tier records
  'letto_cj_inventory',     // CJ affiliate inventory cache
  'letto_engine_events',    // mining/scoring/refresh audit log
  'letto_telegram_events',  // bot interaction log
  'letto_price_history',    // n8n price scanner snapshots
  'mix_cache',              // n8n WF05 flight+hotel search cache
  'mix_searches',           // analytics on Mix V2 search queries
  'pendingMixes',           // 24h-TTL pre-checkout snapshot
  'purchasedMixes',         // canonical paid trips (C-1)
  'failed_email_sends',     // F13 retry queue
  'failed_purchases',       // F14/F18 orphan paid sessions (no email)
  'currency_mismatches',    // F46 quarantine
  'letto_admin'             // admin custom-claims (forward-compatible)
];

const label = process.argv[2] || 'manual';
const ts = new Date().toISOString().slice(0, 10);
const dir = `${homedir()}/letto-ai-backups/${ts}-${label}`;
mkdirSync(dir, { recursive: true });

const summary = [];
let totalDocs = 0;

for (const col of COLLECTIONS) {
  try {
    const snap = await db.collection(col).get();
    const docs = snap.docs.map(d => ({ id: d.id, data: d.data() }));
    const fpath = `${dir}/${col}.json`;
    writeFileSync(fpath, JSON.stringify(docs, (_k, v) => {
      // Firestore Timestamp → ISO string for portable JSON
      if (v && typeof v === 'object' && typeof v.toDate === 'function') {
        try { return v.toDate().toISOString(); } catch { return null; }
      }
      return v;
    }, 2));
    summary.push({ col, docs: docs.length, file: fpath });
    totalDocs += docs.length;
    console.log(`  ${col.padEnd(28)} ${String(docs.length).padStart(5)} docs → ${fpath}`);
  } catch (e) {
    summary.push({ col, error: e.message });
    console.log(`  ${col.padEnd(28)} ERROR · ${e.message}`);
  }
}

const manifestPath = `${dir}/_manifest.json`;
writeFileSync(manifestPath, JSON.stringify({
  takenAt: new Date().toISOString(),
  label,
  totalDocs,
  collections: summary
}, null, 2));
console.log(`\n${summary.length} collections snapshotted · ${totalDocs} total docs`);
console.log(`manifest: ${manifestPath}`);
process.exit(0);
