const IATA = /^[A-Z]{3}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const PREFERENCES = new Set(['balanced', 'budget', 'fastest', 'direct', 'hotel', 'dates']);

export function normalizePriceAlertSearch(value = {}) {
  const origin = String(value.origin || '').trim().toUpperCase();
  const dest = String(value.dest || '').trim().toUpperCase();
  const from = String(value.from || '').trim();
  const to = String(value.to || '').trim();
  const pax = Math.max(1, Math.min(7, Number(value.pax) || 2));
  const preference = String(value.preference || 'balanced').trim().toLowerCase();
  if (!IATA.test(origin) || !IATA.test(dest) || origin === dest ||
      !ISO.test(from) || !ISO.test(to) || from >= to) return null;
  return {
    origin, dest, from, to, pax,
    preference: PREFERENCES.has(preference) ? preference : 'balanced'
  };
}

export function normalizeTargetTotal(value) {
  if (value === '' || value === null || value === undefined) return null;
  const amount = Math.round(Number(value));
  return Number.isFinite(amount) && amount >= 50 && amount <= 20_000 ? amount : null;
}

export function bestAlertTotal(payload = {}) {
  const totals = (Array.isArray(payload.itineraries) ? payload.itineraries : [])
    .filter(item => item?.itinerary?.complete !== false)
    .map(item => Number(item?.pricing?.total))
    .filter(value => Number.isFinite(value) && value > 0);
  return totals.length ? Math.round(Math.min(...totals)) : null;
}

// A small relative + absolute threshold prevents a €1 provider fluctuation
// from producing email noise. Reaching a user-entered target is always useful.
export function evaluatePriceAlert({ previousTotal, currentTotal, targetTotal, targetReachedAt }) {
  const previous = Number(previousTotal);
  const current = Number(currentTotal);
  const target = normalizeTargetTotal(targetTotal);
  if (!Number.isFinite(current) || current <= 0) {
    return { notify: false, reason: 'no_price', drop: null };
  }
  if (target && current <= target && !targetReachedAt) {
    return { notify: true, reason: 'target_reached', drop: Number.isFinite(previous) ? Math.max(0, previous - current) : null };
  }
  if (!Number.isFinite(previous) || previous <= 0 || current >= previous) {
    return { notify: false, reason: 'not_lower', drop: Number.isFinite(previous) ? previous - current : null };
  }
  const drop = previous - current;
  const threshold = Math.max(10, Math.round(previous * 0.03));
  return { notify: drop >= threshold, reason: drop >= threshold ? 'meaningful_drop' : 'minor_drop', drop };
}
