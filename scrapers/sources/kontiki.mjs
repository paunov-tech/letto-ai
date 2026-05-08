// scrapers/sources/kontiki.mjs — Kontiki Travel (kontiki.rs) charter package scraper.
// Plain HTML scrape (no JS rendering needed). Returns array of charter packages.

const BASE = 'https://www.kontiki.rs';

export async function scrapeKontiki() {
  const url = `${BASE}/letovanje`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'sr-RS,sr;q=0.9,en;q=0.8'
    }
  });
  if (!r.ok) throw new Error('Kontiki HTTP ' + r.status);
  const html = await r.text();

  // Parse package cards. Selectors are best-effort; if Kontiki changes layout, this fails gracefully.
  const packages = [];

  // Match pattern: tile/card containing destination + dates + price + hotel name
  // Kontiki's HTML uses .ponuda-item or similar — adapt as needed
  const cardRe = /<(?:div|article)[^>]*class="[^"]*(?:ponuda|aranzman|paket|card|tile)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article)>/gi;
  let m;
  while ((m = cardRe.exec(html)) !== null && packages.length < 60) {
    const block = m[1];
    const pkg = parseCard(block);
    if (pkg) packages.push(pkg);
  }

  return packages;
}

function parseCard(html) {
  const stripTags = s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const txt = stripTags(html);

  const titleM = html.match(/<(?:h2|h3|h4)[^>]*>([\s\S]*?)<\/(?:h2|h3|h4)>/);
  const title = titleM ? stripTags(titleM[1]) : null;

  const priceM = txt.match(/(\d[\d.,]{1,7})\s*(?:€|EUR|RSD|din)/i);
  const price = priceM ? parseFloat(priceM[1].replace(/[.,](?=\d{3})/g, '').replace(',', '.')) : null;

  const datesM = txt.match(/(\d{1,2}\.\s?\d{1,2}\.(?:\s?\d{4})?)\s?[–\-]\s?(\d{1,2}\.\s?\d{1,2}\.\s?\d{2,4})/);
  const nightsM = txt.match(/(\d{1,2})\s?(?:noći|noc|nights?)/i);

  // Star rating
  const starsM = txt.match(/(\d)\s?(?:zvezdice|star|★|⭐)/i);
  const allInclusive = /all\s?inclusive|sve uključeno|ai\b/i.test(txt);

  // Booking URL
  const linkM = html.match(/<a[^>]*href="([^"]+)"/);
  const bookingUrl = linkM ? (linkM[1].startsWith('http') ? linkM[1] : `${BASE}${linkM[1]}`) : null;

  if (!title || !price) return null;

  return {
    title,
    rawText: txt.slice(0, 500),
    price,
    currency: priceM[0].includes('RSD') || priceM[0].includes('din') ? 'RSD' : 'EUR',
    outboundDate: datesM ? datesM[1] : null,
    returnDate: datesM ? datesM[2] : null,
    nights: nightsM ? parseInt(nightsM[1]) : null,
    hotelStars: starsM ? parseInt(starsM[1]) : null,
    allInclusive,
    bookingUrl
  };
}
