import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PERF_TABLES } from './migrations';
import type { PerfTable } from './migrations';
import { legacyColumn, LEGACY_DRIVER_COLUMNS, PERF_TABLE_SPECS } from './perfTables';
import { PerformanceStore } from './performance';
import type { Store } from './store';

/**
 * One-time import of the old Weekly Performance app's `app.db` into the performance tables.
 *
 * Behaviour, in short (the same rules as the load-out import in ./importV1.ts):
 * - The old file is never changed. It is copied to a temporary folder first and read from there.
 * - Its 12 weekly tables are copied as they are, in one transaction: all of it lands or none.
 *   Rows keep their ids (metric entries point at scorecards by id) and their saved order.
 * - Its Drivers table goes to the one driver list (`associates`): a driver whose Transporter ID
 *   is not on the list yet is added after the last row, with a blank status read as OFFBOARDED;
 *   a driver already on the list is left as the list has them.
 * - Only while every performance table is empty; otherwise nothing is written and the result
 *   says `skipped`. The driver list may already have people on it.
 * - An older database that lacks a table, or the columns the old app added later (the drivers'
 *   contact details, the scorecards' file name), is accepted: what is missing reads as empty.
 * - The result carries counts per table, never names or IDs.
 */
export interface WpaTableCount {
  /** A performance table, or `associates` for the old Drivers table. */
  table: PerfTable | 'associates';
  /** Rows in the old database (0 if it has no such table). */
  source: number;
  /** Rows in the new database after the import. */
  imported: number;
}

export interface ImportWpaResult {
  status: 'imported' | 'skipped';
  /** Why it was skipped. Only set when status is 'skipped'. */
  reason?: 'destination-not-empty';
  tables: WpaTableCount[];
  /** True when every table has as many rows as it had before. */
  identical: boolean;
}

export class ImportWpaError extends Error {
  constructor(readonly code: 'source-missing' | 'source-unreadable') {
    super(`Could not import the old weekly performance database (${code}).`);
    this.name = 'ImportWpaError';
  }
}

type Row = Record<string, unknown>;

