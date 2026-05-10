/* LETTO · GDPR cookie consent — F95
 *
 * Self-injects a sticky banner on first visit. Stores granular consent in
 * localStorage (key: letto_cookie_consent). Dispatches `lettoConsentChanged`
 * + sets window.lettoConsent so downstream trackers (FB Pixel, Plausible,
 * etc.) can wait for marketing/analytics consent before firing.
 *
 * Categories:
 *   - necessary  — always on (essential for site to function)
 *   - analytics  — anonymized traffic measurement (off by default)
 *   - marketing  — FB Pixel, remarketing tags (off by default)
 *
 * Compatible with Google Consent Mode v2 semantics: explicit opt-in is
 * required for non-necessary categories. "Samo neophodni" is the equivalent
 * of dismissing the banner (user choice, not silent default).
 *
 * Public API:
 *   window.lettoConsent          — current { necessary, analytics, marketing, timestamp, version }
 *   window.lettoOpenConsentModal() — opens the granular modal (use from footer "Cookie settings" link)
 *   document on 'lettoConsentChanged' — fires whenever consent updates; trackers should listen
 */

(function () {
  'use strict';
  var STORAGE_KEY = 'letto_cookie_consent';
  var CURRENT_VERSION = 1;

  // sr (Latin) is the primary site language; EN is shown when document
  // lang attribute is `en` or query/hash hints. DE is stubbed for DACH future.
  var STRINGS = {
    sr: {
      bannerTitle: 'Tvoja privatnost',
      bannerBody: 'Letto koristi kolačiće za personalizaciju i merenje učinka. Možeš sam birati koje kategorije prihvataš.',
      acceptAll: 'Slažem se',
      necessaryOnly: 'Samo neophodni',
      details: 'Pogledaj detalje',
      modalTitle: 'Podešavanja kolačića',
      categoryNecessary: 'Neophodni',
      categoryNecessaryDesc: 'Bitni za rad sajta — autentikacija, jezik, košarica. Uvek uključeni.',
      categoryAnalytics: 'Analitika',
      categoryAnalyticsDesc: 'Anonimizovano merenje saobraćaja koje nam pomaže da poboljšamo iskustvo.',
      categoryMarketing: 'Marketing',
      categoryMarketingDesc: 'Reklamni pikseli (Meta/Facebook) za prikaz relevantnih oglasa.',
      saveChoice: 'Sačuvaj izbor',
      always: 'uvek aktivno',
      cancel: 'Otkaži',
      privacyLink: 'Politika privatnosti',
      privacyHref: '/privacy'
    },
    en: {
      bannerTitle: 'Your privacy',
      bannerBody: 'Letto uses cookies for personalization and performance measurement. Choose which categories you accept.',
      acceptAll: 'Accept all',
      necessaryOnly: 'Necessary only',
      details: 'See details',
      modalTitle: 'Cookie settings',
      categoryNecessary: 'Necessary',
      categoryNecessaryDesc: 'Essential for site operation — auth, language, cart. Always on.',
      categoryAnalytics: 'Analytics',
      categoryAnalyticsDesc: 'Anonymized traffic measurement that helps us improve the experience.',
      categoryMarketing: 'Marketing',
      categoryMarketingDesc: 'Advertising pixels (Meta/Facebook) for relevant ad delivery.',
      saveChoice: 'Save choice',
      always: 'always on',
      cancel: 'Cancel',
      privacyLink: 'Privacy policy',
      privacyHref: '/privacy'
    }
  };

  function detectLang() {
    var l = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    if (l.indexOf('en') === 0) return 'en';
    if (location.search.indexOf('lang=en') !== -1 || location.hash.indexOf('lang=en') !== -1) return 'en';
    return 'sr';
  }

  function readConsent() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== CURRENT_VERSION) return null;
      return parsed;
    } catch (_) { return null; }
  }

  function writeConsent(consent) {
    consent.version = CURRENT_VERSION;
    consent.timestamp = new Date().toISOString();
    consent.necessary = true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    } catch (_) { /* private mode / quota — silent */ }
    window.lettoConsent = consent;
    document.dispatchEvent(new CustomEvent('lettoConsentChanged', { detail: consent }));
  }

  function injectStyles() {
    if (document.getElementById('letto-consent-styles')) return;
    var style = document.createElement('style');
    style.id = 'letto-consent-styles';
    style.textContent = [
      '#letto-consent-banner{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);max-width:560px;width:calc(100% - 32px);background:#1F2226;color:#E8E5DD;padding:18px 20px;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.32);font-family:"IBM Plex Sans",system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.5;z-index:99999;}',
      '#letto-consent-banner h3{margin:0 0 6px;font-family:"Fraunces",serif;font-size:16px;font-weight:600;color:#F5F0E6;}',
      '#letto-consent-banner p{margin:0 0 12px;color:#C7C2B6;font-size:13px;}',
      '#letto-consent-banner .lc-actions{display:flex;gap:8px;flex-wrap:wrap;}',
      '#letto-consent-banner button{appearance:none;border:1px solid transparent;font:inherit;cursor:pointer;padding:8px 14px;border-radius:8px;font-weight:600;font-size:13px;}',
      '#letto-consent-banner .lc-accept{background:#D9A94A;color:#1F2226;border-color:#D9A94A;}',
      '#letto-consent-banner .lc-accept:hover{background:#E0B45A;}',
      '#letto-consent-banner .lc-necessary{background:transparent;color:#E8E5DD;border-color:rgba(232,229,221,.3);}',
      '#letto-consent-banner .lc-necessary:hover{border-color:rgba(232,229,221,.6);}',
      '#letto-consent-banner .lc-details{background:transparent;color:#D9A94A;border-color:transparent;text-decoration:underline;padding-left:6px;padding-right:6px;}',
      '#letto-consent-modal{position:fixed;inset:0;background:rgba(31,34,38,.78);display:flex;align-items:center;justify-content:center;z-index:100000;padding:16px;}',
      '#letto-consent-modal .lc-card{background:#FAF6EE;color:#1F2226;max-width:520px;width:100%;border-radius:14px;padding:24px;font-family:"IBM Plex Sans",system-ui,-apple-system,sans-serif;max-height:90vh;overflow-y:auto;}',
      '#letto-consent-modal h3{margin:0 0 14px;font-family:"Fraunces",serif;font-size:20px;color:#1F2226;}',
      '#letto-consent-modal .lc-cat{padding:12px 14px;border:1px solid #E5DED1;border-radius:10px;margin-bottom:10px;display:flex;align-items:flex-start;justify-content:space-between;gap:14px;}',
      '#letto-consent-modal .lc-cat strong{display:block;margin-bottom:4px;font-size:14px;}',
      '#letto-consent-modal .lc-cat span{font-size:12px;color:#5C5A52;line-height:1.45;}',
      '#letto-consent-modal .lc-cat-toggle{flex:0 0 auto;align-self:center;}',
      '#letto-consent-modal .lc-modal-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:18px;flex-wrap:wrap;}',
      '#letto-consent-modal button{appearance:none;border:1px solid transparent;font:inherit;cursor:pointer;padding:9px 16px;border-radius:8px;font-weight:600;font-size:13px;}',
      '#letto-consent-modal .lc-save{background:#1F2226;color:#FAF6EE;}',
      '#letto-consent-modal .lc-save:hover{background:#34373D;}',
      '#letto-consent-modal .lc-cancel{background:transparent;color:#1F2226;border-color:#D2CBBC;}',
      '#letto-consent-modal .lc-always{font-size:11px;color:#8A8576;font-style:italic;}',
      '@media (max-width:640px){#letto-consent-banner{left:8px;right:8px;bottom:8px;transform:none;width:auto;max-width:none;padding:14px 16px;}}',
      '@media (prefers-reduced-motion: reduce){#letto-consent-banner,#letto-consent-modal{transition:none;}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function buildToggle(checked, disabled) {
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!checked;
    input.disabled = !!disabled;
    input.className = 'lc-cat-toggle';
    input.style.cssText = 'width:18px;height:18px;cursor:' + (disabled ? 'not-allowed' : 'pointer');
    return input;
  }

  function showBanner() {
    if (document.getElementById('letto-consent-banner')) return;
    var t = STRINGS[detectLang()];

    var banner = document.createElement('div');
    banner.id = 'letto-consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('aria-label', t.bannerTitle);

    var heading = document.createElement('h3');
    heading.textContent = t.bannerTitle;
    var body = document.createElement('p');
    body.textContent = t.bannerBody + ' ';
    var link = document.createElement('a');
    link.href = t.privacyHref;
    link.textContent = t.privacyLink;
    link.style.cssText = 'color:#D9A94A;';
    body.appendChild(link);

    var actions = document.createElement('div');
    actions.className = 'lc-actions';

    var accept = document.createElement('button');
    accept.className = 'lc-accept';
    accept.textContent = t.acceptAll;
    accept.addEventListener('click', function () {
      writeConsent({ analytics: true, marketing: true });
      banner.parentNode && banner.parentNode.removeChild(banner);
    });

    var necessary = document.createElement('button');
    necessary.className = 'lc-necessary';
    necessary.textContent = t.necessaryOnly;
    necessary.addEventListener('click', function () {
      writeConsent({ analytics: false, marketing: false });
      banner.parentNode && banner.parentNode.removeChild(banner);
    });

    var details = document.createElement('button');
    details.className = 'lc-details';
    details.textContent = t.details;
    details.addEventListener('click', function () {
      banner.parentNode && banner.parentNode.removeChild(banner);
      showModal();
    });

    actions.appendChild(accept);
    actions.appendChild(necessary);
    actions.appendChild(details);
    banner.appendChild(heading);
    banner.appendChild(body);
    banner.appendChild(actions);
    document.body.appendChild(banner);
  }

  function showModal() {
    if (document.getElementById('letto-consent-modal')) return;
    var t = STRINGS[detectLang()];
    var existing = readConsent() || { necessary: true, analytics: false, marketing: false };

    var overlay = document.createElement('div');
    overlay.id = 'letto-consent-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', t.modalTitle);

    var card = document.createElement('div');
    card.className = 'lc-card';

    var heading = document.createElement('h3');
    heading.textContent = t.modalTitle;
    card.appendChild(heading);

    function makeRow(name, desc, currentChecked, locked) {
      var row = document.createElement('div');
      row.className = 'lc-cat';
      var info = document.createElement('div');
      var s = document.createElement('strong');
      s.textContent = name;
      info.appendChild(s);
      var d = document.createElement('span');
      d.textContent = desc;
      info.appendChild(d);
      if (locked) {
        var note = document.createElement('div');
        note.className = 'lc-always';
        note.textContent = '(' + t.always + ')';
        info.appendChild(note);
      }
      var input = buildToggle(currentChecked, locked);
      row.appendChild(info);
      row.appendChild(input);
      return { row: row, input: input };
    }

    var necessaryRow = makeRow(t.categoryNecessary, t.categoryNecessaryDesc, true, true);
    var analyticsRow = makeRow(t.categoryAnalytics, t.categoryAnalyticsDesc, !!existing.analytics, false);
    var marketingRow = makeRow(t.categoryMarketing, t.categoryMarketingDesc, !!existing.marketing, false);

    card.appendChild(necessaryRow.row);
    card.appendChild(analyticsRow.row);
    card.appendChild(marketingRow.row);

    var actions = document.createElement('div');
    actions.className = 'lc-modal-actions';

    var cancel = document.createElement('button');
    cancel.className = 'lc-cancel';
    cancel.textContent = t.cancel;
    cancel.addEventListener('click', function () {
      overlay.parentNode && overlay.parentNode.removeChild(overlay);
      if (!readConsent()) showBanner();
    });

    var save = document.createElement('button');
    save.className = 'lc-save';
    save.textContent = t.saveChoice;
    save.addEventListener('click', function () {
      writeConsent({
        analytics: !!analyticsRow.input.checked,
        marketing: !!marketingRow.input.checked
      });
      overlay.parentNode && overlay.parentNode.removeChild(overlay);
    });

    actions.appendChild(cancel);
    actions.appendChild(save);
    card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Keyboard close (Esc) — Cancel semantics
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') cancel.click();
    });
  }

  // ─── Public API ────────────────────────────────────────────
  window.lettoOpenConsentModal = function () { showModal(); };

  // FB Pixel firing helper. Call this from anywhere; it will only fire when
  // marketing consent is granted, NOW or LATER. Use:
  //   lettoFireFbPixel(function () { fbq('track', 'PageView'); });
  // The closure runs immediately if marketing already granted, otherwise it
  // queues until lettoConsentChanged fires with marketing=true.
  window.lettoFireFbPixel = function (fn) {
    var c = window.lettoConsent;
    if (c && c.marketing) {
      try { fn(); } catch (e) { console.error('[letto-consent] pixel fn threw:', e); }
      return;
    }
    var listener = function (ev) {
      if (ev.detail && ev.detail.marketing) {
        document.removeEventListener('lettoConsentChanged', listener);
        try { fn(); } catch (e) { console.error('[letto-consent] pixel fn threw:', e); }
      }
    };
    document.addEventListener('lettoConsentChanged', listener);
  };

  // ─── Boot ──────────────────────────────────────────────────
  function boot() {
    injectStyles();
    var existing = readConsent();
    if (existing) {
      window.lettoConsent = existing;
      document.dispatchEvent(new CustomEvent('lettoConsentChanged', { detail: existing }));
      return;
    }
    showBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
