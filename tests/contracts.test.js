import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

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
    const source = await read(file);
    assert.ok(source.length > 1_000, `${file} should remain a populated entry point`);
    assert.match(source, /<link rel="stylesheet" href="\/css\/ui-finish\.20260716\.css">/);
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

test('static rewrite destinations exist on disk', async () => {
  const config = JSON.parse(await read('vercel.json'));
  const staticDestinations = config.rewrites
    .map(({ destination }) => destination.split('?')[0])
    .filter((destination) => destination.endsWith('.html') && !destination.includes(':'));

  for (const destination of staticDestinations) {
    await assert.doesNotReject(access(new URL(`public${destination}`, root)), `${destination} must exist`);
  }
});

test('robots keeps private surfaces out of search and advertises the sitemap', async () => {
  const robots = await read('public/robots.txt');
  assert.match(robots, /^Disallow: \/admin\.html$/m);
  assert.match(robots, /^Disallow: \/metrics\.html$/m);
  assert.match(robots, /^Disallow: \/api\/$/m);
  assert.match(robots, /^Sitemap: https:\/\/letto\.live\/sitemap\.xml$/m);
});

test('main sitemap entries are unique and point at HTTPS production URLs', async () => {
  const sitemap = await read('public/sitemap-main.xml');
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.ok(locations.length > 10, 'main sitemap should contain the core and destination pages');
  assert.equal(new Set(locations).size, locations.length, 'sitemap locations must be unique');
  for (const location of locations) assert.match(location, /^https:\/\/letto\.live\//);
});

test('generated destination pages retain canonical and hreflang metadata', async () => {
  const pairs = [
    ['public/letovi-rim.html', 'https://letto.live/letovi-rim', 'https://letto.live/flights-rome'],
    ['public/flights-rome.html', 'https://letto.live/flights-rome', 'https://letto.live/letovi-rim'],
    ['public/letovi-prag.html', 'https://letto.live/letovi-prag', 'https://letto.live/flights-prague'],
    ['public/flights-prague.html', 'https://letto.live/flights-prague', 'https://letto.live/letovi-prag'],
  ];
  for (const [file, canonical, alternate] of pairs) {
    const source = await read(file);
    assert.ok(source.includes(`rel="canonical" href="${canonical}"`), `${file} canonical`);
    assert.ok(source.includes(alternate), `${file} paired hreflang`);
  }
});
