// Read the Amazon associate export (.csv) into an AssociateBook. Ported from associates.py.

import {
  createAssociate,
  createAssociateBook,
  type Associate,
  type AssociateBook,
} from '../models/associates';
import { parseDateFormats, type IsoDate } from '../models/dates';
import { alnumKey, squeeze } from '../models/text';
import { looksBinary, parseCsv, readCsvText, shownHeaders, type CsvRecord } from './csv';
import { fileExists, pathText } from './files';
import { reason } from './clean';

/** The selected file is not an associate export we can read. */
export class AssociateImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssociateImportError';
  }
}

// Header text -> field, lowercased and stripped of punctuation/spaces.
const HEADER_ALIASES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['name', ['nameandid', 'name', 'associatename', 'associate']],
  ['transporter_id', ['transporterid', 'transporter', 'id']],
  ['position', ['position', 'role']],
  ['qualifications', ['qualifications', 'qualification', 'quals']],
  ['id_expiration', ['idexpiration', 'idexpiry', 'idexpires', 'expiration']],
  ['personal_phone', ['personalphonenumber', 'personalphone', 'phone']],
  ['work_phone', ['workphonenumber', 'workphone']],
  ['email', ['email', 'emailaddress']],
  ['status', ['status']],
];

const DATE_FORMATS = ['%Y-%m-%d', '%m/%d/%Y', '%m/%d/%y', '%d/%m/%Y', '%Y/%m/%d'] as const;

function clean(value: string | null | undefined): string {
  return value === null || value === undefined ? '' : squeeze(value);
}

function parseDate(text: string): IsoDate | null {
  const cleaned = clean(text);
  if (!cleaned) return null;
  return parseDateFormats(cleaned, DATE_FORMATS);
}

/** 'AMZL_HELPER, CDV, Standard Parcel , EDV' -> ['AMZL_HELPER', 'CDV', ...]. Each entry squeezed and de-duplicated. */
function parseQualifications(text: string): string[] {
  const seen: string[] = [];
  for (const part of clean(text).split(',')) {
    const item = clean(part);
    if (item && !seen.includes(item)) seen.push(item);
  }
  return seen;
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
  if (!mapping.has('name') || !mapping.has('transporter_id')) {
    throw new AssociateImportError(
      "This doesn't look like an associate export.\n\n" +
        "Expected columns 'Name and ID' and 'TransporterID', but the file " +
        `has: ${shownHeaders(fieldnames)}`,
    );
  }
  return mapping;
}

function valueOf(record: CsvRecord, mapping: Map<string, string>, field: string): string | null {
  // The old reader asked for the column called '' when a field had no column.
  return record.get(mapping.get(field) ?? '') ?? null;
}

/**
 * Parse an associate export into an AssociateBook.
 *
 * Throws an AssociateImportError with a message suitable for showing to the user.
 */
export async function importAssociateData(path: string): Promise<AssociateBook> {
  if (!fileExists(path)) {
    throw new AssociateImportError(`File not found:\n\n${pathText(path)}`);
  }

  let text: string;
  try {
    text = await readCsvText(path);
  } catch (error) {
    throw new AssociateImportError(`Couldn't open the file:\n\n${reason(error)}`);
  }

  // The .xlsx flavour of the same export, or any other binary, would only
  // dissolve into garbage headers below - say what it is instead.
  if (looksBinary(text)) {
    throw new AssociateImportError(
      "This isn't a CSV - it looks like an Excel workbook or another " +
        'binary file.\n\n' +
        'Save the associate export as .csv and import that.',
    );
  }

  const table = parseCsv(text);
  if (!table.fieldnames || table.fieldnames.length === 0) {
    throw new AssociateImportError('The file is empty.');
  }

  const mapping = columnMap(table.fieldnames);

  const rows: Associate[] = [];
  const seenIds = new Set<string>();
  for (const record of table.records) {
    const name = clean(valueOf(record, mapping, 'name'));
    const transporterId = clean(valueOf(record, mapping, 'transporter_id'));
    if (!name && !transporterId) continue; // blank line
    if (transporterId && seenIds.has(transporterId)) continue; // duplicate export row
    seenIds.add(transporterId);
    rows.push(
      createAssociate({
        name,
        transporterId,
        position: clean(valueOf(record, mapping, 'position')),
        qualifications: parseQualifications(valueOf(record, mapping, 'qualifications') ?? ''),
        idExpiration: parseDate(valueOf(record, mapping, 'id_expiration') ?? ''),
        personalPhone: clean(valueOf(record, mapping, 'personal_phone')),
        workPhone: clean(valueOf(record, mapping, 'work_phone')),
        email: clean(valueOf(record, mapping, 'email')),
        status: clean(valueOf(record, mapping, 'status')),
      }),
    );
  }

  if (rows.length === 0) {
    throw new AssociateImportError('Found the header row but no associate rows below it.');
  }

  return createAssociateBook({ rows, sourceFile: pathText(path), importedAt: new Date() });
}
