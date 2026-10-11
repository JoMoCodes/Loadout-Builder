// Read the pickup failure files (DSP_Pickup_Failures_*.csv). Ported from PsbImporter.cs.
//
// One row per pickup failure, with a 0/1 flag per category, added up per driver (ignoring case)
// for the week in the file name. Here "Transporter ID" is the ID and "Delivery Associate" the
// name (the other way round from CDF and DSB); if the ID cell is blank, "Delivery Associate" is
// used as the ID, in case Amazon swaps them again. Every file that reads cleanly also marks its
// week as imported, even with no failures in it, so the report can tell "no file for this week"
// from "no failures this week".

import type { PsbImportedWeek, PsbWeekEntry } from '../models';
import { parseFlag, type ImportFile } from './csv';
import { readWeekFiles, type WeekFileResult } from './weekFiles';

export interface PsbImportResult extends WeekFileResult<PsbWeekEntry> {
  /** Failure events (data rows) read, including in files that then failed. */
  csvRowsScanned: number;
  /**
   * One entry per week whose file read cleanly (the later file wins for a repeated week).
   * Storage adds it, or replaces the file name and time of an existing entry for that week;
   * it stamps `importedAt` itself.
   */
  importedWeeks: Array<Omit<PsbImportedWeek, 'importedAt'>>;
}

/** Read PSB files, in order. */
export function parsePsb(files: ImportFile | readonly ImportFile[]): PsbImportResult {
  let csvRowsScanned = 0;
  const importedWeeks = new Map<string, string>();
  const outcome = readWeekFiles<PsbWeekEntry>(
    files,
    { hyphenOptional: false, listWeekBeforeReading: true },
    (sheet, fileName, week) => {
      const perDriver = new Map<string, PsbWeekEntry>();
      for (const row of sheet.rows) {
        csvRowsScanned++;
        let transporterId = sheet.get(row, 'Transporter ID').trim();
        if (transporterId === '') transporterId = sheet.get(row, 'Delivery Associate').trim();
        if (transporterId === '') continue;

        const key = transporterId.toUpperCase();
        let entry = perDriver.get(key);
        if (entry === undefined) {
          entry = {
            transporterId,
            week,
            name: sheet.get(row, 'Delivery Associate').trim(),
            earlyArrivals: 0,
            lateArrivals: 0,
            geoLocation: 0,
            notAttempted: 0,
            contactCompliance: 0,
            outOfReturnLabel: 0,
            pickedUpNotReturned: 0,
            sourceFile: fileName,
          };
          perDriver.set(key, entry);
        }
        entry.earlyArrivals += parseFlag(sheet.get(row, 'Early Arrivals'));
        entry.lateArrivals += parseFlag(sheet.get(row, 'Late Arrivals'));
        entry.geoLocation += parseFlag(sheet.get(row, 'Geo Location'));
        entry.notAttempted += parseFlag(sheet.get(row, 'Not Attempted'));
        entry.contactCompliance += parseFlag(sheet.get(row, 'Contact Compliance'));
        entry.outOfReturnLabel += parseFlag(sheet.get(row, 'Out of Return Label'));
        entry.pickedUpNotReturned += parseFlag(sheet.get(row, 'Picked up, Not Returned'));
      }
      return [...perDriver.values()];
    },
    (_rows, week, fileName) => {
      importedWeeks.set(week, fileName);
    },
  );
  return {
    ...outcome,
    csvRowsScanned,
    importedWeeks: [...importedWeeks].map(([week, sourceFile]) => ({ week, sourceFile })),
  };
}
