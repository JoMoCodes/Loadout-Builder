// Read the scorecard thresholds file (DSP_Thresholds_Scoring_Metadata_*.csv). Ported from
// ThresholdImporter.cs.
//
// There is one set of thresholds, not one per week: an import replaces the whole table. FICO and
// any metric name the app does not know are skipped.

import { normalizeThresholdMetricName, type MetricThreshold } from '../models';
import {
  fileError,
  FileProblem,
  parseNullableDouble,
  readCsv,
  type CsvSheet,
  type ImportFile,
} from './csv';

/** A threshold row as read; storage stamps `importedAt` when it writes it. */
export type ThresholdRow = Omit<MetricThreshold, 'importedAt'>;

export interface ThresholdImportResult {
  /** Data rows in the file. */
  rowsRead: number;
  rowsImported: number;
  /** FICO and unknown metric names. */
  rowsSkipped: number;
  /** The "Scorecard Week" of the first row that was not skipped, as written in the file. */
  sourceWeek: string | null;
  errors: string[];
  /**
   * True when the file could be read: storage then empties the thresholds table and writes
   * `rows` (even when that is no rows at all). False means leave the table alone.
   */
  replaceAll: boolean;
  rows: ThresholdRow[];
}

/** Read the thresholds file. */
export function parseThresholds(file: ImportFile): ThresholdImportResult {
  const result: ThresholdImportResult = {
    rowsRead: 0,
    rowsImported: 0,
    rowsSkipped: 0,
    sourceWeek: null,
    errors: [],
    replaceAll: false,
    rows: [],
  };

  let sheet: CsvSheet;
  try {
    sheet = readCsv(file.text, { trimHeaders: false });
  } catch (error) {
    result.errors.push(fileError(file.fileName, error));
    return result;
  }
  result.replaceAll = true;

  for (const row of sheet.rows) {
    result.rowsRead++;
    try {
      const canonical = normalizeThresholdMetricName(sheet.get(row, 'Metric'));
      if (canonical === null) {
        result.rowsSkipped++;
        continue;
      }

      const week = sheet.get(row, 'Scorecard Week').trim();
      if (result.sourceWeek === null) result.sourceWeek = week;

      const threshold: ThresholdRow = {
        metricName: canonical,
        indicator: sheet.get(row, 'Indicator').trim(),
        platinumThreshold: parseNullableDouble(sheet.get(row, 'Platinum Threshold')),
        goldThreshold: parseNullableDouble(sheet.get(row, 'Gold Threshold')),
        silverThreshold: parseNullableDouble(sheet.get(row, 'Silver Threshold')),
        bronzeThreshold: parseNullableDouble(sheet.get(row, 'Bronze Threshold')),
        overallMetricWeight: parseNullableDouble(sheet.get(row, 'Overall Metric Weight')),
        sourceWeek: week,
      };
      // The metric name is the table's key, so a second row for the same metric (for example
      // both the old and the new delivery completion rows) could not be written.
      if (result.rows.some((existing) => existing.metricName === canonical)) {
        throw new FileProblem(
          `the metric "${canonical}" appears more than once; the first one was kept.`,
        );
      }
      result.rows.push(threshold);
      result.rowsImported++;
    } catch (error) {
      if (!(error instanceof FileProblem)) throw error;
      result.errors.push(
        `${file.fileName}: row ${row.rowNumber} was skipped because ${error.forRow}`,
      );
    }
  }
  return result;
}
