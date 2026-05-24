/* LETTO · Google Analytics 4 (G-7S08G830GK) · GDPR Consent Mode v2
 *
 * Loads gtag.js immediately with consent default = denied for both
 * analytics_storage and ad_storage. No actual events leave the browser
 * until consent.js dispatches the analytics grant via
 * lettoFireGaAnalytics(), which calls
 * gtag('consent', 'update', { analytics_storage: 'granted', ... }).
 *
 * Loaded by every consent-enabled user-facing HTML — same set as pixel.js.
 * Skipped on admin*.html / metrics.html (internal, no consent.js).
 *
 * Why Consent Mode v2 (not full block-until-consent like pixel.js):
 *   v2 lets gtag.js LOAD so behavioural modelling / cookieless pings can
 *   begin in 'denied' mode (no PII, no identifiers, no storage). On grant
 *   it upgrades to full attribution. This gives FB-Pixel-style cookieless
 *   measurement even for users who decline cookies, which the strict
 *   block-load pattern can't provide.
 *
 * Swap the ID? One-line change here.
 */
(function () {
  'use strict';
  var GA_ID = 'G-7S08G830GK';

  // dataLayer + gtag bootstrap. Defined BEFORE gtag.js loads so its
  // first calls don't race against the async script tag below.
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag('js', new Date());

  // Consent default · DENIED. wait_for_update gives the consent gate
  // 500ms to flip to 'granted' before any queued event would flush —
  // mostly belt-and-suspenders since the only queued event here is
  // the page_view from gtag('config') below, and it'll fire whether
  // granted or denied (denied → cookieless ping, granted → full event).
  gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    wait_for_update: 500
  });

  gtag('config', GA_ID, {
    anonymize_ip: true,
    send_page_view: true
  });

  // Inject gtag.js · async so it never blocks the page parse.
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);

  // Hook into consent.js · upgrade to granted the moment the visitor
  // accepts analytics cookies (NOW or LATER). consent.js loads BEFORE
  // this file via `defer`, so window.lettoFireGaAnalytics is already
  // defined when this IIFE runs — the whenReady polling is purely
  // defensive against future load-order changes.
  (function whenReady() {
    if (window.lettoFireGaAnalytics) {
      window.lettoFireGaAnalytics(function () {
        gtag('consent', 'update', {
          analytics_storage: 'granted',
          ad_storage: 'granted'
        });
      });
    } else {
      setTimeout(whenReady, 50);
    }
  })();
})();
