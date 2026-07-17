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
    const accessDistanceKm = Number(pkg?.origin?.accessDistanceKm || pkg?.flight?.accessDistanceKm || 0);
    const originPenalty = clamp(accessDistanceKm / 30, 0, 15);
    const selfTransferPenalty = pkg?.flight?.selfTransfer?.required ? 12 : 0;
    const score = Math.round(
      dateScore * 0.35 +
      priceScore * 0.25 +
      hotelScore * 0.18 +
      routeScore * 0.12 +
      verificationScore * 0.10 -
      originPenalty -
      selfTransferPenalty
    );
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
