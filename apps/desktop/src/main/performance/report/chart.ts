// The Overall Score line chart as inline SVG (ScottPlot drew it in the old app): weeks along
// the bottom, the score up the side, each score labelled above its point (below when it is
// near the top), and the tier bands behind it when the thresholds are in and colour is on.

import { formatNet, OVERALL_SCORE, type ThresholdView } from '@loadout/performance';
import type { Palette, Tier } from './colours';
import { esc } from './format';

export interface ChartPoint {
  week: string;
  score: number | null;
}

const WIDTH = 700;
const HEIGHT = 280;
const PLOT = { left: 62, right: 14, top: 34, bottom: 56 };
const LINE = '#7E57C2';

/** A tidy tick step for a range: 1, 2, 5, 10, 20, 25 or 50, about 8 ticks or fewer. */
function tickStep(range: number): number {
  for (const step of [1, 2, 5, 10, 20, 25, 50]) {
    if (range / step <= 8) return step;
  }
  return 100;
}

function n(value: number): string {
  return value.toFixed(1);
}

/**
 * The chart. Weeks with no score get a tick but no point. The axis is tight like the old one:
 * 5 below the lowest score (and 3 below the Bronze line when there is one) up to 100.
 */
export function overallScoreChart(
  points: readonly ChartPoint[],
  thresholds: readonly ThresholdView[],
  p: Palette,
): string {
  const scored = points.flatMap((pt, i) => (pt.score === null ? [] : [{ i, y: pt.score }]));
  const ys = scored.map((s) => s.y);
  const dataMin = ys.length > 0 ? Math.min(...ys) : 0;
  const dataMax = ys.length > 0 ? Math.max(...ys) : 100;
  let yMin = Math.max(0, dataMin - 5);
  const yMax = Math.max(dataMax, 100);
  const overall = thresholds.find((t) => t.metricName === OVERALL_SCORE);
  if (overall?.bronzeThreshold != null) {
    yMin = Math.max(0, Math.min(yMin, overall.bronzeThreshold - 3));
  }
  const span = yMax - yMin || 1;

  const xMin = -0.5;
  const xMax = Math.max(0.5, points.length - 0.5);
  const plotW = WIDTH - PLOT.left - PLOT.right;
  const plotH = HEIGHT - PLOT.top - PLOT.bottom;
  const sx = (x: number) => PLOT.left + ((x - xMin) / (xMax - xMin)) * plotW;
  const sy = (y: number) => PLOT.top + (1 - (y - yMin) / span) * plotH;
  const clampY = (y: number) => Math.min(yMax, Math.max(yMin, y));

  const out: string[] = [];
  out.push(
    `<svg class="chart" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="Overall Score Over Time">`,
  );
  out.push(
    `<text x="${n(WIDTH / 2)}" y="20" text-anchor="middle" class="c-title">Overall Score Over Time</text>`,
  );

  // Tier bands: each threshold is the top of its tier.
  if (overall && p.useColor) {
    const band = (lo: number | null, hi: number | null, tier: Tier) => {
      if (lo === null || hi === null) return;
      const a = clampY(lo);
      const b = clampY(hi);
      if (b <= a) return;
      out.push(
        `<rect class="band band-${tier.toLowerCase()}" x="${n(sx(xMin))}" y="${n(sy(b))}" width="${n(plotW)}" height="${n(sy(a) - sy(b))}" fill="${esc(p.bandColour(tier))}" fill-opacity="0.25"/>`,
      );
    };
    const {
      platinumThreshold: pl,
      goldThreshold: go,
      silverThreshold: si,
      bronzeThreshold: br,
    } = overall;
    band(yMin, br, 'Bronze');
    band(br, si, 'Silver');
    band(si, go, 'Gold');
    band(go, pl, 'Platinum');
  }

  // Grid and the score axis.
  const step = tickStep(span);
  for (let t = Math.ceil(yMin / step) * step; t <= yMax + 1e-9; t += step) {
    const y = n(sy(t));
    out.push(
      `<line x1="${PLOT.left}" x2="${WIDTH - PLOT.right}" y1="${y}" y2="${y}" class="c-grid"/>`,
    );
    out.push(
      `<text x="${PLOT.left - 6}" y="${y}" dy="0.35em" text-anchor="end" class="c-tick">${esc(formatNet(t, '0.#'))}</text>`,
    );
  }

  // Week axis.
  const rotate = points.length > 12;
  points.forEach((pt, i) => {
    const x = n(sx(i));
    out.push(
      `<line x1="${x}" x2="${x}" y1="${PLOT.top}" y2="${HEIGHT - PLOT.bottom}" class="c-grid"/>`,
    );
    const ty = HEIGHT - PLOT.bottom + 15;
    out.push(
      rotate
        ? `<text x="${x}" y="${ty}" text-anchor="end" transform="rotate(-35 ${x} ${ty})" class="c-tick">${esc(pt.week)}</text>`
        : `<text x="${x}" y="${ty}" text-anchor="middle" class="c-tick">${esc(pt.week)}</text>`,
    );
  });
  out.push(
    `<rect x="${PLOT.left}" y="${PLOT.top}" width="${n(plotW)}" height="${n(plotH)}" class="c-frame"/>`,
  );
  out.push(
    `<text x="${n(PLOT.left + plotW / 2)}" y="${HEIGHT - 6}" text-anchor="middle" class="c-axis">Week</text>`,
  );
  out.push(
    `<text x="16" y="${n(PLOT.top + plotH / 2)}" text-anchor="middle" transform="rotate(-90 16 ${n(PLOT.top + plotH / 2)})" class="c-axis">Overall Score</text>`,
  );

  // The line, the points and their labels.
  if (scored.length > 1) {
    const path = scored.map((s) => `${n(sx(s.i))},${n(sy(s.y))}`).join(' ');
    out.push(`<polyline points="${path}" fill="none" stroke="${LINE}" stroke-width="2"/>`);
  }
  const offset = span * 0.05;
  for (const s of scored) {
    const week = points[s.i]?.week ?? '';
    out.push(
      `<circle class="pt" data-week="${esc(week)}" cx="${n(sx(s.i))}" cy="${n(sy(s.y))}" r="4" fill="${LINE}"/>`,
    );
    const nearTop = s.y > yMax - offset * 1.5;
    const labelY = nearTop ? s.y - offset : s.y + offset;
    out.push(
      `<text x="${n(sx(s.i))}" y="${n(sy(labelY))}" dy="0.35em" text-anchor="middle" class="c-label">${esc(formatNet(s.y, '0.0'))}</text>`,
    );
  }
  out.push('</svg>');
  return out.join('');
}
