// The DSP Workplace day-of sheet, kept to the columns the printed handout needs.

import { longDateLabel, type IsoDate } from './dates';

/**
 * 'cx 16' -> 'CX16'. What two route codes are compared on: case and spacing
 * differ between the sheets that carry a route code, and neither means anything.
 */
export function routeKey(text: string | null | undefined): string {
  return Array.from((text ?? '').toUpperCase())
    .filter((char) => /[\p{L}\p{N}]/u.test(char))
    .join('');
}

/** One route's line from the DWP sheet. `staging` is where that route loads - 'STG.G02'. */
export interface DwpEntry {
  routeCode: string;
  bags: string;
  ovs: string;
  staging: string;
}

export function createDwpEntry(values: Partial<DwpEntry> = {}): DwpEntry {
  return { routeCode: '', bags: '', ovs: '', staging: '', ...values };
}

/**
 * One imported DWP sheet, read by route code. `day` is the date the sheet is
 * for, read off its file name - the sheet itself carries none. null means
 * nobody can tell, which is not the same as "wrong day".
 */
export interface DwpDataSet {
  rows: DwpEntry[];
  day: IsoDate | null;
  sourceFile: string;
  importedAt: Date | null;
}

export function createDwpDataSet(values: Partial<DwpDataSet> = {}): DwpDataSet {
  return { rows: [], day: null, sourceFile: '', importedAt: null, ...values };
}

/** Route code -> its line. Where a code repeats, the first line wins. */
export function byRouteCode(dataSet: Pick<DwpDataSet, 'rows'>): Map<string, DwpEntry> {
  const found = new Map<string, DwpEntry>();
  for (const row of dataSet.rows) {
    const key = routeKey(row.routeCode);
    if (key && !found.has(key)) found.set(key, row);
  }
  return found;
}

/** Route codes the sheet lists more than once, in the order they appear. */
export function duplicateCodes(dataSet: Pick<DwpDataSet, 'rows'>): string[] {
  const seen = new Set<string>();
  const repeated = new Map<string, string>();
  for (const row of dataSet.rows) {
    const key = routeKey(row.routeCode);
    if (!key) continue;
    if (seen.has(key) && !repeated.has(key)) repeated.set(key, row.routeCode);
    seen.add(key);
  }
  return [...repeated.values()];
}

export function dwpDateLabel(dataSet: Pick<DwpDataSet, 'day'>): string {
  return dataSet.day === null ? 'Unknown date' : longDateLabel(dataSet.day);
}

/** What copying the DWP sheet onto the roster actually did. */
export interface DwpApplyResult {
  /** Drivers that took at least one value. */
  filled: number;
  staging: number;
  bags: number;
  ovs: number;
  /** Nothing to match on - route data isn't over yet. */
  noRouteCode: number;
  /** Has a route, and the sheet doesn't carry it. */
  notInSheet: number;
  /** Rows emptied because this sheet has nothing for the route they now hold. */
  cleared: number;
}

export function createDwpApplyResult(values: Partial<DwpApplyResult> = {}): DwpApplyResult {
  return {
    filled: 0,
    staging: 0,
    bags: 0,
    ovs: 0,
    noRouteCode: 0,
    notInSheet: 0,
    cleared: 0,
    ...values,
  };
}

export function dwpSkipped(result: Pick<DwpApplyResult, 'noRouteCode' | 'notInSheet'>): number {
  return result.noRouteCode + result.notInSheet;
}
