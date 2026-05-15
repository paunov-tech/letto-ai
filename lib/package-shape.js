// lib/package-shape.js
// Two-tier response shaping for /api/packages.
//
// scrubToPreview(pkg)    — mask paid-only fields (hotel.name, exact dates,
//                          flight.bookingUrl, exact prices, etc.) and emit
//                          computed labels for free-tier card render.
// passThroughFull(pkg)   — preserve full shape and add the same labels so
//                          frontend can render one card component regardless
//                          of tier (full polja just go alongside labels).
//
// Both return shape sa `locked: true|false` flag-om za frontend da odluči
// da li renderuje "Pogledaj punu ponudu" CTA ili direktnu booking dugmad.

// Genitive forms — "Krajem / Početkom / Sredinom" govern genitive case in
// Serbian, so "krajem jun" is ungrammatical; correct is "krajem juna".
const MONTHS_SR_GEN = ['januara','februara','marta','aprila','maja','juna','jula','avgusta','septembra','oktobra','novembra','decembra'];

function buildDateLabel(dates) {
  if (!dates?.departure) return null;
  const d = new Date(dates.departure);
  if (isNaN(d.getTime())) return null;
  const day = d.getDate();
  const period = day <= 10 ? 'Početkom' : day <= 20 ? 'Sredinom' : 'Krajem';
  const month = MONTHS_SR_GEN[d.getMonth()];
  const year = d.getFullYear();
  const nights = dates.nights || 0;
  return `${period} ${month} ${year} · ${nights} noći`;
}

// Strip € / EUR / $ amounts from free-text reasoning so the preview tier
// can't infer exact prices from Claude's narrative. Ratios/percentages
// stay (they're marketing-public) — only absolute monetary values redact.
function sanitizeReasoning(text) {
  if (!text || typeof text !== 'string') return null;
  return text
    .replace(/€\s*\d+(?:[.,]\d+)?/g, '€—')
    .replace(/\b\d+(?:[.,]\d+)?\s*€/g, '€—')
    .replace(/\bEUR\s*\d+(?:[.,]\d+)?\b/gi, 'EUR —')
    .replace(/\b\d+(?:[.,]\d+)?\s*EUR\b/gi, '— EUR')
    .replace(/\$\s*\d+(?:[.,]\d+)?/g, '$—')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPriceLabel(pricing) {
  if (!pricing?.total) return null;
  return `od €${Math.floor(pricing.total)}`;
}

function buildHotelLabel(hotel) {
  if (!hotel?.rating) return null;
  const stars = '★'.repeat(hotel.rating);
  if (hotel.reviewScore >= 9.0) return `${stars} premium`;
  if (hotel.reviewScore >= 8.0) return `${stars} odličan`;
  if (hotel.reviewScore >= 7.0) return `${stars} dobar`;
  return stars;
}

function buildFlightLabel(flight) {
  if (!flight) return null;
  const stops = flight.stops === 0
    ? 'direktan let'
    : `${flight.stops} ${flight.stops === 1 ? 'presedanje' : 'presedanja'}`;
  const hours = flight.duration?.match(/(\d+)h/)?.[1];
  return hours ? `${stops} · ~${hours}h` : stops;
}

function buildSavingsLabel(deal) {
  if (!deal?.flightDealRatio || deal.flightDealRatio >= 1) return null;
  const pct = Math.round((1 - deal.flightDealRatio) * 100);
  return pct > 0 ? `${pct}% jeftiniji let` : null;
}

function buildPreviewLabels(pkg) {
  return {
    dateLabel: buildDateLabel(pkg.dates),
    priceLabel: buildPriceLabel(pkg.pricing),
    hotelLabel: buildHotelLabel(pkg.hotel),
    flightLabel: buildFlightLabel(pkg.flight),
    savingsLabel: buildSavingsLabel(pkg.deal),
  };
}

export function scrubToPreview(pkg) {
  if (!pkg) return pkg;
  return {
    id: pkg.id,
    origin: { city: pkg.origin?.city },
    destination: { city: pkg.destination?.city, country: pkg.destination?.country },
    category: pkg.category,
    transport: pkg.transport,
    status: pkg.status,
    tier: pkg.tier,
    imageUrl: pkg.imageUrl,
    imageCredit: pkg.imageCredit,
    copy: pkg.copy,
    blurbs: pkg.blurbs,
    dates: { nights: pkg.dates?.nights },
    hotel: {
      rating: pkg.hotel?.rating,
      reviewScore: pkg.hotel?.reviewScore,
      reviewCount: pkg.hotel?.reviewCount,
      photo: pkg.hotel?.photo,
    },
    flight: { stops: pkg.flight?.stops, duration: pkg.flight?.duration },
    // Keep the ratio (marketing-public), drop the absolute € amount.
    deal: pkg.deal ? { flightDealRatio: pkg.deal.flightDealRatio } : null,
    metadata: {
      claudeRating: pkg.metadata?.claudeRating,
      claudeReasoning: sanitizeReasoning(pkg.metadata?.claudeReasoning),
      source: pkg.metadata?.source,
    },
    preview: buildPreviewLabels(pkg),
    locked: true,
  };
}

export function passThroughFull(pkg) {
  if (!pkg) return pkg;
  return { ...pkg, preview: buildPreviewLabels(pkg), locked: false };
}

// Test/inspection helper · pure side-effect-free
export const __test__ = { buildDateLabel, buildPriceLabel, buildHotelLabel, buildFlightLabel, buildSavingsLabel, sanitizeReasoning };
