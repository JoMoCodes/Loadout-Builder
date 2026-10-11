// Read the negative customer feedback files (DSP_Customer_Delivery_Feedback_negative_*.csv).
// Ported from CdfImporter.cs.
//
// One row per feedback event, with a 0/1 flag per category. The rows are added up per driver
// (Transporter ID, ignoring case) for the week in the file name. Every event counts; the file's
// "Impacts Scorecard" column is not looked at, as in the old app.

import type { CdfWeekEntry } from '../models';
import { parseFlag, type ImportFile } from './csv';
import { readWeekFiles, type WeekFileResult } from './weekFiles';

export interface CdfImportResult extends WeekFileResult<CdfWeekEntry> {
  /** Feedback events (data rows) read, including in files that then failed. */
  csvRowsScanned: number;
}

/** Read CDF files, in order. */
export function parseCdf(files: ImportFile | readonly ImportFile[]): CdfImportResult {
  let csvRowsScanned = 0;
  const outcome = readWeekFiles<CdfWeekEntry>(
    files,
    { hyphenOptional: false, listWeekBeforeReading: true },
    (sheet, fileName, week) => {
      const perDriver = new Map<string, CdfWeekEntry>();
      for (const row of sheet.rows) {
        csvRowsScanned++;
        const transporterId = sheet.get(row, 'Delivery Associate').trim();
        if (transporterId === '') continue;

        const key = transporterId.toUpperCase();
        let entry = perDriver.get(key);
        if (entry === undefined) {
          entry = {
            transporterId,
            week,
            name: sheet.get(row, 'Delivery Associate Name').trim(),
            mishandled: 0,
            unprofessional: 0,
            didNotFollowInstructions: 0,
            wrongAddress: 0,
            neverReceived: 0,
            wrongItem: 0,
            sourceFile: fileName,
          };
          perDriver.set(key, entry);
        }
        entry.mishandled += parseFlag(sheet.get(row, 'DA Mishandled Package'));
        entry.unprofessional += parseFlag(sheet.get(row, 'DA was Unprofessional'));
        entry.didNotFollowInstructions += parseFlag(
          sheet.get(row, 'DA did not follow my delivery instructions'),
        );
        entry.wrongAddress += parseFlag(sheet.get(row, 'Delivered to Wrong Address'));
        entry.neverReceived += parseFlag(sheet.get(row, 'Never Received Delivery'));
        entry.wrongItem += parseFlag(sheet.get(row, 'Received Wrong Item'));
      }
      return [...perDriver.values()];
    },
  );
  return { ...outcome, csvRowsScanned };
}
