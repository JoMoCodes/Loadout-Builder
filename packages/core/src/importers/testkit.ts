// Helpers for the importer tests: build a small made-up file in a temporary folder, run an
// importer on it, and boil the result down to plain data. Not part of the public API.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { importAssociateData } from './associates';
import { importDwpSheet } from './dwp';
import { importLoadoutSheet } from './loadout';
import { importRouteExport } from './routedata';
import { importTenureExport } from './tenure';
import { importVehicleData } from './vehicles';

/** Where the made-up files live: packages/fixtures/<folder>/<file>. */
export function fixturePath(folder: string, file: string): string {
  return fileURLToPath(new URL(`../../../fixtures/${folder}/${file}`, import.meta.url));
}

export type Cell = string | number | boolean | null | { time: string } | { datetime: string };

export interface Scenario {
  name: string;
  /** Which importer: loadout, associates, tenure, vehicles, dwp, routes, itineraries or schedule. */
  importer: string;
  /** The file name to give the made-up file (some importers read a date off it). */
  file: string;
  /** Spreadsheet content: one entry per sheet. */
  sheets?: Array<{ name: string; rows: Cell[][] }>;
  /** CSV content, written as UTF-8 (or latin-1 when `latin1` is set). */
  text?: string;
  latin1?: boolean;
  /** For the weekly schedule: the day to read. */
  day?: string;
}

function dateCell(cell: { time: string } | { datetime: string }): { value: Date; format: string } {
  if ('time' in cell) {
    const [hour = 0, minute = 0] = cell.time.split(':').map(Number);
    return { value: new Date(Date.UTC(1899, 11, 30, hour, minute)), format: 'h:mm:ss' };
  }
  const [day = '', time = '00:00'] = cell.datetime.split(' ');
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  return {
    value: new Date(Date.UTC(year, month - 1, date, hour, minute)),
    format: 'yyyy-mm-dd hh:mm',
  };
}

async function writeWorkbook(path: string, sheets: NonNullable<Scenario['sheets']>): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    sheet.rows.forEach((row, rowIndex) => {
      row.forEach((cell, columnIndex) => {
        if (cell === null) return;
        const target = worksheet.getCell(rowIndex + 1, columnIndex + 1);
        if (typeof cell === 'object') {
          const { value, format } = dateCell(cell);
          target.value = value;
          target.numFmt = format;
        } else {
          target.value = cell;
        }
      });
    });
  }
  await workbook.xlsx.writeFile(path);
}

/** Write the scenario's file into a fresh temporary folder, run `use` on its path, then clean up. */
export async function withScenarioFile<T>(
  scenario: Pick<Scenario, 'file' | 'sheets' | 'text' | 'latin1'>,
  use: (path: string) => Promise<T>,
): Promise<T> {
  const folder = await mkdtemp(join(tmpdir(), 'loadout-test-'));
  try {
    const path = join(folder, scenario.file);
    if (scenario.sheets) {
      await writeWorkbook(path, scenario.sheets);
    } else {
      await writeFile(path, Buffer.from(scenario.text ?? '', scenario.latin1 ? 'latin1' : 'utf8'));
    }
    return await use(path);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

function plain(row: object): Record<string, unknown> {
  return { ...row } as Record<string, unknown>;
}

async function runImporter(scenario: Scenario, path: string): Promise<Record<string, unknown>> {
  switch (scenario.importer) {
    case 'loadout': {
      const roster = await importLoadoutSheet(path);
      return { loadOutDate: roster.loadOutDate, rows: roster.rows.map(plain) };
    }
    case 'associates': {
      const book = await importAssociateData(path);
      return { rows: book.rows.map(plain) };
    }
    case 'tenure': {
      const book = await importTenureExport(path);
      return { records: [...book.records.entries()].map(([id, record]) => [id, { ...record }]) };
    }
    case 'vehicles': {
      const fleet = await importVehicleData(path);
      return { rows: fleet.rows.map(plain) };
    }
    case 'dwp': {
      const dataSet = await importDwpSheet(path);
      return { day: dataSet.day, rows: dataSet.rows.map(plain) };
    }
    default: {
      const dataSet = await importRouteExport(scenario.importer, path, scenario.day);
      return {
        kind: dataSet.kind,
        day: dataSet.day,
        sourceTotal: dataSet.sourceTotal,
        rows: dataSet.rows.map(plain),
      };
    }
  }
}

/** Run a scenario and return its result as plain data, or `{ error: message }` if the importer refused. */
export async function runScenario(scenario: Scenario): Promise<Record<string, unknown>> {
  return withScenarioFile(scenario, async (path) => {
    try {
      return await runImporter(scenario, path);
    } catch (error) {
      // Only the importers' own refusals are results; anything else is a bug and should surface.
      if (error instanceof Error && error.name.endsWith('ImportError')) {
        return { error: error.message };
      }
      throw error;
    }
  });
}

/** Sample rows from a fixture: [position in the file, the row]. */
export type Sample = Array<[number, Record<string, unknown>]>;
