/* LETTO · Service Worker (v40.4) · offline-first cache layer
 *
 * Strategy
 *   cache-first       static own assets (consent.js / pixel.js / ga4.js /
 *                     gtm.js / lead-capture.js / favicon.svg / brand/*)
 *   network-first     HTML pages (always-fresh, cache fallback for offline)
 *   network-only      /api/* (never cache · fresh response is the whole point)
 *   pass-through      cross-origin (Stripe / GA / GTM / FB / Pexels / CDN —
 *                     don't intercept; let the browser handle natively)
 *
 * Versioning · bump CACHE_VERSION on each meaningful asset change. The
 * activate event drops old caches so stale files don't accumulate.
 *
 * Update propagation · skipWaiting + clients.claim → new SW activates on
 * the next page load (no two-tab dance). For an emergency rollback,
 * deploy this file's content replaced with:
 *
 *   self.addEventListener('install',  () => self.skipWaiting());
 *   self.addEventListener('activate', () =>
 *     self.registration.unregister().then(() => self.clients.claim())
 *   );
 *
 * That uninstalls the SW on next visit — kills the cache layer entirely.
 */

const CACHE_VERSION = 'letto-v1';
const CACHE_NAME = CACHE_VERSION;

// Pre-cache critical-path own assets on install (best-effort · individual
// failures are swallowed so a missing file doesn't abort the whole install).
const PRECACHE_URLS = [
  '/',
  '/consent.js',
  '/pixel.js',
  '/ga4.js',
  '/gtm.js',
  '/lead-capture.js',
  '/favicon.svg',
  '/compass-sun.svg',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(PRECACHE_URLS.map((url) =>
        cache.add(url).catch(() => { /* ignore single 404 / network blip */ })
      ))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )),
      self.clients.claim(),
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // GET only · POST/PUT/DELETE/etc pass through untouched (Stripe, lead-
  // capture, save-mix all need fresh network).
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Pass-through for cross-origin · let the browser handle Stripe / GA /
  // GTM / FB Pixel / Pexels / CDN natively, with their own caching rules.
  if (url.origin !== self.location.origin) return;

  // /api/* · network-only, no cache, no fallback (a stale package list
  // would mislead the user; better to fail than to lie).
  if (url.pathname.startsWith('/api/')) return;

  const isHtml = req.mode === 'navigate'
    || (req.headers.get('Accept') || '').includes('text/html');

  if (isHtml) {
    // HTML · network-first with cache fallback for offline.
    event.respondWith(
      fetch(req).then((resp) => {
        if (resp && resp.ok && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
        }
        return resp;
      }).catch(() => caches.match(req).then((cached) => cached || Response.error()))
    );
    return;
  }

  // Static asset · cache-first, update cache in background on miss.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        if (resp && resp.ok && resp.status === 200 && resp.type !== 'opaque') {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
        }
        return resp;
      }).catch(() => cached || Response.error());
    })
  );
});
