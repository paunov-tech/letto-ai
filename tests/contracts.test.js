import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Vercel cron actions match the restricted CRON_SECRET allowlist', async () => {
  const [{ default: config }, { CRON_ACTIONS }] = await Promise.all([
    import('../vercel.json', { with: { type: 'json' } }),
    import('../lib/admin-auth.js'),
  ]);
  const actions = config.crons.map(({ path }) => new URL(path, 'https://letto.live').searchParams.get('action'));
  assert.deepEqual(new Set(actions), CRON_ACTIONS);
});

test('critical public entry points and API rewrites remain present', async () => {
  const config = JSON.parse(await read('vercel.json'));
  const rewrites = new Map(config.rewrites.map(({ source, destination }) => [source, destination]));
  assert.equal(rewrites.get('/results'), '/results.html');
  assert.equal(rewrites.get('/me'), '/me.html');
  assert.equal(rewrites.get('/trip/:id'), '/trip.html?id=:id');
  assert.equal(rewrites.get('/api/(.*)'), '/api/$1');

  for (const file of ['public/index.html', 'public/results.html', 'public/me.html', 'public/trip.html']) {
    assert.ok((await read(file)).length > 1_000, `${file} should remain a populated entry point`);
  }
});

test('security headers required by the current deployment remain configured', async () => {
  const config = JSON.parse(await read('vercel.json'));
  const global = config.headers.find(({ source }) => source === '/(.*)');
  const headers = new Map(global.headers.map(({ key, value }) => [key, value]));
  for (const key of ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options', 'Referrer-Policy']) {
    assert.ok(headers.has(key), `${key} must remain configured`);
  }
});

test('admin authorization runs before Stripe-heavy helpers can load', async () => {
  const source = await read('api/admin.js');
  assert.equal(source.includes("import { sendMixConfirmationEmail, sendWelcomeEmailWithRetry, postSlackAlert } from './stripe-webhook.js'"), false);
  assert.match(source, /stripeHelpersPromise \|\|= import\('\.\/stripe-webhook\.js'\)/);
  assert.match(source, /if \(!auth\.ok\) \{\s*return res\.status\(401\)/);
});
