// The Dashboard's small rules and words: which weeks it shows, how numbers are written, the
// coaching reasons in plain words, and the "How is this worked out?" explanations. Plain
// functions, so they can be tested on their own (words.test.ts).

import type { PerfComplianceRow, PerfDashboardView, WeekRange } from '../../../shared/performance';
import type { WeekRangeChoice } from '../../../shared/performanceSettings';
import type { Tone } from '../../ui/chip';

// ------------------------------------------------------------------------------ weeks

export const QUICK_PICKS = [
  { id: 'last-1', label: 'Last week', weeks: 1 },
  { id: 'last-4', label: 'Last 4', weeks: 4 },
  { id: 'last-8', label: 'Last 8', weeks: 8 },
  { id: 'last-13', label: 'Last 13', weeks: 13 },
  { id: 'all', label: 'All', weeks: null },
] as const;

export type QuickPickId = (typeof QUICK_PICKS)[number]['id'];

/** Nothing chosen (both ends empty): every week, on the Dashboard and the Performance page. */
export function isAllWeeks(choice: WeekRangeChoice | null | undefined): boolean {
  return !choice || (choice.from === null && choice.to === null);
}

/**
 * The weeks the Dashboard shows. With nothing chosen (both ends empty) it is every week brought
 * in, the same as the Performance page. A remembered end that is no longer one of the weeks
 * brought in falls back to the oldest (from) or newest (to) week. Null when there are no weeks.
 */
export function dashboardRange(
  weeks: readonly string[],
  choice: WeekRangeChoice | null | undefined,
): WeekRange | null {
  if (weeks.length === 0) return null;
  const first = weeks[0]!;
  const last = weeks[weeks.length - 1]!;
  if (!choice || isAllWeeks(choice)) return { from: first, to: last };
  const from = choice.from && weeks.includes(choice.from) ? choice.from : first;
  const to = choice.to && weeks.includes(choice.to) ? choice.to : last;
  return from <= to ? { from, to } : { from: to, to: from };
}

/** The range a quick pick stands for: the newest `count` weeks (fewer if fewer were brought in). */
export function quickRange(weeks: readonly string[], count: number): WeekRange | null {
  if (weeks.length === 0) return null;
  const shown = weeks.slice(-count);
  return { from: shown[0]!, to: shown[shown.length - 1]! };
}

/** What a quick pick remembers: "All" is no ends at all (every week, even ones brought in later). */
export function quickChoice(
  weeks: readonly string[],
  count: number | null,
): WeekRangeChoice | null {
  if (count === null) return { from: null, to: null };
  return quickRange(weeks, count);
}

/**
 * Which quick pick is lit: "All" when nothing is chosen (a null `choice`, or both ends empty),
 * else the pick the range matches, or null when it was chosen by hand. Leave `choice` out to
 * match by the range alone.
 */
export function quickPickOf(
  weeks: readonly string[],
  range: WeekRange | null,
  choice?: WeekRangeChoice | null,
): QuickPickId | null {
  if (!range || weeks.length === 0) return null;
  if (choice !== undefined && isAllWeeks(choice)) return 'all';
  if (range.to !== weeks[weeks.length - 1]) return null;
  const count = weeks.indexOf(range.to) - weeks.indexOf(range.from) + 1;
  // With only 3 weeks in, "Last 4" and "Last 8" are the same weeks: the smallest pick wins.
  const exact = QUICK_PICKS.find((pick) => pick.weeks === count);
  if (exact) return exact.id;
  if (range.from === weeks[0]) {
    return (
      QUICK_PICKS.find((pick) => pick.weeks !== null && pick.weeks >= weeks.length)?.id ?? null
    );
  }
  return null;
}

/** How many weeks a range covers, counting only weeks brought in. */
export function weeksIn(weeks: readonly string[], range: WeekRange | null): number {
  if (!range) return weeks.length;
  return weeks.filter((week) => week >= range.from && week <= range.to).length;
}

/** "2026-W40", or "2026-W31 to 2026-W40", or "every week". */
export function rangeWords(range: WeekRange | null): string {
  if (!range) return 'every week';
  return range.from === range.to ? range.from : `${range.from} to ${range.to}`;
}

