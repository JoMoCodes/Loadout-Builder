// The Performance page's small rules and words: the week range, the filter chips, and the plain
// sentences for what an import, a sync, the reports and the emails did. Plain functions, so they
// can be tested on their own (perfText.test.ts).

import type {
  EmailOutcome,
  GenerateOutcome,
  PerfDriverRow,
  PerfImportSummary,
  PerfKind,
  PerfProgress,
  PerfScoreExplanation,
  SyncSummary,
  WeekRange,
} from '../../../shared/performance';
import { PERF_KIND_WORDS } from '../../../shared/performance';
import type { WeekRangeChoice } from '../../../shared/performanceSettings';
import type { Tone } from '../../ui/chip';
import { plural } from '../dataPages/format';

// ------------------------------------------------------------------------------ weeks

/**
 * The weeks the page works on. A remembered end that is no longer one of the weeks brought in
 * falls back to the oldest (from) or newest (to) week. Null when there are no weeks at all.
 */
export function effectiveRange(
  weeks: readonly string[],
  choice: WeekRangeChoice,
): WeekRange | null {
  if (weeks.length === 0) return null;
  const first = weeks[0]!;
  const last = weeks[weeks.length - 1]!;
  const from = choice.from && weeks.includes(choice.from) ? choice.from : first;
  const to = choice.to && weeks.includes(choice.to) ? choice.to : last;
  return from <= to ? { from, to } : { from: first, to: last };
}

export const QUICK_PICKS = [
  { id: 'last-1', label: 'Last week', weeks: 1 },
  { id: 'last-4', label: 'Last 4', weeks: 4 },
  { id: 'last-8', label: 'Last 8', weeks: 8 },
  { id: 'last-13', label: 'Last 13', weeks: 13 },
  { id: 'all', label: 'All', weeks: null },
] as const;

/** The range a quick pick stands for. "All" is remembered as no ends at all. */
export function quickRange(weeks: readonly string[], count: number | null): WeekRangeChoice {
  if (count === null || weeks.length === 0) return { from: null, to: null };
  const shown = weeks.slice(-count);
  return { from: shown[0] ?? null, to: shown[shown.length - 1] ?? null };
}

/** Which quick pick (if any) the range is now. */
export function quickPickOf(weeks: readonly string[], range: WeekRange | null): string | null {
  if (!range || weeks.length === 0) return null;
  const last = weeks[weeks.length - 1]!;
  if (range.to !== last) return null;
  const count = weeks.indexOf(range.to) - weeks.indexOf(range.from) + 1;
  if (range.from === weeks[0] && count === weeks.length) return 'all';
  return QUICK_PICKS.find((pick) => pick.weeks === count)?.id ?? null;
}

/** "2026-W31 to 2026-W40", or one week on its own. */
export function rangeWords(range: WeekRange | null): string {
  if (!range) return 'no weeks';
  return range.from === range.to ? range.from : `${range.from} to ${range.to}`;
}

// ---------------------------------------------------------------------------- filters

export const STATUS_CHOICES = [
  { id: 'ACTIVE', label: 'Active' },
  { id: 'INACTIVE', label: 'Inactive' },
  { id: 'OFFBOARDED', label: 'Offboarded' },
  { id: 'ALL', label: 'All' },
] as const;

export const TIERS = ['Platinum', 'Gold', 'Silver', 'Bronze'] as const;

export const ACTIVITY_CHOICES = [
  { id: 'all', label: 'Everyone' },
  { id: 'in-range', label: 'Had a scorecard' },
  { id: 'none', label: 'No scorecard' },
] as const;

export interface DriverFilters {
  status: string;
  tiers: string[];
  activity: string;
}

/** Reads the remembered chips ("status:ACTIVE", "tier:Gold", "activity:in-range"). */
export function readFilters(saved: readonly string[]): DriverFilters {
  const of = (prefix: string) =>
    saved
      .filter((item) => item.startsWith(`${prefix}:`))
      .map((item) => item.slice(prefix.length + 1));
  const status = of('status')[0];
  const activity = of('activity')[0];
  return {
    status: STATUS_CHOICES.some((choice) => choice.id === status) ? status! : 'ALL',
    tiers: of('tier').filter((tier) => (TIERS as readonly string[]).includes(tier)),
    activity: ACTIVITY_CHOICES.some((choice) => choice.id === activity) ? activity! : 'all',
  };
}

