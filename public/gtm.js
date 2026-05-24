/* LETTO · Google Tag Manager (GTM-TR2FLLW8) · stand-by container
 *
 * Empty workspace — waiting for future tags wired up in
 * tagmanager.google.com (Hotjar / LinkedIn Insight / TikTok Pixel / …).
 *
 * DO NOT add a GA4 tag inside this GTM workspace — public/ga4.js
 * already loads gtag.js directly, so any GTM-side GA4 tag would
 * double-fire every event. GTM is here for future, non-GA4 tools.
 *
 * Loaded by every consent-enabled user-facing HTML — same set as
 * pixel.js + ga4.js. Skipped on admin*.html / metrics.html.
 *
 * Consent: gates the `letto_consent_granted` dataLayer event behind
 * lettoFireGaAnalytics. Any GTM tag that needs analytics consent
 * (e.g. Hotjar) should use that event as its trigger, OR consume
 * Google's native Consent Mode signals which gtag.js / GTM share.
 *
 * Swap the ID? One-line change here.
 */
(function () {
  'use strict';
  var GTM_ID = 'GTM-TR2FLLW8';

  // dataLayer is SHARED with ga4.js — both scripts push into the same
  // window-global array. ga4.js initialises it first via `defer` order.
  window.dataLayer = window.dataLayer || [];

  // Standard GTM bootstrap (Google template, async).
  (function (w, d, s, l, i) {
    w[l] = w[l] || [];
    w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    var f = d.getElementsByTagName(s)[0],
        j = d.createElement(s),
        dl = l !== 'dataLayer' ? '&l=' + l : '';
    j.async = true;
    j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + dl;
    f.parentNode.insertBefore(j, f);
  })(window, document, 'script', 'dataLayer', GTM_ID);

  // Consent gate · same pattern as ga4.js. Fires once the visitor grants
  // analytics consent, pushing a custom event that future GTM tags can use
  // as a trigger condition. (Stand-by container has no tags listening yet.)
  (function whenReady() {
    if (window.lettoFireGaAnalytics) {
      window.lettoFireGaAnalytics(function () {
        window.dataLayer.push({
          event: 'letto_consent_granted',
          analytics_consent: true
        });
      });
    } else {
      setTimeout(whenReady, 50);
    }
  })();
})();
