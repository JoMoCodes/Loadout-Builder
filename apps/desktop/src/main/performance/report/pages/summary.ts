// Page 1 (the score chart, legend, Overall thresholds and the Overall weekly detail) and page 2
// (Safety thresholds and weekly detail, then the CED row).

import { formatNet, METRIC_DEFINITIONS, thresholdCategoryOf } from '@loadout/performance';
import { overallScoreChart } from '../chart';
import type { Palette } from '../colours';
import { esc } from '../format';
import type { ReportModel } from '../model';
import {
  categoryThresholds,
  directionOf,
  metricCells,
  metricRow,
  metricThresholds,
  weekTable,
  type Cell,
} from '../tables';

function legend(hasThresholds: boolean): string {
  const key =
    '<p class="semi">Each data cell shows three values:</p>' +
    '<p class="indent"><b>Metric Data</b> — the raw measurement for that week</p>' +
    '<p class="indent"><b>(Metric Score)</b> — Amazon\'s 0-100 sub-score for that metric</p>' +
    '<p class="indent"><b>[Metric Weight]</b> — % of Overall Score this metric contributes that week</p>';
  if (hasThresholds) return `<div class="legend">${key}</div>`;
  const item = (name: string, what: string) => `<li><b>• ${esc(name)}</b> — ${esc(what)}</li>`;
  return (
    `<div class="legend">${key}<div class="two-lists">` +
    '<div><p class="semi">Safety Metrics</p><ul>' +
    item('Speeding Event Rate', 'Netradyne Violations') +
    item('Seatbelt-Off Rate', 'Netradyne Violations') +
    item('Distractions Rate', 'Netradyne Violations') +
    item('Sign/Signal Violations Rate', 'Netradyne Violations') +
    item('Following Distance Rate', 'Netradyne Violations') +
    '</ul></div><div><p class="semi">Quality Metrics</p><ul>' +
    item('CDF DPMO', 'Customer Delivery Feedback') +
    item('CED', 'Customer Escalated Defect') +
    item('DCR', 'Delivery Completion DPMO') +
    item('DSB', 'Delivery Success Behavior') +
    item('POD', 'Photo On Delivery') +
    item('PSB', 'Pickup Success Behavior') +
    '</ul></div></div></div>'
  );
}

function overallRows(model: ReportModel, p: Palette): string {
  const cards = model.scorecards;
  const tier: Cell[] = cards.map((c) => ({
    lines: [c.overallStanding ?? '-'],
    tier: c.overallStanding,
  }));
  const score: Cell[] = cards.map((c) => ({
    lines: [c.overallScore === null ? '-' : formatNet(c.overallScore, '0.0')],
    tier: c.overallStanding,
  }));
  const rank: Cell[] = cards.map((c) => {
    const r = model.ranks[c.week];
    return { lines: [r ? `${r.rank} / ${r.total}` : '-'], tier: null };
  });
  const packages: Cell[] = cards.map((c) => ({
    lines: [c.packagesDelivered === null ? '-' : String(c.packagesDelivered)],
    tier: null,
  }));
  return (
    metricRow('Overall Tier', null, tier, p) +
    metricRow('Overall Score', null, score, p) +
    metricRow('Rank', null, rank, p) +
    metricRow('Packages', null, packages, p)
  );
}

/** Page 1. */
export function summaryPage(model: ReportModel, p: Palette): string {
  const chart = overallScoreChart(
    model.scorecards.map((c) => ({ week: c.week, score: c.overallScore })),
    model.thresholds,
    p,
  );
  return (
    '<h2>Overall Score Trend</h2>' +
    `<div class="chart-box">${chart}</div>` +
    '<h2>Legend</h2>' +
    legend(model.thresholds.length > 0) +
    categoryThresholds(model.thresholds, 'Overall', p) +
    '<h2>Weekly Detail — Overall</h2>' +
    weekTable('Metric', model.weeks, overallRows(model, p), p)
  );
}

/** Does any week have a value, score or weight for this metric? */
function hasAnyData(model: ReportModel, metricName: string): boolean {
  return model.weeks.some((week) => {
    const e = model.metrics.get(week)?.get(metricName);
    return (
      e !== undefined &&
      ((e.metricValue !== null && e.metricValue !== '') ||
        e.score !== null ||
        e.weightApplied !== null)
    );
  });
}

/** Page 2: Safety, then CED. */
export function safetyPage(model: ReportModel, p: Palette): string {
  const rows = METRIC_DEFINITIONS.filter(
    (m) => m.name === 'FICO' || thresholdCategoryOf(m.name) === 'Safety',
  )
    .filter((m) => hasAnyData(model, m.name) || m.name === 'PSB')
    .map((m) => metricRow(m.name, m.direction, metricCells(model, m.name), p))
    .join('');
  return (
    categoryThresholds(model.thresholds, 'Safety', p) +
    '<h2>Weekly Detail — Safety</h2>' +
    weekTable('Metric', model.weeks, rows, p) +
    metricThresholds(model.thresholds, 'CED', p) +
    weekTable(
      'Weekly Detail',
      model.weeks,
      metricRow('CED', directionOf('CED'), metricCells(model, 'CED'), p),
      p,
    )
  );
}