/** The chips to remember. "All" and "Everyone" are remembered as no chip. */
export function writeFilters(filters: DriverFilters): string[] {
  const out: string[] = [];
  if (filters.status !== 'ALL') out.push(`status:${filters.status}`);
  for (const tier of filters.tiers) out.push(`tier:${tier}`);
  if (filters.activity !== 'all') out.push(`activity:${filters.activity}`);
  return out;
}

/** A blank status counts as offboarded, as in the old app. */
export function statusOf(row: { status: string }): string {
  const status = row.status.trim().toUpperCase();
  return status === '' ? 'OFFBOARDED' : status;
}

export function passesFilters(row: PerfDriverRow, filters: DriverFilters): boolean {
  if (filters.status !== 'ALL' && statusOf(row) !== filters.status) return false;
  if (filters.tiers.length > 0 && !filters.tiers.includes(row.latestTier ?? '')) return false;
  if (filters.activity === 'in-range' && !row.activeInRange) return false;
  if (filters.activity === 'none' && row.activeInRange) return false;
  return true;
}

/** Every text a driver's line shows, for the search. */
export function rowTexts(row: PerfDriverRow): string[] {
  return [
    row.name,
    row.transporterId,
    statusOf(row),
    row.latestWeek ?? '',
    row.latestTier ?? '',
    numberText(row.latestScore, 1),
    row.latestRankDisplay,
    numberText(row.latestPackages, 0),
    ...Object.values(row.averagesDisplay ?? {}),
    deltaText(row.trend?.scoreDelta ?? null),
  ];
}

/** The table's search, matched the way the table's own search box matches. */
export function matchesSearch(row: PerfDriverRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return rowTexts(row).some((text) => text.toLowerCase().includes(q));
}

// ------------------------------------------------------------------------- the table

/** The chip colour for a tier. The word is always on the chip too. */
export function tierTone(tier: string | null): Tone {
  switch (tier) {
    case 'Platinum':
      return 'info';
    case 'Gold':
      return 'warn';
    case 'Bronze':
      return 'bad';
    default:
      return 'neutral';
  }
}

/** "93.58", or '' for none. */
export function numberText(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return '';
  return String(Number(value.toFixed(digits)));
}

