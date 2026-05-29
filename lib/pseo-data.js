// lib/pseo-data.js — shared enrichment lookups for the pSEO engine.
//
// Thin re-export layer over the existing SEO data sources so the generator
// (lib/pseo-claude-gen.js) and renderer (lib/pseo-render.js) draw facts from
// ONE place — the same maps that already drive the live /letovi-* pages.
// No new data is invented here; we only reshape what destinations-faq.mjs +
// generate-destination-pages.mjs already maintain.
//
//   FAQ_DATA[iata]      → flight_duration_min_from_beg, best_months,
//                         flight_price_eur_range_from_beg,
//                         hotel_price_eur_range_per_night, visa notes,
//                         attractions [{name_sr,name_en}]
//   GEO_TYPE_BY_IATA    → { lat, lng, types:[...] }  (Schema.org touristType)
//
// GEO_TYPE_BY_IATA lives inline in generate-destination-pages.mjs (a script,
// not importable cleanly), so it is duplicated here verbatim. If you edit one,
// edit both — they are intentionally identical until a future refactor lifts
// the map into scripts/lib/.

import { FAQ_DATA } from '../scripts/lib/destinations-faq.mjs';

export { FAQ_DATA };

const MONTH_NAMES_SR = ['januar','februar','mart','april','maj','jun','jul','avgust','septembar','oktobar','novembar','decembar'];
const MONTH_NAMES_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Mirror of GEO_TYPE_BY_IATA in scripts/generate-destination-pages.mjs (v42).
export const GEO_TYPE_BY_IATA = {
  FCO: { lat: 41.9028, lng: 12.4964, types: ['Cultural travel', 'City breaks', 'Romantic getaways'] },
  PMI: { lat: 39.5696, lng:  2.6502, types: ['Beach holidays',  'Family travel', 'Mediterranean coast'] },
  ATH: { lat: 37.9838, lng: 23.7275, types: ['Cultural travel', 'Historical sites', 'City breaks'] },
  BCN: { lat: 41.3851, lng:  2.1734, types: ['City breaks',     'Cultural travel', 'Beach holidays'] },
  CDG: { lat: 48.8566, lng:  2.3522, types: ['Romantic getaways','Cultural travel', 'City breaks'] },
  MLA: { lat: 35.8989, lng: 14.5146, types: ['Cultural travel', 'Mediterranean coast', 'Historical sites'] },
  BUD: { lat: 47.4979, lng: 19.0402, types: ['City breaks',     'Wellness travel', 'Cultural travel'] },
  LIS: { lat: 38.7223, lng: -9.1393, types: ['City breaks',     'Cultural travel', 'Beach holidays'] },
  VIE: { lat: 48.2082, lng: 16.3738, types: ['Cultural travel', 'City breaks',     'Historical sites'] },
  DXB: { lat: 25.2048, lng: 55.2708, types: ['Luxury travel',   'Shopping',        'Family travel'] },
  SKG: { lat: 40.6401, lng: 22.9444, types: ['City breaks',     'Mediterranean coast', 'Cultural travel'] },
  IST: { lat: 41.0082, lng: 28.9784, types: ['Cultural travel', 'Historical sites', 'City breaks'] },
  MUC: { lat: 48.1351, lng: 11.5820, types: ['City breaks',     'Cultural travel', 'Food and drink'] },
  SPU: { lat: 43.5081, lng: 16.4402, types: ['Beach holidays',  'Adriatic coast',  'Cultural travel'] },
  DBV: { lat: 42.6507, lng: 18.0944, types: ['Cultural travel', 'Adriatic coast',  'Beach holidays'] },
  PRG: { lat: 50.0755, lng: 14.4378, types: ['Cultural travel', 'City breaks',     'Historical sites'] },
  TIA: { lat: 41.3275, lng: 19.8187, types: ['City breaks',     'Cultural travel', 'Mediterranean coast'] },
  AMS: { lat: 52.3676, lng:  4.9041, types: ['City breaks',     'Cultural travel', 'Nightlife'] },
  CMN: { lat: 33.5731, lng: -7.5898, types: ['Cultural travel', 'Beach holidays',  'City breaks'] },
  HER: { lat: 35.3387, lng: 25.1442, types: ['Beach holidays',  'Mediterranean coast', 'Cultural travel'] },
  IBZ: { lat: 38.9067, lng:  1.4206, types: ['Beach holidays',  'Nightlife',       'Mediterranean coast'] },
  LHR: { lat: 51.5074, lng: -0.1278, types: ['City breaks',     'Cultural travel', 'Shopping'] },
  MAD: { lat: 40.4168, lng: -3.7038, types: ['City breaks',     'Cultural travel', 'Nightlife'] },
};

export function formatDurationMin(mins) {
  if (mins == null) return null;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h === 0) return m + 'min';
  return m === 0 ? h + 'h' : h + 'h ' + m + 'min';
}

export function monthNames(monthNums, lang) {
  const names = lang === 'en' ? MONTH_NAMES_EN : MONTH_NAMES_SR;
  return (monthNums || []).map(m => names[m - 1]).join(', ');
}

/**
 * Collect every grounded fact about a destination IATA for prompt-building
 * + schema rendering. Returns a flat object (nulls where data is absent).
 */
export function destFacts(iata, lang) {
  const faq = FAQ_DATA[iata] || null;
  const geo = GEO_TYPE_BY_IATA[iata] || null;
  return {
    geo,
    faq,
    durationText: faq ? formatDurationMin(faq.flight_duration_min_from_beg) : null,
    bestMonthsText: faq ? monthNames(faq.best_months, lang) : null,
    flightRange: faq ? faq.flight_price_eur_range_from_beg : null,
    hotelRange: faq ? faq.hotel_price_eur_range_per_night : null,
    visaNote: faq ? (lang === 'en' ? faq.visa_note_en : faq.visa_note_sr) : null,
    attractions: faq && faq.attractions
      ? faq.attractions.map(a => (lang === 'en' ? a.name_en : a.name_sr))
      : [],
    touristTypes: geo ? geo.types : [],
  };
}
