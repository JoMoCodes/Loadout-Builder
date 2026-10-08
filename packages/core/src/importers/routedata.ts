// Read the three Amazon route exports into a RouteDataSet. Ported from routedata.py.
//
// Routes and Itineraries are day-of exports: one row per dispatched route, keyed by
// Transporter Id. The morning Itineraries export has no time columns at all - its rows
// live on a 'Pre Dispatch' sheet behind an empty first sheet, with the route duration
// packed into the service type as '... MEDIUM (440 mins)'. The weekly schedule is a grid
// instead - one row per associate, one column per day - with the service type and the
// start time packed into a single cell.
//
// The clocks are not interchangeable: a schedule start time is when the associate
// reports, a planned departure is when the van leaves, so each export keeps its own PAD map.

import { parseClock } from '../models/clock';
import {
  ROUTE_ITINERARIES,
  ROUTE_ROUTES,
  ROUTE_SCHEDULE,
  ROUTE_SOURCE_LABELS,
} from '../models/constants';
import { dateParts, longDateLabel, makeDate, todayDate, type IsoDate } from '../models/dates';
import {
  createRouteDataSet,
  createRouteEntry,
  type RouteDataSet,
  type RouteEntry,
} from '../models/routes';
import { alnumKey, pyStrip, splitLines, squeeze } from '../models/text';
import { cleanSqueeze as clean, isDigits, reason } from './clean';
import {
  fileExists,
  fileName,
  pathText,
  pyStr,
  readSheets,
  TimeOfDay,
  type CellValue,
  type Grid,
  type Sheet,
} from './files';

/** The selected file is not the route export we expected. */
export class RouteDataImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RouteDataImportError';
  }
}

// What Amazon writes where a value hasn't happened yet.
const PLACEHOLDERS = new Set(['missing', 'n/a', 'na', '-', '--', 'none']);

// The schedule workbook also carries an empty 'Shifts & Availability' sheet.
const SCHEDULE_SHEET = 'Rostered Work Blocks';

// Day column headers read 'Tue, 04/Aug'.
const DAY_HEADER_RE = /(?<day>\d{1,2})\s*\/\s*(?<month>[A-Za-z]{3,})/;

const MONTHS = new Map(
  ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].map(
    (name, index) => [name, index + 1] as const,
  ),
);

// 'Routes_XXX1_2026-08-04_15_15 (CDT).xlsx'
const FILENAME_DATE_RE = /(?<y>\d{4})[-_](?<m>\d{2})[-_](?<d>\d{2})/;

type TabularKind = typeof ROUTE_ROUTES | typeof ROUTE_ITINERARIES;
type RouteField =
  'transporterId' | 'driverName' | 'routeCode' | 'dispatchTime' | 'serviceType' | 'vin' | 'detail';
type Aliases = ReadonlyArray<readonly [RouteField, readonly string[]]>;

// Header text -> field, lowercased and stripped of everything but alphanumerics.
const ALIASES: Record<TabularKind, Aliases> = {
  [ROUTE_ROUTES]: [
    ['transporterId', ['transporterid', 'transporter']],
    ['driverName', ['drivername', 'driver']],
    ['routeCode', ['routecode', 'route']],
    ['dispatchTime', ['planneddeparturetime', 'departuretime', 'plannedeparture']],
    ['serviceType', ['deliveryservicetype', 'servicetype']],
    ['detail', ['routeprogress', 'progressstatus', 'progress']],
  ],
  [ROUTE_ITINERARIES]: [
    ['transporterId', ['transporterid', 'transporter']],
    ['driverName', ['drivername', 'driver']],
    ['routeCode', ['routecode', 'route']],
    ['dispatchTime', ['planneddeparturetime', 'departuretime', 'plannedeparture']],
    ['serviceType', ['deliveryservicetype', 'servicetype']],
    ['vin', ['cortexvinnumber', 'vin', 'vinnumber']],
    // The afternoon export writes an actual departure here; the morning one has
    // none yet, so its route progress stands in.
    ['detail', ['actualdeparture', 'actualdeparturetime', 'routeprogress', 'progress']],
  ],
};

// What a header row must carry to be recognised. Routes always has a departure time;
// the morning Itineraries export has no time columns at all, so its header is known
// by the route code instead.
const REQUIRED: Record<TabularKind, readonly RouteField[]> = {
  [ROUTE_ROUTES]: ['transporterId', 'dispatchTime'],
  [ROUTE_ITINERARIES]: ['transporterId', 'routeCode'],
};

