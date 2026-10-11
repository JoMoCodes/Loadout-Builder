// The table pieces every report page shares: the week grid (a label column and one column per
// week), the three-line metric cells, the plain count rows and the tier thresholds grid.

import {
  formatNet,
  METRIC_DEFINITIONS,
  OVERALL_SCORE,
  thresholdCategoryOf,
  type ThresholdView,
} from '@loadout/performance';
import type { Palette, Tier } from './colours';
import { esc, isPositiveCount, lines } from './format';
import type { ReportModel } from './model';

/** One data cell: its lines of text and the tier that colours it. */
export interface Cell {
  lines: string[];
  tier: string | null;
}

/** A missing week: a dash plus two blank lines, so the row keeps its height. */
const MISSING: Cell = { lines: ['-', ' ', ' '], tier: null };

function colours(bg: string, fg: string): string {
  return `background:${esc(bg)};color:${esc(fg)}`;
}

/** Column widths: the label column is 1.6 times a week column (as in the old report). */
export function weekColumns(count: number): string {
  const total = 1.6 + count;
  const label = ((1.6 / total) * 100).toFixed(3);
  const week = ((1 / total) * 100).toFixed(3);
  return `<colgroup><col style="width:${label}%">${`<col style="width:${week}%">`.repeat(count)}</colgroup>`;
}

/** The header row of a week grid: the label, then each week. */
export function weekHeader(label: string, weeks: readonly string[], p: Palette): string {
  const style = colours(p.headerBackground, p.headerForeground);
  const border = `border-color:${esc(p.border)}`;
  return (
    `<thead><tr><th class="lbl" style="${style};${border}">${esc(label)}</th>` +
    weeks.map((w) => `<th style="${style};${border}">${esc(w)}</th>`).join('') +
    '</tr></thead>'
  );
}

/** A row of three-line metric cells, coloured by tier, with "Lower/Higher is Better" under the name. */
export function metricRow(
  label: string,
  subtitle: string | null,
  cells: readonly Cell[],
  p: Palette,
): string {
  const border = `border-color:${esc(p.border)}`;
  const sub = subtitle ? `<span class="dir">${esc(subtitle)}</span>` : '';
  return (
    `<tr class="metric"><td class="lbl" style="${border}"><span class="name">${esc(label)}</span>${sub}</td>` +
    cells
      .map(
        (cell) =>
          `<td style="${colours(p.tierBackground(cell.tier), p.tierForeground(cell.tier))};${border}">${lines(cell.lines)}</td>`,
      )
      .join('') +
    '</tr>'
  );
}

/** The three-line cells for one metric across the report's weeks: value, (score), [weight]. */
export function metricCells(model: ReportModel, metricName: string): Cell[] {
  return model.weeks.map((week) => {
    const entry = model.metrics.get(week)?.get(metricName);
    if (!entry) return MISSING;
    const value = entry.metricValue ?? '-';
    const score = entry.score === null ? '-' : formatNet(entry.score, '0');
    const parts = [value, `(${score})`];
    if (entry.weightApplied !== null) parts.push(`[${formatNet(entry.weightApplied, '0.#')}]`);
    return { lines: parts, tier: entry.tier };
  });
}

/** The metric's "Lower is Better" / "Higher is Better" text, or null if it is not one of the 12. */
export function directionOf(metricName: string): string | null {
  return METRIC_DEFINITIONS.find((m) => m.name === metricName)?.direction ?? null;
}

export interface PlainRowOptions {
  /** Paint counts above zero in the reject colours, bold. */
  reject?: boolean;
  /** Bold label and values whatever the number (Acceptance %). */
  emphasize?: boolean;
  /** Taller row for wrapped category names. */
  tall?: boolean;
  /** Smaller label text (CDF categories). */
  smallLabel?: boolean;
}

