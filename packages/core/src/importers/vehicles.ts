// Read the Amazon vehicle export (.xlsx) into a VehicleFleet. Ported from vehicles.py.
//
// One row per van at the station. `vehicleName` is the identity that matters -
// it's what goes in the load-out sheet's Vehicle column - and `vin` fills its VIN column.

import { parseDateFormats, type IsoDate } from '../models/dates';
import { alnumKey, squeeze } from '../models/text';
import {
  createVehicle,
  createVehicleFleet,
  type Vehicle,
  type VehicleFleet,
} from '../models/vehicles';
import { reason } from './clean';
import { fileExists, pathText, pyStr, readSheets, type CellValue, type Grid } from './files';

/** The selected file is not a vehicle export we can read. */
export class VehicleImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VehicleImportError';
  }
}

// Header text -> field, lowercased and stripped of everything but alphanumerics.
const ALIASES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['vin', ['vin']],
  ['name', ['vehiclename', 'name', 'vanname']],
  ['service_type', ['servicetype']],
  ['service_tier', ['servicetier']],
  ['make', ['make']],
  ['model', ['model']],
  ['sub_model', ['submodel']],
  ['plate', ['licenseplatenumber', 'licenseplate', 'plate']],
  ['year', ['year']],
  ['ownership', ['ownershiptype']],
  ['type_label', ['type']],
  ['operational_status', ['operationalstatus']],
  ['status', ['status']],
  ['status_note', ['statusreasonmessage', 'statusmessage']],
  ['registration_expiry', ['registrationexpirydate', 'registrationexpiry']],
  ['ownership_end', ['ownershipenddate']],
  ['station', ['stationcode', 'station']],
];

const REQUIRED = ['vin', 'name'] as const;

const DATE_FORMATS = ['%Y-%m-%d', '%m/%d/%Y', '%m/%d/%y'] as const;

function isoOf(value: Date): IsoDate {
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  return `${pad(value.getUTCFullYear(), 4)}-${pad(value.getUTCMonth() + 1, 2)}-${pad(value.getUTCDate(), 2)}`;
}

function clean(value: CellValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return isoOf(value);
  return squeeze(pyStr(value));
}

function keyOf(value: CellValue | undefined): string {
  return alnumKey(clean(value));
}

function parseDate(value: CellValue | undefined): IsoDate | null {
  if (value instanceof Date) return isoOf(value);
  const text = clean(value);
  if (!text) return null;
  return parseDateFormats(text, DATE_FORMATS);
}

function aliasesOf(field: string): readonly string[] {
  return ALIASES.find(([name]) => name === field)?.[1] ?? [];
}

function findHeader(grid: Grid): number {
  for (const [index, row] of grid.entries()) {
    const keys = new Set(row.filter((cell) => clean(cell)).map(keyOf));
    if (REQUIRED.every((field) => aliasesOf(field).some((alias) => keys.has(alias)))) return index;
  }
  throw new VehicleImportError(
    "Couldn't find the header row.\n\n" +
      "Expected a row containing 'vin' and 'vehicleName' - is this a vehicle " +
      'export?',
  );
}

function columnMap(header: CellValue[]): Map<string, number> {
  const lookup = new Map<string, number>();
  header.forEach((cell, index) => {
    const key = keyOf(cell);
    if (key && !lookup.has(key)) lookup.set(key, index);
  });
  const mapping = new Map<string, number>();
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
    throw new VehicleImportError(`Couldn't open the workbook:\n\n${reason(error)}`);
  }
  const first = sheets[0];
  if (!first) throw new VehicleImportError('The workbook has no worksheets.');
  return first.grid;
}

/**
 * Parse a vehicle export into a VehicleFleet.
 *
 * Throws a VehicleImportError with a message suitable for showing to the user.
 */
export async function importVehicleData(path: string): Promise<VehicleFleet> {
  if (!fileExists(path)) {
    throw new VehicleImportError(`File not found:\n\n${pathText(path)}`);
  }

  const grid = await readGrid(path);
  if (grid.length === 0) throw new VehicleImportError('The sheet is empty.');

  const headerIndex = findHeader(grid);
  const mapping = columnMap(grid[headerIndex] as CellValue[]);

  const cell = (raw: CellValue[], field: string): CellValue => {
    const column = mapping.get(field);
    if (column === undefined || column >= raw.length) return null;
    return raw[column] ?? null;
  };

  const rows: Vehicle[] = [];
  const seen = new Set<string>();
  for (const raw of grid.slice(headerIndex + 1)) {
    const vin = clean(cell(raw, 'vin'));
    const name = clean(cell(raw, 'name'));
    if (!vin && !name) continue; // blank spacer / footer row
    if (vin && seen.has(vin)) continue; // duplicate export row
    seen.add(vin);
    rows.push(
      createVehicle({
        vin,
        name: name || vin,
        serviceType: clean(cell(raw, 'service_type')),
        serviceTier: clean(cell(raw, 'service_tier')),
        make: clean(cell(raw, 'make')),
        model: clean(cell(raw, 'model')),
        subModel: clean(cell(raw, 'sub_model')),
        plate: clean(cell(raw, 'plate')),
        year: clean(cell(raw, 'year')),
        ownership: clean(cell(raw, 'ownership')),
        typeLabel: clean(cell(raw, 'type_label')),
        // Anything that isn't plainly operational is treated as grounded.
        operational: clean(cell(raw, 'operational_status')).toUpperCase() === 'OPERATIONAL',
        status: clean(cell(raw, 'status')),
        statusNote: clean(cell(raw, 'status_note')),
        registrationExpiry: parseDate(cell(raw, 'registration_expiry')),
        ownershipEnd: parseDate(cell(raw, 'ownership_end')),
        station: clean(cell(raw, 'station')),
      }),
    );
  }

  if (rows.length === 0) {
    throw new VehicleImportError('Found the header row but no vehicle rows below it.');
  }

  return createVehicleFleet({ rows, sourceFile: pathText(path), importedAt: new Date() });
}