const REQUIRED_LABELS: Record<TabularKind, string> = {
  [ROUTE_ROUTES]: "'Transporter Id' and 'Planned Departure Time'",
  [ROUTE_ITINERARIES]: "'Transporter Id' and 'Route code'",
};

// ------------------------------------------------------------------- cleaning

/** Cell text, with Amazon's placeholders flattened to empty. */
function value(cell: CellValue | undefined): string {
  const text = clean(cell);
  return PLACEHOLDERS.has(text.toLowerCase()) ? '' : text;
}

function keyOf(cell: CellValue | undefined): string {
  return alnumKey(clean(cell));
}

function formatClock(hour24: number, minute: number): string {
  const hour = hour24 % 12 || 12;
  return `${hour}:${String(minute).padStart(2, '0')}${hour24 < 12 ? 'am' : 'pm'}`;
}

/** Normalise a time to '9:50am', so '9:50 AM' groups with it rather than splitting into a second dispatch time. */
function clockText(cell: CellValue | undefined): string {
  if (cell instanceof Date) return formatClock(cell.getUTCHours(), cell.getUTCMinutes());
  if (cell instanceof TimeOfDay) return formatClock(cell.hour, cell.minute);
  const text = value(cell);
  const parsed = parseClock(text);
  return parsed ? formatClock(parsed.hour, parsed.minute) : text;
}

// 'Standard Parcel Electric - Rivian MEDIUM (440 mins)' - the route duration Amazon
// packs into the service type on the morning Itineraries export.
const DURATION_RE = /\(\s*(\d+)\s*min(?:ute)?s?\.?\s*\)\s*$/i;

/** Split the duration off a service type -> ['... MEDIUM', '440 mins']. */
function splitServiceType(cell: CellValue | undefined): [string, string] {
  const text = value(cell);
  const match = DURATION_RE.exec(text);
  if (!match) return [text, ''];
  return [text.slice(0, match.index).trimEnd(), `${match[1]} mins`];
}

/** Itineraries write 'First,Last' where Routes write 'First Last'. */
function personName(cell: CellValue | undefined): string {
  return squeeze(value(cell).replaceAll(',', ' '));
}

/** Split a pipe-joined cell - a route worked by more than one person. */
function shared(cell: CellValue | undefined): string[] {
  return value(cell)
    .split('|')
    .map(pyStrip)
    .filter((part) => part);
}

function asCount(cell: CellValue | undefined): number | null {
  const text = clean(cell);
  return isDigits(text) ? Number(text) : null;
}

function parseFilenameDate(path: string): IsoDate | null {
  const groups = FILENAME_DATE_RE.exec(fileName(path))?.groups;
  if (!groups) return null;
  return makeDate(Number(groups.y), Number(groups.m), Number(groups.d));
}

// --------------------------------------------------------------------- workbook

/** Load every worksheet as a named grid. */
async function readAllSheets(path: string): Promise<Sheet[]> {
  let sheets: Sheet[];
  try {
    sheets = await readSheets(path);
  } catch (error) {
    throw new RouteDataImportError(`Couldn't open the workbook:\n\n${reason(error)}`);
  }
  if (sheets.length === 0) throw new RouteDataImportError('The workbook has no worksheets.');
  return sheets;
}

/** The named sheet's grid, or the first sheet's where the name isn't there. */
async function readGrid(path: string, sheetName: string): Promise<Grid> {
  const sheets = await readAllSheets(path);
  const named = sheets.find((sheet) => sheet.name === sheetName);
  return (named ?? (sheets[0] as Sheet)).grid;
}

/** Index of the header row, found by header text rather than position. */
function findHeader(grid: Grid, aliases: Aliases, required: readonly RouteField[]): number | null {
  for (const [index, row] of grid.entries()) {
    const keys = new Set(row.filter((cell) => clean(cell)).map(keyOf));
    const matches = required.every((field) => {
      const options = aliases.find(([name]) => name === field)?.[1] ?? [];
      return options.some((alias) => keys.has(alias));
    });
    if (matches) return index;
  }
  return null;
}

