// In-memory provider resilience for a warm serverless instance. The state is
// deliberately advisory: it cuts repeated upstream failures and exposes a
// truthful health signal, but never manufactures inventory or hides a valid
// fallback source.

const circuits = new Map();

function stateFor(name) {
  if (!circuits.has(name)) {
    circuits.set(name, { failures: 0, openedUntil: 0, calls: 0, successes: 0, retries: 0, skipped: 0, lastError: null, lastChangedAt: null });
  }
  return circuits.get(name);
}

function pause(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function publicState(name, now = Date.now()) {
  const state = stateFor(name);
  return {
    name,
    state: state.openedUntil > now ? 'open' : 'closed',
    failures: state.failures,
    calls: state.calls,
    successes: state.successes,
    retries: state.retries,
    skipped: state.skipped,
    lastError: state.lastError,
    lastChangedAt: state.lastChangedAt
  };
}

export function providerHealthSnapshot(names = []) {
  return (names.length ? [...new Set(names)] : [...circuits.keys()]).map(name => publicState(name));
}

export function resetProviderResilience() {
  circuits.clear();
}

export async function withProviderResilience(name, task, {
  retries = 1,
  failureThreshold = 3,
  coolDownMs = 120_000,
  isFailure = () => false,
  shouldRetry = () => true
} = {}) {
  const now = Date.now();
  const state = stateFor(name);
  if (state.openedUntil > now) {
    state.skipped++;
    return { ok: false, error: 'circuit_open', value: null, health: publicState(name) };
  }
  let lastError = null;
  const maxAttempts = Math.max(1, Math.min(3, Number(retries) + 1));
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    state.calls++;
    try {
      const value = await task(attempt);
      if (isFailure(value)) throw new Error(String(value?.error || 'provider_failed'));
      state.failures = 0;
      state.successes++;
      state.lastError = null;
      state.lastChangedAt = new Date().toISOString();
      return { ok: true, value, attempts: attempt, health: publicState(name) };
    } catch (error) {
      lastError = error;
      const message = String(error?.message || 'provider_exception').slice(0, 120);
      const retry = attempt < maxAttempts && shouldRetry(error);
      if (retry) {
        state.retries++;
        await pause(100 * attempt);
        continue;
      }
      state.failures++;
      state.lastError = message;
      state.lastChangedAt = new Date().toISOString();
      if (state.failures >= Math.max(1, failureThreshold)) state.openedUntil = Date.now() + coolDownMs;
      console.warn('[provider-resilience]', JSON.stringify({ provider: name, error: message, failures: state.failures, circuit: state.openedUntil > Date.now() ? 'open' : 'closed' }));
      return { ok: false, error: message, value: null, attempts: attempt, health: publicState(name) };
    }
  }
  return { ok: false, error: String(lastError?.message || 'provider_exception'), value: null, health: publicState(name) };
}
