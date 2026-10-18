// The gauge block of a snapshot page: the 75–100 ring gauge with everyone's scores fanned out
// around it as dots, one dot per driver, in the colour of the tier each score lands in. This file
// holds the geometry (where the ring, the columns of dots and the labels go); html.ts draws it.
//
// The ring sweeps 270 degrees, from lower left (75) over the top to lower right (100), so each
// dot sits straight out from the part of the band its own tier colours. Dots are binned by whole
// point and stacked outward from the ring in rank order: rank 1 nearest the ring. A column that
// would run off the card first tightens its step, then splits into two or three lanes.

import type { FleetStrip, SnapshotCutOffs, SnapshotTier } from '@loadout/performance';
import { tierForScore } from '@loadout/performance';

/** The fixed measurements of the gauge, in CSS pixels of the 360 px wide page. */
export const GAUGE = {
  width: 360,
  cx: 180,
  /** The ring's centre line radius and the band's thickness. */
  r: 80,
  band: 24,
  lo: 75,
  hi: 100,
  /** The band sweeps 270 degrees clockwise from 135 degrees (lower left) to 45 degrees. */
  sweep: 1.5 * Math.PI,
  start: Math.PI - (1.5 * Math.PI - Math.PI) / 2,
  /** Dot radius, the first dot's distance from the centre, and the spacing between dots. */
  dot: 3,
  meDot: 4.5,
  r0: 80 + 12 + 10,
  step: 7.2,
  stepMin: 2 * 3 + 0.6,
  lane: 3.4,
  /** Dots and labels keep this far from the card's left and right edges. */
  edge: 6,
  /** The medal (104 px, so a 52 px radius) sits above: its bottom is 40 px below the top. */
  medal: { r: 52, bottom: 40, clear: 6, noteHalfWidth: 125 },
  /** Dots never go further down than this below the centre, so the card cannot grow forever. */
  maxDrop: 190,
} as const;

/** The page's medal note (page 2's "by 7-week average score") and so where the gauge sits. */
export interface GaugeTop {
  /** The height of the text under the medal, 0 when there is none. */
  noteHeight: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The ring's centre: lower when a note under the medal takes room at the top. */
export function gaugeCentre(top: GaugeTop): Point {
  return { x: GAUGE.cx, y: 190 + top.noteHeight };
}

/** The angle (radians, clockwise, y down) a score sits at on the band, 75 and 100 at the ends. */
export function angleFor(score: number): number {
  const s = Math.max(GAUGE.lo, Math.min(GAUGE.hi, score));
  return GAUGE.start + ((s - GAUGE.lo) / (GAUGE.hi - GAUGE.lo)) * GAUGE.sweep;
}

/** The whole-point bin a score falls in: 100 shares the 99 bin, anything under 75 the 75 bin. */
export function binFor(score: number): number {
  return Math.max(GAUGE.lo, Math.min(GAUGE.hi - 1, Math.floor(score)));
}

export const direction = (angle: number): Point => ({ x: Math.cos(angle), y: Math.sin(angle) });

/** A point at `radius` from the centre along `angle`, shifted `across` sideways (clockwise). */
export function at(centre: Point, angle: number, radius: number, across = 0): Point {
  const u = direction(angle);
  return {
    x: centre.x + u.x * radius - u.y * across,
    y: centre.y + u.y * radius + u.x * across,
  };
}

export interface FleetDot {
  /** The driver's place in the strip (rank order, best first). */
  index: number;
  bin: number;
  tier: SnapshotTier;
  me: boolean;
  x: number;
  y: number;
  r: number;
  /** How far the dot's centre is from the ring's centre. */
  radius: number;
}

export interface FleetColumn {
  bin: number;
  angle: number;
  count: number;
  lanes: number;
  step: number;
  /** How far the outer edge of the column's outermost dot is from the ring's centre. */
  reach: number;
}

export interface FleetLayout {
  dots: FleetDot[];
  columns: Map<number, FleetColumn>;
}

/** The blocks a dot may not touch: the card's edges, the medal above, the note under it. */
function blocked(p: Point, radius: number, centre: Point, top: GaugeTop): boolean {
  const m = GAUGE.medal;
  if (p.x - radius < GAUGE.edge || p.x + radius > GAUGE.width - GAUGE.edge) return true;
  if (p.y - radius < 2 || p.y + radius > centre.y + GAUGE.maxDrop) return true;
  const medalCy = m.bottom - m.r;
  const dx = p.x - GAUGE.cx;
  const dy = p.y - medalCy;
  if (Math.hypot(dx, dy) < m.r + m.clear + radius) return true;
  if (
    top.noteHeight > 0 &&
    Math.abs(dx) < m.noteHalfWidth + m.clear + radius &&
    p.y - radius < m.bottom + top.noteHeight + m.clear
  ) {
    return true;
  }
  return false;
}

/** How far out a dot can go along a column's ray before it hits something. */
function reachAlong(angle: number, centre: Point, top: GaugeTop): number {
  let r = GAUGE.r0;
  while (r < 420 && !blocked(at(centre, angle, r + 1), GAUGE.dot, centre, top)) r += 1;
  return r;
}

const LANE_OFFSETS: Record<number, number[]> = {
  1: [0],
  2: [-GAUGE.lane, GAUGE.lane],
  3: [-2 * GAUGE.lane, 0, 2 * GAUGE.lane],
};

/**
 * Where every driver's dot goes. Scores are binned by whole point; within a bin the strip's own
 * order (rank order) is kept, rank 1 nearest the ring. The driver's own dot is bigger.
 */
export function layoutFleetDots(
  strip: FleetStrip,
  cutOffs: SnapshotCutOffs,
  top: GaugeTop,
): FleetLayout {
  const centre = gaugeCentre(top);
  const byBin = new Map<number, number[]>();
  strip.scores.forEach((score, index) => {
    const bin = binFor(score);
    const list = byBin.get(bin);
    if (list) list.push(index);
    else byBin.set(bin, [index]);
  });
  const dots: FleetDot[] = [];
  const columns = new Map<number, FleetColumn>();
  for (const [bin, indexes] of byBin) {
    const angle = angleFor(bin + 0.5);
    const available = reachAlong(angle, centre, top) - GAUGE.r0;
    const n = indexes.length;
    let lanes = 1;
    let step: number = GAUGE.step;
    for (lanes = 1; lanes <= 3; lanes++) {
      const perLane = Math.ceil(n / lanes);
      if (perLane === 1) break;
      const fit = available / (perLane - 1);
      if (fit >= GAUGE.step) break;
      if (fit >= GAUGE.stepMin || lanes === 3) {
        step = Math.max(1, fit);
        break;
      }
    }
    const offsets = LANE_OFFSETS[lanes] as number[];
    let reach = 0;
    indexes.forEach((index, i) => {
      const me = index === strip.meIndex;
      const radius = GAUGE.r0 + Math.floor(i / lanes) * step;
      const p = at(centre, angle, radius, offsets[i % lanes] as number);
      const r = me ? GAUGE.meDot : GAUGE.dot;
      const score = strip.scores[index] as number;
      dots.push({ index, bin, tier: tierForScore(score, cutOffs), me, x: p.x, y: p.y, r, radius });
      reach = Math.max(reach, radius + r);
    });
    columns.set(bin, { bin, angle, count: n, lanes, step, reach });
  }
  dots.sort((a, b) => a.index - b.index);
  return { dots, columns };
}
