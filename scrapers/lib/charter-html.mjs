function decodeHtml(value = '') {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function text(value = '') {
  return decodeHtml(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function absoluteUrl(base, href) {
  if (!href) return null;
  try { return new URL(decodeHtml(href), base).toString(); } catch { return null; }
}

function parseAmount(value) {
  const raw = text(value).replace(/\s/g, '');
  if (!raw) return null;
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(raw)) {
    return Number(raw.replace(/\./g, '').replace(',', '.'));
  }
  return Number(raw.replace(',', '.')) || null;
}

function isoDate(value) {
  const match = String(value).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : null;
}

export function parseCharterCards(html, { baseUrl, limit = 80 } = {}) {
  const cards = [];
  const cardRe = /<li[^>]*ng-repeat="product in item\.Items"[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = cardRe.exec(html || '')) !== null && cards.length < limit) {
    const block = match[1];
    const nameMatch = block.match(/<div[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/div>/i);
    const hrefMatch = block.match(/<a[^>]*href="([^"]+)"/i);
    const currentPrice = block.match(/<span[^>]*class="price ng-binding"[^>]*>[\s\S]*?<span[^>]*class="price-number"[^>]*>([^<]+)<\/span>/i);
    const currencyMatch = block.match(/data-currency-code="([^"]+)"/i);
    const criteriaMatch = block.match(/<div[^>]*class="criteria[^>]*>([\s\S]*?)<\/div>/i);
    const countryMatch = block.match(/<span[^>]*class="country"[^>]*>([^<]*)<\/span>/i);
    const cityMatch = block.match(/<span[^>]*class="city"[^>]*>(?:\s*<span[^>]*>[^<]*<\/span>)?\s*([^<]+)/i);
    const boardMatch = block.match(/<div[^>]*class="board[^>]*>([\s\S]*?)<\/div>/i);
    const imageMatch = block.match(/(?:src|ng-src)="(https?:\/\/[^" ]+)"/i);
    const name = nameMatch ? text(nameMatch[1]) : null;
    const price = currentPrice ? parseAmount(currentPrice[1]) : null;
    if (!name || !price || !hrefMatch) continue;

    const criteria = criteriaMatch ? text(criteriaMatch[1]) : '';
    const nightsMatch = criteria.match(/(\d{1,2})\s*(?:noći|noc|nights?)/i);
    const board = boardMatch ? text(boardMatch[1]) : null;
    cards.push({
      title: name,
      destination: cityMatch ? text(cityMatch[1]).replace(/^\//, '').trim() : null,
      country: countryMatch ? text(countryMatch[1]) : null,
      price,
      currency: (currencyMatch?.[1] || 'EUR').toUpperCase(),
      outboundDate: isoDate(criteria),
      nights: nightsMatch ? Number(nightsMatch[1]) : null,
      hotelStars: (block.match(/class="fa fa-star"/g) || []).length || null,
      board,
      allInclusive: /all\s*inclusive|sve uključeno/i.test(board || ''),
      bookingUrl: absoluteUrl(baseUrl, hrefMatch[1]),
      image: imageMatch ? absoluteUrl(baseUrl, imageMatch[1]) : null,
      rawText: text(block).slice(0, 500),
    });
  }
  return cards;
}
