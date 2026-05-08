// scrapers/sources/wizzair.mjs — Wizz Air timetable scraper via Smartproxy API.
// Returns array of { date, price, currency } pairs for given route.
// js_render: false works for raw HTML; flip to true if Wizz client-renders prices.

import { scrape, bumpQuotaCounter } from '../lib/smartproxy.mjs';

export async function scrapeWizzair({ origin, destination, jsRender = false }) {
  const url = `https://wizzair.com/en-gb/flights/timetable?departureStation=${origin}&arrivalStation=${destination}`;
  bumpQuotaCounter();
  const { html, status } = await scrape(url, { jsRender });
  if (!html || status >= 400) return [];

  const rows = extractRows(html);
  return rows.map(r => ({
    date: normalizeDate(r.rawDate),
    price: r.price,
    currency: 'EUR'
  })).filter(r => r.date && r.price);
}

function extractRows(html) {
  const rows = [];
  // Wizz timetable: rows with date label + price. Class names vary; use regex over snippets.
  // Match patterns like "15 Jun" / "2026-06-15" near a price like "€89" / "EUR 89".
  // First try structured JSON embedded in the page (Wizz uses Next.js / Apollo cache).
  const jsonMatches = html.match(/"flights":\s*\[[\s\S]{0,5000}?\]/g) || [];
  for (const blob of jsonMatches.slice(0, 3)) {
    const dateRe = /"departureDate":"(\d{4}-\d{2}-\d{2})"/g;
    const priceRe = /"basePrice":\{[^}]*"amount":(\d+(?:\.\d+)?)/g;
    let dm, pm;
    const dates = [];
    const prices = [];
    while ((dm = dateRe.exec(blob)) !== null) dates.push(dm[1]);
    while ((pm = priceRe.exec(blob)) !== null) prices.push(parseFloat(pm[1]));
    for (let i = 0; i < Math.min(dates.length, prices.length); i++) {
      rows.push({ rawDate: dates[i], price: prices[i] });
    }
  }
  // Fallback: HTML row regex
  if (rows.length === 0) {
    const rowRe = /<[^>]*timetable[^>]*>([\s\S]{0,400}?)<\/[^>]+>/gi;
    let m;
    while ((m = rowRe.exec(html)) !== null && rows.length < 60) {
      const txt = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const dm = txt.match(/(\d{4}-\d{2}-\d{2})|(\d{1,2}\s+[A-Za-z]{3,9})/);
      const pm = txt.match(/(?:€|EUR)\s?(\d{2,4}(?:[.,]\d{1,2})?)/i);
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