// ------------------------------------------------------------------------------ numbers

const MINUS = '−';

/** A score with one decimal: "93.6". A dash when there is none. */
export function score(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return value.toFixed(1);
}

/** A change with its sign: "+1.2", "−0.8", "0.0". */
export function signed(value: number, decimals = 1): string {
  const text = Math.abs(value).toFixed(decimals);
  if (Number(text) === 0) return (0).toFixed(decimals);
  return `${value > 0 ? '+' : MINUS}${text}`;
}

/** A whole number with thousands commas: "12,480". */
export function count(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

/** "1 driver", "2 drivers". */
export function plural(n: number, word: string, many = `${word}s`): string {
  return `${count(n)} ${n === 1 ? word : many}`;
}

/** A number without needless decimals: 10.5 -> "10.5", 39.02 -> "39", 11 -> "11". */
function short(value: number, decimals: number): string {
  return String(Number(value.toFixed(decimals)));
}

export type Direction = 'up' | 'down' | 'same';

export function directionOf(change: number, decimals = 1): Direction {
  if (Number(Math.abs(change).toFixed(decimals)) === 0) return 'same';
  return change > 0 ? 'up' : 'down';
}

/** The tone of a change: green when it went the good way, red when it went the bad way. */
export function changeTone(direction: Direction, upIsGood: boolean | null): Tone {
  if (direction === 'same' || upIsGood === null) return 'neutral';
  return (direction === 'up') === upIsGood ? 'ok' : 'bad';
}

// ------------------------------------------------------------------------------ tiers

export const TIERS = ['Platinum', 'Gold', 'Silver', 'Bronze'] as const;

/** The colour each tier is drawn in, from the theme's tokens (the words always say it too). */
export const TIER_COLOUR: Record<string, string> = {
  Platinum: 'var(--info)',
  Gold: 'var(--warn)',
  Silver: 'var(--neutral)',
  Bronze: 'var(--bad)',
};

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

// ------------------------------------------------------------------------------ people

/** A coaching reason from the rules, said in plain words. Unknown wording is kept as it is. */
export function reasonWords(reason: string): string {
  let match = /^Currently Bronze \((.+)\)$/.exec(reason);
  if (match) return `In Bronze in ${match[1]}`;
  match = /^Score declined (\d+) weeks running \((.+) -> (.+)\)$/.exec(reason);
  if (match) return `Score fell ${match[1]} weeks running (${match[2]} → ${match[3]})`;
  match = /^(\w+): (.+) in (\d+) consecutive weeks$/.exec(reason);
  if (match) return `${match[2]} (${match[1]}) ${match[3]} weeks in a row`;
  return reason;
}

/** "DCR is costing the most points (score 39, weight 10.5)", or null when none is known. */
export function dragWords(flag: {
  topDragMetric: string | null;
  topDragScore: number | null;
  topDragWeight: number | null;
}): string | null {
  if (!flag.topDragMetric) return null;
  const bits: string[] = [];
  if (flag.topDragScore !== null) bits.push(`score ${short(flag.topDragScore, 0)}`);
  if (flag.topDragWeight !== null) bits.push(`weight ${short(flag.topDragWeight, 1)}`);
  const tail = bits.length > 0 ? ` (${bits.join(', ')})` : '';
  return `${flag.topDragMetric} is costing the most points${tail}`;
}

/** The ID-expiry alerts, expired first (longest ago first), then soonest to expire. */
export function idAlerts(rows: readonly PerfComplianceRow[]): PerfComplianceRow[] {
  const rank = (row: PerfComplianceRow) => (row.severity === 'Expired' ? 0 : 1);
  return rows
    .filter((row) => row.isAlert)
    .slice()
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0) ||
        a.name.localeCompare(b.name),
    );
}

/** "Expired 49 days ago", "Expires today", "Expires in 9 days". */
export function idWords(row: PerfComplianceRow): string {
  const days = row.daysRemaining;
  if (days === null) return row.statusDisplay;
  if (days < 0) return `Expired ${plural(-days, 'day')} ago`;
  if (days === 0) return 'Expires today';
  return `Expires in ${plural(days, 'day')}`;
}

