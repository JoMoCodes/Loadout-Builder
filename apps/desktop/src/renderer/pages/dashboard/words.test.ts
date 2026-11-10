// The Dashboard's small rules and words, checked on their own. Names come from the made-up people
// in packages/fixtures (scripts/parity/wpa/expected).

import { describe, expect, it } from 'vitest';
import type { PerfComplianceRow } from '../../../shared/performance';
import { effectiveRange } from '../performance/perfText';
import { newSection } from '../../../shared/dashboardLayout';
import type { PerfDashboardView } from '../../../shared/performance';
import { freeTicks, scoreTicks } from './charts';
import {
  categoryTrend,
  coachingFor,
  customExplanation,
  customFormat,
  customSpec,
  customTitle,
  explanation,
  layoutRange,
  reasonKind,
  targetState,
  targetWords,
  dashboardRange,
  dragWords,
  idAlerts,
  idWords,
  quickChoice,
  quickPickOf,
  quickRange,
  reasonWords,
  signed,
} from './words';

const WEEKS = ['2026-W36', '2026-W37', '2026-W38', '2026-W39', '2026-W40'];

describe('the weeks shown', () => {
  it('is every week when nothing is chosen, the same as the Scorecards page', () => {
    expect(dashboardRange(WEEKS, { from: null, to: null })).toEqual({
      from: '2026-W36',
      to: '2026-W40',
    });
    expect(dashboardRange(WEEKS, undefined)).toEqual({ from: '2026-W36', to: '2026-W40' });
    expect(effectiveRange(WEEKS, { from: null, to: null })).toEqual(
      dashboardRange(WEEKS, { from: null, to: null }),
    );
    expect(dashboardRange([], { from: null, to: null })).toBeNull();
  });

  it('keeps a remembered range, and fills in an end that is no longer there', () => {
    expect(dashboardRange(WEEKS, { from: '2026-W37', to: '2026-W39' })).toEqual({
      from: '2026-W37',
      to: '2026-W39',
    });
    expect(dashboardRange(WEEKS, { from: '2026-W20', to: null })).toEqual({
      from: '2026-W36',
      to: '2026-W40',
    });
  });

  it('knows which quick pick a range is', () => {
    expect(quickRange(WEEKS, 4)).toEqual({ from: '2026-W37', to: '2026-W40' });
    expect(quickPickOf(WEEKS, { from: '2026-W40', to: '2026-W40' })).toBe('last-1');
    expect(quickPickOf(WEEKS, { from: '2026-W37', to: '2026-W40' })).toBe('last-4');
    // Only five weeks in: all of them is "Last 8".
    expect(quickPickOf(WEEKS, { from: '2026-W36', to: '2026-W40' })).toBe('last-8');
    expect(quickPickOf(WEEKS, { from: '2026-W37', to: '2026-W39' })).toBeNull();
  });

  it('lights "All" when nothing is chosen, and All remembers no ends', () => {
    const all = { from: '2026-W36', to: '2026-W40' };
    expect(quickPickOf(WEEKS, all, { from: null, to: null })).toBe('all');
    // The same weeks chosen with a quick pick keep that pick lit.
    expect(quickPickOf(WEEKS, all, { from: '2026-W36', to: '2026-W40' })).toBe('last-8');
    expect(quickChoice(WEEKS, null)).toEqual({ from: null, to: null });
    expect(quickChoice(WEEKS, 1)).toEqual({ from: '2026-W40', to: '2026-W40' });
    expect(quickPickOf([], null, { from: null, to: null })).toBeNull();
  });
});

