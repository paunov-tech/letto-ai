#!/usr/bin/env node
// P0 V2 · Aviasales SPA pretest.
//
// Headless Chromium hits each URL, waits for hydration, then probes the
// rendered DOM via locators (not raw HTML substring search — Aviasales' JS
// bundle ships every UI string including "failed to launch" as i18n keys,
// which produces false positives on naive substring matching).
//
// PASS = origin + dest + start-date + end-date all pre-filled on the search
//        form AND no visible "Oops" banner.
// FAIL = empty dest / empty dates / visible failure banner.
//
// Usage: node scripts/aviasales-live-test.mjs [url1 url2 ...]
// Exits 0 only if every URL passes.

import { chromium } from 'playwright';

const argUrls = process.argv.slice(2);
const DEFAULT_URLS = [
  // 4-digit DDMM produced by today's converter (was 6-digit YYMMDD pre-fix)
  'https://www.aviasales.com/search/BEG0411BCN07111?marker=722287',
  // 4-digit DDMM that was clean before this fix
  'https://www.aviasales.com/search/BEG0211DXB08111?marker=722287',
  // BEG → IST close-future round-trip (popular live route)
  'https://www.aviasales.com/search/BEG2611IST05121?marker=722287'
];
const TEST_URLS = argUrls.length ? argUrls : DEFAULT_URLS;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  locale: 'sr-Latn',
  viewport: { width: 1280, height: 900 }
});
const page = await context.newPage();

let allPass = true;
const results = [];

for (const url of TEST_URLS) {
  console.log(`\nTesting: ${url}`);
  let originVal = '', destVal = '', startDate = '', endDate = '', oopsVisible = false, err = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(10000);

    const oopsLocator = page.locator('text=Oops, the search failed to');
    oopsVisible = (await oopsLocator.count()) > 0
      ? await oopsLocator.first().isVisible()
      : false;

    originVal = await page.locator('[data-test-id="origin-input"]').inputValue().catch(() => '');
    destVal   = await page.locator('[data-test-id="destination-input"]').inputValue().catch(() => '');
    startDate = await page.locator('[data-test-id="start-date-value"]').textContent().catch(() => '');
    endDate   = await page.locator('[data-test-id="end-date-value"]').textContent().catch(() => '');
  } catch (e) {
    err = e.message;
  }

  // Pass requires: form fully pre-filled (4 fields populated AND not the
  // empty-state placeholders) AND no Oops banner.
  const datePlaceholders = ['Departure', 'Return', '', null];
  const destFilled = !!destVal && destVal.trim().length > 0;
  const datesFilled = startDate && endDate
    && !datePlaceholders.includes(startDate.trim())
    && !datePlaceholders.includes(endDate.trim());
  const verdict = err ? '🔴 ERR' : (!oopsVisible && destFilled && datesFilled ? '✅ PASS' : '🔴 FAIL');

  console.log(`  origin:     "${originVal}"`);
  console.log(`  dest:       "${destVal}"`);
  console.log(`  start:      "${startDate}"`);
  console.log(`  end:        "${endDate}"`);
  console.log(`  oopsVisible:${oopsVisible}`);
  if (err) console.log(`  error:      ${err}`);
  console.log(`  verdict:    ${verdict}`);

  results.push({ url, originVal, destVal, startDate, endDate, oopsVisible, verdict, err });
  if (verdict !== '✅ PASS') allPass = false;
}

await browser.close();

console.log('\n──── summary ────');
for (const r of results) console.log(`${r.verdict}  ${r.url}`);
process.exit(allPass ? 0 : 1);
