// Draws the two Weekly Snapshot pages as standalone HTML (inline styles and SVG, no scripts),
// phone width (360 px), from a SnapshotModel. The pages are the design chosen in the
// "DA Snapshot Co-Edit" artifact: navy with a ribbon in the driver's tier colour at the top, a
// medal ring with the rank, a 75–100 ring gauge filled in tier colours with everyone's scores
// fanned out around it as dots (./gauge.ts has the geometry), then the body sections (Page 1:
// "Try this next" and the points receipt; Page 2: "Needs Improvement", the score-by-week chart
// and the tier dot grid), and a boxed pointer to the PDF.
//
// The desktop app turns each page into a picture for the email (./render.ts) and shows the same
// HTML in the Reports tab's preview. Mail apps strip SVG, so the HTML itself never goes out.

import type {
  FleetStrip,
  Receipt,
  SnapshotCutOffs,
  SnapshotMetric,
  SnapshotModel,
  SnapshotTier,
} from '@loadout/performance';
import { tierForScore } from '@loadout/performance';
import type { ReportColours } from '../../../shared/performanceSettings';
import { esc } from '../report/format';
import {
  angleFor,
  at,
  binFor,
  GAUGE,
  gaugeCentre,
  layoutFleetDots,
  type GaugeTop,
  type Point,
} from './gauge';

/** The header photo, already read from disk: a data URL and its size in pixels. */
export interface SnapshotPhoto {
  dataUrl: string;
  width: number;
  height: number;
}

export interface SnapshotLook {
  colours: ReportColours;
  /** The DSP's header photo, or null for a plain navy page. */
  photo: SnapshotPhoto | null;
}

export type SnapshotPage = 1 | 2;

/** The page is drawn this wide (CSS pixels); the email shows the picture at the same width. */
export const SNAPSHOT_WIDTH = 360;

/** The design's photo rules: the top 22% is the name band, shown at its true shape. */
const PHOTO_BAND_PERCENT = 22;
const PHOTO_DIM = 0.6;

/** The body's side padding and the gap between the things in it (also in SNAPSHOT_CSS). */
const BODY_PAD = 14;
const BODY_GAP = 12;
/** The text under the medal on page 2 is this tall, so the gauge knows where it starts. */
const NOTE_HEIGHT = 24;
/** The gauge's top edge sits this far above the medal's bottom edge (its dots fan up beside it). */
const GAUGE_OVERLAP = GAUGE.medal.bottom;

/** The design's navy-and-amber theme, with the tier colours from the report colours. */
const THEME = {
  bg: '#0b2545',
  card: '#13315c',
  fg: '#eef4ff',
  muted: '#b7c7e3',
  line: '#2b4a7a',
  accent: '#ffb703',
  accentText: '#0b2545',
  ok: '#6fe3a1',
  /** The deeper colours the gauge arcs and the pill inside the gauge use. */
  arc: { Platinum: '#38c6ea', Gold: '#f2bd1b', Silver: '#93a4b8', Bronze: '#c4551a' },
  /** "Needs Improvement" red (the dot grid rows, the box border) and the receipt's lost rows. */
  red: '#d6342a',
  lostRed: '#b3261e',
};

const HEX = /^#[0-9A-Fa-f]{6}$/;
const safe = (value: string, fallback: string) => (HEX.test(value) ? value : fallback);

interface Tiers {
  fill: Record<SnapshotTier, string>;
  text: Record<SnapshotTier, string>;
}

function tierColours(c: ReportColours): Tiers {
  return {
    fill: {
      Platinum: safe(c.platinumBackground, '#81DBED'),
      Gold: safe(c.goldBackground, '#E9DE63'),
      Silver: safe(c.silverBackground, '#D1D1D1'),
      Bronze: safe(c.bronzeBackground, '#AA4918'),
    },
    text: {
      Platinum: safe(c.platinumForeground, '#000000'),
      Gold: safe(c.goldForeground, '#000000'),
      Silver: safe(c.silverForeground, '#000000'),
      Bronze: safe(c.bronzeForeground, '#FFFFFF'),
    },
  };
}

const arcText = (tier: SnapshotTier) => (tier === 'Bronze' ? '#fff' : '#111');

const P = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const score1 = (v: number) => v.toFixed(1);

export const SNAPSHOT_CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: ${THEME.bg}; }
body { width: ${SNAPSHOT_WIDTH}px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: ${SNAPSHOT_WIDTH}px; overflow: hidden; position: relative;
  background: ${THEME.bg}; color: ${THEME.fg}; font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 14px; line-height: 1.4; font-variant-numeric: tabular-nums; }
.page * { min-width: 0; }
.page + .page { border-top: 1px solid ${THEME.line}; }
.ribbon { background: ${THEME.accent}; color: ${THEME.accentText}; padding: 16px 16px 14px; text-align: center;
  font-weight: 800; line-height: 1.15; position: relative; z-index: 2; }
