import puppeteer from 'puppeteer-core';

const BASE = 'https://letto.live';
const TARGET = BASE + '/results.html?origin_iata=BEG&destination_iata=ATH&depart_date=2026-06-01&return_date=2026-06-08&adults=2';

const b = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--disable-gpu']
});
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 1800 });

p.on('console', m => {
  const t = m.text();
  if (/mix-v2|letto|TP|package|select/i.test(t)) console.log('  [c]', t.slice(0, 180));
});
p.on('pageerror', e => console.log('  [pageerror]', e.message));
p.on('response', r => {
  const u = r.url();
  if (u.includes('/api/packages') || u.includes('/api/hotels-search')) {
    console.log('  [api]', r.status(), u.slice(0, 100));
  }
});
p.on('framenavigated', f => {
  if (f === p.mainFrame()) console.log('  [nav]', f.url().slice(0, 100));
});

console.log('=== 1) navigate to /results.html with BEG→ATH search params ===');
await p.goto(TARGET, { waitUntil: 'networkidle2', timeout: 25000 });
await new Promise(r => setTimeout(r, 3000));

// Verify package list rendered
const pkgInfo = await p.evaluate(() => {
  const cards = document.querySelectorAll('.pkg-card');
  return Array.from(cards).map(c => ({
    pkgId: c.getAttribute('data-mix-pkg-id'),
    text: c.textContent.replace(/\s+/g, ' ').trim().slice(0, 200)
  }));
});
console.log('=== 2) packages rendered:', pkgInfo.length, '===');
for (const pk of pkgInfo) console.log('  ·', pk.pkgId, '·', pk.text);

if (pkgInfo.length === 0) { console.log('FAIL: no packages'); await b.close(); process.exit(1); }

// Click first package
console.log('=== 3) click first package ===');
await p.evaluate(() => {
  document.querySelector('.pkg-card[data-mix-pkg-id]').click();
});
await new Promise(r => setTimeout(r, 2500));

// Check state.flight.selected after click
const flightState = await p.evaluate(() => {
  try {
    var s = JSON.parse(localStorage.getItem('letto_mix_state_v2') || '{}');
    return s.flight && s.flight.selected;
  } catch (e) { return null; }
});
console.log('=== 4) state.flight.selected after click ===');
console.log('  ', JSON.stringify(flightState, null, 2));

// Pick a hotel via JS — same pattern selectHotel uses
console.log('=== 5) pick first hotel ===');
await p.evaluate(() => {
  const btn = document.querySelector('[data-mix-select-hotel]');
  if (btn) btn.click();
});
await new Promise(r => setTimeout(r, 2000));

// Check Stage 3 visible
const stage3State = await p.evaluate(() => {
  const final = document.getElementById('mix-final');
  if (!final) return { visible: false, reason: 'no element' };
  const visible = !final.hidden && getComputedStyle(final).display !== 'none';
  const fDesc = document.getElementById('final-flight-desc')?.textContent;
  const fPrice = document.getElementById('final-flight-price')?.textContent;
  const hDesc = document.getElementById('final-hotel-desc')?.textContent;
  const hPrice = document.getElementById('final-hotel-price')?.textContent;
  const total = document.getElementById('final-total-value')?.textContent;
  return { visible, fDesc, fPrice, hDesc, hPrice, total };
});
console.log('=== 6) Stage 3 review state ===');
console.log('  ', JSON.stringify(stage3State, null, 2));

await p.screenshot({ path: '/tmp/pivot-stage3.png', fullPage: true });
console.log('=== 7) screenshot saved /tmp/pivot-stage3.png ===');

await b.close();
process.exit(0);
