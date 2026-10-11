// Week-range trend math shared by the grid, the fleet view and the coaching rules.
// Ported from WeekMath.cs. "Consecutive" means next to each other in the ordered rows that
// exist (a missing week is simply absent, the same way the averages ignore it).

import type { TrendDirection } from './types';

export const IMPROVING: TrendDirection = 'Improving';
export const DECLINING: TrendDirection = 'Declining';
export const FLAT: TrendDirection = 'Flat';

/** Platinum 4, Gold 3, Silver 2, Bronze 1; anything else (blank, unknown) 0. */
export function tierRank(tier: string | null | undefined): number {
  switch (tier) {
    case 'Platinum':
      return 4;
    case 'Gold':
      return 3;
    case 'Silver':
      return 2;
    case 'Bronze':
      return 1;
    default:
      return 0;
  }
}

/**
 * Least-squares slope of the values against their position (0, 1, 2, ...). Null for fewer than
 * two values. Positive means rising across the range.
 */
export function slope(ys: readonly number[] | null | undefined): number | null {
  if (!ys || ys.length < 2) return null;
  const n = ys.length;
  const meanX = (n - 1) / 2.0;
  let sum = 0;
  for (const y of ys) sum += y;
  const meanY = sum / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    num += dx * ((ys[i] as number) - meanY);
    den += dx * dx;
  }
  return den === 0 ? null : num / den;
}

/**
 * Improving, Declining or Flat. Moves within `flatBand` score points a week either way read as
 * Flat, and so does a missing slope.
 */
export function classify(slopeValue: number | null | undefined, flatBand = 0.5): TrendDirection {
  if (slopeValue === null || slopeValue === undefined) return FLAT;
  if (slopeValue > flatBand) return IMPROVING;
  if (slopeValue < -flatBand) return DECLINING;
  return FLAT;
}

/** cur - prev, or null when either is missing. */
export function delta(
  prev: number | null | undefined,
  cur: number | null | undefined,
): number | null {
  return prev === null || prev === undefined || cur === null || cur === undefined
    ? null
    : cur - prev;
}

/** The old `WeekMath` class, for code that reads closer to the original. */
export const WeekMath = Object.freeze({
  Improving: IMPROVING,
  Declining: DECLINING,
  Flat: FLAT,
  tierRank,
  slope,
  classify,
  delta,
});
