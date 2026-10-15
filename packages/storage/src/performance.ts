import type Database from 'better-sqlite3';
import type {
  CdfWeekEntry,
  DcrWeekTotals,
  DriverRecord,
  DsbWeekEntry,
  PerfData,
  PodWeekEntry,
  PsbImportedWeek,
  PsbWeekEntry,
} from '@loadout/performance';
import type {
  CdfImportResult,
  DcrImportResult,
  DcrTotalsImportResult,
  DsbImportResult,
  PsbImportResult,
  SafetyImportResult,
  ScorecardImportResult,
  ThresholdImportResult,
} from '@loadout/performance/importers';
import { PERF_TABLES } from './migrations';
import type { PerfTable } from './migrations';
import { perfTableSpec } from './perfTables';

/**
 * Reads and writes the weekly performance data (the `perf_` tables).
 *
 * The file readers in @loadout/performance work out what to write; the `apply*` methods write
 * it the way the old Weekly Performance app's importers did, each in one transaction (all of
 * it lands, or none of it). They return the counts only the database can know.
 *
 * The drivers are not a performance table: they are the `associates` table, the one driver list
 * the Associates page keeps (every row with a Transporter ID). A driver first seen on a scorecard
 * is added to that list by name alone, marked OFFBOARDED, until an associate export names them.
 */
export interface PerformanceStoreOptions {
  /** The clock used to stamp "imported at". Defaults to the computer's clock. */
  now?: () => Date;
}

/** What writing a "week file" reader's result did. */
export interface WeekApplyCounts {
  /** Weeks emptied before writing (one per file that read cleanly). */
  weeksReplaced: number;
  /** Rows taken out of those weeks first. */
  rowsRemoved: number;
  rowsWritten: number;
}

export interface ThresholdsApplyCounts {
  /** False when the file could not be read, so the saved thresholds were left alone. */
  replaced: boolean;
  rowsRemoved: number;
  rowsWritten: number;
}

export interface ScorecardsApplyCounts {
  /** Drivers that were not in the database before. */
  driversAdded: number;
  scorecardsWritten: number;
  /** Scorecards that replaced one already saved for the same driver and week. */
  scorecardsReplaced: number;
  metricsWritten: number;
}

export interface PsbApplyCounts extends WeekApplyCounts {
  /** Weeks recorded as having had a PSB file read. */
  importedWeeksRecorded: number;
}

/** One file auto-import has already brought in. */
export interface LedgerEntry {
  /** Which kind of file (the auto-import source's name). */
  source: string;
  fileName: string;
  fileSize: number;
  /** The file's last-change time, in milliseconds since 1970 (UTC). */
  lastWriteMs: number;
  /** The same time as the old app kept it: 100-nanosecond steps since year 1 (UTC). */
  lastWriteUtcTicks: bigint;
  importedAtUtc: string;
}

type Row = Record<string, unknown>;

/** The old app's time unit: 100-nanosecond steps since 1 January of year 1, UTC. */
const TICKS_AT_1970 = 621_355_968_000_000_000n;

/** Milliseconds since 1970 -> the old app's ticks. */
export function ticksFromMs(ms: number): bigint {
  return TICKS_AT_1970 + BigInt(Math.round(ms * 10_000));
}

/** The old app's ticks -> milliseconds since 1970. */
export function msFromTicks(ticks: bigint): number {
  return Number(ticks - TICKS_AT_1970) / 10_000;
}

/** UTC time the way the old app's `DateTime.UtcNow.ToString("o")` wrote it. */
export function roundTripUtc(date: Date): string {
  return date.toISOString().replace(/Z$/, '0000Z');
}

/** Local time as "yyyy-MM-dd HH:mm:ss", the way the old thresholds import stamped it. */
export function localStamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ` +
    `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
  );
}

