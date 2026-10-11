// Read the driver roster (AssociateData.csv). Ported from AssociateImporter.cs.
//
// The old importer upserted each row into Drivers: a new Transporter ID is added, a known one has
// its name, status, position, qualifications, ID expiration, phones and email replaced. This
// reader returns those rows; the storage layer applies them the same way.

import type { DriverRecord } from '../models';
import {
  asList,
  fileError,
  FileProblem,
  readCsv,
  type CsvRow,
  type CsvSheet,
  type ImportFile,
} from './csv';

export interface AssociateImportResult {
  filesProcessed: number;
  /** Rows written (every row with a Transporter ID that had no problem). */
  rowsImported: number;
  /** Drivers that were not known before (see `knownIds`). */
  driversAdded: number;
  /** Rows for a driver that was already known, or already seen earlier in this import. */
  driversUpdated: number;
  /** Rows whose status reads "ACTIVE" / "INACTIVE" (counted even when the row had a problem later). */
  activeCount: number;
  inactiveCount: number;
  errors: string[];
  /**
   * Drivers to add or update, one per Transporter ID (the last row wins). Every column is
   * replaced, so storage writes the whole record: insert when new, otherwise overwrite.
   */
  drivers: DriverRecord[];
}

function rowProblem(fileName: string, row: CsvRow, error: unknown): string {
  if (error instanceof FileProblem) {
    return `${fileName}: row ${row.rowNumber} was skipped because ${error.forRow}`;
  }
  throw error;
}

function readRow(sheet: CsvSheet, row: CsvRow, result: AssociateImportResult): DriverRecord | null {
  const transporterId = sheet.get(row, 'TransporterID').trim();
  if (transporterId === '') return null;

  let name = sheet.get(row, 'Name and ID').trim();
  if (name === '') name = transporterId;

  const status = sheet.get(row, 'Status').trim().toUpperCase();
  if (status === 'ACTIVE') result.activeCount++;
  else if (status === 'INACTIVE') result.inactiveCount++;

  return {
    transporterId,
    name,
    status,
    position: sheet.get(row, 'Position').trim(),
    qualifications: sheet.get(row, 'Qualifications').trim(),
    idExpiration: sheet.get(row, 'ID expiration').trim(),
    personalPhone: sheet.get(row, 'Personal Phone Number').trim(),
    workPhone: sheet.get(row, 'Work Phone Number').trim(),
    email: sheet.get(row, 'Email').trim(),
  };
}

/**
 * Read one or more roster files, in order. `knownIds` are the Transporter IDs already in the
 * database, so the added / updated counts come out as the old app's did.
 */
export function parseAssociates(
  files: ImportFile | readonly ImportFile[],
  knownIds: Iterable<string> = [],
): AssociateImportResult {
  const result: AssociateImportResult = {
    filesProcessed: 0,
    rowsImported: 0,
    driversAdded: 0,
    driversUpdated: 0,
    activeCount: 0,
    inactiveCount: 0,
    errors: [],
    drivers: [],
  };
  const known = new Set(knownIds);
  const byId = new Map<string, DriverRecord>();

  for (const file of asList(files)) {
    let sheet: CsvSheet;
    try {
      sheet = readCsv(file.text, { trimHeaders: false });
    } catch (error) {
      result.errors.push(fileError(file.fileName, error));
      continue;
    }
    for (const row of sheet.rows) {
      let driver: DriverRecord | null;
      try {
        driver = readRow(sheet, row, result);
      } catch (error) {
        result.errors.push(rowProblem(file.fileName, row, error));
        continue;
      }
      if (driver === null) continue;
      if (known.has(driver.transporterId)) result.driversUpdated++;
      else result.driversAdded++;
      known.add(driver.transporterId);
      byId.delete(driver.transporterId);
      byId.set(driver.transporterId, driver);
      result.rowsImported++;
    }
    result.filesProcessed++;
  }

  result.drivers = [...byId.values()];
  return result;
}