/** A one-line row of counts or totals. */
export function plainRow(
  label: string,
  texts: readonly string[],
  options: PlainRowOptions,
  p: Palette,
): string {
  const border = `border-color:${esc(p.border)}`;
  const rowClass = ['plain', options.tall ? 'tall' : '', options.emphasize ? 'emph' : '']
    .filter(Boolean)
    .join(' ');
  const labelClass = `lbl${options.smallLabel ? ' small' : ''}`;
  return (
    `<tr class="${rowClass}"><td class="${labelClass}" style="${border}">${esc(label)}</td>` +
    texts
      .map((text) => {
        const highlight = options.reject === true && isPositiveCount(text);
        const style = highlight
          ? colours(p.rejectBackground, p.rejectForeground)
          : colours('#FFFFFF', '#374151');
        const cls = highlight ? ' class="bad"' : '';
        return `<td${cls} style="${style};${border}">${esc(text)}</td>`;
      })
      .join('') +
    '</tr>'
  );
}

/** A whole week grid: header plus rows. */
export function weekTable(
  label: string,
  weeks: readonly string[],
  rows: string,
  p: Palette,
): string {
  return `<table class="grid">${weekColumns(weeks.length)}${weekHeader(label, weeks, p)}<tbody>${rows}</tbody></table>`;
}

// ---- thresholds -----------------------------------------------------------------------------

/** Friendly names for the quality metrics in the thresholds grids. */
function fullName(metricName: string): string {
  switch (metricName) {
    case OVERALL_SCORE:
      return 'Overall Score';
    case 'CDF DPMO':
      return 'CDF DPMO  (Customer Delivery Feedback)';
    case 'CED':
      return 'CED  (Customer Escalated Defect)';
    case 'DCR':
      return 'Delivery Completion DPMO';
    case 'DSB':
      return 'DSB  (Delivery Success Behaviors)';
    case 'POD':
      return 'POD  (Photo On Delivery)';
    case 'PSB':
      return 'PSB  (Pickup Success Behaviors)';
    default:
      return metricName;
  }
}

const TIERS: readonly Tier[] = ['Platinum', 'Gold', 'Silver', 'Bronze'];

/** The thresholds grid: one row per metric, a column per tier (in the tier colours), then Weight. */
export function thresholdsGrid(
  rows: readonly ThresholdView[],
  headerLabel: string,
  p: Palette,
): string {
  const display = (row: ThresholdView, tier: Tier): string =>
    tier === 'Platinum'
      ? row.platinumDisplay
      : tier === 'Gold'
        ? row.goldDisplay
        : tier === 'Silver'
          ? row.silverDisplay
          : row.bronzeDisplay;
  const body = rows
    .map(
      (row) =>
        `<tr><td class="lbl">${esc(fullName(row.metricName))}</td>` +
        TIERS.map(
          (tier) =>
            `<td class="tier" style="${colours(p.tierBackground(tier), p.tierForeground(tier))}">${esc(display(row, tier))}</td>`,
        ).join('') +
        `<td class="weight">${esc(row.weightDisplay)}</td></tr>`,
    )
    .join('');
  return (
    '<table class="thresholds"><colgroup><col class="c-name"><col><col><col><col><col class="c-weight"></colgroup>' +
    `<thead><tr><th class="lbl">${esc(headerLabel)}</th><th>Platinum</th><th>Gold</th><th>Silver</th><th>Bronze</th><th>Weight</th></tr></thead>` +
    `<tbody>${body}</tbody></table>`
  );
}

/** The category thresholds ("Overall" or "Safety") with a title; nothing when none were brought in. */
export function categoryThresholds(
  thresholds: readonly ThresholdView[],
  category: 'Overall' | 'Safety',
  p: Palette,
): string {
  const rows = thresholds.filter((t) => thresholdCategoryOf(t.metricName) === category);
  if (rows.length === 0) return '';
  const title =
    category === 'Overall'
      ? 'Tier Thresholds — Overall'
      : 'Tier Thresholds — Safety  (Netradyne Violations)';
  return `<div class="block"><h3>${esc(title)}</h3>${thresholdsGrid(rows, 'Metric', p)}</div>`;
}

/** One metric's thresholds row at the top of its page; nothing when none was brought in. */
export function metricThresholds(
  thresholds: readonly ThresholdView[],
  metricName: string,
  p: Palette,
): string {
  const rows = thresholds.filter((t) => t.metricName === metricName);
  if (rows.length === 0) return '';
  return `<div class="block">${thresholdsGrid(rows, 'Metric Thresholds', p)}</div>`;
}
