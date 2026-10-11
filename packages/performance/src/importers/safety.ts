// Read the safety event files (Safety_Dashboard_*.csv, from Netradyne). Ported from
// SafetyImporter.cs.
//
// One row per safety event, kept one by one (like DCR) so the Drivers grid can list each event
// with its video link. Every row with a Transporter ID is kept, including those whose Program
// Impact is "None"; only the grid's counts leave those out. "Delivery Associate " (with a space
// after it) is the driver's name.

import { isSafetyEventCounted, type SafetyEventEntry } from '../models';
import { trimmed, type ImportFile } from './csv';
import { readWeekFiles, type WeekFileResult } from './weekFiles';

/** A safety event as read (storage gives it its id). */
export type SafetyEventRow = Omit<SafetyEventEntry, 'id'>;

export interface SafetyImportResult extends WeekFileResult<SafetyEventRow> {
  /** Events whose Program Impact is not blank or "None". */
  countedEvents: number;
}

/** Read Safety Dashboard files, in order. */
export function parseSafety(files: ImportFile | readonly ImportFile[]): SafetyImportResult {
  let countedEvents = 0;
  const outcome = readWeekFiles<SafetyEventRow>(
    files,
    { hyphenOptional: true, listWeekBeforeReading: true },
    (sheet, fileName, week) => {
      const events: SafetyEventRow[] = [];
      for (const row of sheet.rows) {
        const transporterId = sheet.get(row, 'Transporter ID').trim();
        if (transporterId === '') continue;
        events.push({
          transporterId,
          week,
          name: (sheet.field(row, 'Delivery Associate') ?? '').trim(),
          eventDate: trimmed(sheet.field(row, 'Date')),
          programImpact: trimmed(sheet.field(row, 'Program Impact')),
          metricType: trimmed(sheet.field(row, 'Metric Type')),
          metricSubtype: trimmed(sheet.field(row, 'Metric Subtype')),
          source: trimmed(sheet.field(row, 'Source')),
          videoLink: trimmed(sheet.field(row, 'Video Link')),
          reviewDetails: trimmed(sheet.field(row, 'Review Details')),
          sourceFile: fileName,
        });
      }
      return events;
    },
    (rows) => {
      countedEvents += rows.filter(isSafetyEventCounted).length;
    },
  );
  return { ...outcome, countedEvents };
}
