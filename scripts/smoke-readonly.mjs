#!/usr/bin/env node

// Read-only production/preview smoke probe. Uses no credentials and performs
// no writes: public GETs plus negative authentication checks only.

const rawBase = process.argv[2] || process.env.LETTO_BASE_URL || 'https://letto.live';
const base = rawBase.replace(/\/$/, '');
const timeoutMs = Number(process.env.LETTO_SMOKE_TIMEOUT_MS) || 15_000;

const checks = [
  { name: 'homepage', path: '/', status: 200, minBytes: 50_000 },
  { name: 'results', path: '/results', status: 200, minBytes: 100_000 },
  { name: 'account', path: '/me', status: 200, minBytes: 10_000 },
  { name: 'ui-css', path: '/css/ui-finish.20260716.css', status: 200, minBytes: 500 },
  {
    name: 'health', path: '/api/health', status: 200,
    validate: (body) => JSON.parse(body).ok === true,
  },
  {
    name: 'packages', path: '/api/packages?limit=1', status: 200,
    validate: (body) => Array.isArray(JSON.parse(body).packages),
  },
  {
    name: 'me-negative-auth', path: '/api/me', status: 401,
    validate: (body) => JSON.parse(body).authenticated === false,
  },
  {
    name: 'admin-negative-auth', path: '/api/admin?action=stats', status: 401,
    validate: (body) => JSON.parse(body).error === 'Unauthorized',
  },
];

let failed = 0;
for (const check of checks) {
  const started = Date.now();
  try {
    const response = await fetch(base + check.path, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'letto-readonly-smoke/1.0' },
    });
    const body = await response.text();
    const statusOk = response.status === check.status;
    const sizeOk = !check.minBytes || Buffer.byteLength(body) >= check.minBytes;
    let bodyOk = true;
    try {
      if (check.validate) bodyOk = check.validate(body);
    } catch {
      bodyOk = false;
    }
    const ok = statusOk && sizeOk && bodyOk;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${check.name} status=${response.status} bytes=${Buffer.byteLength(body)} ms=${Date.now() - started}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${check.name} error=${error.name}:${error.message} ms=${Date.now() - started}`);
  }
}

if (failed) {
  console.error(`Read-only smoke failed: ${failed}/${checks.length} checks.`);
  process.exitCode = 1;
} else {
  console.log(`Read-only smoke passed: ${checks.length}/${checks.length} checks · ${base}`);
}
