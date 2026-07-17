// Public property-page metadata augments amenities only. Booking conditions
// depend on the chosen room/rate, so this module deliberately never upgrades
// cancellation, breakfast, or tax scope from generic page marketing copy.

function readJsonLd(html) {
  const scripts = String(html || '').matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const values = [];
  for (const match of scripts) {
    try { values.push(JSON.parse(match[1].trim())); } catch (_) {}
  }
  return values;
}

function label(value) {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  return String(value.name || value.label || value.title || value.value || '').trim();
}

function amenityValues(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (item && typeof item === 'object' && item.value === false) return [];
    const itemLabel = label(item);
    return itemLabel ? [itemLabel] : [];
  });
}

function walk(value, found = []) {
  if (Array.isArray(value)) {
    value.forEach(item => walk(item, found));
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  for (const [key, child] of Object.entries(value)) {
    if (['amenityFeature', 'amenities', 'hotelAmenities'].includes(key)) {
      found.push(...amenityValues(child));
    }
    walk(child, found);
  }
  return found;
}

export function extractPropertyPageAmenities(html) {
  return [...new Set(readJsonLd(html).flatMap(item => walk(item)))].slice(0, 8);
}

export function propertyPageStayDetails(html) {
  const amenities = extractPropertyPageAmenities(html);
  return {
    amenities,
    source: amenities.length ? 'property_page_structured_data' : 'unavailable',
    scope: 'property_only'
  };
}
