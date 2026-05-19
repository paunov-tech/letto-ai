/* LETTO · Meta/FB Pixel — F95 activation (v26)
 *
 * Hardcoded ID 2513952102382319 (was '' placeholder in index.html until
 * 2026-05-19 · audit-2026-05-17-full.md P2 closed).
 *
 * Waits for consent.js to grant marketing consent before firing, via the
 * window.lettoFireFbPixel(callback) registry. If the user declines marketing
 * cookies, this never fires. If they grant consent later (via the cookie
 * settings modal), the queued PageView fires then.
 *
 * Loaded by every consent-enabled user-facing HTML: about, dobrodosao,
 * impressum, index, me, privacy, results, terms, trip. Skipped on metrics.html
 * (internal dashboard, noindex/nofollow) and admin*.html (no consent.js).
 *
 * Companion: each page has a <noscript><img> fallback for JS-disabled
 * visitors. That path bypasses the consent gate (no JS to query) — Meta's
 * default and a known trade-off for the ~1% no-JS audience.
 *
 * Swap-the-ID? One-line change here, no other files to touch.
 */
(function () {
  'use strict';
  var LETTO_FB_PIXEL_ID = '2513952102382319';
  function loadPixel() {
    if (window.fbq) { window.fbq('track', 'PageView'); return; }
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', LETTO_FB_PIXEL_ID);
    window.fbq('track', 'PageView');
  }
  // Queue until consent.js exposes the firing registry.
  (function whenReady() {
    if (window.lettoFireFbPixel) window.lettoFireFbPixel(loadPixel);
    else setTimeout(whenReady, 50);
  })();
})();
