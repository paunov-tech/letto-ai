import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
const sa = JSON.parse(readFileSync('/home/zlfzr/letto-ai/.secrets/firebase-admin-sa.json','utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const NOTIFY = readFileSync('/home/zlfzr/letto-ai/.secrets/notify-secret.env','utf8').match(/NOTIFY_SECRET=(.*)/)[1].trim();

async function snap() {
  const s = await db.collection('letto_packages').get();
  return new Set(s.docs.map(d => d.id));
}
async function ping(event, detail) {
  await fetch('https://letto.live/api/notify-admin', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + NOTIFY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, workflow: '01-MIXING-ENGINE', detail })
  });
}

const baseline = await snap();
console.log(`[${new Date().toISOString()}] baseline: ${baseline.size} packages`);
const start = Date.now();
const TIMEOUT_MS = 30 * 60 * 1000; // 30 min
let firedFirst = false;
let lastSeenCount = baseline.size;

while (Date.now() - start < TIMEOUT_MS) {
  await new Promise(r => setTimeout(r, 30000));
  const cur = await snap();
  const newIds = [...cur].filter(id => !baseline.has(id));
  if (newIds.length > lastSeenCount - baseline.size) {
    lastSeenCount = newIds.length + baseline.size;
    console.log(`[${new Date().toISOString()}] new packages: ${newIds.length} (ids: ${newIds.slice(0,3).join(', ')}...)`);
    if (!firedFirst && newIds.length > 0) {
      const sample = await db.collection('letto_packages').doc(newIds[0]).get();
      const d = sample.data();
      await ping('engine_first_run_success', {
        message: `Engine running! ${newIds.length} package(s) mined first run.`,
        sample: {
          id: newIds[0],
          destination: d.destination?.city,
          country: d.destination?.country,
          savings: `${d.pricing?.savingsPercent}%`,
          total: `€${d.pricing?.total}`,
          agencyRef: `€${d.pricing?.agencyReference}`,
          claudeRating: d.metadata?.claudeRating
        },
        next_run: 'in 6h (cron)',
        adminPanel: 'https://letto.live/admin.html'
      });
      firedFirst = true;
      // Continue polling for ~3 more minutes to catch more packages from the same run
      await new Promise(r => setTimeout(r, 180000));
      const final = await snap();
      const finalNew = [...final].filter(id => !baseline.has(id));
      console.log(`[${new Date().toISOString()}] final tally: ${finalNew.length} mined`);
      await ping('engine_run_complete', {
        total_mined: finalNew.length,
        baseline: baseline.size,
        final_collection_size: final.size,
        sample_ids: finalNew.slice(0, 5)
      });
      process.exit(0);
    }
  }
}
console.log(`[${new Date().toISOString()}] TIMEOUT after 30min — no new packages detected`);
await ping('engine_timeout', { message: 'No new packages mined in 30 minutes after env fix. Check Executions tab in n8n UI for errors.', baseline_size: baseline.size });
process.exit(2);