describe('the words', () => {
  it('writes changes with their sign', () => {
    expect(signed(1.234)).toBe('+1.2');
    expect(signed(-1.13)).toBe('−1.1');
    expect(signed(0.04)).toBe('0.0');
  });

  it('says the coaching reasons in plain words', () => {
    expect(reasonWords('Currently Bronze (2026-W40)')).toBe('In Bronze in 2026-W40');
    expect(reasonWords('Score declined 3 weeks running (100.0 -> 93.6)')).toBe(
      'Score fell 3 weeks running (100.0 → 93.6)',
    );
    expect(reasonWords('POD: Blurry Photo in 3 consecutive weeks')).toBe(
      'Blurry Photo (POD) 3 weeks in a row',
    );
    expect(reasonWords('Dropped from Platinum to Gold')).toBe('Dropped from Platinum to Gold');
  });

  it('names the metric costing the most points', () => {
    expect(dragWords({ topDragMetric: 'DCR', topDragScore: 39.02, topDragWeight: 10.5 })).toBe(
      'DCR is costing the most points (score 39, weight 10.5)',
    );
    expect(dragWords({ topDragMetric: null, topDragScore: null, topDragWeight: null })).toBeNull();
  });

  it('lists expired IDs first, then those expiring soon, and leaves out the rest', () => {
    const row = (name: string, days: number, severity: string): PerfComplianceRow => ({
      transporterId: name,
      name,
      status: 'ACTIVE',
      qualifications: '',
      expiresOn: '2026-10-01',
      daysRemaining: days,
      severity,
      isAlert: severity !== 'OK',
      statusDisplay: '',
    });
    const alerts = idAlerts([
      row('Tabitha Luther Chesterfield', 9, 'Expiring soon'),
      row('Gabriel Amelia Wakefield', -21, 'Expired'),
      row('Felicia Wendell Thorne', 200, 'OK'),
      row('Cecil Julian Radcliffe', -49, 'Expired'),
    ]);
    expect(alerts.map(idWords)).toEqual([
      'Expired 49 days ago',
      'Expired 21 days ago',
      'Expires in 9 days',
    ]);
  });

  it('says whether a failure reason is growing', () => {
    expect(categoryTrend(10, 12)).toBe('growing');
    expect(categoryTrend(12, 10)).toBe('shrinking');
    expect(categoryTrend(5, 5)).toBe('steady');
  });
});

describe('the score axis', () => {
  it('covers the values with round numbers', () => {
    expect(scoreTicks(90.28, 95.32)).toEqual({ low: 90, high: 96, ticks: [90, 92, 94, 96] });
    const flat = scoreTicks(91, 91);
    expect(flat.low).toBeLessThan(91);
    expect(flat.high).toBeGreaterThan(91);
  });
});

describe("a layout's own weeks", () => {
  const shared = { from: '2026-W37', to: '2026-W38' };

  it('uses the Scorecards weeks unless the layout keeps its own', () => {
    expect(layoutRange(WEEKS, undefined, shared)).toEqual(shared);
    expect(
      layoutRange(WEEKS, { own: false, pick: 'last-1', from: null, to: null }, shared),
    ).toEqual(shared);
  });

  it('a quick pick moves along as new weeks come in', () => {
    const own = { own: true, pick: 'last-4' as const, from: null, to: null };
    expect(layoutRange(WEEKS, own, shared)).toEqual({ from: '2026-W37', to: '2026-W40' });
    expect(layoutRange([...WEEKS, '2026-W41'], own, shared)).toEqual({
      from: '2026-W38',
      to: '2026-W41',
    });
    expect(layoutRange(WEEKS, { ...own, pick: 'all' }, shared)).toEqual({
      from: '2026-W36',
      to: '2026-W40',
    });
  });

  it('two weeks by hand stay those two weeks', () => {
    const own = { own: true, pick: null, from: '2026-W36', to: '2026-W37' };
    expect(layoutRange(WEEKS, own, shared)).toEqual({ from: '2026-W36', to: '2026-W37' });
    expect(layoutRange([], own, shared)).toBeNull();
  });
});

