import { describe, expect, it } from 'vitest';
import { distribute } from '../matcher/distribute';
import { ASSOCIATES, ID, ROUTES, SHEETS } from '../matcher/testkit';
import {
  DRAFT_ID,
  addMonth,
  pruneDecisions,
  runLabel,
  sendProblem,
  staleRunIds,
  unsentRoutes,
} from './rules';

describe('run rules', () => {
  it('Associate Data: due for a new import one calendar month after it was imported', () => {
    const local = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9, 30).toISOString();
    expect(addMonth(local(2026, 8, 15))).toBe(local(2026, 9, 15));
    expect(addMonth(local(2026, 1, 31))).toBe(local(2026, 2, 28)); // short months use their last day
    expect(addMonth(local(2026, 12, 10))).toBe(local(2027, 1, 10));
    expect(addMonth('not a date')).toBeNull();
  });

  it('Runs: runs older than 30 days are the ones removed when the app opens', () => {
    const runs = [
      { id: 'a', date: '2026-09-12' },
      { id: 'b', date: '2026-09-13' },
      { id: 'c', date: '2026-10-12' },
      { id: 'd', date: null, updatedAt: new Date(2026, 7, 1, 12).toISOString() },
      { id: 'e', date: null },
    ];
    // Today is Oct 13: 30 days back is Sep 13, so only days before that go.
    expect(staleRunIds(runs, '2026-10-13')).toEqual(['a', 'd']);
    expect(staleRunIds(runs, '2026-10-13', 90)).toEqual([]);
  });

  it('Runs: decisions that no longer fit the routes file are dropped', () => {
    const decisions = {
      CX102: { recipients: [ID.adrian], viaSuggestion: true },
      CX103: { recipients: [ID.barrett] }, // a driver who left the route
      CX104: { recipients: [ID.caleb], manual: true },
      CX105: { skipped: true },
    };
    const pruned = pruneDecisions(decisions, ROUTES);
    expect(Object.keys(pruned).sort()).toEqual(['CX102', 'CX104', 'CX105']);
    expect(Object.keys(decisions).length).toBe(4); // the original is not changed
  });

  it('Runs: Email all leaves out routes with no address and routes already sent', () => {
    const dist = distribute({
      sheets: SHEETS,
      routes: ROUTES,
      associates: ASSOCIATES,
      decisions: {
        CX102: { recipients: [ID.adrian] },
        CX103: { recipients: [ID.amelia] }, // no email on file
      },
    });
    const route = (code: string) => dist.routes.find((r) => r.routeCode === code)!;
    expect(sendProblem(route('CX101'))).toBeNull();
    expect(sendProblem(route('CX103'))).toBe(
      'No email address on file for Amelia Aaron Blackwell.',
    );
    expect(sendProblem(route('CX104'))).toBe(route('CX104').headline);
    expect(sendProblem(null)).toBe('That route is not in this run.');
    expect(unsentRoutes(dist, {})).toEqual(['CX101', 'CX102', 'CX106']);
    expect(unsentRoutes(dist, { CX101: { how: 'emailed' } })).toEqual(['CX102', 'CX106']);
  });

  it('Runs: the label is the station, the short date and the cycle', () => {
    expect(runLabel({ id: DRAFT_ID })).toBe('New run (no route sheet PDF yet)');
    expect(runLabel({ id: 'x', station: 'XXX1', date: '2026-09-24', cycle: 'CYCLE_1' })).toBe(
      'XXX1 · Thu, Sep 24, 2026 · CYCLE_1',
    );
  });
});
