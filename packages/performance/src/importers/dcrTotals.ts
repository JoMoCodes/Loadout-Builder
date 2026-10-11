// Read the weekly delivery completion totals (Quality_DCR_*.csv). Ported from
// DcrTotalsImporter.cs.
//
// One row per driver for the week in the file name: the delivery completion number and the
// package counts. Amazon renamed the "DCR" column (a rate) to "Delivery Completion DPMO" (lower
// is better); the new name is read first, then the old one.

import type { DcrWeekTotals } from '../models';
import { FileProblem, parseNullableDouble, parseNullableInt, type ImportFile } from './csv';
import { readWeekFiles, type WeekFileResult } from './weekFiles';

export type DcrTotalsImportResult = WeekFileResult<DcrWeekTotals>;

/** Read DCR totals files, in order. */
export function parseDcrTotals(files: ImportFile | readonly ImportFile[]): DcrTotalsImportResult {
  return readWeekFiles<DcrWeekTotals>(
    files,
    { hyphenOptional: true, listWeekBeforeReading: true },
    (sheet, fileName, week) => {
      const rows: DcrWeekTotals[] = [];
      const seen = new Set<string>();
      for (const row of sheet.rows) {
        const transporterId = sheet.get(row, 'Transporter ID').trim();
        if (transporterId === '') continue;
        const totals: DcrWeekTotals = {
          transporterId,
          week,
          name: sheet.get(row, 'Delivery Associate').trim(),
          dcr: parseNullableDouble(
            sheet.field(row, 'Delivery Completion DPMO') ?? sheet.field(row, 'DCR'),
            true,
          ),
          packagesDispatched: parseNullableInt(sheet.get(row, 'Packages Dispatched')),
          packagesDelivered: parseNullableInt(sheet.get(row, 'Packages Delivered')),
          packagesReturnedToStation: parseNullableInt(
            sheet.get(row, 'Packages Returned To Station'),
          ),
          packagesReturnedToStationDaControllable: parseNullableInt(
            sheet.get(row, 'Packages Returned to Station - DA Controllable'),
          ),
          rescuedPackages: parseNullableInt(sheet.get(row, 'Rescued Packages')),
          rtsAllExempted: parseNullableInt(sheet.get(row, 'RTS All Exempted')),
          sourceFile: fileName,
        };
        // One row per driver and week is all the table can hold; the old importer failed the
        // whole file when a driver appeared twice.
        if (seen.has(transporterId)) {
          throw new FileProblem(
            `row ${row.rowNumber} is a second row for a driver already in this file.`,
          );
        }
        seen.add(transporterId);
        rows.push(totals);
      }
      return rows;
    },
  );
}
