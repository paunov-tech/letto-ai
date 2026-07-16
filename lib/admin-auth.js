import crypto from 'crypto';

// These are the only actions invoked by Vercel Cron in vercel.json. Keep the
// allowlist explicit so CRON_SECRET can never inherit human admin privileges.
export const CRON_ACTIONS = new Set([
  'retry-failed-emails',
  'packages-health',
  'daily-firestore-export',
  'daily-review-report',
]);

function safeEqual(left, right) {
  if (!left || !right || typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function bearerToken(req) {
  const header = (req.headers?.authorization || '').toString();
  if (!header.startsWith('Bearer ')) return '';
  return header.slice(7);
}

export function authorizeAdminRequest(req, env = process.env) {
  const token = bearerToken(req);
  if (safeEqual(token, env.ADMIN_TOKEN)) return { ok: true, actor: 'admin' };

  const action = (req.query?.action || '').toString();
  const cronMethod = req.method === 'GET' || req.method === 'POST';
  if (cronMethod && CRON_ACTIONS.has(action) && safeEqual(token, env.CRON_SECRET)) {
    return { ok: true, actor: 'cron' };
  }

  return { ok: false, actor: null };
}
