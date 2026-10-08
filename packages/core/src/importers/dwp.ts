// Read the DSP Workplace day-of sheet (.xlsx) for what the handout needs. Ported from dwp.py.
//
// Only four columns are kept: the route code, its bag count, its oversize count and
// where it stages. The route code is the anchor, not the name on the row.

import { extname } from 'node:path';
import { makeDate, type IsoDate } from '../models/dates';
import { createDwpDataSet, createDwpEntry, type DwpDataSet, type DwpEntry } from '../models/dwp';
import { alnumKey } from '../models/text';
import { cleanSqueeze as clean, reason } from './clean';
import { fileExists, fileName, pathText, readSheets, type CellValue, type Grid } from './files';

/** The selected file is not a DWP sheet we can read. */
export class DwpImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DwpImportError';
  }
}

// 'DWP_DSP-XXXX_08-14-2026' -> month, day, year. The sheet carries the date
// nowhere inside it, so the file name is the only thing that knows which day it is.
const NAME_MDY = /(?<!\d)(\d{1,2})[-_.](\d{1,2})[-_.](\d{4})(?!\d)/;
const NAME_YMD = /(?<!\d)(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})(?!\d)/;

/** The file name without its last extension, like Python's `Path(name).stem`. */
function stemOf(path: string): string {
  const name = fileName(path);
  const extension = extname(name);
  return extension.length > 1 && extension !== name
    ? name.slice(0, name.length - extension.length)
    : name;
}

/**
 * The day a DWP file is for, read off its name. null if it doesn't say. null is
 * not a failure to be swallowed - it means the day is unknown, and a caller about
 * to copy this onto a roster should say so rather than take it on trust.
 */
export function dateFromName(path: string): IsoDate | null {
  const stem = stemOf(path);
  let year: number;
  let month: number;
  let day: number;
  const ymd = NAME_YMD.exec(stem);
  if (ymd) {
    year = Number(ymd[1]);
    month = Number(ymd[2]);
    day = Number(ymd[3]);
  } else {
    const mdy = NAME_MDY.exec(stem);
    if (!mdy) return null;
    month = Number(mdy[1]);
    day = Number(mdy[2]);
    year = Number(mdy[3]);
  }
  return makeDate(year, month, day); // '13-40-2026' is a number, not a date
}

// Header text -> field, lowercased and stripped of everything but alphanumerics.
const ALIASES: ReadonlyArray<readonly [keyof DwpEntry, readonly string[]]> = [
  ['routeCode', ['routecode', 'route', 'routeid']],
  ['bags', ['bags', 'bag', 'bagcount', 'totalbags']],
  ['ovs', ['ovs', 'ov', 'oversize', 'oversized', 'oversizecount']],
  ['staging', ['staging', 'staginglocation', 'stg', 'stagearea']],
];

function keyOf(value: CellValue | undefined): string {
  return alnumKey(clean(value));
}

function findHeader(grid: Grid): number {
  for (const [index, row] of grid.entries()) {
    const keys = new Set(row.filter((cell) => clean(cell)).map(keyOf));
    // All four, because a sheet missing any of them is not the one being asked for.
    if (ALIASES.every(([, options]) => options.some((alias) => keys.has(alias)))) return index;
  }
  throw new DwpImportError(
    "Couldn't find the header row.\n\n" +
      "Expected a row containing 'Route Code', 'Bags', 'OVS' and 'Staging' " +
      '- is this a DWP sheet?',
  );
}

function columnMap(header: CellValue[]): Map<keyof DwpEntry, number> {
  const lookup = new Map<string, number>();
  header.forEach((cell, index) => {
    const key = keyOf(cell);
    if (key && !lookup.has(key)) lookup.set(key, index);
  });
  const mapping = new Map<keyof DwpEntry, number>();
  for (const [field, options] of ALIASES) {
    for (const option of options) {
      const column = lookup.get(option);
      if (column !== undefined) {
        mapping.set(field, column);
        break;
      }
    }
  }
  return mapping;
}

/** Load the first worksheet. */
async function readGrid(path: string): Promise<Grid> {
  let sheets;
  try {
    sheets = await readSheets(path);
  } catch (error) {
    throw new DwpImportError(`Couldn't open the workbook:\n\n${reason(error)}`);
  }
  const first = sheets[0];
  if (!first) throw new DwpImportError('The workbook has no worksheets.');
  return first.grid;
}

/**
 * Parse a DWP sheet into a DwpDataSet.
 *
 * Throws a DwpImportError with a message suitable for showing to the user.
 */
export async function importDwpSheet(path: string): Promise<DwpDataSet> {
  if (!fileExists(path)) {
    throw new DwpImportError(`File not found:\n\n${pathText(path)}`);
  }

  const grid = await readGrid(path);
  if (grid.length === 0) throw new DwpImportError('The sheet is empty.');

  const headerIndex = findHeader(grid);
  const mapping = columnMap(grid[headerIndex] as CellValue[]);

  const cell = (raw: CellValue[], field: keyof DwpEntry): CellValue => {
    const column = mapping.get(field);
    if (column === undefined || column >= raw.length) return null;
    return raw[column] ?? null;
  };

  const rows: DwpEntry[] = [];
  for (const raw of grid.slice(headerIndex + 1)) {
    const routeCode = clean(cell(raw, 'routeCode'));
    if (!routeCode) continue; // blank spacer / footer row
    rows.push(
      createDwpEntry({
        routeCode,
        bags: clean(cell(raw, 'bags')),
        ovs: clean(cell(raw, 'ovs')),
        staging: clean(cell(raw, 'staging')),
      }),
    );
  }

  if (rows.length === 0) {
    throw new DwpImportError('Found the header row but no route rows below it.');
  }

  return createDwpDataSet({
    rows,
    day: dateFromName(path),
    sourceFile: pathText(path),
    importedAt: new Date(),
  });
}