describe('who needs a word, as a layout wants it', () => {
  const flag = (name: string, severity: string, reasons: string[]) => ({
    name,
    severity,
    reasons,
    latestScore: 90,
  });
  const flags = [
    flag('Carmen Josie Rutherford', 'Watch', ['Score declined 3 weeks running (98.2 -> 95.1)']),
    flag('Amelia Aaron Blackwell', 'High', [
      'Currently Bronze (2026-W40)',
      'POD: Package Too Close in 3 consecutive weeks',
    ]),
    flag('Cleo Silas Jessup', 'Watch', ['POD: Blurry Photo in 3 consecutive weeks']),
    flag('Archer Gresham', 'High', ['Dropped from Platinum to Gold']),
  ];
  const names = (list: Array<{ name: string }>) => list.map((one) => one.name);

  it('reads which rule a reason comes from', () => {
    expect(flags.flatMap((one) => one.reasons).map(reasonKind)).toEqual([
      'falling',
      'bronze',
      'repeating',
      'repeating',
      'dropped',
    ]);
    expect(reasonKind('Something new')).toBe('other');
  });

  it('with every reason on, only puts High first', () => {
    expect(names(coachingFor(flags, newSection('coaching')))).toEqual([
      'Amelia Aaron Blackwell',
      'Archer Gresham',
      'Carmen Josie Rutherford',
      'Cleo Silas Jessup',
    ]);
  });

  it('drops a driver whose only reasons are switched off, and the reason from the rest', () => {
    const kept = coachingFor(flags, { reasons: ['bronze', 'dropped', 'falling'], highOnly: false });
    expect(names(kept)).not.toContain('Cleo Silas Jessup');
    expect(kept[0]!.reasons).toEqual(['Currently Bronze (2026-W40)']);
  });

  it('a driver left with only Watch reasons is Watch', () => {
    const kept = coachingFor(flags, { reasons: ['falling', 'repeating'], highOnly: false });
    expect(kept.map((one) => [one.name, one.severity])).toEqual([
      ['Carmen Josie Rutherford', 'Watch'],
      ['Amelia Aaron Blackwell', 'Watch'],
      ['Cleo Silas Jessup', 'Watch'],
    ]);
    expect(coachingFor(flags, { reasons: ['falling', 'repeating'], highOnly: true })).toEqual([]);
  });

  it('shows only High when asked', () => {
    expect(names(coachingFor(flags, { ...newSection('coaching'), highOnly: true }))).toEqual([
      'Amelia Aaron Blackwell',
      'Archer Gresham',
    ]);
  });
});

describe('targets', () => {
  it('is met on the number itself, either way', () => {
    expect(targetState({ dir: 'min', value: 90 }, 90)).toBe('met');
    expect(targetState({ dir: 'min', value: 90 }, 89.99)).toBe('missed');
    expect(targetState({ dir: 'max', value: 5 }, 5)).toBe('met');
    expect(targetState({ dir: 'max', value: 5 }, 6)).toBe('missed');
    expect(targetState(null, 6)).toBeNull();
    expect(targetState({ dir: 'max', value: 5 }, null)).toBeNull();
  });

  it('is said in plain words', () => {
    const plain = (value: number) => String(value);
    expect(targetWords({ dir: 'min', value: 90 }, 'met', plain)).toBe('On target: 90 or higher');
    expect(targetWords({ dir: 'min', value: 90 }, 'missed', plain)).toBe('Below your target of 90');
    expect(targetWords({ dir: 'max', value: 5 }, 'met', plain)).toBe('On target: 5 or lower');
    expect(targetWords({ dir: 'max', value: 5 }, 'missed', plain)).toBe('Above your limit of 5');
  });
});

