import test from 'node:test';
import assert from 'node:assert/strict';
import { providerHealthSnapshot, resetProviderResilience, withProviderResilience } from '../lib/provider-resilience.js';

test('retries a transient provider failure and records the healthy recovery', async () => {
  resetProviderResilience();
  let calls = 0;
  const result = await withProviderResilience('flights', async () => {
    calls++;
    if (calls === 1) throw new Error('timeout');
    return { flights: [1] };
  }, { retries: 1 });
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.equal(result.health.retries, 1);
  assert.equal(result.health.state, 'closed');
});

test('opens a circuit after repeated failures and skips another costly call', async () => {
  resetProviderResilience();
  let calls = 0;
  const fail = () => withProviderResilience('hotels', async () => {
    calls++;
    throw new Error('upstream_503');
  }, { retries: 0, failureThreshold: 2, coolDownMs: 60_000 });
  assert.equal((await fail()).ok, false);
  assert.equal((await fail()).ok, false);
  const skipped = await fail();
  assert.equal(skipped.error, 'circuit_open');
  assert.equal(calls, 2);
  assert.equal(providerHealthSnapshot(['hotels'])[0].state, 'open');
});

test('can decline a retry for an already-expensive timeout', async () => {
  resetProviderResilience();
  let calls = 0;
  const result = await withProviderResilience('slow-provider', async () => {
    calls++;
    throw new Error('timeout');
  }, { retries: 1, shouldRetry: error => error.message !== 'timeout' });
  assert.equal(result.ok, false);
  assert.equal(calls, 1);
});
