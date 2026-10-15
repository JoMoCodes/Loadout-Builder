// Helpers for the weekly performance storage tests: read the made-up export files in
// packages/fixtures/performance, run the readers over them in the old harness's order, and read
// what the old app's own code stored from them (scripts/parity/wpa/expected/tables). Tests only.

import type { PerfData } from '@loadout/performance';
import {
  parseCdf,
  parseDcr,
  parseDcrTotals,
  parseDsb,
  parsePodFiles,
  parsePsb,
  parseSafety,
  parseScorecards,
  parseThresholds,
  type ImportFile,
  type PdfWords,
} from '@loadout/performance/importers';
import { readPdfWords } from '../../performance/src/importers/pdfWords.node';
import { parseFixtureRoster } from '../../performance/src/importers/testkit';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PerformanceStore } from './performance';

const FIXTURES = resolve(__dirname, '../../fixtures/performance');
const EXPECTED = resolve(__dirname, '../../../scripts/parity/wpa/expected');

export type Row = Record<string, unknown>;

export function ordinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Every file of one kind, sorted by name (the harness's order). */
export function fixtureNames(kind: string, extension = '.csv'): string[] {
  return readdirSync(join(FIXTURES, kind))
    .filter((name) => name.toLowerCase().endsWith(extension))
    .sort(ordinal);
}

export function fixtureFiles(kind: string): ImportFile[] {
  return fixtureNames(kind).map((fileName) => ({
    fileName,
    text: readFileSync(join(FIXTURES, kind, fileName), 'utf8'),
  }));
}

/** The words of every POD report, in name order. */
export async function podFixtures(): Promise<PdfWords[]> {
  const out: PdfWords[] = [];
  for (const fileName of fixtureNames('pod', '.pdf')) {
    const pages = await readPdfWords(new Uint8Array(readFileSync(join(FIXTURES, 'pod', fileName))));
    out.push({ fileName, pages });
  }
  return out;
}

/** Everything the readers make of the fixtures, ready to apply (POD words read once). */
export interface FixtureImports {
  roster: ImportFile[];
  thresholds: ImportFile;
  scorecards: ImportFile[];
  pod: PdfWords[];
  cdf: ImportFile[];
  dsb: ImportFile[];
  psb: ImportFile[];
  dcr: ImportFile[];
  dcrTotals: ImportFile[];
  safety: ImportFile[];
}

export async function loadFixtureImports(): Promise<FixtureImports> {
  const thresholds = fixtureFiles('thresholds');
  if (thresholds.length !== 1 || thresholds[0] === undefined) {
    throw new Error('Expected one thresholds file');
  }
  return {
    roster: fixtureFiles('roster'),
    thresholds: thresholds[0],
    scorecards: fixtureFiles('scorecards'),
    pod: await podFixtures(),
    cdf: fixtureFiles('cdf'),
    dsb: fixtureFiles('dsb'),
    psb: fixtureFiles('psb'),
    dcr: fixtureFiles('dcr'),
    dcrTotals: fixtureFiles('dcr-totals'),
    safety: fixtureFiles('safety'),
  };
}

/**
 * The made-up roster onto the driver list (the `associates` table), as the old app's own
 * importer kept it: each cell as written, trimmed. A driver already on the list is replaced.
 */
export function applyFixtureRoster(perf: PerformanceStore, files: readonly ImportFile[]): void {
  const insert = perf.db.prepare(
    `INSERT INTO associates
       (transporter_id, position_index, name, status, position, qualifications,
        id_expiration, personal_phone, work_phone, email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(transporter_id) DO UPDATE SET
       name = excluded.name, status = excluded.status, position = excluded.position,
       qualifications = excluded.qualifications, id_expiration = excluded.id_expiration,
       personal_phone = excluded.personal_phone, work_phone = excluded.work_phone,
       email = excluded.email`,
  );
  perf.transaction(() => {
    const next =
      ((
        perf.db.prepare('SELECT MAX(position_index) AS n FROM associates').get() as {
          n: number | null;
        }
      ).n ?? -1) + 1;
    parseFixtureRoster(files).forEach((d, index) => {
      insert.run(
        d.transporterId,
        next + index, // kept as it was for a driver already on the list
        d.name,
        d.status,
        d.position,
        d.qualifications,
        d.idExpiration || null,
        d.personalPhone,
        d.workPhone,
        d.email,
      );
    });
  });
}

/** Run every reader and write its result, in the old harness's order. */
export function applyAll(perf: PerformanceStore, files: FixtureImports): void {
  applyFixtureRoster(perf, files.roster);
  perf.applyThresholds(parseThresholds(files.thresholds));
  perf.applyScorecards(parseScorecards(files.scorecards, perf.knownDriverIds()));
  perf.applyPod(parsePodFiles(files.pod));
  perf.applyCdf(parseCdf(files.cdf));
  perf.applyDsb(parseDsb(files.dsb));
  perf.applyPsb(parsePsb(files.psb));
  perf.applyDcr(parseDcr(files.dcr));
  perf.applyDcrTotals(parseDcrTotals(files.dcrTotals));
  perf.applySafety(parseSafety(files.safety));
}

export interface ExpectedTable {
  table: string;
  columns: string[];
  rows: Row[];
}

export function expectedTable(name: string): ExpectedTable {
  return JSON.parse(
    readFileSync(join(EXPECTED, 'tables', `${name}.json`), 'utf8'),
  ) as ExpectedTable;
}

export function expectedTableRows(): Record<string, number> {
  return (
    JSON.parse(readFileSync(join(EXPECTED, 'summary.json'), 'utf8')) as {
      tableRows: Record<string, number>;
    }
  ).tableRows;
}

/**
 * Which old table each list of PerfData came from. The drivers come from the `associates` table
 * now, so a blank in a row the roster filled reads as null (the old table kept '' there): compare
 * them with `driversAlike`.
 */
export const PERF_DATA_TABLES: Record<keyof PerfData, string> = {
  drivers: 'Drivers',
  scorecards: 'WeeklyScorecards',
  metrics: 'MetricEntries',
  thresholds: 'MetricThresholds',
  pod: 'PodWeekEntries',
  cdf: 'CdfWeekEntries',
  dsb: 'DsbWeekEntries',
  psb: 'PsbWeekEntries',
  psbImportedWeeks: 'PsbImportedWeeks',
  dcrEvents: 'DcrEvents',
  dcrTotals: 'DcrWeekTotals',
  safetyEvents: 'SafetyEvents',
};

/**
 * Drivers rows as both sides can agree on them: every '' read as null (the old table kept ''
 * where the roster had a blank, the driver list reads it as null); no status read as OFFBOARDED
 * (what the driver list gives a driver known from a scorecard alone); and runs of spaces in a
 * name closed up (the old app renamed a driver from each scorecard, the driver list keeps the
 * associate export's name, and in the made-up data the two differ only in spacing).
 */
export function driversAlike(rows: readonly Row[]): Row[] {
  return rows.map((row) => {
    const out: Row = {};
    for (const [key, value] of Object.entries(row)) out[key] = value === '' ? null : value;
    if (out.Status == null) out.Status = 'OFFBOARDED';
    if (typeof out.Name === 'string') out.Name = squeeze(out.Name);
    return out;
  });
}

/** Runs of spaces closed up, as a scorecard writes a name the associate export spaces out. */
export function squeeze(text: string): string {
  return text.replace(/ {2,}/g, ' ');
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

/**
 * Rows as the harness dumped a table: old column names, clock times blanked, sorted by
 * TransporterId, Week, Id, then every other column.
 */
export function asHarnessRows(rows: readonly object[], columns: readonly string[]): Row[] {
  const out = rows.map((row) => {
    const copy: Row = {};
    for (const [key, value] of Object.entries(row)) {
      const column = key.charAt(0).toUpperCase() + key.slice(1);
      copy[column] = column === 'ImportedAt' || column === 'ImportedAtUtc' ? null : value;
    }
    return copy;
  });
  const first = ['TransporterId', 'Week', 'Id'].filter((key) => columns.includes(key));
  const keys = first.concat(columns.filter((key) => !first.includes(key)));
  return out.sort((a, b) => {
    for (const key of keys) {
      const c = compareValues(a[key], b[key]);
      if (c !== 0) return c;
    }
    return 0;
  });
}
