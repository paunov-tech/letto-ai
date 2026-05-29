/* public/js/destination-matrix.js — homepage origin→destination matrix (v43-C).
 *
 * Renders an origin selector (desktop: chips · mobile: <select>) + a grid of
 * destination links pointing at the pSEO routes:
 *     /letovi-iz-{origin_genitiv}-za-{dest}
 *
 * Self-contained & additive: it only does anything if a container element
 * with id="destination-matrix" exists on the page. The selected origin
 * persists in localStorage ('letto_pseo_origin', default BEG) across reloads.
 *
 * Data is inlined (20 origins × 12 top dests) so the component needs no fetch
 * and renders instantly. Keep in sync with data/pseo-origins.json +
 * scripts/lib/destinations.mjs if those change.
 *
 * NB · these links resolve only when the pSEO engine is live
 * (PSEO_ENABLED=1 + the target pages pre-generated). Wire the container into
 * index.html as part of the Phase 2 rollout flip, not before.
 */
(function () {
  'use strict';
  var MOUNT = document.getElementById('destination-matrix');
  if (!MOUNT) return;

  var STORE_KEY = 'letto_pseo_origin';
  var DEFAULT_ORIGIN = 'BEG';

  // origin code → genitive slug (matches data/pseo-origins.json slug_sr)
  var ORIGINS = [
    { code: 'BEG', name: 'Beograd',    slug: 'beograda' },
    { code: 'INI', name: 'Niš',        slug: 'nisa' },
    { code: 'TGD', name: 'Podgorica',  slug: 'podgorice' },
    { code: 'TIV', name: 'Tivat',      slug: 'tivta' },
    { code: 'SJJ', name: 'Sarajevo',   slug: 'sarajeva' },
    { code: 'BNX', name: 'Banja Luka', slug: 'banje-luke' },
    { code: 'OMO', name: 'Mostar',     slug: 'mostara' },
    { code: 'TZL', name: 'Tuzla',      slug: 'tuzle' },
    { code: 'ZAG', name: 'Zagreb',     slug: 'zagreba' },
    { code: 'SPU', name: 'Split',      slug: 'splita' },
    { code: 'DBV', name: 'Dubrovnik',  slug: 'dubrovnika' },
    { code: 'PUY', name: 'Pula',       slug: 'pule' },
    { code: 'RJK', name: 'Rijeka',     slug: 'rijeke' },
    { code: 'ZAD', name: 'Zadar',      slug: 'zadra' },
    { code: 'OSI', name: 'Osijek',     slug: 'osijeka' },
    { code: 'LJU', name: 'Ljubljana',  slug: 'ljubljane' },
    { code: 'MBX', name: 'Maribor',    slug: 'maribora' },
    { code: 'SKP', name: 'Skoplje',    slug: 'skoplja' },
    { code: 'OHD', name: 'Ohrid',      slug: 'ohrida' },
    { code: 'PRN', name: 'Priština',   slug: 'pristine' }
  ];

  // top 12 destinations · { iata, city, srSlug } (matches destinations.mjs)
  var DESTS = [
    { iata: 'FCO', city: 'Rim',         slug: 'rim' },
    { iata: 'ATH', city: 'Atina',       slug: 'atina' },
    { iata: 'BCN', city: 'Barselona',   slug: 'barselona' },
    { iata: 'CDG', city: 'Pariz',       slug: 'pariz' },
    { iata: 'IST', city: 'Istanbul',    slug: 'istanbul' },
    { iata: 'VIE', city: 'Beč',         slug: 'bec' },
    { iata: 'BUD', city: 'Budimpešta',  slug: 'budimpesta' },
    { iata: 'LHR', city: 'London',      slug: 'london' },
    { iata: 'AMS', city: 'Amsterdam',   slug: 'amsterdam' },
    { iata: 'MAD', city: 'Madrid',      slug: 'madrid' },
    { iata: 'PRG', city: 'Prag',        slug: 'prag' },
    { iata: 'DXB', city: 'Dubai',       slug: 'dubai' }
  ];

  function getOrigin() {
    var code;
    try { code = localStorage.getItem(STORE_KEY); } catch (e) {}
    return ORIGINS.some(function (o) { return o.code === code; }) ? code : DEFAULT_ORIGIN;
  }
  function setOrigin(code) {
    try { localStorage.setItem(STORE_KEY, code); } catch (e) {}
  }
  function originBy(code) {
    for (var i = 0; i < ORIGINS.length; i++) if (ORIGINS[i].code === code) return ORIGINS[i];
    return ORIGINS[0];
  }

  function injectStyle() {
    if (document.getElementById('dm-css')) return;
    var s = document.createElement('style');
    s.id = 'dm-css';
    s.textContent = [
      '#destination-matrix { max-width: 960px; margin: 0 auto; padding: 8px 16px 40px; }',
      '.dm-origins { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 22px; }',
      '.dm-chip { border: 1px solid #E4D9BC; background: #fff; color: #3d342c; border-radius: 999px; padding: 7px 15px; font: inherit; font-size: 13px; cursor: pointer; transition: all .15s; }',
      '.dm-chip:hover { border-color: #A17433; }',
      '.dm-chip[aria-pressed="true"] { background: #1f1a16; color: #fff; border-color: #1f1a16; }',
      '.dm-select { display: none; width: 100%; padding: 11px 14px; border: 1px solid #E4D9BC; border-radius: 8px; font: inherit; font-size: 15px; margin-bottom: 22px; background: #fff; }',
      '.dm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }',
      '.dm-link { display: block; border: 1px solid #e8dfca; border-radius: 10px; padding: 14px 16px; color: #1f1a16; background: #fffdf7; font-size: 15px; transition: transform .15s, border-color .15s; }',
      '.dm-link:hover { transform: translateY(-2px); border-color: #A17433; text-decoration: none; }',
      '.dm-link small { display: block; font-family: "JetBrains Mono", monospace; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: #8a8076; margin-top: 3px; }',
      '@media (max-width: 560px) { .dm-origins { display: none; } .dm-select { display: block; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function render() {
    var current = getOrigin();
    var o = originBy(current);

    // origin chips (desktop)
    var chips = ORIGINS.map(function (x) {
      return '<button class="dm-chip" data-code="' + x.code + '" aria-pressed="' + (x.code === current) + '">' + x.name + '</button>';
    }).join('');

    // origin select (mobile)
    var opts = ORIGINS.map(function (x) {
      return '<option value="' + x.code + '"' + (x.code === current ? ' selected' : '') + '>' + x.name + '</option>';
    }).join('');

    // destination grid
    var grid = DESTS.map(function (d) {
      var href = '/letovi-iz-' + o.slug + '-za-' + d.slug;
      return '<a class="dm-link" href="' + href + '">' + d.city + '<small>iz ' + o.name + '</small></a>';
    }).join('');

    MOUNT.innerHTML =
      '<div class="dm-origins" role="group" aria-label="Polazni grad">' + chips + '</div>' +
      '<select class="dm-select" aria-label="Polazni grad">' + opts + '</select>' +
      '<div class="dm-grid">' + grid + '</div>';

    // wire events
    MOUNT.querySelectorAll('.dm-chip').forEach(function (btn) {
      btn.addEventListener('click', function () { setOrigin(btn.getAttribute('data-code')); render(); });
    });
    var sel = MOUNT.querySelector('.dm-select');
    if (sel) sel.addEventListener('change', function () { setOrigin(sel.value); render(); });
  }

  injectStyle();
  render();
})();
