// Read the delivery concession files (DSP_Delivery_Concessions_*.csv). Ported from
// DsbImporter.cs.
//
// Only events flagged as impacting the scorecard count. Amazon renamed that column from
// "Impacts DSB" to "Impacts Scorecard" (around 2026-W27); either is accepted. The counted events
// are added up per driver (Transporter ID, ignoring case) for the week in the file name.

import type { DsbWeekEntry } from '../models';
import { FileProblem, parseFlag, type ImportFile } from './csv';
import { readWeekFiles, type WeekFileResult } from './weekFiles';

/** The "impacts the scorecard" column's names, newest first. */
export const DSB_IMPACTS_COLUMNS: readonly string[] = ['Impacts Scorecard', 'Impacts DSB'];

export interface DsbImportResult extends WeekFileResult<DsbWeekEntry> {
  /** Concession events (data rows) read, including in files that then failed. */
  csvRowsScanned: number;
  /** Events flagged as impacting the scorecard. */
  csvRowsCounted: number;
}

/** Read DSB files, in order. */
export function parseDsb(files: ImportFile | readonly ImportFile[]): DsbImportResult {
  let csvRowsScanned = 0;
  let csvRowsCounted = 0;
  const outcome = readWeekFiles<DsbWeekEntry>(
    files,
    { hyphenOptional: false, listWeekBeforeReading: true },
    (sheet, fileName, week) => {
      const impactsColumn = sheet.findAlias(...DSB_IMPACTS_COLUMNS);
      if (impactsColumn === null) {
        throw new FileProblem('it has neither an "Impacts Scorecard" nor an "Impacts DSB" column.');
      }
      const perDriver = new Map<string, DsbWeekEntry>();
      for (const row of sheet.rows) {
        csvRowsScanned++;
        if (parseFlag(sheet.get(row, impactsColumn)) <= 0) continue;
        csvRowsCounted++;

        const transporterId = sheet.get(row, 'Delivery Associate').trim();
        if (transporterId === '') continue;

        const key = transporterId.toUpperCase();
        let entry = perDriver.get(key);
        if (entry === undefined) {
          entry = {
            transporterId,
            week,
            name: sheet.get(row, 'Delivery Associate Name').trim(),
            simultaneousDeliveries: 0,
            deliveredOver50m: 0,
            incorrectScanAttended: 0,
            incorrectScanUnattended: 0,
            noPodOnDelivery: 0,
            scannedNotDeliveredNotReturned: 0,
            sourceFile: fileName,
          };
          perDriver.set(key, entry);
        }
        entry.simultaneousDeliveries += parseFlag(sheet.get(row, 'Simultaneous Deliveries'));
        entry.deliveredOver50m += parseFlag(sheet.get(row, 'Delivered > 50 m'));
        entry.incorrectScanAttended += parseFlag(
          sheet.get(row, 'Incorrect Scan Usage - Attended Delivery'),
        );
        entry.incorrectScanUnattended += parseFlag(
          sheet.get(row, 'Incorrect Scan Usage - Unattended Delivery'),
        );
        entry.noPodOnDelivery += parseFlag(sheet.get(row, 'No POD on Delivery'));
        entry.scannedNotDeliveredNotReturned += parseFlag(
          sheet.get(row, 'Scanned - Not Delivered - Not Returned'),
        );
      }
      return [...perDriver.values()];
    },
  );
  return { ...outcome, csvRowsScanned, csvRowsCounted };
}