// ------------------------------------------------------------------------------ explanations

export interface Explanation {
  title: string;
  paragraphs: string[];
}

export type ExplainId =
  'fleet' | 'tiers' | 'packages' | 'safety' | 'coaching' | 'ids' | 'movers' | 'trend';

/** What each "How is this worked out?" button says. */
export function explanation(id: ExplainId, view: PerfDashboardView): Explanation {
  const latest = view.latestWeek ?? 'the newest week';
  const before = view.previousWeek;
  const range = rangeWords(view.range);
  const rules = view.rules;
  switch (id) {
    case 'fleet':
      return {
        title: 'Fleet average score',
        paragraphs: [
          `The average of every driver's Overall Score in ${latest}. ${plural(view.activeDrivers, 'driver')} had a scorecard in the weeks shown.`,
          before
            ? `The change compares it with the average in ${before}, the week before.`
            : 'There is no week before this one to compare it with.',
          'The small line shows the average for each week you picked, oldest on the left.',
        ],
      };
    case 'tiers':
      return {
        title: 'Tiers',
        paragraphs: [
          `How many drivers ended ${latest} in each tier, from their scorecards: Platinum, Gold, Silver and Bronze.`,
          before
            ? `"In" counts drivers who were in a different tier in ${before} and moved into this one. "Out" counts drivers who left it.`
            : 'There is no week before this one, so no moves in or out are shown.',
        ],
      };
    case 'packages':
      return {
        title: 'Packages delivered',
        paragraphs: [
          `Every driver's packages delivered in ${latest}, added up from their scorecards.`,
          before
            ? `The change compares it with ${before}, the week before.`
            : 'There is no week before this one to compare it with.',
        ],
      };
    case 'safety':
      return {
        title: 'Drivers with safety events',
        paragraphs: [
          `How many drivers had at least one safety event in ${range} that counts against the program. A driver with several events is counted once.`,
          'Events marked "None" for program impact in the safety file are left out.',
        ],
      };
    case 'coaching':
      return {
        title: 'Who needs a word',
        paragraphs: [
          'A driver is on this list when, in the weeks shown, any of these is true:',
          `- They are in Bronze in their newest week. (High)`,
          `- They dropped a tier since the week before. (High)`,
          `- Their score fell ${rules.atRiskDecliningWeeks} weeks running. (Watch)`,
          `- The same failure reason showed up ${rules.recurringCategoryWeeks} weeks in a row. (Watch)`,
          'High comes first, then Watch; lowest score first within each.',
          'The metric "costing the most points" is the one losing the most of the score in their newest week: its weight times what it is short of 100.',
          'The week counts can be changed in Settings.',
        ],
      };
    case 'ids':
      return {
        title: 'ID expiry',
        paragraphs: [
          `Drivers whose ID has already expired come first, then those whose ID expires within ${plural(rules.complianceWindowDays, 'day')}.`,
          'The dates come from the driver list. The number of days can be changed in Settings.',
        ],
      };
    case 'movers':
      return {
        title: 'Movers',
        paragraphs: [
          `Each driver's Overall Score in their first week with a scorecard in ${range}, against their last.`,
          `The ${rules.topN} biggest rises and the ${rules.topN} biggest falls are shown. How many can be changed in Settings.`,
          view.range && view.range.from === view.range.to
            ? 'With only one week picked nobody can move. Pick Last 4 or more.'
            : '',
        ].filter(Boolean),
      };
    case 'trend':
      return {
        title: 'Trend',
        paragraphs: [
          'The line is the fleet average Overall Score for each week you picked.',
          'The bars add up each failure reason (POD, CDF, DSB and PSB) over those weeks.',
          'A reason is "growing" when it happened more in the second half of the weeks than in the first half, and "shrinking" when it happened less.',
        ],
      };
  }
}

/** Plain words for whether a failure reason is growing. */
export function categoryTrend(
  firstHalf: number,
  secondHalf: number,
): 'growing' | 'shrinking' | 'steady' {
  if (secondHalf > firstHalf) return 'growing';
  if (secondHalf < firstHalf) return 'shrinking';
  return 'steady';
}
