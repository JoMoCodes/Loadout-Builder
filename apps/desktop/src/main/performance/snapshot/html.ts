// Draws the two Weekly Snapshot pages as standalone HTML (inline styles and SVG, no scripts),
// phone width (360 px), from a SnapshotModel. The pages are the design chosen in the
// "DA Snapshot Co-Edit" artifact: navy and amber, a colour ribbon at the top, a medal ring with
// the rank above a 75–100 half-ring gauge filled in tier colours, everyone's scores as dots, then
// the body sections (Page 1: "Try this next" and the points receipt; Page 2: "Needs
// Improvement", the score-by-week chart and the tier dot grid), and a boxed pointer to the PDF.
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
import type { ReportColours } from '../../../shared/performanceSettings';
import { esc } from '../report/format';

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
/* No scrollbars, ever: the picture is taken while the window is shorter than the page. */
html { overflow: hidden; }
body { width: ${SNAPSHOT_WIDTH}px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: ${SNAPSHOT_WIDTH}px; overflow: hidden; position: relative;
  background: ${THEME.bg}; color: ${THEME.fg}; font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 14px; line-height: 1.4; font-variant-numeric: tabular-nums; }
.page * { min-width: 0; }
.page + .page { border-top: 1px solid ${THEME.line}; }
.ribbon { background: ${THEME.accent}; color: ${THEME.accentText}; padding: 16px 16px 14px; text-align: center;
  font-weight: 800; line-height: 1.15; position: relative; z-index: 2; }
.body { position: relative; padding: 14px 16px 22px; display: flex; flex-direction: column; gap: 12px; min-height: 560px; }
.body > * { position: relative; z-index: 1; }
.ph-band, .ph-rest { position: absolute; left: 0; right: 0; z-index: 0; }
.body.photo .gbox svg text, .body.photo .eyebrow, .body.photo .center { text-shadow: 0 1px 2px rgba(0,0,0,.5); }
.center { text-align: center; }
.small { font-size: 12px; }
.muted { color: ${THEME.muted}; }
.eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: ${THEME.muted}; margin: 0; }
p { margin: 0; }
h2 { margin: 0; font-size: 15px; font-weight: 700; line-height: 1.15; }
.medal { width: 104px; height: 104px; border-radius: 50%; margin: 0 auto; border: 6px solid ${THEME.muted};
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
  font-size: 36px; font-weight: 800; line-height: 1; background: rgba(11,37,69,.35); }
.medal > span { line-height: 1; }
.medal > small { display: block; font-size: 11px; font-weight: 600; color: ${THEME.muted}; letter-spacing: 0.02em; line-height: 1; }
.gbox { display: flex; flex-direction: column; gap: 8px; }
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

interface GaugeMarker {
  v: number;
  text: string;
}

/**
 * The 75–100 half-ring gauge, filled in tier colours up to the score (the rest dimmed), with
 * straight cuts at the tier boundaries, the score and a tier pill inside, and tier markers
 * labelled away from the arc.
 */
