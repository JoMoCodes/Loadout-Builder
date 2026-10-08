// The print parity cases: what the old app's writers were asked to draw on each fixture day
// (scripts/parity/print/expected/<day>/cases.json), and what they drew (the .json beside it).
// Test support only; the app never reads these.
//
// The rows come from the main parity files (scripts/parity/expected/<day>/printing.json and
// export.json), which the core is already proven to produce, so these cases test only the drawing.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { printing } from '@loadout/core';
import type { PdfRecord, SheetRecord } from './parity';
import { exportRowsBytes, printSheetBytes, type SheetFormat } from './write';

const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
export const PARITY_DIR = path.join(ROOT, 'scripts', 'parity', 'expected');
export const PRINT_DIR = path.join(ROOT, 'scripts', 'parity', 'print', 'expected');

export const DAYS = ['2026-09-01', '2026-09-11', '2026-09-14'] as const;

export interface PrintCase {
  file: string;
  spec: Record<string, unknown>;
  drivers?: number;
  pages?: number;
  error?: string;
}

export interface DayCases {
  date_label: string;
  export: Record<string, { file: string; with_dwp: boolean; drivers: number }>;
  print: Record<string, PrintCase>;
}

export interface Reference {
  pdf: PdfRecord;
  xlsx: SheetRecord[];
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

export function hasReferences(): boolean {
  return existsSync(path.join(PRINT_DIR, DAYS[0], 'cases.json'));
}

export function dayCases(day: string): DayCases {
  return readJson<DayCases>(path.join(PRINT_DIR, day, 'cases.json'));
}

export function reference(day: string, file: string): Reference {
  return readJson<Reference>(path.join(PRINT_DIR, day, `${file}.json`));
}

export function printRows(day: string): printing.PrintRow[] {
  return readJson<{ print_rows: printing.PrintRow[] }>(path.join(PARITY_DIR, day, 'printing.json'))
    .print_rows;
}

export function exportRows(day: string, withDwp: boolean): string[][] {
  const data = readJson<{ rows: { plain: string[][]; with_dwp: string[][] } }>(
    path.join(PARITY_DIR, day, 'export.json'),
  );
  return withDwp ? data.rows.with_dwp : data.rows.plain;
}

/** This app's writer, given what the old app's writer was given for one case. */
export async function writeCase(
  day: string,
  name: string,
  format: SheetFormat,
): Promise<{ bytes: Uint8Array; drivers: number; pages?: number }> {
  const cases = dayCases(day);
  const exported = cases.export[name];
  if (exported)
    return exportRowsBytes(format, exportRows(day, exported.with_dwp), exported.with_dwp);
  const entry = cases.print[name];
  if (!entry) throw new Error(`No such case: ${name}`);
  const spec = printing.specFromJson(JSON.stringify(entry.spec));
  return printSheetBytes(format, printRows(day), spec, cases.date_label);
}

/** Every case of a day, by name, with the file its reference is under. */
export function caseNames(day: string): Array<{ name: string; file: string; skip: boolean }> {
  const cases = dayCases(day);
  return [
    ...Object.entries(cases.export).map(([name, c]) => ({ name, file: c.file, skip: false })),
    ...Object.entries(cases.print).map(([name, c]) => ({
      name,
      file: c.file,
      skip: c.error !== undefined,
    })),
  ];
}