.body { position: relative; padding: ${BODY_PAD}px 16px 22px; display: flex; flex-direction: column; gap: ${BODY_GAP}px; min-height: 560px; }
.body > * { position: relative; z-index: 1; }
.ph-band, .ph-rest { position: absolute; left: 0; right: 0; z-index: 0; }
.body.photo .gauge svg text, .body.photo .eyebrow, .body.photo .center { text-shadow: 0 1px 2px rgba(0,0,0,.5); }
.center { text-align: center; }
.small { font-size: 12px; }
.muted { color: ${THEME.muted}; }
.eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: ${THEME.muted}; margin: 0; }
p { margin: 0; }
h2 { margin: 0; font-size: 15px; font-weight: 700; line-height: 1.15; }
.medal { width: 104px; height: 104px; border-radius: 50%; margin: 0 auto; border: 6px solid ${THEME.muted};
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
  font-size: 36px; font-weight: 800; line-height: 1; background: rgba(11,37,69,.4); }
.medal > span { line-height: 1; }
.medal > small { display: block; font-size: 11px; font-weight: 600; color: ${THEME.muted}; letter-spacing: 0.02em; line-height: 1; }
.note { margin-top: 4px; height: ${NOTE_HEIGHT - 4}px; line-height: ${NOTE_HEIGHT - 4}px; white-space: nowrap; }
.gauge { margin: 0 -16px; }
svg { display: block; width: 100%; height: auto; }
svg text { font-family: inherit; }
.chip { display: inline-block; border-radius: 999px; padding: 2px 9px; font-size: 12px; font-weight: 700; line-height: 1.4; white-space: nowrap; }
.chip.sm { font-size: 10.5px; padding: 1px 7px; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; flex: none; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 11px; color: ${THEME.muted}; }
.legend span { display: inline-flex; align-items: center; gap: 4px; }
.row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.rows { display: flex; flex-direction: column; gap: 6px; }
.sect { display: flex; flex-direction: column; gap: 10px; }
.receipt { font-family: "Cascadia Mono", Consolas, "Courier New", monospace; font-size: 12.5px; display: flex; flex-direction: column; gap: 2px; }
.receipt .row { border-radius: 6px; padding: 4px 6px; }
.tip { background: ${THEME.accent}; color: ${THEME.accentText}; border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; }
.tip .k { font-size: 12px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; opacity: .85; }
.tip .t { font-size: 16px; font-weight: 700; line-height: 1.3; }
.tip .p { font-size: 13px; font-weight: 600; opacity: .9; }
.focus { border-radius: 12px; overflow: hidden; border: 2px solid ${THEME.red}; background: ${THEME.bg}; }
.focus .h { background: ${THEME.red}; color: #fff; padding: 8px 14px; font-size: 12px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
.focus .item { padding: 10px 14px; border-top: 1px solid ${THEME.line}; display: flex; flex-direction: column; gap: 5px; }
.focus .item:first-of-type { border-top: 0; }
.focus .name { display: flex; align-items: center; gap: 8px; }
.focus ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 2px; }
.foot { margin-top: auto; padding: 12px 14px; border: 5px solid ${THEME.accent}; border-radius: 12px;
  background: #28373d; color: ${THEME.fg}; font-size: 13px; display: flex; flex-direction: column; gap: 3px; }
.foot .h { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 14px; }
.foot .badge { display: inline-flex; align-items: center; justify-content: center; flex: none; min-width: 34px; height: 22px; padding: 0 6px;
  border-radius: 6px; background: ${THEME.accent}; color: ${THEME.accentText}; font-size: 10.5px; font-weight: 800; letter-spacing: .06em; line-height: 1; }
.grid { display: flex; flex-direction: column; gap: 3px; position: relative; }
.grid .row { padding: 3px 0 3px 6px; margin: 0 0 0 -6px; border-radius: 6px; }
.grid .cells { display: flex; gap: 5px; }
.grid .cell { display: inline-flex; justify-content: center; align-items: center; flex: none; }
.wkcols { position: absolute; top: -2px; bottom: -2px; right: 0; display: flex; gap: 5px; pointer-events: none; }
.wkcols div { flex: 1; margin: 0 -1px; border: 1.5px solid rgba(255,255,255,.45); border-radius: 6px; }
`;

// ---- SVG parts -------------------------------------------------------------------------------

/** What the gauge block of one page shows. */
export interface GaugeBlock {
  score: number;
  tier: SnapshotTier | null;
  cutOffs: SnapshotCutOffs;
  /** Everyone's scores, best first, with the driver's own place among them. */
  strip: FleetStrip;
  /** Which page, so the ids inside the SVG stay unique in a document holding both pages. */
  page: SnapshotPage;
  top: GaugeTop;
  label: string;
}

const BAND_FONT = `Bahnschrift, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

/** A rough width of a line of text, enough to keep labels off each other and inside the card. */
const textWidth = (text: string, size: number, spacing = 0) =>
  text.length * size * 0.62 + Math.max(0, text.length - 1) * spacing;

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * The gauge block: a 75–100 ring gauge sweeping 270 degrees, filled in tier colours up to the
 * score with the tier names along the band, the score and a tier pill inside, and everyone's
 * score as a dot fanned out around the ring over its own tier (rank 1 nearest, "You" bigger with
 * a glow), the fleet average as a dashed ray. The SVG is as tall as what it draws.
 */
export function gaugeBlockSvg(block: GaugeBlock): string {
  const { r, band, lo, hi } = GAUGE;
  const c = gaugeCentre(block.top);
  const cx = c.x;
  const cy = c.y;
  const id = `g${block.page}`;
  const own = block.tier ? THEME.arc[block.tier] : THEME.muted;
  const tierColour = (score: number) => THEME.arc[tierForScore(score, block.cutOffs)];
  const half = band / 2;
  /** The lowest thing drawn so far: the band's own ends to start with. */
  let bottom = cy + (r + half) * Math.SQRT1_2 + 2;
  const low = (y: number) => {
    bottom = Math.max(bottom, y);
  };
  const pt = (angle: number, radius: number, across = 0) => at(c, angle, radius, across);
  const xy = (p: Point) => `x="${P(p.x)}" y="${P(p.y)}"`;
  const arcPath = (a0: number, a1: number, radius: number) => {
    const p0 = pt(a0, radius);
    const p1 = pt(a1, radius);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M${P(p0.x)} ${P(p0.y)} A${radius} ${radius} 0 ${large} 1 ${P(p1.x)} ${P(p1.y)}`;
  };
  const arc = (s0: number, s1: number, col: string, op = 1, cap = 'butt') =>
    s1 <= s0
      ? ''
      : `<path d="${arcPath(angleFor(s0), angleFor(s1), r)}" fill="none" stroke="${col}" stroke-width="${band}" opacity="${op}" stroke-linecap="${cap}"/>`;
  // A round tip only at the leading end: a butt segment plus a short round-capped arc whose cap
  // ends exactly at the score. `tip` is half the band's width in score points.
  const unit = (r * GAUGE.sweep) / (hi - lo);
  const tip = half / unit;
  const capped = (s0: number, s1: number, col: string) =>
    s1 - s0 > 3 * tip
      ? arc(s0, s1 - tip, col) + arc(s1 - 2 * tip, s1 - tip, col, 1, 'round')
      : arc(s0, s1, col);
  const cuts = block.cutOffs;
  const bands: Array<[number, number, SnapshotTier]> = (
    [
      [lo, cuts.silver, 'Bronze'],
      [cuts.silver, cuts.gold, 'Silver'],
      [cuts.gold, cuts.platinum, 'Gold'],
      [cuts.platinum, hi, 'Platinum'],
    ] as Array<[number, number, SnapshotTier]>
  ).map(([a, b, tier]) => [Math.max(lo, a), Math.min(hi, b), tier]);

  let defs = `<filter id="${id}-glow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="0.9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  let s = '';
  // The band, dimmed, then filled up to the score.
  for (const [a, b, tier] of bands) s += arc(a, b, THEME.arc[tier], 0.28);
  for (const [a, b, tier] of bands) {
    if (block.score <= a) continue;
    const end = Math.min(b, block.score);
    s += block.score < b ? capped(a, end, THEME.arc[tier]) : arc(a, end, THEME.arc[tier]);
  }
  // Dark separators across the band at the cut-offs, with the threshold numbers just inside.
  for (const v of [cuts.silver, cuts.gold, cuts.platinum]) {
    if (!(v > lo && v < hi)) continue;
    const p0 = pt(angleFor(v), r - half - 1);
    const p1 = pt(angleFor(v), r + half + 1);
    s += `<line x1="${P(p0.x)}" y1="${P(p0.y)}" x2="${P(p1.x)}" y2="${P(p1.y)}" stroke="${THEME.bg}" stroke-width="3"/>`;
    s += `<text ${xy(pt(angleFor(v), r - half - 9))} font-size="9" text-anchor="middle" dominant-baseline="central" fill="${THEME.muted}">${v}</text>`;
  }
  // The tier names along the band, centred on each segment; the driver's own tier glows white.
  for (const [a, b, tier] of bands) {
    if (b <= a) continue;
    const name = tier.toUpperCase();
    const room = (b - a) * unit - 12;
    let size = 9.5;
    if (textWidth(name, size, 0.6) > room) {
      size = Math.max(4.5, (room - (name.length - 1) * 0.6) / (name.length * 0.62));
    }
    defs += `<path id="${id}-${tier}" d="${arcPath(angleFor(a), angleFor(b), r)}" fill="none"/>`;
    const mine = tier === block.tier;
    const look = mine
      ? `font-weight="800" fill="#fff" filter="url(#${id}-glow)"`
      : `font-weight="700" fill="#000" opacity=".75"`;
    s += `<text font-size="${P(size)}" ${look} letter-spacing="0.6" dominant-baseline="central" font-family="${BAND_FONT}"><textPath href="#${id}-${tier}" startOffset="50%" text-anchor="middle">${name}</textPath></text>`;
  }
  // 75 and 100 just past the band's two ends, in the gap underneath.
  for (const [v, angle] of [
    [lo, GAUGE.start - 0.22],
    [hi, angleFor(hi) + 0.22],
  ] as Array<[number, number]>) {
    const p = pt(angle, r);
    s += `<text ${xy(p)} font-size="10" text-anchor="middle" dominant-baseline="central" fill="${THEME.muted}">${v}</text>`;
    low(p.y + 6);
  }
  // The score with a shadow in the tier colour, and the tier pill under it.
  const ny = cy - 12;
  const inside = score1(block.score);
  const scoreSize = inside.length > 4 ? 35 : 40;
  if (block.tier) {
    s += `<text x="${cx + 2}" y="${ny + 2}" font-size="${scoreSize}" font-weight="800" text-anchor="middle" fill="${own}">${esc(inside)}</text>`;
  }
  s += `<text x="${cx}" y="${ny}" font-size="${scoreSize}" font-weight="800" text-anchor="middle" fill="${THEME.fg}">${esc(inside)}</text>`;
  if (block.tier) {
    const w = block.tier.length * 7.2 + 18;
    s += `<rect x="${P(cx - w / 2)}" y="${ny + 6}" width="${P(w)}" height="19" rx="9.5" fill="${own}"/>`;
    s += `<text x="${cx}" y="${ny + 19.5}" font-size="12" font-weight="700" text-anchor="middle" fill="${arcText(block.tier)}">${block.tier}</text>`;
  }

  // Everyone's dots, with the fleet average's ray under them.
  const strip = block.strip;
  const layout = layoutFleetDots(strip, block.cutOffs, block.top);
  const medal = GAUGE.medal;
  const medalBox: Box = {
    x0: cx - (block.top.noteHeight > 0 ? medal.noteHalfWidth : medal.r) - 4,
    x1: cx + (block.top.noteHeight > 0 ? medal.noteHalfWidth : medal.r) + 4,
    y0: -1000,
    y1: medal.bottom + block.top.noteHeight + 4,
  };
  /** A label's x once pushed sideways off the medal, to whichever side it was nearer. */
  const aside = (x: number, halfWidth: number) =>
    x < cx ? medalBox.x0 - halfWidth : medalBox.x1 + halfWidth;
  const clampX = (
    x: number,
    halfWidth: number,
    min: number = GAUGE.edge,
    max: number = GAUGE.width - GAUGE.edge,
  ) => Math.max(min + halfWidth, Math.min(max - halfWidth, x));
  let avgBox: Box | null = null;
  if (strip.average !== null) {
    const avg = strip.average;
    const angle = angleFor(avg);
    const column = layout.columns.get(binFor(avg));
    const end = column ? column.reach + 4 : GAUGE.r0 + 24;
    const col = tierColour(avg);
    const p0 = pt(angle, GAUGE.r0 - 6);
    const p1 = pt(angle, end);
    s += `<line x1="${P(p0.x)}" y1="${P(p0.y)}" x2="${P(p1.x)}" y2="${P(p1.y)}" stroke="${col}" stroke-width="1.4" stroke-dasharray="3 3"/>`;
    const halfWidth = 28;
    const centre = pt(angle, end + 16);
    let x = clampX(centre.x, halfWidth, 30 - halfWidth, 330 + halfWidth);
    const y = Math.max(13, centre.y);
    let box: Box = { x0: x - halfWidth, x1: x + halfWidth, y0: y - 10, y1: y + 14 };
    if (overlaps(box, medalBox)) {
      x = clampX(aside(x, halfWidth), halfWidth);
      box = { ...box, x0: x - halfWidth, x1: x + halfWidth };
    }
    s += `<text x="${P(x)}" y="${P(y - 1)}" font-size="10.5" font-weight="600" text-anchor="middle" fill="${col}">Fleet Avg</text>`;
    s += `<text x="${P(x)}" y="${P(y + 11)}" font-size="11" font-weight="700" text-anchor="middle" fill="${col}">${score1(avg)}</text>`;
    avgBox = box;
    low(box.y1);
  }
  for (const d of layout.dots) {
    const col = THEME.arc[d.tier];
    if (d.me) {
      s += `<circle cx="${P(d.x)}" cy="${P(d.y)}" r="${P(d.r * 2.4)}" fill="${col}" opacity=".16"/>`;
      s += `<circle cx="${P(d.x)}" cy="${P(d.y)}" r="${P(d.r * 1.2)}" fill="${col}" opacity=".28"/>`;
    }
    s += `<circle cx="${P(d.x)}" cy="${P(d.y)}" r="${P(d.r)}" fill="${col}"/>`;
    low(d.y + d.r);
  }
  // "You" beside the driver's dot: past the column when it is short, else to its emptier side.
  const me = layout.dots.find((d) => d.me);
  if (me) {
    const column = layout.columns.get(me.bin)!;
    const halfWidth = 11;
    let p: Point;
    if (column.reach - GAUGE.r0 < 36) {
      p = pt(column.angle, column.reach + 9);
    } else {
      const count = (bin: number) => layout.columns.get(bin)?.count ?? 0;
      const up = count(me.bin + 1);
      const down = count(me.bin - 1);
      const plus = pt(column.angle, me.radius, 19);
      const minus = pt(column.angle, me.radius, -19);
      p =
        up < down
          ? plus
          : up > down
            ? minus
            : Math.abs(plus.x - cx) >= Math.abs(minus.x - cx)
              ? plus
              : minus;
    }
    let x = clampX(p.x, halfWidth);
    let y = Math.max(10, p.y);
    let box: Box = { x0: x - halfWidth, x1: x + halfWidth, y0: y - 6, y1: y + 6 };
    if (overlaps(box, medalBox)) {
      x = clampX(aside(x, halfWidth), halfWidth);
      box = { ...box, x0: x - halfWidth, x1: x + halfWidth };
    }
    if (avgBox && overlaps(box, avgBox)) {
      y += 26;
      box = { ...box, y0: y - 6, y1: y + 6 };
    }
    s += `<text x="${P(x)}" y="${P(y)}" font-size="11" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="${own}">You</text>`;
    low(box.y1);
  }
  // 80 and 90 outside the dots (75 and 100 are the gauge's own).
  for (const v of [80, 90]) {
    const reach =
      Math.max(GAUGE.r0 + 10, ...[v - 1, v].map((bin) => layout.columns.get(bin)?.reach ?? 0)) + 10;
    const p = pt(angleFor(v), reach);
    let x = clampX(p.x, 7);
    const y = Math.max(8, p.y);
    if (overlaps({ x0: x - 7, x1: x + 7, y0: y - 5, y1: y + 5 }, medalBox)) {
      x = clampX(aside(x, 7), 7);
    }
    s += `<text x="${P(x)}" y="${P(y)}" font-size="10" text-anchor="middle" dominant-baseline="central" fill="${THEME.muted}">${v}</text>`;
    low(y + 5);
  }
  const height = Math.ceil(bottom + 14);
  return (
    `<svg viewBox="0 0 ${GAUGE.width} ${height}" role="img" aria-label="${esc(block.label)}">` +
    `<defs>${defs}</defs>${s}</svg>`
  );
}

/** The Overall Score by week as an area chart over tier bands, 75–100 up the side. */
export function scoreChartSvg(model: SnapshotModel, tiers: Tiers): string {
  const weeks = model.weeks;
  const n = Math.max(2, weeks.length);
  const W = 328;
  const H = 190;
  const L = 30;
  const R = 10;
  const T = 14;
  const B = 30;
  const x = (i: number) => L + (i * (W - L - R)) / (n - 1);
  const y = (s: number) => T + ((100 - Math.max(75, Math.min(100, s))) * (H - T - B)) / 25;
  const c = model.cutOffs;
  const bands: Array<[SnapshotTier, number, number]> = [
    ['Platinum', 100, c.platinum],
    ['Gold', c.platinum, c.gold],
    ['Silver', c.gold, c.silver],
    ['Bronze', c.silver, 75],
  ];
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Overall score by week, 75 to 100, with tier bands">`;
  for (const [tier, hi, lo] of bands) {
    if (lo >= hi) continue;
    s += `<rect x="${L}" y="${P(y(hi))}" width="${W - L - R}" height="${P(y(lo) - y(hi))}" fill="${tiers.fill[tier]}" opacity="0.22"/>`;
  }
  for (const g of [75, 80, 85, 90, 95, 100]) {
    s += `<line x1="${L}" x2="${W - R}" y1="${P(y(g))}" y2="${P(y(g))}" stroke="${THEME.line}" stroke-width="1"/>`;
    s += `<text x="${L - 5}" y="${P(y(g) + 3.5)}" font-size="9.5" text-anchor="end" fill="${THEME.muted}">${g}</text>`;
  }
  const scored = weeks
    .map((w, i) => ({ w, i }))
    .filter(
      (p): p is { w: (typeof weeks)[number] & { score: number }; i: number } => p.w.score !== null,
    );
  const pts = scored.map((p) => `${P(x(p.i))},${P(y(p.w.score))}`);
  if (scored.length > 1) {
    const first = scored[0]!;
    const last = scored[scored.length - 1]!;
    s += `<polygon points="${P(x(first.i))},${P(y(75))} ${pts.join(' ')} ${P(x(last.i))},${P(y(75))}" fill="${THEME.accent}" opacity="0.15"/>`;
    s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${THEME.accent}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  const peak = scored.reduce<{ i: number; score: number } | null>(
    (best, p) => (best === null || p.w.score > best.score ? { i: p.i, score: p.w.score } : best),
    null,
  );
  weeks.forEach((w, i) => {
    s += `<text x="${P(x(i))}" y="${H - 14}" font-size="10" text-anchor="middle" fill="${THEME.muted}">W${w.number}</text>`;
    if (w.score === null) {
      // No scorecard that week: a hollow mark on the bottom line says so.
      s += `<circle cx="${P(x(i))}" cy="${P(y(75))}" r="3" fill="none" stroke="${THEME.muted}" stroke-width="1.5" stroke-dasharray="2 2"/>`;
      return;
    }
    const last = i === weeks.length - 1;
    const fill = w.tier ? tiers.fill[w.tier] : THEME.muted;
    s += `<circle cx="${P(x(i))}" cy="${P(y(w.score))}" r="${last ? 5 : 3.5}" fill="${fill}" stroke="${THEME.bg}" stroke-width="2"/>`;
    const labelled = last || i === scored[0]?.i || i === peak?.i;
    if (labelled) {
      const above = y(w.score) - 9;
      const ty = above < T + 8 ? y(w.score) + 16 : above;
      // The first and last labels lean inwards so they never run into the axis or the edge.
      const anchor = i === 0 ? 'start' : last ? 'end' : 'middle';
      const tx = x(i) + (i === 0 ? -4 : last ? 4 : 0);
      s += `<text x="${P(tx)}" y="${P(ty)}" font-size="10" font-weight="700" text-anchor="${anchor}" fill="${THEME.fg}">${score1(w.score)}</text>`;
    }
  });
  return s + '</svg>';
}

// ---- HTML parts -------------------------------------------------------------------------------

function chip(
  tier: SnapshotTier,
  tiers: Tiers,
  text: string = tier,
  small = false,
  arc = false,
): string {
  const bg = arc ? THEME.arc[tier] : tiers.fill[tier];
  const fg = arc ? arcText(tier) : tiers.text[tier];
  return `<span class="chip${small ? ' sm' : ''}" style="background:${bg};color:${fg}">${esc(text)}</span>`;
}

const dot = (tier: SnapshotTier, tiers: Tiers, extra = '') =>
  `<span class="dot" style="background:${tiers.fill[tier]}${extra}"></span>`;

/** The title band, in the driver's tier colour for that page (amber with no tier). */
function ribbon(text: string, size: number, tier: SnapshotTier | null): string {
  const bg = tier ? THEME.arc[tier] : THEME.accent;
  return `<div class="ribbon" style="font-size:${size}px;background:${bg}">${esc(text)}</div>`;
}

/**
 * The rank in a ring, both in the tier colour. `style` goes on the block around it (the margin
 * that puts the medal under the photo's name band). `under` is the note under the medal, which
 * is exactly NOTE_HEIGHT tall so the gauge below knows where it ends.
 */
function medal(
  rank: { rank: number; total: number } | null,
  tier: SnapshotTier | null,
  under: string | null,
  unranked: string,
  style: string,
): string {
  const colour = tier ? THEME.arc[tier] : THEME.muted;
  const inner = rank
    ? `<span style="color:${tier ? colour : THEME.fg}">#${rank.rank}</span><small>of ${rank.total}</small>`
    : `<span style="font-size:26px">—</span><small>${esc(unranked)}</small>`;
  return (
    `<div class="center"${style}><div class="medal" style="border-color:${colour}">${inner}</div>` +
    (under ? `<p class="small muted note">${esc(under)}</p>` : '') +
    '</div>'
  );
}

/** The gauge block on the page, pulled up so its dots can fan out beside the medal above it. */
function gaugeBox(block: GaugeBlock): string {
  const up = BODY_GAP + GAUGE_OVERLAP + block.top.noteHeight;
  return `<div class="gbox gauge" style="margin-top:-${up}px">${gaugeBlockSvg(block)}</div>`;
}

function tipBox(model: SnapshotModel): string {
  const tip = model.tip;
  if (!tip) {
    return (
      '<div class="tip"><div class="k">Keep it up</div>' +
      `<div class="t">Every metric earned its full points this week. Keep doing exactly what you're doing.</div></div>`
    );
  }
  return (
    `<div class="tip"><div class="k">Try this next</div><div class="t">${esc(tip.tip)}</div>` +
    `<div class="p">${esc(tip.payoff)}</div></div>`
  );
}

function receiptBox(receipt: Receipt): string {
  const rows = receipt.rows
    .map((row) =>
      row.earned + 0.05 < row.max
        ? `<div class="row" style="background:${THEME.lostRed};color:#fff;font-weight:600"><span>${esc(row.label)}</span><span>+${row.earned.toFixed(1)} <span class="small" style="opacity:.85">of ${row.max.toFixed(1)}</span></span></div>`
        : `<div class="row" style="background:#217597"><span>${esc(row.label)}</span><span>+${row.earned.toFixed(1)}</span></div>`,
    )
    .join('');
  const tier = receipt.tier;
  const total = tier
    ? `<div class="row" style="background:${THEME.arc[tier]};color:${arcText(tier)};padding:5px 6px;margin-top:2px"><b>TOTAL</b><b>${score1(receipt.total)} ${tier.toUpperCase()}</b></div>`
    : `<div class="row" style="background:${THEME.card};padding:5px 6px;margin-top:2px"><b>TOTAL</b><b>${score1(receipt.total)}</b></div>`;
  const to =
    receipt.toPlatinum === null
      ? ''
      : `<div class="row" style="background:${THEME.bg};margin-top:2px"><span>To Platinum</span><span>${receipt.toPlatinum.toFixed(1)}</span></div>`;
  return `<div class="receipt">${rows}${total}${to}</div>`;
}

function focusBox(model: SnapshotModel, tiers: Tiers): string {
  const items = model.focus
    .map(
      (item) =>
        `<div class="item"><div class="name"><b style="font-size:15px">${esc(item.name)}</b>` +
        (item.averageTier
          ? chip(item.averageTier, tiers, `Average ${item.averageTier}`, true, true)
          : '') +
        `</div><ul class="small muted">${item.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` +
        `<div class="small"><b>Do this:</b> ${esc(item.tip)}</div></div>`,
    )
    .join('');
  const none = `<div class="item"><div class="small">Nothing lost points over these weeks. Every metric earned its full points every week.</div></div>`;
  return `<div class="focus"><div class="h">Needs Improvement</div><div>${items || none}</div></div>`;
}

function weekLabel(model: SnapshotModel): string {
  const first = model.weeks[0]!;
  return model.weeks.length === 1 ? `${first.number}` : `${first.number} - ${model.latest.number}`;
}

function dotGrid(model: SnapshotModel, tiers: Tiers): string {
  const ws = 16;
  const cw = Math.max(14, Math.round(ws * 1.4));
  const gap = 5;
  const n = model.weeks.length;
  const total = n * cw + (n - 1) * gap;
  const cell = (inner: string) => `<span class="cell" style="width:${cw}px">${inner}</span>`;
  const cols = `<div class="wkcols" aria-hidden="true" style="width:${total}px">${model.weeks.map(() => '<div></div>').join('')}</div>`;
  const header =
    `<div class="row"><span class="small muted" style="flex:1">Week</span><span class="cells">` +
    model.weeks
      .map((w) =>
        cell(
          `<span class="eyebrow" style="font-size:${ws}px;font-weight:700;line-height:1;color:${THEME.muted}">${w.number}</span>`,
        ),
      )
      .join('') +
    '</span></div>';
  const rowFor = (m: SnapshotMetric) => {
    const loss = m.latestTier !== null && m.latestTier !== 'Platinum';
    const dots = m.tiers
      .map((t) =>
        cell(
          t === null
            ? `<span class="dot" style="width:14px;height:14px;background:transparent;border:1.5px dashed ${THEME.muted}"></span>`
            : `<span class="dot" style="width:14px;height:14px;background:${tiers.fill[t]}${t === 'Platinum' ? ';opacity:.4' : ''}${loss && t !== 'Platinum' ? ';box-shadow:0 0 0 2px #fff' : ''}"></span>`,
        ),
      )
      .join('');
    return `<div class="row" style="${loss ? `background:${THEME.red};color:#fff;font-weight:700` : ''}"><span class="small" style="flex:1">${esc(m.name)}</span><span class="cells">${dots}</span></div>`;
  };
  const legend =
    `<div class="legend"><span>${dot('Platinum', tiers, ';opacity:.4')} Platinum</span><span>${dot('Gold', tiers)} Gold</span>` +
    `<span>${dot('Silver', tiers)} Silver</span><span>${dot('Bronze', tiers)} Bronze</span>` +
    `<span><span style="width:14px;height:10px;border-radius:3px;background:${THEME.red};display:inline-block"></span> Needs Improvement</span>` +
    (model.weeks.some((w) => w.score === null)
      ? `<span><span class="dot" style="border:1.5px dashed ${THEME.muted}"></span> No scorecard that week</span>`
      : '') +
    '</div>';
  return `<div class="grid">${cols}${header}${model.metrics.map(rowFor).join('')}</div>${legend}`;
}

function footer(page: SnapshotPage, transporterId: string): string {
  const main = page === 1 ? 'Want the full breakdown?' : 'Want all the numbers?';
  return (
    `<div class="foot"><div class="h"><span class="badge" aria-hidden="true">PDF</span>${main}</div>` +
    '<div>Open the <b>PDF attached to this email</b> for every metric, every week.</div>' +
    `<div class="small" style="color:${THEME.muted}">Transporter ID ${esc(transporterId)}</div></div>`
  );
}

/**
 * The photo behind the body: the top band at its true shape under the ribbon, the rest
 * stretched down to the bottom of the page, both darkened so the numbers stay readable. Also
 * says how tall the band is on the page, so the medal can start under it.
 */
function photoLayers(photo: SnapshotPhoto): { html: string; bandHeight: number } {
  const cut = Math.max(
    1,
    Math.min(photo.height - 1, Math.round((photo.height * PHOTO_BAND_PERCENT) / 100)),
  );
  const bandH = Math.round((SNAPSHOT_WIDTH * cut) / photo.width);
  const restPercent = ((photo.height - cut) / photo.height) * 100;
  const dim = `linear-gradient(rgba(0,0,0,${PHOTO_DIM}), rgba(0,0,0,${PHOTO_DIM}))`;
  // The stretched part starts 2px under the band so no seam shows between them.
  const html =
    `<div class="ph-rest" style="top:${bandH - 2}px;bottom:0;background:${dim}, url(${photo.dataUrl}) center bottom / 100% ${(10000 / restPercent).toFixed(2)}% no-repeat"></div>` +
    `<div class="ph-band" style="top:0;height:${bandH}px;background:${dim}, url(${photo.dataUrl}) center top / 100% auto no-repeat"></div>`;
  return { html, bandHeight: bandH };
}

/** The body of one page (the ribbon and everything under it), without the document around it. */
export function snapshotPageBody(
  model: SnapshotModel,
  page: SnapshotPage,
  look: SnapshotLook,
): string {
  const tiers = tierColours(look.colours);
  const latest = model.latest;
  const photo = look.photo ? photoLayers(look.photo) : null;
  // With a photo, the medal starts under its name band so nothing covers the lettering.
  const medalStyle =
    photo && photo.bandHeight > BODY_PAD
      ? ` style="margin-top:${photo.bandHeight - BODY_PAD}px"`
      : '';
  let head: string;
  let sections: string;
  if (page === 1) {
    head = ribbon(`SCORECARD WEEK ${latest.number}`, 27, latest.tier);
    const rank = medal(latest.rank, latest.tier, null, 'no rank', medalStyle);
    const gauge =
      latest.score === null
        ? ''
        : gaugeBox({
            score: latest.score,
            tier: latest.tier,
            cutOffs: model.cutOffs,
            strip: model.fleetWeek,
            page,
            top: { noteHeight: 0 },
            label: `Score ${score1(latest.score)} on a gauge from 75 to 100, with every driver's Week ${latest.number} score as a dot around it and you highlighted`,
          });
    sections =
      rank +
      gauge +
      `<div class="sect">${tipBox(model)}</div>` +
      `<div class="sect">${receiptBox(model.receipt)}</div>`;
  } else {
    const count = model.weeks.length;
    head = ribbon(`${count} WEEK SCORECARD  ${weekLabel(model)}`, 22, model.average.tier);
    const avg = model.average;
    const rank = medal(
      avg.rank,
      avg.tier,
      avg.rank
        ? `by ${count}-week average score`
        : `ranked after ${avg.minWeeks} scored weeks (you have ${avg.weeksScored})`,
      'not yet',
      medalStyle,
    );
    const gauge =
      avg.score === null
        ? ''
        : gaugeBox({
            score: avg.score,
            tier: avg.tier,
            cutOffs: model.cutOffs,
            strip: model.fleetAverage,
            page,
            top: { noteHeight: NOTE_HEIGHT },
            label: `Average score ${score1(avg.score)} over ${count} weeks on a gauge from 75 to 100, with every driver's ${count}-week average as a dot around it and you highlighted`,
          });
    sections =
      rank +
      gauge +
      `<div class="sect">${focusBox(model, tiers)}</div>` +
      `<div class="sect">${scoreChartSvg(model, tiers)}</div>` +
      `<div class="sect">${dotGrid(model, tiers)}</div>`;
  }
  return (
    `<section class="page" data-page="${page}">${head}` +
    `<div class="body${photo ? ' photo' : ''}">${photo?.html ?? ''}${sections}${footer(page, model.transporterId)}</div></section>`
  );
}

/** One standalone HTML document holding the given pages (both, stacked, by default). */
export function buildSnapshotHtml(
  model: SnapshotModel,
  look: SnapshotLook,
  pages: readonly SnapshotPage[] = [1, 2],
): string {
  const body = pages.map((page) => snapshotPageBody(model, page, look)).join('\n');
  return (
    '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">' +
    `<title>Weekly snapshot</title><style>${SNAPSHOT_CSS}</style></head>` +
    `<body>${body}</body></html>`
  );
}
