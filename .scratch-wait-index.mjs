import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'node:fs';
const sa = JSON.parse(readFileSync('/home/zlfzr/letto-ai/.secrets/firebase-admin-sa.json','utf8'));
const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/datastore'] });
const client = await auth.getClient();
const start = Date.now();
while (Date.now() - start < 5*60*1000) {
  const t = (await client.getAccessToken()).token;
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/letto-ai/databases/(default)/collectionGroups/letto_packages/indexes`, { headers: { 'Authorization': 'Bearer '+t }});
  const j = await r.json();
  const idx = (j.indexes||[]).find(i => {
    const f = (i.fields||[]).filter(x=>x.fieldPath!=='__name__').map(x=>x.fieldPath+':'+x.order);
    return f[0]==='status:ASCENDING' && f[1]==='pricing.savingsPercent:DESCENDING';
  });
  if (idx) {
    console.log(`[${new Date().toISOString()}] state: ${idx.state}`);
    if (idx.state === 'READY') { console.log('✅ index READY'); process.exit(0); }
  }
  await new Promise(r => setTimeout(r, 10000));
}
console.log('⚠️ timeout — index still building');
process.exit(1);
