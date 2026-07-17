import { itineraryContract } from './itinerary-contract.js';

const DAY = 86400000;
export const RANKING_PREFERENCES = new Set(['balanced', 'budget', 'fastest', 'direct', 'hotel', 'dates']);

export function normalizeRankingPreference(value) {
  const preference = String(value || '').trim().toLowerCase();
  return RANKING_PREFERENCES.has(preference) ? preference : 'balanced';
}

function dateDelta(a, b) {
  if (!a || !b) return null;
  const left = Date.parse(`${a}T00:00:00Z`);
  const right = Date.parse(`${b}T00:00:00Z`);
  return Number.isFinite(left) && Number.isFinite(right)
    ? Math.round(Math.abs(left - right) / DAY)
    : null;
}

function signedDateDelta(actual, requested) {
  if (!actual || !requested) return null;
  const left = Date.parse(`${actual}T00:00:00Z`);
  const right = Date.parse(`${requested}T00:00:00Z`);
  return Number.isFinite(left) && Number.isFinite(right)
    ? Math.round((left - right) / DAY)
    : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function durationMinutes(value) {
  if (Number.isFinite(Number(value)) && Number(value) > 0) return Number(value);
  const text = String(value || '').toLowerCase();
  const hours = Number(text.match(/(\d+(?:[.,]\d+)?)\s*h/)?.[1]?.replace(',', '.')) || 0;
  const minutes = Number(text.match(/(\d+)\s*m/)?.[1]) || 0;
  const total = Math.round(hours * 60 + minutes);
  return total > 0 ? total : null;
}

export function rankItineraries(packages, requested = {}, limit = 6) {
  const preference = normalizeRankingPreference(requested.preference);
  const complete = (packages || []).map(pkg => ({
    pkg,
    contract: itineraryContract(pkg)
  })).filter(item => item.contract.complete);

  if (!complete.length) return [];

  const prices = complete.map(({ pkg }) => Number(pkg?.pricing?.total) || (
    Number(pkg?.flight?.totalPrice) + Number(pkg?.hotel?.totalWithTaxes || pkg?.hotel?.totalPrice)
  )).filter(Number.isFinite);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const spread = Math.max(1, maxPrice - minPrice);
  const durations = complete.map(({ pkg }) => durationMinutes(pkg?.flight?.duration)).filter(Number.isFinite);
  const fastest = durations.length ? Math.min(...durations) : null;
  const slowest = durations.length ? Math.max(...durations) : null;
  const durationSpread = fastest !== null && slowest !== null ? Math.max(1, slowest - fastest) : null;

  return complete.map(({ pkg, contract }) => {
    const departureDelta = dateDelta(pkg?.dates?.departure, requested.from);
    const returnDelta = dateDelta(pkg?.dates?.return, requested.to);
    const delta = [departureDelta, returnDelta].filter(Number.isFinite);
    const meanDelta = delta.length ? delta.reduce((sum, value) => sum + value, 0) / delta.length : 30;
    const dateScore = clamp(100 - meanDelta * 2.5, 0, 100);
    const total = Number(pkg?.pricing?.total) || (
      Number(pkg?.flight?.totalPrice) + Number(pkg?.hotel?.totalWithTaxes || pkg?.hotel?.totalPrice)
    );
    const priceScore = 100 - ((total - minPrice) / spread) * 55;
    const review = Number(pkg?.hotel?.reviewScore || pkg?.hotel?.rating || 0);
    const hotelScore = clamp(review <= 5 ? review * 20 : review * 10, 45, 100);
    const stops = Number(pkg?.flight?.stops || 0);
    const routeScore = clamp(100 - stops * 15, 55, 100);
    const verificationScore = contract.level === 'segment_confirmed' ? 100 : 78;
    const accessDistanceKm = Number(pkg?.origin?.accessDistanceKm || pkg?.flight?.accessDistanceKm || 0);
    const originPenalty = clamp(accessDistanceKm / 30, 0, 15);
    const selfTransferPenalty = pkg?.flight?.selfTransfer?.required ? 12 : 0;
    const baseScore =
      dateScore * 0.35 +
      priceScore * 0.25 +
      hotelScore * 0.18 +
      routeScore * 0.12 +
      verificationScore * 0.10 -
      originPenalty -
      selfTransferPenalty;
    const duration = durationMinutes(pkg?.flight?.duration);
    const durationScore = duration !== null && fastest !== null && durationSpread !== null
      ? clamp(100 - ((duration - fastest) / durationSpread) * 55, 45, 100)
      : routeScore;
    const directScore = pkg?.flight?.selfTransfer?.required
      ? 20
      : clamp(100 - stops * 38, 20, 100);
    const priorityScore = preference === 'budget' ? priceScore
      : preference === 'fastest' ? durationScore
      : preference === 'direct' ? directScore
      : preference === 'hotel' ? hotelScore
      : preference === 'dates' ? dateScore
      : baseScore;
    // A chosen preference can visibly change order, but verification, exact
    // inventory and safety remain in the factual base score. This never
    // removes an eligible option or upgrades its provider verification.
    const score = Math.round(clamp(
      preference === 'balanced' ? baseScore : (baseScore * 0.55 + priorityScore * 0.45),
      0, 100
    ));
    const why = [];
    const exactDates = departureDelta === 0 && returnDelta === 0;
    const departureShiftDays = signedDateDelta(pkg?.dates?.departure, requested.from);
    const returnShiftDays = signedDateDelta(pkg?.dates?.return, requested.to);
    const requestedNights = signedDateDelta(requested.to, requested.from);
    const actualNights = Number(pkg?.dates?.nights);
    const nightsDifference = Number.isFinite(actualNights) && Number.isFinite(requestedNights)
      ? actualNights - requestedNights
      : null;
    if (exactDates) why.push('Datumi tačno odgovaraju pretrazi');
    else if (departureShiftDays === 0 && nightsDifference) {
      why.push(`${nightsDifference > 0 ? 'Duži' : 'Kraći'} boravak: ${actualNights} noći (${Math.abs(nightsDifference)} ${Math.abs(nightsDifference) === 1 ? 'noć' : 'noći'} razlike)`);
    } else if (departureShiftDays === returnShiftDays && departureShiftDays) {
      why.push(`Ceo termin ${Math.abs(departureShiftDays)} dana ${departureShiftDays > 0 ? 'kasnije' : 'ranije'}`);
    }
    else if (meanDelta <= 21) why.push(`Najbliži raspoloživ termin (±${Math.round(meanDelta)} dana)`);
    else why.push(`Alternativni termin (±${Math.round(meanDelta)} dana)`);
    if (pkg?.flight?.selfTransfer?.required) {
      const hub = pkg.flight.selfTransfer.hub;
      why.push(`Self-transfer preko ${hub}: 4 odvojene karte, bez zaštite konekcije`);
    }
    if (total <= minPrice * 1.1) why.push('Među najpovoljnijim kompletnim kombinacijama');
    if (review >= 8 || (review > 0 && review <= 5 && review >= 4)) why.push('Visoko ocenjen hotel');
    if (stops === 0) why.push('Direktan let');
    if (pkg?.origin?.alternative) {
      why.push(`Alternativni polazak: ${pkg.origin.code} (${accessDistanceKm} km od početnog aerodroma)`);
    }
    why.push(contract.level === 'segment_confirmed'
      ? 'Oba segmenta leta potvrđena'
      : 'Povratna pretraga i konkretan hotel potvrđeni');

    return {
      ...pkg,
      itinerary: contract,
      rank: 0,
      lettoScore: score,
      baseScore: Math.round(baseScore),
      personalization: {
        preference,
        priorityScore: Math.round(priorityScore),
        applied: preference !== 'balanced'
      },
      dateDeltaDays: Math.round(meanDelta),
      dateMatch: exactDates ? 'exact' : (meanDelta <= 21 ? 'near' : 'alternative'),
      dateFlex: {
        departureShiftDays,
        returnShiftDays,
        nightsDifference
      },
      why: why.slice(0, pkg?.origin?.alternative ? 4 : 3)
    };
  }).filter(item => item.dateDeltaDays <= 60).sort((a, b) =>
    b.lettoScore - a.lettoScore ||
    Number(a?.pricing?.total || Infinity) - Number(b?.pricing?.total || Infinity)
  ).slice(0, limit).map((item, index) => ({ ...item, rank: index + 1 }));
}
