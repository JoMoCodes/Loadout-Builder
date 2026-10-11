// The Dashboard's small rules and words, checked on their own. Names come from the made-up people
// in packages/fixtures (scripts/parity/wpa/expected).

import { describe, expect, it } from 'vitest';
import type { PerfComplianceRow } from '../../../shared/performance';
import { effectiveRange } from '../performance/perfText';
import { scoreTicks } from './charts';
import {
  categoryTrend,
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
  it('is every week when nothing is chosen, the same as the Performance page', () => {
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
