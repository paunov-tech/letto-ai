// scrapers/sources/pegasus.mjs — Pegasus Airlines flight tickets via Smartproxy API.

import { scrape, bumpQuotaCounter } from '../lib/smartproxy.mjs';

export async function scrapePegasus({ origin, destination, jsRender = false }) {
  const url = `https://www.flypgs.com/en/flight-tickets/${origin.toLowerCase()}-${destination.toLowerCase()}`;
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
  // Pegasus often embeds price calendar JSON
  const calRe = /"date":"(\d{4}-\d{2}-\d{2})"[^}]*?"price":(\d+(?:\.\d+)?)/g;
  let m;
  while ((m = calRe.exec(html)) !== null && rows.length < 60) {
    rows.push({ rawDate: m[1], price: parseFloat(m[2]) });
  }
  // Fallback DOM regex
  if (rows.length === 0) {
    const cardRe = /<[^>]*(?:flight|ticket|fare)[^>]*>([\s\S]{0,400}?)<\/[^>]+>/gi;
    while ((m = cardRe.exec(html)) !== null && rows.length < 60) {
      const txt = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const dm = txt.match(/(\d{4}-\d{2}-\d{2})|(\d{2}\.\d{2}\.\d{4})|(\d{1,2}\s+[A-Za-z]{3,9})/);
      const pm = txt.match(/(?:€|EUR|TRY)\s?(\d{2,5}(?:[.,]\d{1,2})?)/i);
      if (dm && pm) rows.push({ rawDate: dm[0], price: parseFloat(pm[1].replace(',', '.')) });
    }
  }
  return rows;
}

function normalizeDate(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dot = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (dot) return `${dot[3]}-${dot[2]}-${dot[1]}`;
  const d = new Date(s + ' ' + new Date().getFullYear());
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}
