/* LETTO · Google Analytics 4 · GDPR Consent Mode v2
 *
 *   GA_IDS[0]  G-WLXPWVNFNJ   — Sial > molty-portal > Letto stream
 *                              (sole live property; G-7S08G830GK dropped
 *                               on cleanup — verified absent from GA4
 *                               Admin Account history + Realtime overview,
 *                               only G-WLXPWVNFNJ shows incoming traffic)
 *
 * Loads gtag.js once and registers a gtag('config', …) per ID. The
 * structure stays array-shaped so a second property can be added back
 * as a one-line edit — gtag.js natively multiplexes events to every
 * configured property without further wiring. Consent Mode v2 settings
 * are GLOBAL — one consent default + one consent update covers any
 * number of configured properties.
 *
 * Consent: gtag.js loads immediately with default = denied for both
 * analytics_storage and ad_storage. No actual events leave the browser
 * until consent.js dispatches the analytics grant via
 * lettoFireGaAnalytics(), which calls
 * gtag('consent', 'update', { analytics_storage: 'granted', … }).
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
 * Add or swap an ID? Edit the GA_IDS array — everything else flows.
 */
(function () {
  'use strict';
  var GA_IDS = ['G-WLXPWVNFNJ'];

  // dataLayer + gtag bootstrap. Defined BEFORE gtag.js loads so its
  // first calls don't race against the async script tag below.
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag('js', new Date());

  // Consent default · DENIED — single GLOBAL call, applies to every
  // GA4 property configured below. wait_for_update gives the consent
  // gate 500ms to flip to 'granted' before any queued event would
  // flush. Page_view fires either way (denied → cookieless ping per
  // property, granted → full event per property).
  gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    wait_for_update: 500
  });

  // Per-property config. gtag.js dispatches each event to every
  // configured property in parallel — no need to call gtag('event')
  // per ID later.
  GA_IDS.forEach(function (id) {
    gtag('config', id, {
      anonymize_ip: true,
      send_page_view: true
    });
  });

  // Inject gtag.js ONCE · the bootstrap is universal and serves all
  // configured GA4 properties simultaneously. Using GA_IDS[0] in the
  // src is purely conventional (Google's snippet picks the first one).
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_IDS[0];
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
