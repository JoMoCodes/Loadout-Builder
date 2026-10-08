// Read a DSP Workplace load-out export (.xlsx) into a Roster. Ported from importer.py.

import { createDriverRow, createRoster, type DriverRow, type Roster } from '../models/roster';
import { makeDate, strptimeDate, type IsoDate } from '../models/dates';
import { pyStrip } from '../models/text';
import { reason } from './clean';
import {
  fileExists,
  fileName,
  pathText,
  pyStr,
  readSheets,
  type CellValue,
  type Grid,
} from './files';

// The export header row, in the order the sheet writes it.
export const EXPECTED_HEADERS = [
  'driver',
  'shifttype',
  'status',
  'routes',
  'vehicle',
  'vin',
  'device',
  'staging location',
  'bag',
  'wave time',
] as const;

// "Load Out Export for Tuesday, August 04th 2026"
const TITLE_DATE_RE =
  /for\s+(?:\w+,\s*)?(?<month>[A-Za-z]+)\s+(?<day>\d{1,2})(?:st|nd|rd|th)?,?\s+(?<year>\d{4})/i;

// "2026_08_03_22_45_loadout_sheet.xlsx"
const FILENAME_DATE_RE = /(?<y>\d{4})_(?<m>\d{2})_(?<d>\d{2})/;

// Placeholder the export writes when a field has not been filled in yet.
const PLACEHOLDERS = new Set(['no data', 'n/a', '-', '--']);

/** The selected file is not a load-out sheet we can read. */
export class LoadoutImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoadoutImportError';
  }
}

function two(value: number): string {
  return String(value).padStart(2, '0');
}

/** Normalise a cell into display text. */
function clean(value: CellValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const onEpochDay =
      value.getUTCFullYear() === 1899 && value.getUTCMonth() === 11 && value.getUTCDate() === 30;
    const time = `${two(value.getUTCHours())}:${two(value.getUTCMinutes())}`;
    if (onEpochDay) return time;
    return `${value.getUTCFullYear()}-${two(value.getUTCMonth() + 1)}-${two(value.getUTCDate())} ${time}`;
  }
  return pyStrip(pyStr(value));
}

function normaliseHeader(value: CellValue | undefined): string {
  return clean(value).toLowerCase().replaceAll('_', ' ');
}

function parseTitleDate(text: string): IsoDate | null {
  const match = TITLE_DATE_RE.exec(text);
  const groups = match?.groups;
  if (!groups) return null;
  const raw = `${(groups.month ?? '').slice(0, 3)} ${two(Number(groups.day))} ${groups.year}`;
  return strptimeDate(raw, '%b %d %Y');
}

function parseFilenameDate(path: string): IsoDate | null {
  const match = FILENAME_DATE_RE.exec(fileName(path));
  const groups = match?.groups;
  if (!groups) return null;
  return makeDate(Number(groups.y), Number(groups.m), Number(groups.d));
}

/** The index of the header row, or throw if there isn't one. */
function findHeaderRow(grid: Grid): number {
  for (const [index, row] of grid.entries()) {
    const cells = row.map(normaliseHeader);
    if (cells.includes('driver') && (cells.includes('shifttype') || cells.includes('shift type'))) {
      return index;
    }
  }
  throw new LoadoutImportError(
    "Couldn't find the header row.\n\n" +
      "Expected a row containing 'Driver' and 'ShiftType' - is this a DSP " +
      'Workplace load-out export?',
  );
}

type FieldKey =
  | 'driver'
  | 'shiftType'
  | 'status'
  | 'routes'
  | 'vehicle'
  | 'vin'
  | 'device'
  | 'stagingLocation'
  | 'bag'
  | 'waveTime';

const ALIASES: ReadonlyArray<readonly [FieldKey, readonly string[]]> = [
  ['driver', ['driver', 'driver name', 'name']],
  ['shiftType', ['shifttype', 'shift type']],
  ['status', ['status']],
  ['routes', ['routes', 'route']],
  ['vehicle', ['vehicle', 'van', 'vehicle name']],
  ['vin', ['vin']],
  ['device', ['device', 'phone']],
  ['stagingLocation', ['staging location', 'staging', 'stage']],
  ['bag', ['bag', 'bags']],
  ['waveTime', ['wave time', 'wave']],
];

/** Map our field names to column indexes by header text. */
function columnMap(header: CellValue[]): Map<FieldKey, number> {
  const lookup = new Map<string, number>();
  header.forEach((cell, index) => {
    if (clean(cell)) lookup.set(normaliseHeader(cell), index);
  });
  const mapping = new Map<FieldKey, number>();
  for (const [field, options] of ALIASES) {
    for (const option of options) {
      const column = lookup.get(option);
      if (column !== undefined) {
        mapping.set(field, column);
        break;
      }
    }
  }
  if (!mapping.has('driver')) {
    throw new LoadoutImportError("The sheet has no 'Driver' column.");
  }
  return mapping;
}

/** Load the first worksheet as a grid. */
async function readGrid(path: string): Promise<Grid> {
  let sheets;
  try {
    sheets = await readSheets(path);
  } catch (error) {
    throw new LoadoutImportError(`Couldn't open the workbook:\n\n${reason(error)}`);
  }
  const first = sheets[0];
  if (!first) throw new LoadoutImportError('The workbook has no worksheets.');
  return first.grid;
}

/**
 * Parse a load-out export into a Roster.
 *
 * Throws a LoadoutImportError with a message suitable for showing to the user.
 */
export async function importLoadoutSheet(path: string): Promise<Roster> {
  if (!fileExists(path)) {
    throw new LoadoutImportError(`File not found:\n\n${pathText(path)}`);
  }

  const grid = await readGrid(path);
  if (grid.length === 0) throw new LoadoutImportError('The sheet is empty.');

  const headerIndex = findHeaderRow(grid);
  const mapping = columnMap(grid[headerIndex] as CellValue[]);

  const rows: DriverRow[] = [];
  for (const raw of grid.slice(headerIndex + 1)) {
    const values: Partial<DriverRow> = {};
    for (const [field, column] of mapping) {
      const cell = column < raw.length ? raw[column] : null;
      let text = clean(cell);
      if (PLACEHOLDERS.has(text.toLowerCase()) && field !== 'status') text = '';
      values[field] = text;
    }
    if (!values.driver) continue; // blank spacer / footer row
    rows.push(createDriverRow(values));
  }

  if (rows.length === 0) {
    throw new LoadoutImportError('Found the header row but no driver rows below it.');
  }

  const title = (grid[0] ?? [])
    .map(clean)
    .filter((text) => text)
    .join(' ');
  const loadOutDate = parseTitleDate(title) ?? parseFilenameDate(path);

  return createRoster({
    rows,
    loadOutDate,
    sourceFile: pathText(path),
    importedAt: new Date(),
  });
}
