const DAY = 86400000;

function parseIso(value) {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
}

function iso(time) {
  return new Date(time).toISOString().slice(0, 10);
}

function addDays(value, days) {
  const time = parseIso(value);
  return time === null ? null : iso(time + days * DAY);
}

export function buildFlexibleDateMatrix({
  from, to, enabled = true, maxWindows = 5, today = new Date()
}) {
  const start = parseIso(from);
  const end = parseIso(to);
  if (start === null || end === null || end <= start) return [];
  const nights = Math.round((end - start) / DAY);
  const minDeparture = Date.UTC(
    today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()
  );
  const candidates = [
    { from, to, kind: 'exact', shiftDays: 0, nights },
    { from: addDays(from, -3), to: addDays(to, -3), kind: 'shift_earlier', shiftDays: -3, nights },
    { from: addDays(from, 3), to: addDays(to, 3), kind: 'shift_later', shiftDays: 3, nights },
    { from, to: addDays(to, -2), kind: 'shorter_stay', shiftDays: 0, nights: nights - 2 },
    { from, to: addDays(to, 2), kind: 'longer_stay', shiftDays: 0, nights: nights + 2 }
  ];
  const seen = new Set();
  return candidates.filter((window, index) => {
    if (!enabled && index > 0) return false;
    if (window.nights < 2 || window.nights > 21) return false;
    if (parseIso(window.from) < minDeparture) return false;
    const key = `${window.from}|${window.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, Math.max(1, Math.min(5, maxWindows)));
}

function dateDistance(flight, requested) {
  const departure = Math.abs(parseIso(flight.depart) - parseIso(requested.from)) / DAY;
  const returning = Math.abs(parseIso(flight.ret) - parseIso(requested.to)) / DAY;
  return departure + returning;
}

export function selectDateDiverseFlights(flights, requested, limit = 5) {
  const sorted = [...(flights || [])].sort((left, right) =>
    Number(left.originAlternative) - Number(right.originAlternative) ||
    dateDistance(left, requested) - dateDistance(right, requested) ||
    Number(left.totalPrice || Infinity) - Number(right.totalPrice || Infinity)
  );
  const selected = [];
  const datePairs = new Set();
  for (const flight of sorted) {
    const key = `${flight.origin}|${flight.depart}|${flight.ret}`;
    if (datePairs.has(key)) continue;
    datePairs.add(key);
    selected.push(flight);
    if (selected.length >= limit) break;
  }
  return selected;
}