function weeksOf(rows: ReadonlyArray<{ week: string }>): string[] {
  return [...new Set(rows.map((row) => row.week))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export class PerformanceStore {
  private readonly now: () => Date;

  /** Works on an open database that has been through the setup steps (a Store's `db`). */
  constructor(
    readonly db: Database.Database,
    options: PerformanceStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  /** Run several changes as one: all of them land, or none do. */
  transaction<T>(work: () => T): T {
    return this.db.transaction(work)();
  }

  // ----------------------------------------------------------------- counts

  /** How many rows each performance table holds. Counts only. */
  perfTableCounts(): Record<PerfTable, number> {
    const counts = {} as Record<PerfTable, number>;
    for (const table of PERF_TABLES) {
      const row = this.db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number };
      counts[table] = row.n;
    }
    return counts;
  }

  /** True when no performance data (and no auto-import record) is saved at all. */
  isPerfEmpty(): boolean {
    return Object.values(this.perfTableCounts()).every((n) => n === 0);
  }

  /** Every Transporter ID on the driver list, in list order, for the readers that count new drivers. */
  knownDriverIds(): string[] {
    return (
      this.db
        .prepare(
          "SELECT transporter_id FROM associates WHERE transporter_id <> '' ORDER BY position_index",
        )
        .all() as Array<{ transporter_id: string }>
    ).map((row) => row.transporter_id);
  }

  // ------------------------------------------------------------------ apply

  /**
   * The thresholds file: when it could be read, the whole table is replaced by its rows, all
   * stamped with the same local time. Otherwise nothing changes.
   */
  applyThresholds(
    result: Pick<ThresholdImportResult, 'replaceAll' | 'rows'>,
  ): ThresholdsApplyCounts {
    if (!result.replaceAll) return { replaced: false, rowsRemoved: 0, rowsWritten: 0 };
    const importedAt = localStamp(this.now());
    const insert = this.db.prepare(
      `INSERT INTO perf_metric_thresholds
         (metric_name, indicator, platinum_threshold, gold_threshold, silver_threshold,
          bronze_threshold, overall_metric_weight, source_week, imported_at)
       VALUES (@metricName, @indicator, @platinumThreshold, @goldThreshold, @silverThreshold,
               @bronzeThreshold, @overallMetricWeight, @sourceWeek, @importedAt)`,
    );
    return this.transaction(() => {
      const rowsRemoved = this.db.prepare('DELETE FROM perf_metric_thresholds').run().changes;
      for (const row of result.rows) insert.run({ ...row, importedAt });
      return { replaced: true, rowsRemoved, rowsWritten: result.rows.length };
    });
  }

  /**
   * Scorecards: a driver not on the driver list yet is added to it by name alone (after the
   * last row, marked OFFBOARDED until an associate export names them); a driver already on it
   * is left as the list has them. Then for each scorecard, take out the one saved for the same
   * driver and week (its metrics go with it) and write the new one with its metrics. Other
   * drivers' scorecards for that week are left alone.
   */
  applyScorecards(
    result: Pick<ScorecardImportResult, 'drivers' | 'scorecards'>,
  ): ScorecardsApplyCounts {
    const exists = this.db.prepare('SELECT 1 FROM associates WHERE transporter_id = ?');
    const addDriver = this.db.prepare(
      `INSERT INTO associates (transporter_id, position_index, name, status)
       VALUES (?, COALESCE((SELECT MAX(position_index) FROM associates), -1) + 1, ?, 'OFFBOARDED')`,
    );
    const remove = this.db.prepare(
      'DELETE FROM perf_weekly_scorecards WHERE transporter_id = ? AND week = ?',
    );
    const insertCard = this.db.prepare(
      `INSERT INTO perf_weekly_scorecards
         (transporter_id, week, overall_standing, overall_score, packages_delivered, source_file)
       VALUES (@transporterId, @week, @overallStanding, @overallScore, @packagesDelivered,
               @sourceFile)`,
    );
    const insertMetric = this.db.prepare(
      `INSERT INTO perf_metric_entries
         (scorecard_id, metric_name, metric_value, tier, score, weight_applied)
       VALUES (@scorecardId, @metricName, @metricValue, @tier, @score, @weightApplied)`,
    );
    return this.transaction(() => {
      const counts: ScorecardsApplyCounts = {
        driversAdded: 0,
        scorecardsWritten: 0,
        scorecardsReplaced: 0,
        metricsWritten: 0,
      };
      for (const driver of result.drivers) {
        if (!driver.transporterId || exists.get(driver.transporterId)) continue;
        addDriver.run(driver.transporterId, driver.name);
        counts.driversAdded++;
      }
      for (const card of result.scorecards) {
        counts.scorecardsReplaced += remove.run(card.transporterId, card.week).changes;
        const { metrics, ...fields } = card;
        const scorecardId = insertCard.run(fields).lastInsertRowid;
        counts.scorecardsWritten++;
        for (const metric of metrics) {
          insertMetric.run({ scorecardId, ...metric });
          counts.metricsWritten++;
        }
      }
      return counts;
    });
  }

  /**
   * POD reports: each week a file was read for is emptied, then the rows are written.
   * `replaceWeeks` defaults to the weeks the rows are in; pass the weeks of every file that read
   * cleanly (`parsePodFile(...).ok`) to also empty a week whose report listed nobody, as the old
   * app did.
   */
  applyPod(
    result: { rows: readonly PodWeekEntry[] },
    replaceWeeks: readonly string[] = weeksOf(result.rows),
  ): WeekApplyCounts {
    return this.applyWeekRows<PodWeekEntry>('perf_pod_week_entries', replaceWeeks, result.rows);
  }

  /** CDF files: each week read is emptied, then its rows are written. */
  applyCdf(result: Pick<CdfImportResult, 'replaceWeeks' | 'rows'>): WeekApplyCounts {
    return this.applyWeekRows<CdfWeekEntry>(
      'perf_cdf_week_entries',
      result.replaceWeeks,
      result.rows,
    );
  }

  /** DSB files: each week read is emptied, then its rows are written. */
  applyDsb(result: Pick<DsbImportResult, 'replaceWeeks' | 'rows'>): WeekApplyCounts {
    return this.applyWeekRows<DsbWeekEntry>(
      'perf_dsb_week_entries',
      result.replaceWeeks,
      result.rows,
    );
  }

  /**
   * PSB files: each week read is emptied, then its rows are written, and each week is recorded
   * as read (even with no failures in it), stamped with the current UTC time.
   */
  applyPsb(
    result: Pick<PsbImportResult, 'replaceWeeks' | 'rows' | 'importedWeeks'>,
  ): PsbApplyCounts {
    const importedAt = roundTripUtc(this.now());
    const record = this.db.prepare(
      `INSERT INTO perf_psb_imported_weeks (week, source_file, imported_at)
       VALUES (@week, @sourceFile, @importedAt)
       ON CONFLICT(week) DO UPDATE SET
         source_file = excluded.source_file,
         imported_at = excluded.imported_at`,
    );
    return this.transaction(() => {
      const counts = this.applyWeekRows<PsbWeekEntry>(
        'perf_psb_week_entries',
        result.replaceWeeks,
        result.rows,
      );
      for (const week of result.importedWeeks) record.run({ ...week, importedAt });
      return { ...counts, importedWeeksRecorded: result.importedWeeks.length };
    });
  }

  /** DCR (returned package) files: each week read is emptied, then its events get new ids. */
  applyDcr(result: Pick<DcrImportResult, 'replaceWeeks' | 'rows'>): WeekApplyCounts {
    return this.applyWeekRows('perf_dcr_events', result.replaceWeeks, result.rows);
  }

  /** DCR totals files: each week read is emptied, then its rows are written. */
  applyDcrTotals(result: Pick<DcrTotalsImportResult, 'replaceWeeks' | 'rows'>): WeekApplyCounts {
    return this.applyWeekRows<DcrWeekTotals>(
      'perf_dcr_week_totals',
      result.replaceWeeks,
      result.rows,
    );
  }

  /** Safety files: each week read is emptied, then its events get new ids. */
  applySafety(result: Pick<SafetyImportResult, 'replaceWeeks' | 'rows'>): WeekApplyCounts {
    return this.applyWeekRows('perf_safety_events', result.replaceWeeks, result.rows);
  }

  private applyWeekRows<T extends object>(
    table: PerfTable,
    replaceWeeks: readonly string[],
    rows: readonly T[],
  ): WeekApplyCounts {
    const columns = perfTableSpec(table).columns.filter(([column]) => column !== 'id');
    const remove = this.db.prepare(`DELETE FROM ${table} WHERE week = ?`);
    const insert = this.db.prepare(
      `INSERT INTO ${table} (${columns.map(([column]) => column).join(', ')})
       VALUES (${columns.map(([, field]) => `@${field}`).join(', ')})`,
    );
    return this.transaction(() => {
      let rowsRemoved = 0;
      for (const week of replaceWeeks) rowsRemoved += remove.run(week).changes;
      for (const row of rows) {
        const values: Row = {};
        for (const [, field] of columns) values[field] = (row as Row)[field] ?? null;
        insert.run(values);
      }
      return { weeksReplaced: replaceWeeks.length, rowsRemoved, rowsWritten: rows.length };
    });
  }

  // ------------------------------------------------------------------- read

  /**
   * The driver list as the performance side reads it: every associate with a Transporter ID, in
   * list order. A blank status reads as OFFBOARDED further up (`effectiveStatus`); every other
   * blank is null, as the old drivers table had it for a driver known by name alone.
   */
  loadDrivers(): DriverRecord[] {
    const rows = this.db
      .prepare(
        `SELECT transporter_id, name, status, position, qualifications, id_expiration,
                personal_phone, work_phone, email
         FROM associates WHERE transporter_id <> '' ORDER BY position_index`,
      )
      .all() as Row[];
    const blankNull = (value: unknown): string | null =>
      value == null || String(value).trim() === '' ? null : String(value);
    return rows.map((row) => ({
      transporterId: String(row.transporter_id),
      name: String(row.name ?? ''),
      status: blankNull(row.status),
      position: blankNull(row.position),
      qualifications: blankNull(row.qualifications),
      idExpiration: blankNull(row.id_expiration),
      personalPhone: blankNull(row.personal_phone),
      workPhone: blankNull(row.work_phone),
      email: blankNull(row.email),
    }));
  }

  /** Every performance table, as the row shapes of @loadout/performance, in the order saved. */
  loadPerfData(): PerfData {
    return {
      drivers: this.loadDrivers(),
      scorecards: this.rows('perf_weekly_scorecards'),
      metrics: this.rows('perf_metric_entries'),
      thresholds: this.rows('perf_metric_thresholds'),
      pod: this.rows('perf_pod_week_entries'),
      cdf: this.rows('perf_cdf_week_entries'),
      dsb: this.rows('perf_dsb_week_entries'),
      psb: this.rows('perf_psb_week_entries'),
      psbImportedWeeks: this.rows<PsbImportedWeek>('perf_psb_imported_weeks'),
      dcrEvents: this.rows('perf_dcr_events'),
      dcrTotals: this.rows('perf_dcr_week_totals'),
      safetyEvents: this.rows('perf_safety_events'),
    };
  }

  private rows<T>(table: PerfTable): T[] {
    const { columns } = perfTableSpec(table);
    const select = columns.map(([column, field]) => `${column} AS "${field}"`).join(', ');
    return this.db.prepare(`SELECT ${select} FROM ${table} ORDER BY rowid`).all() as T[];
  }

  // ----------------------------------------------------------------- ledger

  /** The record of one file auto-import brought in, or null if it never did. */
  ledgerGet(source: string, fileName: string): LedgerEntry | null {
    const row = this.db
      .prepare('SELECT * FROM perf_imported_files WHERE source = ? AND file_name = ?')
      .safeIntegers(true)
      .get(source, fileName) as Row | undefined;
    return row ? ledgerEntry(row) : null;
  }

  /**
   * True when this file, with this size and last-change time, has been brought in already
   * (the old auto-import's test for "nothing new").
   */
  ledgerHas(source: string, fileName: string, size: number, lastWriteMs: number): boolean {
    const entry = this.ledgerGet(source, fileName);
    return (
      entry !== null &&
      entry.fileSize === size &&
      entry.lastWriteUtcTicks === ticksFromMs(lastWriteMs)
    );
  }

  /** Note that a file was brought in (replaces any earlier note for the same file). */
  ledgerRecord(
    source: string,
    fileName: string,
    size: number,
    lastWriteMs: number,
    importedAt: Date | string = this.now(),
  ): void {
    this.db
      .prepare(
        `INSERT INTO perf_imported_files
           (source, file_name, file_size, last_write_utc_ticks, imported_at_utc)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(source, file_name) DO UPDATE SET
           file_size            = excluded.file_size,
           last_write_utc_ticks = excluded.last_write_utc_ticks,
           imported_at_utc      = excluded.imported_at_utc`,
      )
      .run(
        source,
        fileName,
        size,
        ticksFromMs(lastWriteMs),
        typeof importedAt === 'string' ? importedAt : roundTripUtc(importedAt),
      );
  }

  /** Every file auto-import has brought in, by source then file name. */
  ledgerList(): LedgerEntry[] {
    return (
      this.db
        .prepare('SELECT * FROM perf_imported_files ORDER BY source, file_name')
        .safeIntegers(true)
        .all() as Row[]
    ).map(ledgerEntry);
  }
}

function ledgerEntry(row: Row): LedgerEntry {
  const ticks = BigInt(row.last_write_utc_ticks as bigint | number);
  return {
    source: String(row.source),
    fileName: String(row.file_name),
    fileSize: Number(row.file_size),
    lastWriteMs: msFromTicks(ticks),
    lastWriteUtcTicks: ticks,
    importedAtUtc: String(row.imported_at_utc),
  };
}