/** "+1.5" for a rise (or no change), "-2.0" for a fall, '' for none. */
export function deltaText(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '';
  return value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

/** Which kind of safety event each red count stands for (null: every kind that counts). */
export const SAFETY_COLUMNS = [
  { id: 'safety-total', key: 'total', header: 'Program impact', metricType: null },
  { id: 'safety-speeding', key: 'speeding', header: 'Speeding', metricType: 'Speeding' },
  { id: 'safety-sign', key: 'signSignal', header: 'Sign/Signal', metricType: 'Sign Signal' },
  {
    id: 'safety-distraction',
    key: 'distraction',
    header: 'Distraction',
    metricType: 'Distraction',
  },
  {
    id: 'safety-following',
    key: 'followingDistance',
    header: 'Following distance',
    metricType: 'Following Distance',
  },
  { id: 'safety-seatbelt', key: 'seatbelt', header: 'Seatbelt', metricType: 'Seatbelt' },
] as const;

/** "Since 2026-W39: 3 moved up a tier, 2 moved down, 4 new safety events." */
export function changesWords(changes: {
  newestWeek: string | null;
  previousWeek: string | null;
  tierUp: number;
  tierDown: number;
  newSafetyEvents: number;
}): string {
  if (!changes.newestWeek) return '';
  if (!changes.previousWeek) return `${changes.newestWeek} is the only week brought in so far.`;
  const bits = [
    `${plural(changes.tierUp, 'driver')} moved up a tier`,
    `${changes.tierDown} moved down`,
    plural(changes.newSafetyEvents, 'new safety event'),
  ];
  return `${changes.newestWeek} compared with ${changes.previousWeek}: ${bits.join(', ')}.`;
}

/** "Gold to Platinum", for one driver in the "What changed" list. */
export function tierMoveWords(move: { from: string; to: string }): string {
  return `${move.from} to ${move.to}`;
}

// ---------------------------------------------------------------------------- results

/** "Making report 3 of 12...", "Emailing 3 of 12...": the one being worked on now. */
export function progressWords(progress: PerfProgress): string {
  const { done, total } = progress;
  if (done >= total) {
    return progress.job === 'email' ? 'Finishing the emails...' : 'Finishing the reports...';
  }
  const now = Math.min(done + 1, total);
  return progress.job === 'email'
    ? `Emailing ${now} of ${total}...`
    : `Making report ${now} of ${total}...`;
}

/** "Brought in 10 files: 647 rows, 16 new drivers, weeks 2026-W31 to 2026-W40." */
export function importWords(summary: PerfImportSummary): string {
  const what = PERF_KIND_WORDS[summary.kind];
  if (summary.filesRead === 0) return `Nothing new to bring in for ${what.the}.`;
  const bits = [plural(summary.rows, 'row')];
  if (summary.driversAdded > 0) bits.push(plural(summary.driversAdded, 'new driver'));
  const weeks = [...summary.weeks].sort();
  if (weeks.length === 1) bits.push(`week ${weeks[0]}`);
  else if (weeks.length > 1) bits.push(`weeks ${weeks[0]} to ${weeks[weeks.length - 1]}`);
  return `Brought in ${plural(summary.filesRead, 'file')}: ${bits.join(', ')}.`;
}

/** "Saved the check file "x.csv": 3 drivers, 10 weeks, 30 rows." */
export function checkFileWords(done: {
  fileName: string;
  drivers: number;
  weeks: number;
  rows: number;
}): string {
  return (
    `Saved the check file "${done.fileName}": ${plural(done.drivers, 'driver')}, ` +
    `${plural(done.weeks, 'week')}, ${plural(done.rows, 'row')}.`
  );
}

/** "3 new files, 2 weeks updated." or "Everything is already up to date." */
export function syncWords(summary: SyncSummary): string {
  const lines: string[] = [];
  if (summary.newFiles === 0) lines.push('Everything is already up to date.');
  else
    lines.push(
      `${plural(summary.newFiles, 'new file')}, ${plural(summary.rows, 'row')}, ` +
        `${plural(summary.weeksUpdated, 'week')} updated.`,
    );
  if (summary.missingFolders.length > 0) {
    const names = summary.missingFolders.map((kind) => PERF_KIND_WORDS[kind].title);
    lines.push(
      `${summary.missingFolders.length === 1 ? 'One folder is' : 'Some folders are'} not there now, so ${joinAnd(names)} ${names.length === 1 ? 'was' : 'were'} skipped.`,
    );
  }
  if (summary.problems.length > 0)
    lines.push(`${plural(summary.problems.length, 'problem')} found.`);
  return lines.join(' ');
}

/** "Sent 12, could not send 1: no address on file." */
export function emailWords(outcome: EmailOutcome): string {
  const failed = outcome.notSent.length;
  if (failed === 0) return `Sent ${outcome.sent}.`;
  const reasons = new Map<string, number>();
  for (const one of outcome.notSent) reasons.set(one.reason, (reasons.get(one.reason) ?? 0) + 1);
  const why =
    reasons.size === 1
      ? [...reasons.keys()][0]!
      : [...reasons.entries()].map(([reason, count]) => `${reason} (${count})`).join(', ');
  return `Sent ${outcome.sent}, could not send ${failed}: ${why}.`;
}

/** What making reports did, or '' when the folder window was closed. */
export function generateWords(outcome: GenerateOutcome): string {
  if (outcome.status === 'cancelled') return '';
  if (outcome.status === 'nothing')
    return 'None of these drivers has a scorecard in these weeks, so no reports were made.';
  const lines = [
    `Made ${plural(outcome.written, 'report')} in the folder "${outcome.folderName}".`,
  ];
  const skipped = outcome.skipped ?? 0;
  if (skipped > 0) {
    lines.push(
      skipped === 1
        ? '1 driver had no scores in these weeks, so no report was made.'
        : `${skipped} drivers had no scores in these weeks, so no report was made.`,
    );
  }
  if (outcome.failed > 0) lines.push(`${plural(outcome.failed, 'report')} could not be made.`);
  return lines.join(' ');
}

// ---------------------------------------------------------------------- explain this score

/** "6.4", "100", "0.5": one decimal place at most. */
export function pointsText(value: number): string {
  return String(Number(value.toFixed(1)));
}

/** "Each metric's score counts for its weight. DCR lost the most: 6.4 of 100 points." */
export function explainWords(explanation: PerfScoreExplanation): string {
  const top = explanation.topDrag;
  if (!top || top.lost === null) {
    return 'None of the metrics that week had both a score and a weight, so none of them counted.';
  }
  const start = "Each metric's score counts for its weight.";
  const total = pointsText(explanation.totalWeight);
  if (top.lost <= 0) return `${start} Every metric scored 100, so no points were lost.`;
  return `${start} ${top.metric} lost the most: ${pointsText(top.lost)} of ${total} points.`;
}

/** One bar of the "points lost each week" chart: the points lost by each series, in order. */
export interface LostWeek {
  week: string;
  parts: number[];
  total: number;
}

/**
 * The "points lost each week" chart: the metrics that lost the most over all the weeks (at most
 * `top`), then "Other" for the rest when any of them lost points.
 */
export function lostByWeek(
  weeks: readonly PerfScoreExplanation[],
  top = 4,
): { series: string[]; rows: LostWeek[] } {
  const totals = new Map<string, number>();
  for (const week of weeks) {
    for (const item of week.items) {
      if (item.counted && (item.lost ?? 0) > 0) {
        totals.set(item.metric, (totals.get(item.metric) ?? 0) + (item.lost ?? 0));
      }
    }
  }
  // Most lost first; a tie keeps the order they were first seen in.
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([metric]) => metric);
  const named = ranked.slice(0, top);
  const hasOther = ranked.length > top;
  const series = hasOther ? [...named, 'Other'] : named;
  const rows = weeks.map((week) => {
    const parts = series.map(() => 0);
    for (const item of week.items) {
      if (!item.counted) continue;
      const at = named.indexOf(item.metric);
      const index = at >= 0 ? at : hasOther ? named.length : -1;
      if (index >= 0) parts[index]! += item.lost ?? 0;
    }
    return { week: week.week, parts, total: week.totalLost };
  });
  return { series, rows };
}

