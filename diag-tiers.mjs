import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const sa = JSON.parse(readFileSync('.secrets/firebase-admin-sa.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const TARGETS = ['IST', 'FCO', 'ATH', 'BCN', 'CDG'];
const TIER_BUDGET = 400, TIER_VALUE_MAX = 800;
function tierOf(price) {
  if (price < TIER_BUDGET) return 'budget';
  if (price < TIER_VALUE_MAX) return 'value';
  return 'lux';
}

const snap = await db.collection('letto_packages').where('status', 'in', ['published_public', 'published_premium']).get();
console.log('Total published packages:', snap.size);

const pkgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

// Overall pricing distribution
const allTotals = pkgs.map(p => Math.round(p.pricing?.total || 0)).filter(n => n > 0).sort((a,b)=>a-b);
function percentile(arr, p) { return arr[Math.floor(arr.length * p / 100)]; }
console.log('\n=== Overall pricing.total distribution ===');
console.log('  count:', allTotals.length);
console.log('  min:   €' + allTotals[0]);
console.log('  p25:   €' + percentile(allTotals, 25));
console.log('  median:€' + percentile(allTotals, 50));
console.log('  p75:   €' + percentile(allTotals, 75));
console.log('  max:   €' + allTotals[allTotals.length-1]);

// Airline distribution
console.log('\n=== Airline counts (all destinations) ===');
const airlines = {};
for (const p of pkgs) {
  const a = p.flight?.airline || '?';
  airlines[a] = (airlines[a] || 0) + 1;
}
for (const [k,v] of Object.entries(airlines).sort((a,b)=>b[1]-a[1])) {
  console.log(`  ${k.padEnd(6)} ${v}`);
}

// Per-destination tier distribution for TARGETS
console.log('\n=== Per-destination tier distribution (target 5) ===');
console.log('  ' + 'dest'.padEnd(6) + '  total · budget · value · lux  · ★★ · ★★★ · ★★★★ · ★★★★★ · airlines');
for (const dest of TARGETS) {
  const list = pkgs.filter(p => p.destination?.code === dest);
  const buckets = { budget: 0, value: 0, lux: 0 };
  const stars = { 1:0, 2:0, 3:0, 4:0, 5:0 };
  const carriers = {};
  for (const p of list) {
    const total = Math.round(p.pricing?.total || 0);
    if (total > 0) buckets[tierOf(total)]++;
    const s = parseInt(p.hotel?.stars || p.hotel?.rating, 10);
    if (s >= 1 && s <= 5) stars[s]++;
    const a = p.flight?.airline || '?';
    carriers[a] = (carriers[a] || 0) + 1;
  }
  const carriersStr = Object.entries(carriers).sort((a,b)=>b[1]-a[1]).map(([k,v]) => `${k}×${v}`).join(' ');
  console.log(`  ${dest.padEnd(6)}  ${String(list.length).padStart(5)} · ${String(buckets.budget).padStart(6)} · ${String(buckets.value).padStart(5)} · ${String(buckets.lux).padStart(3)}  · ${String(stars[2]).padStart(2)} · ${String(stars[3]).padStart(3)} · ${String(stars[4]).padStart(4)} · ${String(stars[5]).padStart(5)} · ${carriersStr}`);
}

// Detailed list per target — to spot if "value" cluster is mid-band
console.log('\n=== Per-destination samples (sorted by pricing.total) ===');
for (const dest of TARGETS) {
  const list = pkgs.filter(p => p.destination?.code === dest)
    .map(p => ({ id: p.id, total: Math.round(p.pricing?.total || 0), airline: p.flight?.airline, stars: p.hotel?.stars || p.hotel?.rating, hotelTotal: Math.round(p.hotel?.priceTotal || 0), flightTotal: Math.round(p.flight?.totalPrice || 0), nights: p.dates?.nights }))
    .sort((a,b) => a.total - b.total);
  console.log(`\n  ${dest} (${list.length} packages):`);
  for (const x of list) {
    console.log(`    ${tierOf(x.total).padEnd(6)} €${String(x.total).padStart(4)} · ${x.airline} · ★${x.stars} · flight €${x.flightTotal} + hotel €${x.hotelTotal} · ${x.nights}n · ${x.id}`);
  }
}

// Coverage assessment
console.log('\n=== Coverage assessment (≥3 per tier per dest = good) ===');
let scenario1Ok = true;
for (const dest of TARGETS) {
  const list = pkgs.filter(p => p.destination?.code === dest);
  const buckets = { budget: 0, value: 0, lux: 0 };
  for (const p of list) {
    const total = Math.round(p.pricing?.total || 0);
    if (total > 0) buckets[tierOf(total)]++;
  }
  const ok = buckets.budget >= 3 && buckets.value >= 3 && buckets.lux >= 3;
  if (!ok) scenario1Ok = false;
  console.log(`  ${dest}: budget=${buckets.budget} value=${buckets.value} lux=${buckets.lux} ${ok ? '✅ all tiers ≥3' : '❌ need seed mining'}`);
}
console.log('\nVerdict:', scenario1Ok ? 'Scenario 1 (B-1 + B-3 enough)' : 'Scenario 2 (need B-2 mining + B-1 + B-3)');

process.exit(0);
