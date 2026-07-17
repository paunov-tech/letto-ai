import { itineraryContract } from './itinerary-contract.js';

const DAY = 86400000;

function dateDelta(a, b) {
  if (!a || !b) return null;
  const left = Date.parse(`${a}T00:00:00Z`);
  const right = Date.parse(`${b}T00:00:00Z`);
  return Number.isFinite(left) && Number.isFinite(right)
    ? Math.round(Math.abs(left - right) / DAY)
    : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function rankItineraries(packages, requested = {}, limit = 6) {
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
    const score = Math.round(
      dateScore * 0.35 +
      priceScore * 0.25 +
      hotelScore * 0.18 +
      routeScore * 0.12 +
      verificationScore * 0.10
    );
    const why = [];
    if (meanDelta <= 3) why.push('Datumi odgovaraju pretrazi');
    else if (meanDelta <= 21) why.push(`Najbliži raspoloživ termin (±${Math.round(meanDelta)} dana)`);
    else why.push(`Alternativni termin (±${Math.round(meanDelta)} dana)`);
    if (total <= minPrice * 1.1) why.push('Među najpovoljnijim kompletnim kombinacijama');
    if (review >= 8 || (review > 0 && review <= 5 && review >= 4)) why.push('Visoko ocenjen hotel');
    if (stops === 0) why.push('Direktan let');
    why.push(contract.level === 'segment_confirmed'
      ? 'Oba segmenta leta potvrđena'
      : 'Povratna pretraga i konkretan hotel potvrđeni');

    return {
      ...pkg,
      itinerary: contract,
      rank: 0,
      lettoScore: score,
      dateDeltaDays: Math.round(meanDelta),
      dateMatch: meanDelta <= 3 ? 'exact' : (meanDelta <= 21 ? 'near' : 'alternative'),
      why: why.slice(0, 3)
    };
  }).sort((a, b) =>
    b.lettoScore - a.lettoScore ||
    Number(a?.pricing?.total || Infinity) - Number(b?.pricing?.total || Infinity)
  ).slice(0, limit).map((item, index) => ({ ...item, rank: index + 1 }));
}