export function gaugeSvg(
  score: number,
  inside: string,
  pill: SnapshotTier | null,
  cutOffs: SnapshotCutOffs,
  markers: GaugeMarker[],
  label: string,
): string {
  const lo = 75;
  const start = Math.PI;
  const sweep = Math.PI;
  const pad = 14;
  const r = 84;
  const t = 18;
  const W = 260 + 2 * pad;
  const cx = 130 + pad;
  const cy = 114 + pad;
  const H = 134 + pad;
  const f = (s: number) => Math.max(0, Math.min(1, (s - lo) / (100 - lo)));
  const pt = (a: number, rr: number): [number, number] => [
    cx + rr * Math.cos(start + a * sweep),
    cy + rr * Math.sin(start + a * sweep),
  ];
  const arc = (a0: number, a1: number, col: string, op = 1, cap = 'butt') => {
    if (a1 <= a0) return '';
    const [x0, y0] = pt(a0, r);
    const [x1, y1] = pt(a1, r);
    return `<path d="M${P(x0)} ${P(y0)} A${r} ${r} 0 0 1 ${P(x1)} ${P(y1)}" fill="none" stroke="${col}" stroke-width="${t}" opacity="${op}" stroke-linecap="${cap}"/>`;
  };
  const tick = (v: number, inner: number, outer: number, col: string, w: number) => {
    const [x0, y0] = pt(f(v), inner);
    const [x1, y1] = pt(f(v), outer);
    return `<line x1="${P(x0)}" y1="${P(y0)}" x2="${P(x1)}" y2="${P(y1)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
  };
  const bands: Array<[number, number, SnapshotTier]> = [
    [lo, cutOffs.silver, 'Bronze'],
    [cutOffs.silver, cutOffs.gold, 'Silver'],
    [cutOffs.gold, cutOffs.platinum, 'Gold'],
    [cutOffs.platinum, 100, 'Platinum'],
  ];
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">`;
  for (const [a, b, tier] of bands) s += arc(f(a), f(b), THEME.arc[tier], 0.28);
  // A round tip only at the leading end: a butt segment plus a short round-capped arc.
  const capped = (a0: number, a1: number, col: string) => {
    const d = t / 2 / r / sweep;
    return arc(a0, a1, col, 1, 'butt') + (a1 - a0 > d ? arc(a1 - d, a1, col, 1, 'round') : '');
  };
  for (const [a, b, tier] of bands) {
    if (score <= a) continue;
    const end = Math.min(b, score);
    s += score < b ? capped(f(a), f(end), THEME.arc[tier]) : arc(f(a), f(end), THEME.arc[tier]);
  }
  for (const v of [cutOffs.silver, cutOffs.gold, cutOffs.platinum]) {
    if (v > lo && v < 100) s += tick(v, r - t / 2 - 1, r + t / 2 + 1, THEME.bg, 3.5);
  }
  for (const m of markers) {
    const a = f(m.v);
    s += tick(m.v, r + t / 2 + 3, r + t / 2 + 11, THEME.fg, 2);
    const [px] = pt(a, r);
    const side = px < cx - 14 ? 'end' : px > cx + 14 ? 'start' : 'middle';
    const [lx, ly] = pt(a, r + t / 2 + (side === 'middle' ? 21 : 15));
    s += `<text x="${P(lx)}" y="${P(ly + 3)}" font-size="9" text-anchor="${side}" fill="${THEME.muted}">${esc(m.text)}</text>`;
  }
  const ny = cy - 12;
  s += `<text x="${cx}" y="${ny}" font-size="40" font-weight="800" text-anchor="middle" fill="${THEME.fg}">${esc(inside)}</text>`;
  if (pill) {
    const w = pill.length * 7.2 + 18;
    s += `<rect x="${P(cx - w / 2)}" y="${ny + 6}" width="${P(w)}" height="19" rx="9.5" fill="${THEME.arc[pill]}"/>`;
    s += `<text x="${cx}" y="${ny + 19.5}" font-size="12" font-weight="700" text-anchor="middle" fill="${arcText(pill)}">${pill}</text>`;
  }
  s += `<text x="${cx - r - t / 2}" y="${cy + 18}" font-size="10" fill="${THEME.muted}">75</text>`;
  s += `<text x="${cx + r + t / 2}" y="${cy + 18}" font-size="10" text-anchor="end" fill="${THEME.muted}">100</text>`;
  return s + '</svg>';
}

/** Everyone's scores as anonymous dots on a 65–100 line, "You" picked out, the fleet average dashed. */
export function fleetStripSvg(strip: FleetStrip, what: string): string {
  const W = 328;
  const H = 84;
  const L = 14;
  const R = 14;
  const lo = 65;
  const hi = 100;
  const x = (v: number) =>
    (L + ((Math.max(lo, Math.min(hi, v)) - lo) * (W - L - R)) / (hi - lo)).toFixed(1);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Every driver's ${what} score, with you highlighted`)}">`;
  for (const g of [70, 80, 90, 100]) {
    s += `<line x1="${x(g)}" x2="${x(g)}" y1="16" y2="56" stroke="${THEME.line}"/>`;
    s += `<text x="${x(g)}" y="68" font-size="9.5" text-anchor="middle" fill="${THEME.muted}">${g}</text>`;
  }
  if (strip.average !== null) {
    s += `<line x1="${x(strip.average)}" x2="${x(strip.average)}" y1="12" y2="60" stroke="${THEME.accent}" stroke-width="2.5" stroke-dasharray="4 3"/>`;
    s += `<text x="${x(strip.average)}" y="80" font-size="10" font-weight="700" text-anchor="middle" fill="${THEME.fg}">Fleet Average ${score1(strip.average)}</text>`;
  }
  strip.scores.forEach((v, i) => {
    const me = i === strip.meIndex;
    const cy = 26 + (i % 3) * 11;
    s += `<circle cx="${x(v)}" cy="${cy}" r="${me ? 6.5 : 3.5}" fill="${me ? THEME.accent : THEME.muted}" opacity="${me ? 1 : 0.55}" stroke="${THEME.bg}" stroke-width="1.5"/>`;
  });
  if (strip.meIndex !== null) {
    const v = strip.scores[strip.meIndex] as number;
    s += `<text x="${x(v)}" y="11" font-size="10" font-weight="700" text-anchor="middle" fill="${THEME.fg}">You</text>`;
  }
  return s + '</svg>';
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

function ribbon(text: string, size: number): string {
  return `<div class="ribbon" style="font-size:${size}px">${esc(text)}</div>`;
}

function medal(
  rank: { rank: number; total: number } | null,
  tier: SnapshotTier | null,
  tiers: Tiers,
  under: string | null,
  unranked: string,
): string {
  const ring = tier ? tiers.fill[tier] : THEME.muted;
  const inner = rank
    ? `<span>#${rank.rank}</span><small>of ${rank.total}</small>`
    : `<span style="font-size:26px">—</span><small>${esc(unranked)}</small>`;
  return (
    `<div class="center"><div class="medal" style="border-color:${ring}">${inner}</div>` +
    (under ? `<p class="small muted" style="margin-top:6px">${esc(under)}</p>` : '') +
    '</div>'
  );
}

function markersFor(c: SnapshotCutOffs): GaugeMarker[] {
  return [
    { v: c.silver, text: `Silver ${c.silver}` },
    { v: c.gold, text: `Gold ${c.gold}` },
    { v: c.platinum, text: `Platinum ${c.platinum}` },
  ].filter((m) => m.v > 75 && m.v < 100);
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
 * stretched down to the bottom of the page, both darkened so the numbers stay readable.
 */
function photoLayers(photo: SnapshotPhoto): string {
  const cut = Math.max(
    1,
    Math.min(photo.height - 1, Math.round((photo.height * PHOTO_BAND_PERCENT) / 100)),
  );
  const bandH = Math.round((SNAPSHOT_WIDTH * cut) / photo.width);
  const restPercent = ((photo.height - cut) / photo.height) * 100;
  const dim = `linear-gradient(rgba(0,0,0,${PHOTO_DIM}), rgba(0,0,0,${PHOTO_DIM}))`;
  // The stretched part starts 2px under the band so no seam shows between them.
  return (
    `<div class="ph-rest" style="top:${bandH - 2}px;bottom:0;background:${dim}, url(${photo.dataUrl}) center bottom / 100% ${(10000 / restPercent).toFixed(2)}% no-repeat"></div>` +
    `<div class="ph-band" style="top:0;height:${bandH}px;background:${dim}, url(${photo.dataUrl}) center top / 100% auto no-repeat"></div>`
  );
}

/** The body of one page (the ribbon and everything under it), without the document around it. */
export function snapshotPageBody(
  model: SnapshotModel,
  page: SnapshotPage,
  look: SnapshotLook,
): string {
  const tiers = tierColours(look.colours);
  const markers = markersFor(model.cutOffs);
  const latest = model.latest;
  let head: string;
  let gauge: string;
  let strip: string;
  let sections: string;
  if (page === 1) {
    head = ribbon(`SCORECARD WEEK ${latest.number}`, 27);
    const rank = medal(latest.rank, latest.tier, tiers, null, 'no rank');
    gauge = gaugeSvg(
      latest.score as number,
      score1(latest.score as number),
      latest.tier,
      model.cutOffs,
      markers,
      `Score ${score1(latest.score as number)} on a gauge from 75 to 100`,
    );
    strip = fleetStripSvg(model.fleetWeek, `Week ${latest.number}`);
    sections =
      rank +
      `<div class="gbox">${gauge}</div>` +
      `<div class="gbox">${strip}</div>` +
      `<div class="sect">${tipBox(model)}</div>` +
      `<div class="sect">${receiptBox(model.receipt)}</div>`;
  } else {
    const count = model.weeks.length;
    head = ribbon(`${count} WEEK SCORECARD  ${weekLabel(model)}`, 22);
    const avg = model.average;
    const rank = medal(
      avg.rank,
      avg.tier,
      tiers,
      avg.rank
        ? `by ${count}-week average score`
        : `ranked after ${avg.minWeeks} scored weeks (you have ${avg.weeksScored})`,
      'not yet',
    );
    gauge =
      avg.score === null
        ? ''
        : gaugeSvg(
            avg.score,
            score1(avg.score),
            avg.tier,
            model.cutOffs,
            markers,
            `Average score ${score1(avg.score)} over ${count} weeks on a gauge from 75 to 100`,
          );
    strip = fleetStripSvg(model.fleetAverage, `${count}-week average`);
    sections =
      rank +
      `<div class="gbox">${gauge}</div>` +
      `<div class="gbox">${strip}</div>` +
      `<div class="sect">${focusBox(model, tiers)}</div>` +
      `<div class="sect">${scoreChartSvg(model, tiers)}</div>` +
      `<div class="sect">${dotGrid(model, tiers)}</div>`;
  }
  const photo = look.photo ? photoLayers(look.photo) : '';
  return (
    `<section class="page" data-page="${page}">${head}` +
    `<div class="body${look.photo ? ' photo' : ''}">${photo}${sections}${footer(page, model.transporterId)}</div></section>`
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
