// Read the weekly scorecard files (DSP_Overview_Dashboard_*.csv). Ported from
// ScorecardImporter.cs.
//
// Each row is one driver's scorecard for one week, with up to 12 metrics (see
// METRIC_DEFINITIONS for the exact headers). The week comes from the file's "Week" column, not
// from its name. The old importer, per row:
//   - added the driver to Drivers if new, otherwise replaced only their name;
//   - replaced that driver's scorecard (and its metrics) for that week;
//   - stored one metric entry per metric that has a value, a tier or a score.
// A file that fails part-way is not written at all (the old importer rolled it back).

import { METRIC_DEFINITIONS, type MetricEntry, type WeeklyScorecard } from '../models';
import {
  addWeek,
  asList,
  fileError,
  parseNullableDouble,
  parseNullableInt,
  readCsv,
  trimmed,
  type CsvRow,
  type CsvSheet,
  type ImportFile,
} from './csv';

/** One metric on a scorecard, as read (storage gives it its id and scorecard id). */
export type ScorecardMetric = Omit<MetricEntry, 'id' | 'scorecardId'>;

/** One scorecard as read, with its metrics in the old app's metric order. */
export interface ScorecardRow extends Omit<WeeklyScorecard, 'id'> {
  metrics: ScorecardMetric[];
}

/** A driver seen on a scorecard: storage adds them if new, otherwise replaces only the name. */
export interface ScorecardDriver {
  transporterId: string;
  name: string;
}

export interface ScorecardImportResult {
  filesProcessed: number;
  /** Scorecard rows read (as the old app counted: rows in a file that later failed count too). */
  rowsImported: number;
  /** Drivers not known before (see `knownIds`), counted the way the old app did. */
  driversAdded: number;
  /** The weeks seen, sorted, as written in the files' "Week" column (rows in a failed file count too). */
  weeks: string[];
  errors: string[];
  /** Drivers to add or rename, one per Transporter ID (the last row wins). */
  drivers: ScorecardDriver[];
  /**
   * The scorecards to write, one per driver and week (a later row for the same driver and week
   * replaces an earlier one). Storage replaces any stored scorecard for the same driver and week,
   * metrics included; other drivers' scorecards for that week are left alone.
   */
  scorecards: ScorecardRow[];
}

function isNullOrEmpty(value: string | null): boolean {
  return value === null || value === '';
}

function readMetrics(sheet: CsvSheet, row: CsvRow): ScorecardMetric[] {
  const metrics: ScorecardMetric[] = [];
  for (const definition of METRIC_DEFINITIONS) {
    // Read tolerantly: Amazon adds metric columns a bit at a time, so a missing header leaves
    // that one value empty instead of stopping the file.
    const value = trimmed(sheet.field(row, definition.valueCol));
    const tier = trimmed(sheet.field(row, definition.tierCol));
    const score = parseNullableDouble(sheet.field(row, definition.scoreCol), true);
    const weight = parseNullableDouble(sheet.field(row, definition.weightCol), true);
    if (isNullOrEmpty(value) && isNullOrEmpty(tier) && score === null) continue;
    metrics.push({
      metricName: definition.name,
      metricValue: value,
      tier,
      score,
      weightApplied: weight,
    });
  }
  return metrics;
}

function driverWeekKey(transporterId: string, week: string): string {
  return `${transporterId}\u0000${week}`;
}

/**
 * Read scorecard files, in order. `knownIds` are the Transporter IDs already in the database
 * (after the roster import, say), so `driversAdded` comes out as the old app's did.
 */
export function parseScorecards(
  files: ImportFile | readonly ImportFile[],
  knownIds: Iterable<string> = [],
): ScorecardImportResult {
  const result: ScorecardImportResult = {
    filesProcessed: 0,
    rowsImported: 0,
    driversAdded: 0,
    weeks: [],
    errors: [],
    drivers: [],
    scorecards: [],
  };
  const known = new Set(knownIds);
  const drivers = new Map<string, string>();
  const scorecards = new Map<string, ScorecardRow>();

  for (const file of asList(files)) {
    const pendingIds = new Set<string>();
    const pendingDrivers: ScorecardDriver[] = [];
    const pendingScorecards: ScorecardRow[] = [];
    try {
      const sheet = readCsv(file.text, { trimHeaders: false });
      for (const row of sheet.rows) {
        const transporterId = sheet.get(row, 'Transporter ID').trim();
        if (transporterId === '') continue;

        const name = (
          sheet.field(row, 'Delivery Associate ') ??
          sheet.field(row, 'Delivery Associate') ??
          ''
        ).trim();
        const week = sheet.get(row, 'Week').trim();
        addWeek(result.weeks, week);

        if (!known.has(transporterId) && !pendingIds.has(transporterId)) {
          result.driversAdded++;
          pendingIds.add(transporterId);
        }
        pendingDrivers.push({ transporterId, name });

        const overallStanding = sheet.get(row, 'Overall Standing').trim();
        const overallScore = parseNullableDouble(sheet.get(row, 'Overall Score'), true);
        const packagesDelivered = parseNullableInt(sheet.get(row, 'Packages Delivered'));

        pendingScorecards.push({
          transporterId,
          week,
          overallStanding,
          overallScore,
          packagesDelivered,
          sourceFile: file.fileName,
          metrics: readMetrics(sheet, row),
        });
        result.rowsImported++;
      }
    } catch (error) {
      result.errors.push(fileError(file.fileName, error));
      continue;
    }

    for (const id of pendingIds) known.add(id);
    for (const driver of pendingDrivers) drivers.set(driver.transporterId, driver.name);
    for (const scorecard of pendingScorecards) {
      const key = driverWeekKey(scorecard.transporterId, scorecard.week);
      scorecards.delete(key);
      scorecards.set(key, scorecard);
    }
    result.filesProcessed++;
  }

  result.drivers = [...drivers].map(([transporterId, name]) => ({ transporterId, name }));
  result.scorecards = [...scorecards.values()];
  result.weeks.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return result;
}
