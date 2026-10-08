// Read the Tenured Workforce export (.csv) into lifetime route counts. Ported from tenure.py.
//
// The export is a weekly history: one row per driver per week, each carrying the
// lifetime totals as they stood that week. Only the most recent week a driver
// appears in counts.

import { alnumKey, squeeze } from '../models/text';
import {
  createTenureBook,
  isNewerStamp,
  type TenureBook,
  type TenureRecord,
} from '../models/tenure';
import { looksBinary, parseCsv, readCsvText, shownHeaders, type CsvRecord } from './csv';
import { fileExists, pathText } from './files';
import { reason } from './clean';

/** The selected file is not a Tenured Workforce export we can read. */
export class TenureImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenureImportError';
  }
}

// Header text -> field. The export misspells its own anchor column - 'Trabsporter ID' -
// so that spelling is as load-bearing as the right one.
const HEADER_ALIASES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['transporter_id', ['trabsporterid', 'transporterid', 'transporter']],
  ['year', ['year']],
  ['week', ['week']],
  ['routes', ['lifetimeroutes']],
];

// "1,234" as Excel writes a grouped number back to CSV. Only exact grouping is
// unpicked, so a stray comma still reads as malformed rather than as a number.
const GROUPED = /^\d{1,3}(,\d{3})+$/;

// What Python's float() accepts, bar the words (nan, inf) which are refused anyway.
const DIGITS = String.raw`\d+(?:_\d+)*`;
const FLOAT_TEXT = new RegExp(
  String.raw`^[+-]?(?:${DIGITS}(?:\.(?:${DIGITS})?)?|\.${DIGITS})(?:[eE][+-]?${DIGITS})?$`,
);

function clean(value: string | null | undefined): string {
  return value === null || value === undefined ? '' : squeeze(value);
}

/**
 * '43' -> 43, tolerating the '43.0' and '1,234' a spreadsheet writes. null for
 * anything else - a negative, a 'NaN', an infinity.
 */
export function asCount(value: string | null | undefined): number | null {
  let text = clean(value);
  if (GROUPED.test(text)) text = text.replaceAll(',', '');
  if (!text) return null;
  if (!FLOAT_TEXT.test(text)) return null;
  const number = Number(text.replaceAll('_', ''));
  if (!Number.isFinite(number) || number < 0 || number !== Math.trunc(number)) return null;
  return number === 0 ? 0 : number;
}

function columnMap(fieldnames: string[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const name of fieldnames) if (name) lookup.set(alnumKey(name), name);
  const mapping = new Map<string, string>();
  for (const [field, options] of HEADER_ALIASES) {
    for (const option of options) {
      const header = lookup.get(option);
      if (header !== undefined) {
        mapping.set(field, header);
        break;
      }
    }
  }
  if (HEADER_ALIASES.some(([field]) => !mapping.has(field))) {
    throw new TenureImportError(
      "This doesn't look like a Tenured Workforce export.\n\n" +
        "Expected columns 'Transporter ID', 'Year', 'Week' and " +
        `'Lifetime Routes', but the file has: ${shownHeaders(fieldnames)}`,
    );
  }
  return mapping;
}

function valueOf(record: CsvRecord, mapping: Map<string, string>, field: string): string | null {
  return record.get(mapping.get(field) as string) ?? null;
}

/**
 * Parse a Tenured Workforce export into a TenureBook.
 *
 * Throws a TenureImportError with a message suitable for showing to the user.
 */
export async function importTenureExport(path: string): Promise<TenureBook> {
  if (!fileExists(path)) {
    throw new TenureImportError(`File not found:\n\n${pathText(path)}`);
  }

  let text: string;
  try {
    text = await readCsvText(path);
  } catch (error) {
    throw new TenureImportError(`Couldn't open the file:\n\n${reason(error)}`);
  }

  if (looksBinary(text)) {
    throw new TenureImportError(
      "This isn't a CSV - it looks like an Excel workbook or another " +
        'binary file.\n\n' +
        'Save the Tenured Workforce export as .csv and import that.',
    );
  }

  const table = parseCsv(text);
  if (!table.fieldnames || table.fieldnames.length === 0) {
    throw new TenureImportError('The file is empty.');
  }

  const mapping = columnMap(table.fieldnames);

  // Transporter ID -> the latest week's record seen so far.
  const latest = new Map<string, TenureRecord>();
  for (const record of table.records) {
    const transporterId = clean(valueOf(record, mapping, 'transporter_id'));
    if (!transporterId) continue; // blank line, or a row with nothing to key by
    const year = asCount(valueOf(record, mapping, 'year'));
    const week = asCount(valueOf(record, mapping, 'week'));
    const routes = asCount(valueOf(record, mapping, 'routes'));
    if (year === null || week === null || routes === null) continue; // a malformed row shouldn't sink the file
    const candidate: TenureRecord = { routes, year, week };
    const held = latest.get(transporterId);
    // Strictly newer weeks win; on the same week the higher count does.
    if (held === undefined || isNewerStamp(candidate, held)) latest.set(transporterId, candidate);
  }

  if (latest.size === 0) {
    throw new TenureImportError(
      'Found the header row but no usable rows below it - every row is ' +
        'missing its Transporter ID, Year, Week or Lifetime Routes.',
    );
  }

  return createTenureBook({ records: latest, sourceFile: pathText(path), importedAt: new Date() });
}
