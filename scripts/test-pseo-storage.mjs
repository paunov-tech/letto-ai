// scripts/test-pseo-storage.mjs — smoke test for lib/pseo-storage.js.
//
// Run locally:
//   source .env && node scripts/test-pseo-storage.mjs
//
// Requires FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY in env
// (same as every other Letto API route). Writes + reads + cleans up a
// single throw-away slug — leaves no residue in production data.
//
// What it exercises:
//   1. setPseoPage      · creates pseo_pages/<TEST_SLUG> + adds to on_demand index
//   2. getPseoPage      · reads it back, validates shape
//   3. pseoPageExists   · returns true for present, false for missing
//   4. listIndex        · contains TEST_SLUG under 'on_demand'
//   5. deletePseoPage   · removes doc + both index entries
//   6. final getPseoPage → null + listIndex no longer contains TEST_SLUG

import {
  getPseoPage,
  setPseoPage,
  listIndex,
  pseoPageExists,
  deletePseoPage,
} from '../lib/pseo-storage.js';

const TEST_SLUG = '__test-pseo-storage-' + Date.now();
let pass = 0, fail = 0;

function check(label, ok, detail = '') {
  if (ok) { console.log('  ✓ ' + label); pass++; }
  else    { console.error('  ✗ ' + label + (detail ? '  ·  ' + detail : '')); fail++; }
}

async function main() {
  console.log('═══ pseo-storage smoke test · slug = ' + TEST_SLUG + ' ═══\n');

  // 1 · WRITE
  const sample = {
    slug:            TEST_SLUG,
    origin_code:     'BEG',
    dest_code:       'FCO',
    vibe:            null,
    month:           null,
    lang:            'sr',
    copy:            'Sample copy for smoke test.',
    faqs:            [{ q: 'Q1?', a: 'A1.' }, { q: 'Q2?', a: 'A2.' }],
    isPreGenerated:  false,
    generatedAt:     Date.now(),
  };
  await setPseoPage(TEST_SLUG, sample);
  check('1. setPseoPage write completes', true);

  // 2 · READ
  const got = await getPseoPage(TEST_SLUG);
  check('2. getPseoPage returns the stored object',
    got !== null && got.slug === TEST_SLUG && got.copy === sample.copy,
    got === null ? 'got null' : 'shape ok');

  // 3 · EXISTS
  const exists = await pseoPageExists(TEST_SLUG);
  const missing = await pseoPageExists('__nonexistent-' + Date.now());
  check('3a. pseoPageExists returns true for present slug', exists === true);
  check('3b. pseoPageExists returns false for absent slug', missing === false);

  // 4 · INDEX MEMBERSHIP
  const onDemand = await listIndex('on_demand');
  check('4. listIndex(\'on_demand\') contains the new slug',
    onDemand.includes(TEST_SLUG),
    'index length = ' + onDemand.length);

  // 5 · DELETE
  await deletePseoPage(TEST_SLUG);
  check('5. deletePseoPage completes', true);

  // 6 · POST-DELETE CHECKS
  const gone = await getPseoPage(TEST_SLUG);
  check('6a. getPseoPage returns null after delete', gone === null);
  const onDemandAfter = await listIndex('on_demand');
  check('6b. listIndex(\'on_demand\') no longer contains the slug',
    !onDemandAfter.includes(TEST_SLUG));

  console.log('\n═══ summary · ' + pass + ' pass · ' + fail + ' fail ═══');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