describe("a person's own tile", () => {
  const view = {
    latestWeek: '2026-W40',
    previousWeek: '2026-W39',
    range: { from: '2026-W37', to: '2026-W40' },
    rules: {
      atRiskDecliningWeeks: 3,
      recurringCategoryWeeks: 3,
      complianceWindowDays: 30,
      topN: 5,
    },
    activeDrivers: 61,
  } as PerfDashboardView;
  const tile = (more: object) => ({ ...newSection('custom', 'custom-1'), ...more });

  it('names itself from its choices unless it was given a name', () => {
    expect(customTitle(tile({}))).toBe('Average Overall Score');
    expect(customTitle(tile({ number: 'packages', how: 'total' }))).toBe(
      'Total Packages delivered',
    );
    expect(customTitle(tile({ number: 'metric:DCR', how: 'below', limit: 80 }))).toBe(
      'Drivers below 80: DCR score',
    );
    expect(customTitle(tile({ title: 'Mine' }))).toBe('Mine');
  });

  it('asks for the number it was set up with', () => {
    expect(customSpec(tile({ number: 'fail:POD', how: 'above', limit: 2 }))).toEqual({
      id: 'custom-1',
      number: 'fail:POD',
      how: 'above',
      limit: 2,
    });
    // A number the app no longer knows falls back to the Overall Score.
    expect(customSpec(tile({ number: 'gone' })).number).toBe('overall');
  });

  it('writes an average with decimals and a total or a count whole', () => {
    expect(customFormat(tile({}))(84.25)).toBe('84.3');
    expect(customFormat(tile({ number: 'packages' }))(1234.5)).toBe('1,235');
    expect(customFormat(tile({ number: 'packages', how: 'total' }))(12480)).toBe('12,480');
    expect(customFormat(tile({ how: 'below', limit: 80 }))(8)).toBe('8');
  });

  it('explains itself from its choices', () => {
    const said = customExplanation(
      tile({ number: 'metric:DCR', how: 'below', limit: 80, target: { dir: 'max', value: 5 } }),
      { id: 'custom-1', value: 8, before: 4, drivers: 61, series: [] },
      view,
    );
    expect(said.title).toBe('Drivers below 80: DCR score');
    expect(said.paragraphs).toEqual([
      'How many drivers had DCR score below 80 in 2026-W40. A driver right on 80 is not counted.',
      'This is the score the scorecard gives the metric, from 0 to 100. Higher is better.',
      '61 drivers had this number in 2026-W40.',
      'The change compares it with 2026-W39, the week before.',
      'The small line shows the same number for each week you picked, oldest on the left.',
      'Your target: 5 or lower. The tile turns red when the number is higher.',
    ]);
    expect(
      customExplanation(tile({ how: 'total', number: 'packages' }), undefined, view).paragraphs[0],
    ).toBe("Every driver's packages delivered in 2026-W40, added up.");
  });

  it("a section's explanation says what its own choices change", () => {
    const usual = explanation('coaching', view);
    expect(explanation('coaching', view, newSection('coaching'))).toEqual(usual);
    const less = explanation('coaching', view, {
      ...newSection('coaching'),
      reasons: ['bronze', 'dropped'],
      highOnly: true,
    });
    expect(less.paragraphs.slice(usual.paragraphs.length)).toEqual([
      'This layout leaves out: falling scores, repeated failure reasons.',
      'This layout shows only the High drivers.',
    ]);
    expect(
      explanation('fleet', view, {
        ...newSection('tile-fleet'),
        target: { dir: 'min', value: 90 },
      }).paragraphs.at(-1),
    ).toBe('Your target: 90 or higher. The tile turns red when the number is lower.');
  });
});

describe('the axis for a number that is not a score', () => {
  it('covers the values with a few round numbers', () => {
    expect(freeTicks(11800, 12480)).toEqual({
      low: 11800,
      high: 12600,
      ticks: [11800, 12000, 12200, 12400, 12600],
    });
    expect(freeTicks(0, 8).ticks).toEqual([0, 2, 4, 6, 8]);
    expect(freeTicks(0.2, 0.9).ticks).toEqual([0.2, 0.4, 0.6, 0.8, 1]);
  });

  it('makes room around a single value', () => {
    const { low, high } = freeTicks(5, 5);
    expect(low).toBeLessThan(5);
    expect(high).toBeGreaterThan(5);
    expect(freeTicks(0, 0).low).toBe(0);
  });
});
