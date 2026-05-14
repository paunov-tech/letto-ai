// lib/rate-limit.js — Best-effort per-instance IP rate limiter.
//
// In-memory Map scoped to a single Vercel function instance. Across instances
// each gets its own budget, so the effective global limit is roughly N × limit
// where N is the number of warm instances (typically 1–3 under normal traffic).
//
// This is intentional: blocks obvious single-IP abuse without adding Redis /
// Upstash for marginal gains. Swap for Vercel KV or Upstash if cross-instance
// strictness ever becomes a real requirement.

const buckets = new Map();

let opsSinceGc = 0;
const GC_EVERY = 500;

function gcIfNeeded() {
  if (++opsSinceGc < GC_EVERY) return;
  opsSinceGc = 0;
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}

export function checkRateLimit(key, { limit, windowMs }) {
  gcIfNeeded();
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}

// Vercel injects the client IP at the front of x-forwarded-for; fall back
// to x-real-ip / socket for non-Vercel runtimes (local dev, tests).
export function getClientIp(req) {
  const xff = (req.headers?.['x-forwarded-for'] || '').toString();
  if (xff) return xff.split(',')[0].trim();
  const xri = (req.headers?.['x-real-ip'] || '').toString();
  if (xri) return xri.trim();
  return req.socket?.remoteAddress || 'unknown';
}

// Write standard rate-limit headers + 429 body. Mutates `res` and returns true
// if the request should be aborted (caller does `if (applyRateLimit(...)) return;`).
export function applyRateLimit(req, res, opts) {
  const ip = getClientIp(req);
  const result = checkRateLimit(`${opts.scope}:${ip}`, opts);

  res.setHeader('X-RateLimit-Limit', String(opts.limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.floor(result.resetAt / 1000)));

  if (!result.allowed) {
    const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ error: 'rate_limited', retryAfter });
    return true;
  }
  return false;
}
