import test from 'node:test';
import assert from 'node:assert/strict';

test('Bright Data client discovers an Unlocker zone and scrapes raw HTML', async () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };
  process.env.BRIGHT_DATA_API_KEY = 'test-secret';
  delete process.env.BRIGHT_DATA_ZONE;
  process.env.BRIGHT_DATA_API_BASE = 'https://api.example.test';

  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/zone/get_active_zones')) {
      return new Response(JSON.stringify([{ name: 'travel_unlocker', type: 'unblocker' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response('<html>deal</html>', { status: 200 });
  };

  try {
    const moduleUrl = new URL('../scrapers/lib/brightdata.mjs', import.meta.url);
    moduleUrl.searchParams.set('test', String(Date.now()));
    const { scrapeWithBrightData } = await import(moduleUrl.href);
    const result = await scrapeWithBrightData('https://airline.example/deals', { geo: 'RS' });
    assert.equal(result.html, '<html>deal</html>');
    assert.equal(result.provider, 'brightdata');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].options.headers.Authorization, 'Bearer test-secret');
    assert.deepEqual(JSON.parse(calls[1].options.body), {
      zone: 'travel_unlocker',
      url: 'https://airline.example/deals',
      format: 'raw',
      method: 'GET',
      country: 'rs'
    });
  } finally {
    global.fetch = originalFetch;
    process.env = originalEnv;
  }
});

test('Bright Data errors redact the API key', async () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };
  process.env.BRIGHT_DATA_API_KEY = 'never-log-this';
  process.env.BRIGHT_DATA_ZONE = 'zone';
  process.env.BRIGHT_DATA_API_BASE = 'https://api.example.test';
  global.fetch = async () => new Response('bad token never-log-this', { status: 401 });

  try {
    const moduleUrl = new URL('../scrapers/lib/brightdata.mjs', import.meta.url);
    moduleUrl.searchParams.set('test', `${Date.now()}-error`);
    const { scrapeWithBrightData } = await import(moduleUrl.href);
    await assert.rejects(
      () => scrapeWithBrightData('https://example.test'),
      error => !error.message.includes('never-log-this') && error.message.includes('[redacted]')
    );
  } finally {
    global.fetch = originalFetch;
    process.env = originalEnv;
  }
});