/** Copies the old app's database at `sourcePath` into `store`'s performance tables. */
export function importWpaDatabase(sourcePath: string, store: Store): ImportWpaResult {
  if (!existsSync(sourcePath)) throw new ImportWpaError('source-missing');

  const scratch = mkdtempSync(join(tmpdir(), 'loadout-wpa-import-'));
  try {
    const copy = join(scratch, 'app.db');
    copyFileSync(sourcePath, copy);
    for (const suffix of ['-wal', '-shm']) {
      if (existsSync(sourcePath + suffix)) copyFileSync(sourcePath + suffix, copy + suffix);
    }
    let src: Database.Database | undefined;
    try {
      src = new Database(copy);
      src.prepare('SELECT 1 FROM sqlite_master LIMIT 1').get();
    } catch {
      // Close the handle before the scratch folder is removed; on Windows an open file
      // cannot be deleted.
      src?.close();
      throw new ImportWpaError('source-unreadable');
    }
    try {
      return copyAll(src, store.db);
    } finally {
      src.close();
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
  }
}

function hasTable(src: Database.Database, table: string): boolean {
  return !!src.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
}

function columnsOf(src: Database.Database, table: string): Set<string> {
  return new Set(
    (src.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((c) => c.name),
  );
}

type CountTable = PerfTable | 'associates';

function countRows(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n;
}

function countSource(src: Database.Database): Record<CountTable, number> {
  const out = {} as Record<CountTable, number>;
  for (const spec of PERF_TABLE_SPECS) {
    out[spec.table] = hasTable(src, spec.legacy) ? countRows(src, spec.legacy) : 0;
  }
  out.associates = hasTable(src, 'Drivers') ? countRows(src, 'Drivers') : 0;
  return out;
}

/**
 * The old Drivers table into the one driver list: each driver not on it yet is added after the
 * last row. Returns how many of the old rows are on the list afterwards (one already there counts
 * as brought over, but is left as the list has them).
 */
function copyDrivers(src: Database.Database, db: Database.Database): number {
  if (!hasTable(src, 'Drivers')) return 0;
  const present = columnsOf(src, 'Drivers');
  if (!present.has('TransporterId')) return 0;
  const select = LEGACY_DRIVER_COLUMNS.map((column) =>
    present.has(column) ? `"${column}"` : `NULL AS "${column}"`,
  ).join(', ');
  const exists = db.prepare('SELECT 1 FROM associates WHERE transporter_id = ?');
  const insert = db.prepare(
    `INSERT INTO associates
       (transporter_id, position_index, name, status, position, qualifications,
        id_expiration, personal_phone, work_phone, email)
     VALUES (?, COALESCE((SELECT MAX(position_index) FROM associates), -1) + 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const text = (value: unknown) => (value == null ? '' : String(value));
  let over = 0;
  const rows = src.prepare(`SELECT ${select} FROM "Drivers" ORDER BY rowid`).all() as Row[];
  for (const row of rows) {
    const transporterId = text(row.TransporterId).trim();
    if (transporterId === '') continue;
    over++;
    if (exists.get(transporterId)) continue;
    const status = text(row.Status).trim();
    insert.run(
      transporterId,
      text(row.Name),
      status === '' ? 'OFFBOARDED' : status,
      text(row.Position),
      text(row.Qualifications),
      row.IdExpiration == null || text(row.IdExpiration).trim() === ''
        ? null
        : text(row.IdExpiration),
      text(row.PersonalPhone),
      text(row.WorkPhone),
      text(row.Email),
    );
  }
  return over;
}

function copyAll(src: Database.Database, db: Database.Database): ImportWpaResult {
  const perf = new PerformanceStore(db);
  const before = perf.perfTableCounts();
  const sourceCounts = countSource(src);
  const summary = (counts: Record<CountTable, number>): WpaTableCount[] =>
    (['associates', ...PERF_TABLES] as const).map((table) => ({
      table,
      source: sourceCounts[table],
      imported: counts[table],
    }));

  if (Object.values(before).some((n) => n > 0)) {
    return {
      status: 'skipped',
      reason: 'destination-not-empty',
      tables: summary({ ...before, associates: 0 }),
      identical: false,
    };
  }

  // The old app did not always have its foreign-key checks on, so an old database can hold a
  // row whose driver or scorecard is gone. Copy it as it is rather than refuse the whole file.
  // (The setting cannot change inside a transaction, so it is turned off around it.)
  const foreignKeys = db.pragma('foreign_keys', { simple: true }) as number;
  db.pragma('foreign_keys = OFF');
  let driversOver = 0;
  try {
    db.transaction(() => {
      driversOver = copyDrivers(src, db);
      for (const spec of PERF_TABLE_SPECS) {
        if (!hasTable(src, spec.legacy)) continue;
        const present = columnsOf(src, spec.legacy);
        const columns = spec.columns.filter(([, field]) => present.has(legacyColumn(field)));
        if (columns.length === 0) continue;
        // The rowid keeps the saved order for tables without an id of their own.
        const keepRowid = !spec.autoId;
        const select = [
          ...(keepRowid ? ['rowid AS "__rowid"'] : []),
          ...columns.map(([, field]) => `"${legacyColumn(field)}" AS "${field}"`),
        ].join(', ');
        const order = spec.autoId ? '"Id"' : 'rowid';
        const names = [...(keepRowid ? ['rowid'] : []), ...columns.map(([column]) => column)];
        const insert = db.prepare(
          `INSERT INTO ${spec.table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
        );
        // Whole numbers are read exactly: the auto-import record's times are too big for a
        // plain JavaScript number.
        const read = src
          .prepare(`SELECT ${select} FROM "${spec.legacy}" ORDER BY ${order}`)
          .safeIntegers(true);
        for (const row of read.iterate() as Iterable<Row>) {
          insert.run(
            ...[...(keepRowid ? ['__rowid'] : []), ...columns.map(([, field]) => field)].map(
              (key) => row[key] ?? null,
            ),
          );
        }
      }
      copySequences(src, db);
    })();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`);
  }

  const tables = summary({ ...perf.perfTableCounts(), associates: driversOver });
  return { status: 'imported', tables, identical: tables.every((t) => t.source === t.imported) };
}

/**
 * Carry over where each id counter had got to, so new rows are numbered after the old app's
 * last one (even one since deleted), the way the old app would have numbered them.
 */
function copySequences(src: Database.Database, db: Database.Database): void {
  if (!hasTable(src, 'sqlite_sequence')) return;
  const old = src
    .prepare('SELECT name, seq FROM sqlite_sequence')
    .safeIntegers(true)
    .all() as Array<{
    name: string;
    seq: bigint;
  }>;
  for (const spec of PERF_TABLE_SPECS) {
    if (!spec.autoId) continue;
    const entry = old.find((row) => row.name === spec.legacy);
    if (!entry) continue;
    const changed = db
      .prepare('UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = ?')
      .run(entry.seq, spec.table).changes;
    if (changed === 0) {
      db.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(
        spec.table,
        entry.seq,
      );
    }
  }
}
