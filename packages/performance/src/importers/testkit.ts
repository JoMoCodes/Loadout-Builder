// Helpers for the importer tests: read the made-up export files in packages/fixtures/performance
// and what the old app's own code made from them (scripts/parity/wpa/expected). Not part of the
// public API, and the only file here that reads from disk.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { weekFromFileName } from '../models';
import type { ImportFile } from './csv';
import type { WeekFileResult } from './weekFiles';

const FIXTURES = new URL('../../../fixtures/performance/', import.meta.url);
const EXPECTED = new URL('../../../../scripts/parity/wpa/expected/', import.meta.url);

export type Row = Record<string, unknown>;

/** Plain text order (what the old harness used for file names, IDs and weeks). */
export function ordinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Every file of one kind (a folder under fixtures/performance), sorted by name. */
export function fixtureFiles(kind: string, extension = '.csv'): ImportFile[] {
  const folder = new URL(`${kind}/`, FIXTURES);
  return readdirSync(fileURLToPath(folder))
    .filter((name) => name.toLowerCase().endsWith(extension))
    .sort(ordinal)
    .map((fileName) => ({
      fileName,
      text: readFileSync(fileURLToPath(new URL(fileName, folder)), 'utf8'),
    }));
}

function readExpected<T>(path: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(path, EXPECTED)), 'utf8')) as T;
}

export interface ExpectedOutcome {
  importer: string;
  input: string;
  skipped: boolean;
  filesProcessed: number | null;
  rowsImported: number | null;
  weeks: string[];
  errors: string[];
  otherCounts: Record<string, number | string | null>;
}

/** What the old importer reported (import-results.json). */
export function expectedImport(importer: string): ExpectedOutcome {
  const outcome = readExpected<ExpectedOutcome[]>('import-results.json').find(
    (entry) => entry.importer === importer,
  );
  if (!outcome) throw new Error(`No expected result for ${importer}`);
  return outcome;
}

/** The old importer's extra counts, read from our result by the same names in camelCase. */
export function otherCountsOf(result: object, expected: ExpectedOutcome): Record<string, unknown> {
  const counts: Record<string, unknown> = {};
  for (const key of Object.keys(expected.otherCounts)) {
    counts[key] = (result as Row)[key.charAt(0).toLowerCase() + key.slice(1)];
  }
  return counts;
}

export interface ExpectedTable {
  table: string;
  columns: string[];
  rows: Row[];
}

/** Every row the old app wrote to one table (tables/<name>.json), with its column names as stored. */
export function expectedTable(name: string): ExpectedTable {
  return readExpected<ExpectedTable>(`tables/${name}.json`);
}

/** One driver's file (drivers/<id>.json). */
export function expectedDriver(transporterId: string): Row {
  return readExpected<Row>(`drivers/${transporterId}.json`);
}

/** The week range the per-driver files cover. */
export function expectedRange(): { fromWeek: string; toWeek: string; drivers: string[] } {
  const summary = readExpected<{ fromWeek: string; toWeek: string }>('summary.json');
  const drivers = readExpected<Array<{ transporterId: string }>>('drivers.json').map(
    (driver) => driver.transporterId,
  );
  return { fromWeek: summary.fromWeek, toWeek: summary.toWeek, drivers };
}

/** camelCase field names -> the old table's PascalCase column names. */
export function toColumns(row: object): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.charAt(0).toUpperCase() + key.slice(1)] = value;
  }
  return out;
}

function compareValues(left: unknown, right: unknown): number {
  const a = left ?? null;
  const b = right ?? null;
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === 'string' && typeof b === 'string') return ordinal(a, b);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return ordinal(String(a), String(b));
}

/** Sort rows the way the harness sorted a table: TransporterId, Week, Id, then the other columns. */
export function sortLikeHarness(rows: Row[], columns: readonly string[]): Row[] {
  const first = ['TransporterId', 'Week', 'Id'].filter((key) => columns.includes(key));
  const keys = first.concat(columns.filter((key) => !first.includes(key)));
  return [...rows].sort((a, b) => {
    for (const key of keys) {
      const c = compareValues(a[key], b[key]);
      if (c !== 0) return c;
    }
    return 0;
  });
}

/** Give rows the ids SQLite's autoincrement would have: 1, 2, 3... in the order written. */
export function numbered<T extends object>(rows: readonly T[]): Array<T & { id: number }> {
  return rows.map((row, index) => ({ id: index + 1, ...row }));
}

/** Rows of one file, from a table's expected rows. */
export function rowsFromFile(rows: Row[], fileName: string): Row[] {
  return rows.filter((row) => row.SourceFile === fileName);
}

/** Drop some keys from a row. */
export function without(row: Row, ...keys: string[]): Row {
  const copy = { ...row };
  for (const key of keys) delete copy[key];
  return copy;
}

// ---- the parity checks every week-file reader shares ----------------------------------------

export interface WeekParityCase<Result extends WeekFileResult<object>> {
  /** The old importer's name in import-results.json. */
  importer: string;
  /** The fixture folder. */
  kind: string;
  /** The old table the rows went to. */
  table: string;
  parse: (files: ImportFile | readonly ImportFile[]) => Result;
  /** The table has an autoincrement Id: number the rows 1, 2, 3... in the order written. */
  ids: boolean;
  /** Accept "2026W07" in file names (DCR, DCR totals, Safety). */
  hyphenOptional: boolean;
}

/** The checks against the old app's output, for one week-file reader. */
export function describeWeekParity<Result extends WeekFileResult<object>>(
  options: WeekParityCase<Result>,
): void {
  const files = fixtureFiles(options.kind);
  const expected = expectedImport(options.importer);
  const table = expectedTable(options.table);
  const result = options.parse(files);
  const asColumns = (rows: readonly object[], ids: boolean): Row[] =>
    (ids ? numbered(rows) : rows).map(toColumns);

  describe(`${options.importer}: the made-up files, all together`, () => {
    it('reads every file', () => {
      expect(files.length).toBeGreaterThan(0);
      expect(result.filesProcessed).toBe(files.length);
    });

    it('reports the counts, weeks and errors the old importer reported', () => {
      expect(result.filesProcessed).toBe(expected.filesProcessed);
      expect(result.rowsImported).toBe(expected.rowsImported);
      expect(result.weeks).toEqual(expected.weeks);
      expect(result.replaceWeeks).toEqual(expected.weeks);
      expect(result.errors).toEqual(expected.errors);
      expect(otherCountsOf(result, expected)).toEqual(expected.otherCounts);
    });

    it(`gives exactly the rows the old app wrote to ${options.table}`, () => {
      expect(result.rows.length).toBe(table.rows.length);
      expect(sortLikeHarness(asColumns(result.rows, options.ids), table.columns)).toEqual(
        table.rows,
      );
    });
  });

  describe(`${options.importer}: each made-up file on its own`, () => {
    it.each(files.map((file) => [file.fileName, file] as const))('%s', (fileName, file) => {
      const one = options.parse(file);
      const want = rowsFromFile(table.rows, fileName).map((row) => without(row, 'Id'));
      expect(one.errors).toEqual([]);
      expect(one.filesProcessed).toBe(1);
      expect(one.replaceWeeks).toEqual([weekFromFileName(fileName, options.hyphenOptional)]);
      expect(one.rowsImported).toBe(want.length);
      const got = asColumns(one.rows, false);
      expect(sortLikeHarness(got, table.columns)).toEqual(sortLikeHarness(want, table.columns));
    });
  });
}
