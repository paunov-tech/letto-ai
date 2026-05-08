// scrapers/sources/bigblue.mjs — Big Blue Travel (bigbluetravel.rs) charter scraper.
// HTML parse, similar pattern to Kontiki.

const BASE = 'https://www.bigbluetravel.rs';

export async function scrapeBigBlue() {
  const r = await fetch(BASE, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'sr-RS,sr;q=0.9,en;q=0.8'
    }
  });
  if (!r.ok) throw new Error('BigBlue HTTP ' + r.status);
  const html = await r.text();

  const packages = [];
  const cardRe = /<(?:div|article)[^>]*class="[^"]*(?:offer|package|card|aranzman|destination)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article)>/gi;
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

  const nightsM = txt.match(/(\d{1,2})\s?(?:noći|noc|nights?|x noćenja)/i);
  const starsM = txt.match(/(\d)\s?(?:zvezdice|star|★|⭐)/i);
  const allInclusive = /all\s?inclusive|sve uključeno|ai\b/i.test(txt);

  const linkM = html.match(/<a[^>]*href="([^"]+)"/);
  const bookingUrl = linkM ? (linkM[1].startsWith('http') ? linkM[1] : `${BASE}${linkM[1]}`) : null;

  if (!title || !price) return null;

  return {
    title,
    rawText: txt.slice(0, 500),
    price,
    currency: priceM[0].includes('RSD') || priceM[0].includes('din') ? 'RSD' : 'EUR',
    nights: nightsM ? parseInt(nightsM[1]) : null,
    hotelStars: starsM ? parseInt(starsM[1]) : null,
    allInclusive,
    bookingUrl
  };
}
