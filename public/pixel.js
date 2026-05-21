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

  // v31 · Advanced Matching — raises Meta Event Match Quality above the
  // default IP/UA/fbp triple by adding stronger identifiers:
  //   external_id · stable random per-visitor id (1st-party, not PII)
  //   em          · the visitor's email once known (lead-capture / /me),
  //                  persisted by window.lettoSetPixelEmail below.
  //                  fbevents.js SHA-256-hashes em client-side before send.
  function lettoExtId() {
    try {
      var k = 'letto_ext_id', v = localStorage.getItem(k);
      if (!v) {
        v = (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : 'ext-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
        localStorage.setItem(k, v);
      }
      return v;
    } catch (e) { return null; }
  }
  function lettoKnownEmail() {
    try {
      var e = localStorage.getItem('letto_user_email');
      return (e && e.indexOf('@') > 0) ? e : null;
    } catch (e) { return null; }
  }

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
    // Advanced Matching object · external_id always, em when known.
    var am = {};
    var extId = lettoExtId();      if (extId) am.external_id = extId;
    var email = lettoKnownEmail(); if (email) am.em = email;
    window.fbq('init', LETTO_FB_PIXEL_ID, am);
    window.fbq('track', 'PageView');
  }
  // Queue until consent.js exposes the firing registry.
  (function whenReady() {
    if (window.lettoFireFbPixel) window.lettoFireFbPixel(loadPixel);
    else setTimeout(whenReady, 50);
  })();

  // v33 · cookie reader for _fbp / _fbc (CAPI attribution).
  function lettoCookie(n) {
    try {
      var m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : '';
    } catch (e) { return ''; }
  }

  // v33 · server-side mirror of a conversion event. Beacons /api/meta-event,
  // which re-fires it via CAPI with the SAME event_id → Meta dedups the pair
  // into one conversion. sendBeacon survives the navigation that immediately
  // follows InitiateCheckout (→ Stripe). Fire-and-forget · response ignored.
  function lettoCapiBeacon(event, eventId, params) {
    try {
      var payload = {
        event: event,
        eventId: eventId,
        value: params.value,
        currency: params.currency,
        contentName: params.content_name,
        contentCategory: params.content_category,
        fbp: lettoCookie('_fbp'),
        fbc: lettoCookie('_fbc'),
        extId: lettoExtId(),
        email: lettoKnownEmail(),
        sourceUrl: location.href
      };
      var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/meta-event', blob);
      } else {
        fetch('/api/meta-event', { method: 'POST', body: blob, keepalive: true }).catch(function () {});
      }
    } catch (e) { /* attribution is best-effort */ }
  }

  // v27 helper · v33-enhanced. Fires the event in the browser WITH an eventID
  // (enables dedup) and — for the conversion events — mirrors it server-side
  // via the /api/meta-event CAPI beacon. Ad-blockers can kill the browser
  // fire; the server fire survives, and Meta dedups on the shared eventID.
  // Bails silently if the Pixel isn't loaded (consent declined / admin page) —
  // the calling click flow never breaks. Use:
  //   window.lettoTrackPixel('Lead', { content_name: 'mix_finish', value: 240, currency: 'EUR' });
  window.lettoTrackPixel = function (event, params) {
    try {
      // No consent → Pixel not loaded → skip BOTH browser and server fire.
      if (!(typeof window.fbq === 'function' && window.fbq.loaded)) return;
      params = params || {};
      var eventId = 'le-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
      window.fbq('track', event, params, { eventID: eventId });
      if (event === 'Lead' || event === 'InitiateCheckout') {
        lettoCapiBeacon(event, eventId, params);
      }
    } catch (e) { /* never break the calling click flow */ }
  };

  // v31 · Called by lead-capture.js + me.html the moment a visitor's email
  // becomes known. Persists it (raw, lowercased/trimmed — fbevents.js hashes
  // before send) so the NEXT PageView — this nav or any return visit — fires
  // with em advanced matching, the single strongest EMQ signal.
  window.lettoSetPixelEmail = function (email) {
    try {
      var e = (email || '').toLowerCase().trim();
      if (e.indexOf('@') > 0) localStorage.setItem('letto_user_email', e);
    } catch (e) { /* localStorage blocked · skip silently */ }
  };
})();
