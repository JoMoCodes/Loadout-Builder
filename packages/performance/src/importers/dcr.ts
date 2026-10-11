// Read the returned-to-station files (Quality_RTS_*.csv). Ported from DcrImporter.cs.
//
// Each row is one package the driver brought back. These are not added up: the report lists
// each one, so every row with a Transporter ID becomes one event for the week in the file name.
//
// Amazon has renamed several columns over time, and a folder often mixes old and new files, so
// each file finds its own headers (ignoring case and spaces around them), newest name first:
//   the impact flag: "Impacts Scorecard", "Impact DC DPMO", "Impact DCR"
//   the RTS code:    "DA Selected RTS Code", "RTS Code"
//   extra notes:     "Additional Information", "Customer Contact Details"
// The notes, exemption reason and planned delivery date are read as blank if a file lacks them.

import { impactsDcr, type DcrEventEntry } from '../models';
import { FileProblem, type CsvRow, type CsvSheet, type ImportFile } from './csv';
import { readWeekFiles, type WeekFileResult } from './weekFiles';

/** A returned package as read (storage gives it its id). */
export type DcrEventRow = Omit<DcrEventEntry, 'id'>;

/** Every header name each field has had, newest first. */
export const DCR_COLUMN_ALIASES = Object.freeze({
  transporterId: ['Transporter ID'],
  name: ['Delivery Associate'],
  trackingId: ['Tracking ID'],
  impact: ['Impacts Scorecard', 'Impact DC DPMO', 'Impact DCR'],
  rtsCode: ['DA Selected RTS Code', 'RTS Code'],
  additionalInformation: ['Additional Information', 'Customer Contact Details'],
  exemptionReason: ['Exemption Reason'],
  plannedDeliveryDate: ['Planned Delivery Date'],
});

export interface DcrImportResult extends WeekFileResult<DcrEventRow> {
  /** Events whose Impact DCR is "Y". */
  impactingEventsImported: number;
}

function requireColumn(sheet: CsvSheet, aliases: readonly string[]): string {
  const match = sheet.findAlias(...aliases);
  if (match !== null) return match;
  const names = aliases.map((alias) => `"${alias}"`).join(' or ');
  throw new FileProblem(
    `there is no column named ${names}. Amazon may have renamed it again; the new name needs adding to the app.`,
  );
}

function optional(sheet: CsvSheet, row: CsvRow, column: string | null): string {
  return column === null ? '' : sheet.get(row, column).trim();
}

/** Read DCR (returned package) files, in order. */
export function parseDcr(files: ImportFile | readonly ImportFile[]): DcrImportResult {
  let impactingEventsImported = 0;
  const outcome = readWeekFiles<DcrEventRow>(
    files,
    { hyphenOptional: true, listWeekBeforeReading: false },
    (sheet, fileName, week) => {
      const transporterCol = requireColumn(sheet, DCR_COLUMN_ALIASES.transporterId);
      const nameCol = requireColumn(sheet, DCR_COLUMN_ALIASES.name);
      const trackingCol = requireColumn(sheet, DCR_COLUMN_ALIASES.trackingId);
      const impactCol = requireColumn(sheet, DCR_COLUMN_ALIASES.impact);
      const rtsCodeCol = requireColumn(sheet, DCR_COLUMN_ALIASES.rtsCode);
      const infoCol = sheet.findAlias(...DCR_COLUMN_ALIASES.additionalInformation);
      const exemptionCol = sheet.findAlias(...DCR_COLUMN_ALIASES.exemptionReason);
      const plannedCol = sheet.findAlias(...DCR_COLUMN_ALIASES.plannedDeliveryDate);

      const events: DcrEventRow[] = [];
      for (const row of sheet.rows) {
        const transporterId = sheet.get(row, transporterCol).trim();
        if (transporterId === '') continue;
        events.push({
          transporterId,
          week,
          name: sheet.get(row, nameCol).trim(),
          trackingId: sheet.get(row, trackingCol).trim(),
          impactDcr: sheet.get(row, impactCol).trim(),
          rtsCode: sheet.get(row, rtsCodeCol).trim(),
          additionalInformation: optional(sheet, row, infoCol),
          exemptionReason: optional(sheet, row, exemptionCol),
          plannedDeliveryDate: optional(sheet, row, plannedCol),
          sourceFile: fileName,
        });
      }
      return events;
    },
    (rows) => {
      impactingEventsImported += rows.filter(impactsDcr).length;
    },
  );
  return { ...outcome, impactingEventsImported };
}