/** What the chart says out loud: each week's points lost, and by what. */
export function lostChartLabel(chart: { series: string[]; rows: LostWeek[] }): string {
  if (chart.rows.length === 0) return 'No weeks to show.';
  const weeks = chart.rows.map((row) => {
    const bits = chart.series
      .map((name, index) => ({ name, lost: row.parts[index] ?? 0 }))
      .filter((bit) => bit.lost > 0)
      .map((bit) => `${bit.name} ${pointsText(bit.lost)}`);
    return `${row.week}: ${pointsText(row.total)} points lost${bits.length ? ` (${bits.join(', ')})` : ''}`;
  });
  return `Points lost each week. ${weeks.join('. ')}.`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (value: number) => String(value).padStart(2, '0');

/** "Oct 11, 2026 at 09:05 AM", or '' for none. */
export function whenWords(iso: string | null): string {
  if (!iso) return '';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  const hour = when.getHours() % 12 || 12;
  const half = when.getHours() < 12 ? 'AM' : 'PM';
  return `${MONTHS[when.getMonth()]} ${two(when.getDate())}, ${when.getFullYear()} at ${two(hour)}:${two(when.getMinutes())} ${half}`;
}

/** Short names for the missing-weeks warning ("No DSB file for 2026-W33"). */
const SHORT: Record<PerfKind, string> = {
  thresholds: 'thresholds',
  scorecards: 'scorecard',
  pod: 'POD',
  cdf: 'CDF',
  dsb: 'DSB',
  psb: 'PSB',
  dcr: 'DCR',
  'dcr-totals': 'DCR totals',
  safety: 'safety',
};

/** "No DSB file for 2026-W33." / "No DSB file for 2026-W31, 2026-W33 and 2 more weeks." */
export function missingWeeksWords(kind: PerfKind, weeks: readonly string[]): string {
  if (weeks.length === 0) return '';
  const shown = weeks.slice(0, 3);
  const more = weeks.length - shown.length;
  const list = more > 0 ? `${shown.join(', ')} and ${plural(more, 'more week')}` : joinAnd(shown);
  return `No ${SHORT[kind]} file for ${list}.`;
}

/** "a, b and c". */
export function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
