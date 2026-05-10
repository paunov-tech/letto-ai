// FAZA D2 · Backend Sentry helper.
//
// Single source of truth for Sentry init in API routes. Idempotent — safe to
// call from every handler at the top of the file. No-op when SENTRY_DSN_BACKEND
// is unset (so dev / preview deployments without DSN don't fail or send noise).
//
// Profiling integration is intentionally NOT included: @sentry/profiling-node
// pulls in a native binary that would inflate Vercel function cold-starts.
// We can layer profiling on later once we have a steady-state baseline.

import * as Sentry from '@sentry/node';

let initialized = false;

export function initSentry() {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN_BACKEND;
  if (!dsn) return; // silent no-op when DSN missing
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    // Strip request fields we know carry secrets / cookies before they leave
    // the function. Defense in depth on top of sendDefaultPii: false.
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.query_string;
        if (event.request.headers) {
          delete event.request.headers.cookie;
          delete event.request.headers.authorization;
          delete event.request.headers['x-admin-token'];
        }
      }
      return event;
    }
  });
  initialized = true;
}

// Convenience wrapper — wrap any async API handler so uncaught exceptions
// flow to Sentry with a route tag, then re-throw so the platform's normal
// 500 path runs.
export function withSentry(routeName, handler) {
  return async function wrapped(req, res) {
    initSentry();
    try {
      return await handler(req, res);
    } catch (err) {
      Sentry.captureException(err, {
        tags: { route: routeName },
        extra: {
          method: req.method,
          path: req.url,
          userAgentHash: req.headers['user-agent']
            ? req.headers['user-agent'].slice(0, 80)
            : null
        }
      });
      // Best-effort flush — Vercel functions freeze after the response writes,
      // so let any in-flight transport finish before re-throwing.
      try { await Sentry.flush(2000); } catch {}
      throw err;
    }
  };
}

export { Sentry };
