// Kontiki structured search API scraper.
// Uses the same public ASMX endpoints as kontiki.rs search, then parses the
// server-rendered pagingData JSON. No browser or brittle card regex required.
import { renderHtml } from '../lib/browser-render.mjs';
import { parseCharterCards } from '../lib/charter-html.mjs';

const BASE = 'https://kontiki.rs';

const BELGRADE = {
  code: 'BEG', name: 'BEOGRAD', internationalName: 'BELGRADE', type: 2,
  latitude: '44.786568000', longitude: '20.448922000', parentId: '1',
  countryId: '1', isProductLocation: true, provider: 1, isTopRegion: false,
  ownLocation: false, id: '2'
};

// The old integration hard-coded Antalya, which reduced a very rich supplier
// to one destination.  The supplier already exposes its active arrival
// catalog; discover it on every run and retain a deliberately bounded set of
// commercially useful destinations.  Adding coverage now means adding a
// code/SEO slug here, not reverse-engineering another search page.
const DESTINATION_SLUGS = {
  AYT: 'turska~antalija', ALANYA: 'turska~alanja', BODRUM: 'turska~bodrum',
  IZMIR: 'turska~izmir', KUSADASI: 'turska~kusadasi', MARMARIS: 'turska~marmaris',
  HURGADA: 'egipat~hurgada', MIR: 'tunis~monastir', SOUSSE: 'tunis~sus',
  RODOS: 'grcka~rodos', KRIT: 'grcka~krit', KRF: 'grcka~krf',
  ZAKINTOS: 'grcka~zakintos', LARNACA: 'kipar~larnaka',
  MALLORCA: 'spanija~majorka', MALTAISLAN: 'malta~malta',
  DUBAI: 'ujedinjeni-arapski-emirati~dubai', ZANZIBAR: 'tanzanija~zanzibar'
};

