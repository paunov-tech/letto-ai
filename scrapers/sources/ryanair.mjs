// scrapers/sources/ryanair.mjs — Ryanair cheap-flight-finder via Smartproxy API.

import { scrape, bumpQuotaCounter } from '../lib/smartproxy.mjs';

export async function scrapeRyanair({ origin, destination, jsRender = false }) {
  const url = `https://www.ryanair.com/gb/en/cheap-flight-finder?departureAirportIataCode=${origin}&arrivalAirportIataCode=${destination}`;
  bumpQuotaCounter();
  const { html, status } = await scrape(url, { jsRender });
  if (!html || status >= 400) return [];

  return extractRows(html).map(r => ({
    date: normalizeDate(r.rawDate),
    price: r.price,
    currency: 'EUR'
  })).filter(r => r.date && r.price);
}

function extractRows(html) {
  const rows = [];
  // Ryanair embeds flight data in __NEXT_DATA__ or apollo cache
  const nextData = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]+?)<\/script>/);
  if (nextData) {
    try {
      const json = JSON.parse(nextData[1]);
      const flat = JSON.stringify(json);
      const dateRe = /"departureDateTime":"(\d{4}-\d{2}-\d{2})/g;
      const priceRe = /"value":(\d+(?:\.\d+)?),"currency":"EUR"/g;
      let dm, pm;
      const dates = [], prices = [];
      while ((dm = dateRe.exec(flat)) !== null) dates.push(dm[1]);
      while ((pm = priceRe.exec(flat)) !== null) prices.push(parseFloat(pm[1]));
      for (let i = 0; i < Math.min(dates.length, prices.length); i++) {
        rows.push({ rawDate: dates[i], price: prices[i] });
      }
    } catch (e) { /* fallthrough */ }
  }
  // Fallback DOM regex
  if (rows.length === 0) {
    const cardRe = /<[^>]*flight[^>]*>([\s\S]{0,400}?)<\/[^>]+>/gi;
    let m;
    while ((m = cardRe.exec(html)) !== null && rows.length < 60) {
      const txt = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const dm = txt.match(/(\d{4}-\d{2}-\d{2})|(\d{1,2}\s+[A-Za-z]{3,9})/);
      const pm = txt.match(/(?:€|EUR|£)\s?(\d{2,4}(?:[.,]\d{1,2})?)/i);
      if (dm && pm) rows.push({ rawDate: dm[0], price: parseFloat(pm[1].replace(',', '.')) });
    }
  }
  return rows;
}

function normalizeDate(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s + ' ' + new Date().getFullYear());
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}