function columnMap(header: CellValue[], aliases: Aliases): Map<RouteField, number> {
  const lookup = new Map<string, number>();
  header.forEach((cell, index) => {
    const key = keyOf(cell);
    if (key && !lookup.has(key)) lookup.set(key, index);
  });
  const mapping = new Map<RouteField, number>();
  for (const [field, options] of aliases) {
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

function cellOf(raw: CellValue[], mapping: Map<RouteField, number>, field: RouteField): CellValue {
  const column = mapping.get(field);
  if (column === undefined || column >= raw.length) return null;
  return raw[column] ?? null;
}

// ------------------------------------------------------------ routes/itineraries

async function importTabular(path: string, kind: TabularKind): Promise<RouteDataSet> {
  const aliases = ALIASES[kind];
  const required = REQUIRED[kind];

  // The morning Itineraries workbook keeps its rows on a 'Pre Dispatch' sheet behind an
  // empty first sheet, so every sheet gets a look and the first one carrying the header wins.
  let grid: Grid | null = null;
  let headerIndex = 0;
  for (const candidate of await readAllSheets(path)) {
    const found = findHeader(candidate.grid, aliases, required);
    if (found !== null) {
      grid = candidate.grid;
      headerIndex = found;
      break;
    }
  }
  if (grid === null) {
    throw new RouteDataImportError(
      "Couldn't find the header row on any sheet.\n\n" +
        `Expected a row containing ${REQUIRED_LABELS[kind]} - is this ` +
        `a ${ROUTE_SOURCE_LABELS.get(kind)} export?`,
    );
  }

  const mapping = columnMap(grid[headerIndex] as CellValue[], aliases);

  const rows: RouteEntry[] = [];
  for (const raw of grid.slice(headerIndex + 1)) {
    // A route worked by two people arrives pipe-joined in both columns.
    const ids = shared(cellOf(raw, mapping, 'transporterId'));
    const names = shared(cellOf(raw, mapping, 'driverName')).map(personName);
    const transporterId = ids[0] ?? '';
    const driverName = names[0] ?? '';
    if (!transporterId && !driverName) continue; // blank spacer / footer row
    const detail = cellOf(raw, mapping, 'detail');
    const [serviceType, routeDuration] = splitServiceType(cellOf(raw, mapping, 'serviceType'));
    rows.push(
      createRouteEntry({
        transporterId,
        driverName,
        sharedDrivers: names.join('|'),
        sharedIds: ids.join('|'),
        routeCode: value(cellOf(raw, mapping, 'routeCode')),
        dispatchTime: clockText(cellOf(raw, mapping, 'dispatchTime')),
        serviceType,
        routeDuration,
        vin: value(cellOf(raw, mapping, 'vin')),
        // Itineraries put a clock in this column; Routes put a word.
        detail: kind === ROUTE_ITINERARIES ? clockText(detail) : value(detail),
      }),
    );
  }

  if (rows.length === 0) {
    throw new RouteDataImportError('Found the header row but no route rows below it.');
  }

  return createRouteDataSet({
    kind,
    rows,
    day: parseFilenameDate(path),
    sourceFile: pathText(path),
    importedAt: new Date(),
  });
}

// ------------------------------------------------------------- weekly schedule

/** 'Tue, 04/Aug' -> [8, 4]. The export never writes a year. */
function monthDay(text: string): [number, number] | null {
  const groups = DAY_HEADER_RE.exec(text)?.groups;
  if (!groups) return null;
  const month = MONTHS.get((groups.month ?? '').slice(0, 3).toLowerCase());
  if (month === undefined) return null;
  return [month, Number(groups.day)];
}

function findScheduleHeader(grid: Grid): number {
  for (const [index, row] of grid.entries()) {
    const keys = new Set(row.filter((cell) => clean(cell)).map(keyOf));
    if (keys.has('associatename') && keys.has('transporterid')) return index;
  }
  throw new RouteDataImportError(
    "Couldn't find the header row.\n\n" +
      "Expected a row containing 'Associate Name' and 'Transporter ID' - is " +
      'this a weekly schedule export?',
  );
}

/**
 * A rostered work block cell -> [service type, dispatch time, block length].
 *
 * 'Standard Parcel Step Van - US\n9:55am - 10 hrs' splits on the newline, then on
 * the bullet the export uses between the start time and the block length.
 */
function splitBlock(cell: CellValue): [string, string, string] {
  const parts = splitLines(pyStr(cell))
    .map(pyStrip)
    .filter((part) => part);
  if (parts.length === 0) return ['', '', ''];
  let service: string;
  let chunk: string;
  if (parts.length === 1 && parseClock(parts[0]) !== null) {
    service = '';
    chunk = parts[0] as string;
  } else {
    service = parts[0] as string;
    chunk = parts[1] ?? '';
  }
  const bits = chunk
    .split(/[•·|]/)
    .map(pyStrip)
    .filter((bit) => bit);
  if (bits.length === 0) return [service, '', ''];
  return [service, clockText(bits[0]), bits.slice(1).join(' ')];
}

/** Parse one day out of the weekly schedule. */
async function importSchedule(path: string, day: IsoDate): Promise<RouteDataSet> {
  const grid = await readGrid(path, SCHEDULE_SHEET);
  if (grid.length === 0) throw new RouteDataImportError('The sheet is empty.');

  const headerIndex = findScheduleHeader(grid);
  const header = grid[headerIndex] as CellValue[];
  const lookup = new Map<string, number>();
  header.forEach((cell, index) => {
    if (clean(cell)) lookup.set(keyOf(cell), index);
  });
  const nameColumn = lookup.get('associatename');
  const idColumn = lookup.get('transporterid');

  const days: Array<{ column: number; text: string; stamp: [number, number] }> = [];
  header.forEach((cell, index) => {
    const stamp = monthDay(clean(cell));
    if (stamp !== null) days.push({ column: index, text: clean(cell), stamp });
  });
  if (days.length === 0) throw new RouteDataImportError('The schedule has no day columns.');

  const wanted = dateParts(day);
  const target = days.find(
    (entry) => entry.stamp[0] === wanted.month && entry.stamp[1] === wanted.day,
  );
  if (target === undefined) {
    const available = days.map((entry) => entry.text).join(', ');
    throw new RouteDataImportError(
      `This schedule doesn't cover ${longDateLabel(day)}.\n\n` +
        `The weeks it has are: ${available}`,
    );
  }
  const { column, text: dayLabel } = target;

  const rows: RouteEntry[] = [];
  let sourceTotal: number | null = null;
  for (const raw of grid.slice(headerIndex + 1)) {
    const name = nameColumn !== undefined && nameColumn < raw.length ? clean(raw[nameColumn]) : '';
    if (name.toLowerCase().startsWith('total')) {
      // 'Total Rostered' - the export's own headcount for each day.
      sourceTotal = asCount(column < raw.length ? raw[column] : null);
      continue;
    }
    if (!name) continue; // blank spacer row
    const block = column < raw.length ? (raw[column] ?? null) : null;
    if (!clean(block)) continue; // not rostered that day
    const [serviceType, dispatchTime, detail] = splitBlock(block as CellValue);
    const ids = idColumn !== undefined && idColumn < raw.length ? shared(raw[idColumn]) : [];
    const names = shared(name).map(personName);
    rows.push(
      createRouteEntry({
        transporterId: ids[0] ?? '',
        driverName: names[0] ?? personName(name),
        sharedDrivers: names.join('|'),
        sharedIds: ids.join('|'),
        dispatchTime,
        serviceType,
        detail,
      }),
    );
  }

  if (rows.length === 0) {
    throw new RouteDataImportError(`Nobody is rostered on ${dayLabel} in this schedule.`);
  }

  return createRouteDataSet({
    kind: ROUTE_SCHEDULE,
    rows,
    day,
    sourceFile: pathText(path),
    importedAt: new Date(),
    sourceTotal,
  });
}

/**
 * Parse an export of the given kind. `day` only matters to the weekly schedule
 * (which day of the week to read); without it, today.
 *
 * Throws a RouteDataImportError with a message suitable for showing to the user.
 */
export async function importRouteExport(
  kind: string,
  path: string,
  day?: IsoDate | null,
): Promise<RouteDataSet> {
  if (!fileExists(path)) {
    throw new RouteDataImportError(`File not found:\n\n${pathText(path)}`);
  }
  if (kind === ROUTE_SCHEDULE) return importSchedule(path, day ?? todayDate());
  if (kind === ROUTE_ROUTES || kind === ROUTE_ITINERARIES) return importTabular(path, kind);
  throw new RouteDataImportError(`Unknown export type: ${kind}`);
}