async function invoke(siteBase, path, request, timeoutMs = 90000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const response = await fetch(`${siteBase}/ScriptService/CommonForScript.asmx/InvokeService?p=${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Origin: siteBase,
        Referer: `${siteBase}/`,
        'User-Agent': 'Mozilla/5.0 (compatible; LETTO/1.0; +https://letto.live)'
      },
      body: JSON.stringify({
        req: { Token: 'null', Path: path, ReqObj: JSON.stringify(request) }
      }),
      signal: ctrl.signal
    });
    if (!response.ok) throw new Error(`Kontiki ${path} HTTP ${response.status}`);
    const outer = await response.json();
    const result = JSON.parse(outer.d);
    if (!result.header?.success) throw new Error(`Kontiki ${path} unsuccessful`);
    return result.body || {};
  } finally {
    clearTimeout(timer);
  }
}

function extractAssignedJson(html, marker) {
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const objectStart = html.indexOf('{', start + marker.length);
  if (objectStart < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = objectStart; i < html.length; i++) {
    const char = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return JSON.parse(html.slice(objectStart, i + 1));
  }
  return null;
}

function cheapestAvailableOffer(hotel) {
  return (hotel.offers || [])
    .filter(offer => offer.isAvailable !== false && Number(offer.price?.amount) > 0)
    .sort((a, b) => a.price.amount - b.price.amount)[0];
}

function findDirectSupplierUrl(value, siteBase, depth = 0, seen = new Set()) {
  if (depth > 6 || value == null) return null;
  if (typeof value === 'string') {
    if (/\/sr\/(hotel|tour)\//i.test(value)) {
      try { return new URL(value, siteBase).toString(); } catch (_) { return null; }
    }
    return null;
  }
  if (typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  for (const child of Object.values(value)) {
    const found = findDirectSupplierUrl(child, siteBase, depth + 1, seen);
    if (found) return found;
  }
  return null;
}

function normalizeHotels(pagingData, bookingUrl, siteBase = BASE, searchDestination = null) {
  return (pagingData?.body?.hotels || []).flatMap(hotel => {
    const offer = cheapestAvailableOffer(hotel);
    if (!offer) return [];
    const room = offer.rooms?.[0] || {};
    const directBookingUrl = findDirectSupplierUrl({ hotel, offer }, siteBase);
    return [{
      title: hotel.name,
      destination: hotel.city?.name || hotel.location?.name || null,
      destinationCode: searchDestination?.code || null,
      destinationName: searchDestination?.name || null,
      originCode: 'BEG',
      country: hotel.country?.name || null,
      price: Number(offer.price.amount),
      oldPrice: Number(offer.price.oldAmount) || null,
      currency: offer.price.currency || 'EUR',
      outboundDate: String(offer.checkIn || offer.accomodationCheckIn || '').slice(0, 10) || null,
      nights: Number(offer.night) || null,
      hotelStars: Number(hotel.stars || hotel.hotelCategory?.name) || null,
      board: room.boardName || hotel.boardGroups?.[0]?.name || null,
      room: room.roomName || null,
      allInclusive: /all\s*inclusive/i.test(room.boardName || ''),
      available: offer.isAvailable !== false,
      bookingUrl: directBookingUrl || bookingUrl,
      searchUrl: bookingUrl,
      bookingKind: directBookingUrl ? 'direct_supplier_offer' : 'supplier_search_session',
      image: hotel.thumbnailFull || (hotel.thumbnail ? new URL(hotel.thumbnail, siteBase).toString() : null),
      badges: (hotel.badges || hotel.themes || []).map(item => item.name).filter(Boolean),
      sourceOfferId: offer.offerId || null
    }];
  });
}

async function scrapeDestination(siteBase, { slug, location }) {
  const baseCriteria = {
    productType: 1,
    includeSubLocations: true,
    departureLocations: [BELGRADE],
    arrivalLocations: [location]
  };
  const dates = (await invoke(siteBase, '/api/productservice/getcheckindates', baseCriteria)).dates || [];
  const today = new Date().toISOString().slice(0, 10);
  const checkIn = dates.map(value => String(value).slice(0, 10)).find(date => date > today) || dates[0]?.slice(0, 10);
  if (!checkIn) return [];

  const nightsBody = await invoke(siteBase, '/api/productservice/getnights', { ...baseCriteria, checkIn });
  const nights = (nightsBody.nights || nightsBody || []).map(value => Number(value.id ?? value.value ?? value));
  const night = nights.find(value => value === 7) || nights.find(Number.isFinite);
  if (!night) return [];

  const search = await invoke(siteBase, '/api/productservice/pricesearch', {
    ...baseCriteria,
    checkAllotment: false,
    checkIn,
    checkStopSale: false,
    culture: 'sr-Latn-RS',
    forceFlightBundlePackage: false,
    getOnlyBestOffers: true,
    getOnlyDiscountedPrice: false,
    getTransportations: true,
    night: String(night),
    pagingOption: { currentPage: 1, pageRowCount: 20, Sort: 1 },
    roomCriteria: [{ adult: 2, childAges: [], childCount: 0, active: true }],
    searchBrandedFares: true,
    acceptPendingProviders: true,
    Currency: 'EUR',
    additionalParameters: { getOptionsParameters: { flightBaggageGetOption: 0 } }
  });
  const searchId = search.searchId || search.id;
  if (!searchId) return [];

  const bookingUrl = `${siteBase}/sr/packages/srbija~beograd~${slug}/?SearchId=${encodeURIComponent(searchId)}&R1Adult=2`;
  const response = await fetch(bookingUrl, {
    headers: { Referer: `${siteBase}/`, 'User-Agent': 'Mozilla/5.0 (compatible; LETTO/1.0; +https://letto.live)' }
  });
  if (!response.ok) throw new Error(`Kontiki results HTTP ${response.status}`);
  const pagingData = extractAssignedJson(await response.text(), 'HotelSearchProperties.Prm.pagingData =');
  return normalizeHotels(pagingData, bookingUrl, siteBase, location);
}

async function discoverDestinations(siteBase) {
  const body = await invoke(siteBase, '/api/productservice/getarrivals', {
    productType: 1,
    departureLocations: [BELGRADE]
  });
  return (body.locations || [])
    .filter(location => location.type === 2 && DESTINATION_SLUGS[location.code])
    .map(location => ({ location, slug: DESTINATION_SLUGS[location.code] }));
}

async function settleInBatches(items, worker, concurrency = 4) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    results.push(...await Promise.allSettled(items.slice(i, i + concurrency).map(worker)));
  }
  return results;
}

export async function scrapeStructuredPackages(siteBase, destinations = null) {
  const catalog = destinations || await discoverDestinations(siteBase);
  const results = await settleInBatches(catalog, destination => scrapeDestination(siteBase, destination));
  const rows = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  if (!rows.length) {
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
  }
  return rows;
}

export async function scrapeKontiki() {
  const [structured, catalog] = await Promise.allSettled([
    scrapeStructuredPackages(BASE),
    renderHtml(BASE).then(html => parseCharterCards(html, { baseUrl: BASE }))
  ]);
  const rows = [
    ...(catalog.status === 'fulfilled' ? catalog.value : []),
    ...(structured.status === 'fulfilled' ? structured.value : [])
  ];
  if (!rows.length) throw (structured.reason || catalog.reason || new Error('Kontiki returned no offers'));
  return rows;
}

export { extractAssignedJson, normalizeHotels, findDirectSupplierUrl };
