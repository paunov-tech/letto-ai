import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeAdminRequest, CRON_ACTIONS } from '../lib/admin-auth.js';

const env = { ADMIN_TOKEN: 'admin-secret', CRON_SECRET: 'cron-secret' };
const req = (token, action, method = 'GET') => ({
  method,
  headers: token ? { authorization: `Bearer ${token}` } : {},
  query: action ? { action } : {},
});

test('ADMIN_TOKEN retains access to admin and cron actions', () => {
  assert.deepEqual(authorizeAdminRequest(req('admin-secret', 'approve', 'POST'), env), { ok: true, actor: 'admin' });
  assert.deepEqual(authorizeAdminRequest(req('admin-secret', 'packages-health'), env), { ok: true, actor: 'admin' });
  assert.deepEqual(authorizeAdminRequest(req('admin-secret', null), env), { ok: true, actor: 'admin' });
});

test('CRON_SECRET is limited to the configured cron allowlist', () => {
  for (const action of CRON_ACTIONS) {
    assert.deepEqual(authorizeAdminRequest(req('cron-secret', action), env), { ok: true, actor: 'cron' });
  }
  for (const action of ['approve', 'reject', 'unpublish', 'stats', 'subscribers', 'resend-mix', 'smoke-f13']) {
    assert.deepEqual(authorizeAdminRequest(req('cron-secret', action, 'POST'), env), { ok: false, actor: null });
  }
  assert.deepEqual(authorizeAdminRequest(req('cron-secret', null), env), { ok: false, actor: null });
  assert.deepEqual(authorizeAdminRequest(req('cron-secret', 'packages-health', 'PATCH'), env), { ok: false, actor: null });
});

test('missing, malformed and incorrect credentials are rejected', () => {
  assert.deepEqual(authorizeAdminRequest(req('', 'packages-health'), env), { ok: false, actor: null });
  assert.deepEqual(authorizeAdminRequest(req('wrong', 'packages-health'), env), { ok: false, actor: null });
  assert.deepEqual(authorizeAdminRequest({ method: 'GET', headers: { authorization: 'Basic abc' }, query: {} }, env), { ok: false, actor: null });
});

test('unset secrets never authenticate an empty token', () => {
  assert.deepEqual(authorizeAdminRequest(req('', 'packages-health'), {}), { ok: false, actor: null });
});
