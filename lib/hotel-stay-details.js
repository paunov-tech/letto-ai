// Normalize hotel rate scope without inventing conditions that a provider did
// not state. Every field is either source-confirmed or left `unknown` so the
// UI can say "confirm at partner" rather than implying a refundable room.

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function firstText(values) {
  for (const value of values) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return null;
}

function itemLabel(item) {
  if (typeof item === 'string') return text(item);
  if (!item || typeof item !== 'object') return '';
  return firstText([item.name, item.title, item.label, item.text, item.value, item.description]) || '';
}

function labels(value) {
  if (!Array.isArray(value)) return [];
  return value.map(itemLabel).filter(Boolean);
}

function includesAny(haystack, patterns) {
  const value = String(haystack || '').toLowerCase();
  return patterns.some(pattern => value.includes(pattern));
}

function rateText(property = {}) {
  const price = property.price || {};
  const summary = price.priceSummary || {};
  const display = Array.isArray(summary.displayPrices)
    ? summary.displayPrices.map(item => [item?.price?.formatted, item?.value, item?.description].filter(Boolean).join(' '))
    : [];
  return [
    ...labels(property.messages), ...labels(property.rateMessages),
    text(property.cancellationPolicy), text(property.cancellation), text(property.mealPlan),
    text(property.roomName), text(property.roomType), text(property.rateName),
    text(summary.definition?.displayPrice), text(summary.definition?.title), ...display
  ].filter(Boolean).join(' · ');
}

export function extractAmenities(detail = {}) {
  const summary = detail.summary || detail.data?.summary || {};
  const buckets = [
    detail.amenities, detail.hotelFacilities, detail.facilities,
    detail.data?.amenities, detail.data?.hotelFacilities, detail.data?.facilities,
    summary.amenities, summary.hotelFacilities, summary.facilities
  ];
  return [...new Set(buckets.flatMap(labels))].slice(0, 8);
}

export function normalizeStayDetails(property = {}, detail = {}) {
  const allText = rateText(property);
  const breakfast = property.breakfastIncluded === true || property.hotel_include_breakfast === true ||
    includesAny(allText, ['breakfast included', 'doručak uključen']);
  const freeCancellation = property.freeCancellation === true || property.refundable === true ||
    includesAny(allText, ['free cancellation', 'free cancel', 'besplatno otkazivanje']);
  const nonRefundable = property.refundable === false || property.nonRefundable === true ||
    includesAny(allText, ['non-refundable', 'non refundable', 'nonrefundable', 'nepovrat']);
  const taxesIncluded = property.taxesIncluded === true || property.includesTaxesAndFees === true ||
    includesAny(allText, ['taxes and fees included', 'includes taxes', 'porezi i naknade uključeni']);
  const taxesExcluded = property.taxesIncluded === false || property.includesTaxesAndFees === false ||
    includesAny(allText, ['taxes and fees excluded', 'taxes not included', 'porezi nisu uključeni']);
  return {
    roomType: firstText([property.roomType, property.roomName, property.rateName, property.room?.name]),
    mealPlan: breakfast ? 'breakfast_included' : 'unknown',
    cancellation: freeCancellation ? 'free_cancellation' : (nonRefundable ? 'non_refundable' : 'unknown'),
    taxes: taxesIncluded ? 'included' : (taxesExcluded ? 'excluded' : 'unknown'),
    amenities: extractAmenities(detail),
    verified: {
      roomType: Boolean(firstText([property.roomType, property.roomName, property.rateName, property.room?.name])),
      mealPlan: breakfast,
      cancellation: freeCancellation || nonRefundable,
      taxes: taxesIncluded || taxesExcluded,
      amenities: extractAmenities(detail).length > 0
    }
  };
}

export function mergeStayDetails(base = {}, enrichment = {}) {
  const choose = (field, fallback = 'unknown') => enrichment?.verified?.[field]
    ? enrichment[field] : (base[field] || fallback);
  const amenities = enrichment?.amenities?.length ? enrichment.amenities : (base.amenities || []);
  return {
    roomType: choose('roomType', null),
    mealPlan: choose('mealPlan'),
    cancellation: choose('cancellation'),
    taxes: choose('taxes'),
    amenities,
    verified: {
      roomType: Boolean(enrichment?.verified?.roomType || base?.verified?.roomType),
      mealPlan: Boolean(enrichment?.verified?.mealPlan || base?.verified?.mealPlan),
      cancellation: Boolean(enrichment?.verified?.cancellation || base?.verified?.cancellation),
      taxes: Boolean(enrichment?.verified?.taxes || base?.verified?.taxes),
      amenities: amenities.length > 0
    }
  };
}
