export const SOURCE_ROUTES = {
  wizzair: [['BEG', 'BCN'], ['BEG', 'FCO'], ['BEG', 'AMS'], ['BEG', 'MLA'], ['BEG', 'LTN'], ['INI', 'BSL'], ['INI', 'DTM'], ['INI', 'FMM']],
  ryanair: [['INI', 'VIE'], ['INI', 'CFU'], ['INI', 'MLA'], ['INI', 'ARN']],
  pegasus: [['BEG', 'SAW']],
};

export function pairRoundTrips(outboundRows, returnRows, { minNights = 3, maxNights = 10, limit = 5 } = {}) {
  const outbound = validRows(outboundRows);
  const inbound = validRows(returnRows);
  const pairs = [];
  for (const out of outbound) {
    const outTs = Date.parse(out.date + 'T00:00:00Z');
    const candidates = inbound.filter(row => {
      const nights = Math.round((Date.parse(row.date + 'T00:00:00Z') - outTs) / 86400000);
      return nights >= minNights && nights <= maxNights && row.currency === out.currency;
    });
    if (!candidates.length) continue;
    const back = candidates.sort((a, b) => a.price - b.price)[0];
    pairs.push({ outbound: out, inbound: back,
      nights: Math.round((Date.parse(back.date + 'T00:00:00Z') - outTs) / 86400000),
      totalPrice: Math.round((out.price + back.price) * 100) / 100, currency: out.currency });
  }
  return pairs.sort((a, b) => a.totalPrice - b.totalPrice).slice(0, limit);
}

function validRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row?.date || '') && Number(row?.price) > 0 && row?.currency)
    .map(row => ({ date: row.date, price: Number(row.price), currency: String(row.currency).toUpperCase() }));
}

export function directBookingUrl(source, origin, destination) {
  if (source === 'wizzair') return `https://wizzair.com/en-gb/flights/timetable?departureStation=${origin}&arrivalStation=${destination}`;
  if (source === 'ryanair') return `https://www.ryanair.com/gb/en/cheap-flight-finder?departureAirportIataCode=${origin}&arrivalAirportIataCode=${destination}`;
  if (source === 'pegasus') return `https://www.flypgs.com/en/flight-tickets/${origin.toLowerCase()}-${destination.toLowerCase()}`;
  return null;
}

export function inventoryId(entry) {
  return [entry.source, entry.type, entry.origin, entry.destination, entry.outbound?.date || entry.outboundDate || '', entry.return?.date || entry.returnDate || '', entry.title || '']
    .join('_').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 220);
}
