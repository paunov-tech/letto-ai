// public/lead-capture.js — Email-capture interstitial before external booking
// link clicks. Same script ships on index.html / results.html / trip.html;
// script is idempotent so accidental double-include is harmless.
//
// Flow:
//   - User clicks a[href*=booking-host] (Wizz / Booking / Kiwi / Aviasales /
//     TPEmbars / Air Serbia / Turkish Airlines).
//   - capture-phase listener intercepts, opens modal IF a 24h skip flag is
//     NOT set in localStorage.
//   - "Save & open" → POST /api/lead-capture → window.open(url, '_blank') →
//     set localStorage skip flag.
//   - "Skip this time" → set skip flag → window.open(url, '_blank') without
//     POSTing.
//   - Backdrop click → close, no flag, no open (pure cancel).

(function () {
  if (window.__lettoLeadCapture) return;
  window.__lettoLeadCapture = true;

  var BOOKING_HOST_RE = /(?:wizz(?:air)?|booking|kiwi|airserbia|turkishairlines|aviasales|tpembars)\.com/i;
  var SKIP_KEY = 'letto_lead_modal_skip_until';
  var SKIP_MS = 24 * 3600 * 1000;

  function skipActive() {
    try {
      var until = parseInt(localStorage.getItem(SKIP_KEY), 10);
      return until && until > Date.now();
    } catch (e) { return false; }
  }
  function markSkip() {
    try { localStorage.setItem(SKIP_KEY, String(Date.now() + SKIP_MS)); } catch (e) {}
  }

  function injectStyle() {
    if (document.getElementById('letto-lead-modal-css')) return;
    var s = document.createElement('style');
    s.id = 'letto-lead-modal-css';
    s.textContent = [
      '.lead-modal[hidden] { display: none !important; }',
      '.lead-modal { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; }',
      '.lead-modal__backdrop { position: absolute; inset: 0; background: rgba(10,13,17,0.7); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }',
      '.lead-modal__panel { position: relative; z-index: 1; background: #FAF6EA; color: #1F2226; border: 1px solid #E4D9BC; border-radius: 14px; padding: 28px 28px 22px; max-width: 460px; width: 100%; box-shadow: 0 24px 64px -8px rgba(0,0,0,0.5); }',
      '.lead-modal__panel h3 { font-family: Fraunces, serif; font-weight: 500; font-size: 22px; margin: 0 0 12px; letter-spacing: -0.01em; line-height: 1.2; color: #1F2226; }',
      '.lead-modal__copy { font-family: "Instrument Serif", serif; font-style: italic; font-size: 15px; color: #3A3F47; margin: 0 0 18px; line-height: 1.5; }',
      '.lead-modal__form { display: flex; gap: 8px; flex-wrap: wrap; align-items: stretch; }',
      '.lead-modal__email { flex: 1 1 220px; min-width: 0; background: #fff; border: 1px solid #E4D9BC; border-radius: 8px; padding: 11px 14px; font-family: "IBM Plex Sans", -apple-system, sans-serif; font-size: 14px; color: #1F2226; }',
      '.lead-modal__email:focus { outline: 1px solid #A17433; border-color: #A17433; }',
      '.lead-modal__save { background: #1F2226; color: #FAF6EA; border: none; border-radius: 8px; padding: 11px 18px; font-family: "IBM Plex Sans", sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; letter-spacing: 0.01em; }',
      '.lead-modal__save:hover { background: #3A3F47; }',
      '.lead-modal__save:disabled { background: #6A604D; cursor: wait; }',
      '.lead-modal__skip { background: none; border: none; color: #6A604D; font-family: "IBM Plex Sans", sans-serif; font-size: 12.5px; cursor: pointer; margin-top: 14px; text-decoration: underline; display: block; padding: 0; }',
      '.lead-modal__skip:hover { color: #1F2226; }',
      '.lead-modal__error { color: #7C1E29; font-size: 12px; margin-top: 10px; font-family: "JetBrains Mono", monospace; min-height: 14px; }',
    ].join('\n');
    document.head.appendChild(s);
  }

  function injectModal() {
    if (document.getElementById('lead-modal')) return;
    var div = document.createElement('div');
    div.id = 'lead-modal';
    div.className = 'lead-modal';
    div.hidden = true;
    div.innerHTML = [
      '<div class="lead-modal__backdrop" data-lead-cancel></div>',
      '<div class="lead-modal__panel" role="dialog" aria-modal="true" aria-labelledby="lead-modal-title">',
        '<h3 id="lead-modal-title">',
          '<span data-en>Before you head to <span data-lead-host>the partner</span>…</span>',
          '<span data-sr>Pre nego što odeš na <span data-lead-host>partnera</span>…</span>',
        '</h3>',
        '<p class="lead-modal__copy">',
          '<span data-en>📧 Leave your email — we send 1–3 similar deals weekly. No spam, one-click unsubscribe.</span>',
          '<span data-sr>📧 Ostavi email — šaljemo 1-3 slična deal-a nedeljno. Bez spama, 1 klik odjava.</span>',
        '</p>',
        '<form class="lead-modal__form" autocomplete="off">',
          '<input type="email" name="email" class="lead-modal__email" placeholder="email@adresa.com" required>',
          '<button type="submit" class="lead-modal__save">',
            '<span data-en>Save &amp; open →</span>',
            '<span data-sr>Sačuvaj i otvori →</span>',
          '</button>',
        '</form>',
        '<div class="lead-modal__error" data-lead-error></div>',
        '<button type="button" class="lead-modal__skip" data-lead-skip>',
          '<span data-en>Skip this time</span>',
          '<span data-sr>Preskoči ovaj put</span>',
        '</button>',
      '</div>'
    ].join('');
    document.body.appendChild(div);
  }

  var modal, form, emailInput, errorEl, saveBtn;
  var pendingUrl = null, pendingDealId = '', pendingSource = '';

  function openModal(url, dealId, source) {
    pendingUrl = url;
    pendingDealId = dealId || '';
    pendingSource = source || 'catalog';
    try {
      var host = new URL(url, window.location.href).hostname.replace(/^www\./, '');
      modal.querySelectorAll('[data-lead-host]').forEach(function (el) { el.textContent = host; });
    } catch (e) {}
    if (errorEl) errorEl.textContent = '';
    if (emailInput) emailInput.value = '';
    if (saveBtn) saveBtn.disabled = false;
    modal.hidden = false;
    setTimeout(function () { if (emailInput) emailInput.focus(); }, 50);
  }

  function closeModal() {
    modal.hidden = true;
    pendingUrl = null;
  }

  function openLink() {
    if (pendingUrl) window.open(pendingUrl, '_blank', 'noopener,noreferrer');
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!emailInput) return;
    var email = (emailInput.value || '').trim();
    if (!email) return;
    errorEl.textContent = '';
    if (saveBtn) saveBtn.disabled = true;
    try {
      var r = await fetch('/api/lead-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, dealId: pendingDealId, source: pendingSource }),
        keepalive: true,
      });
      if (r.status === 429) {
        errorEl.textContent = 'Rate limit — probaj sutra.';
        if (saveBtn) saveBtn.disabled = false;
        return;
      }
      if (r.status === 400) {
        errorEl.textContent = 'Email format izgleda pogrešno.';
        if (saveBtn) saveBtn.disabled = false;
        return;
      }
      // 5xx or other — fall through, don't block the user from booking.
    } catch (err) {
      // Network failure — don't block. We'd rather lose the lead than the click.
      console.warn('[lead-capture] fetch failed:', err && err.message);
    }
    markSkip();
    openLink();
    closeModal();
  }

  function onSkip() { markSkip(); openLink(); closeModal(); }
  function onCancel() { closeModal(); }

  function isBookingHost(url) {
    try {
      var u = new URL(url, window.location.href);
      return BOOKING_HOST_RE.test(u.hostname);
    } catch (e) { return false; }
  }

  function interceptClicks() {
    document.addEventListener('click', function (ev) {
      // Skip flag still active — let the link open normally.
      if (skipActive()) return;
      var a = ev.target && ev.target.closest && ev.target.closest('a[href]');
      if (!a) return;
      // Don't intercept clicks inside the modal itself.
      if (a.closest('#lead-modal')) return;
      var href = a.getAttribute('href');
      if (!href || !isBookingHost(href)) return;
      ev.preventDefault();
      ev.stopPropagation();
      // Identify deal context for the lead record.
      var card = a.closest('[data-deal]') || a.closest('[data-mix-pkg-id]');
      var dealId = card ? (card.getAttribute('data-deal') || card.getAttribute('data-mix-pkg-id') || '') : '';
      // Source heuristic: locked card = 'catalog'; data-lead-source override
      // wins (e.g. trip.html sets 'premium', Mix output sets 'mix').
      var source = a.getAttribute('data-lead-source') ||
        (card && card.classList.contains('locked') ? 'catalog' : 'try_it');
      openModal(a.href || href, dealId, source);
    }, true);
  }

  function init() {
    injectStyle();
    injectModal();
    modal = document.getElementById('lead-modal');
    form = modal.querySelector('.lead-modal__form');
    emailInput = modal.querySelector('.lead-modal__email');
    errorEl = modal.querySelector('[data-lead-error]');
    saveBtn = modal.querySelector('.lead-modal__save');
    form.addEventListener('submit', onSubmit);
    modal.querySelector('[data-lead-skip]').addEventListener('click', onSkip);
    modal.querySelector('[data-lead-cancel]').addEventListener('click', onCancel);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) onCancel();
    });
    interceptClicks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
