import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
const sa = JSON.parse(readFileSync('/home/zlfzr/letto-ai/.secrets/firebase-admin-sa.json','utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const NOTIFY = readFileSync('/home/zlfzr/letto-ai/.secrets/notify-secret.env','utf8').match(/NOTIFY_SECRET=(.*)/)[1].trim();
async function ping(event, detail) {
  await fetch('https://letto.live/api/notify-admin', { method:'POST', headers:{'Authorization':'Bearer '+NOTIFY,'Content-Type':'application/json'}, body: JSON.stringify({ event, workflow:'01-MIXING-ENGINE', detail })});
}

const start = Date.now();
const TIMEOUT = 25 * 60 * 1000;
let firedDone = false;
console.log('[poller-v3] waiting for v3-quality package (source=mixing_engine_v3 + complete hotel fields + claudeRating > 0)...');

while (Date.now() - start < TIMEOUT && !firedDone) {
  await new Promise(r => setTimeout(r, 30000));
  const snap = await db.collection('letto_packages').where('metadata.source', '==', 'mixing_engine_v3').get().catch(() => ({ docs: [] }));
  if (snap.docs?.length === 0) continue;
  const docs = snap.docs.map(d => d.data());
  const withFullFields = docs.filter(d => d.hotel?.name && d.outbound?.airline);
  const withRating = docs.filter(d => Number(d.metadata?.claudeRating) > 0);
  console.log(`[${new Date().toISOString()}] v3 docs: ${docs.length} | full fields: ${withFullFields.length} | claudeRating>0: ${withRating.length}`);
  if (withFullFields.length > 0) {
    const sample = withFullFields[0];
    await ping('engine_v3_first_success', {
      message: 'Engine v3 mining with full Firestore writes!',
      v3_count: docs.length,
      with_full_fields: withFullFields.length,
      with_claude_rating: withRating.length,
      sample: {
        id: sample.id,
        destination: sample.destination?.city,
        savings: sample.pricing?.savingsPercent + '%',
        total: '€' + sample.pricing?.total,
        hotel_name: sample.hotel?.name,
        hotel_stars: sample.hotel?.rating,
        hotel_price_per_night: '€' + sample.hotel?.pricePerNight,
        airline: sample.outbound?.airline,
        claude_rating: sample.metadata?.claudeRating,
        claude_blurb_en: sample.blurbs?.en
      }
    });
    firedDone = true;
  }
}
if (!firedDone) {
  await ping('engine_v3_timeout', { message: 'No v3-quality packages mined in 25min after re-import. Check Executions tab.' });
}
process.exit(0);
