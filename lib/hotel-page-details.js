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

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:x27|39);/gi, "'")
    .replace(/&nbsp;/gi, ' ');
}

function textContent(value) {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Booking.com renders a property-specific, human-visible "Most popular
// amenities" list in the server HTML. It is safe to use because it is a
// property attribute (not a room/rate term); extracting the nearby <li>s
// avoids treating review prose or generic page navigation as amenities.
function bookingPopularAmenities(html) {
  const source = String(html || '');
  const heading = source.search(/Most\s+popular\s+amenities/i);
  if (heading < 0) return [];
  const nearby = source.slice(heading, heading + 24_000);
  const list = nearby.match(/<ul\b[^>]*>([\s\S]*?)<\/ul>/i)?.[1] || '';
  const values = [...list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map(match => textContent(match[1]))
    .filter(value => value && value.length <= 120);
  return [...new Set(values)].slice(0, 8);
}

export function extractPropertyPageAmenities(html) {
  const structured = readJsonLd(html).flatMap(item => walk(item));
  return [...new Set([...structured, ...bookingPopularAmenities(html)])].slice(0, 8);
}

export function propertyPageStayDetails(html) {
  const amenities = extractPropertyPageAmenities(html);
  return {
    amenities,
    source: amenities.length ? 'property_page_amenities' : 'unavailable',
    scope: 'property_only'
  };
}
