import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DATA_TABLES } from './migrations';
import type { DataTable } from './migrations';
import { Store, asDate, asDateTime } from './store';
import { FIELD_NAMES, ROUTE_FIELDS, VEHICLE_FIELDS } from './types';
import type {
  Associate,
  DriverRow,
  DwpEntry,
  Roster,
  RouteDataSet,
  RouteEntry,
  TenureBook,
  Vehicle,
} from './types';

/**
 * One-time import of the old version's `loadout.db` into a v2 database.
 *
 * Behaviour, in short:
 * - The old file is never changed. It is copied to a temporary folder first and read from there
 *   (an old database may be in WAL mode, and even reading one can touch its side files).
 * - The new database goes through the usual setup steps (migrations) first.
 * - Everything is written through the Store, in a single transaction: all of it lands or none.
 * - Safe to run twice: if the new database already holds any saved data, nothing is written and
 *   the result says `skipped`. To import again, start from a fresh new database.
 * - The result carries counts per table, never names or IDs.
 * - Older databases that lack some tables or columns are accepted; missing pieces read as empty.
 */
export interface TableCount {
  table: DataTable;
  /** Rows in the old database (0 if it has no such table). */
  source: number;
  /** Rows in the new database after the import. */
  imported: number;
}

export interface ImportResult {
  status: 'imported' | 'skipped';
  /** Why it was skipped. Only set when status is 'skipped'. */
  reason?: 'destination-not-empty';
  tables: TableCount[];
  /** True when every table has as many rows as it had before. */
  identical: boolean;
}

export class ImportV1Error extends Error {
  constructor(readonly code: 'source-missing' | 'source-unreadable') {
    super(`Could not import the old database (${code}).`);
    this.name = 'ImportV1Error';
  }
}

type Row = Record<string, unknown>;

export function importV1Database(sourcePath: string, store: Store): ImportResult {
  if (!existsSync(sourcePath)) throw new ImportV1Error('source-missing');

  const scratch = mkdtempSync(join(tmpdir(), 'loadout-import-'));
  try {
    const copy = join(scratch, 'old.db');
    copyFileSync(sourcePath, copy);
    for (const suffix of ['-wal', '-shm']) {
      if (existsSync(sourcePath + suffix)) copyFileSync(sourcePath + suffix, copy + suffix);
    }
    let src: Database.Database | undefined;
    try {
      src = new Database(copy, { readonly: false });
      src.prepare('SELECT 1 FROM sqlite_master LIMIT 1').get();
    } catch {
      // Close the handle before the scratch folder is removed; on Windows an open file
      // cannot be deleted.
      src?.close();
      throw new ImportV1Error('source-unreadable');
    }
    try {
      return copyAll(src, store);
    } finally {
      src.close();
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
  }
}

function copyAll(src: Database.Database, store: Store): ImportResult {
  const before = store.tableCounts();
  const sourceCounts = countSource(src);

  if (Object.values(before).some((n) => n > 0)) {
    return {
      status: 'skipped',
      reason: 'destination-not-empty',
      tables: DATA_TABLES.map((table) => ({
        table,
        source: sourceCounts[table],
        imported: before[table],
      })),
      identical: false,
    };
  }

  store.transaction(() => {
    importRosters(src, store);
    importAssociates(src, store);
    importLinks(src, store);
    importRouteData(src, store);
    importDwp(src, store);
    importVehicles(src, store);
    importSmallTables(src, store);
    importTenure(src, store);
    importLayouts(src, store);
  });

  const after = store.tableCounts();
  const tables = DATA_TABLES.map((table) => ({
    table,
    source: sourceCounts[table],
    imported: after[table],
  }));
  return { status: 'imported', tables, identical: tables.every((t) => t.source === t.imported) };
}

// ------------------------------------------------------------------- reading

function hasTable(src: Database.Database, table: string): boolean {
  return !!src.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
}

function countSource(src: Database.Database): Record<DataTable, number> {
  const out = {} as Record<DataTable, number>;
  for (const table of DATA_TABLES) {
    out[table] = hasTable(src, table)
      ? (src.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n
      : 0;
  }
  return out;
}

/** All rows of a table (empty if the table is missing), in a stable order. */
function rowsOf(src: Database.Database, table: string, orderBy: string): Row[] {
  if (!hasTable(src, table)) return [];
  const columns = new Set(
    (src.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((c) => c.name),
  );
  const order = orderBy
    .split(',')
    .map((c) => c.trim())
    .filter((c) => columns.has(c))
    .join(', ');
  return src.prepare(`SELECT * FROM "${table}"${order ? ` ORDER BY ${order}` : ''}`).all() as Row[];
}

function str(value: unknown): string {
  return value == null ? '' : String(value);
}

function metaRow(src: Database.Database, table: string): Row | undefined {
  return rowsOf(src, table, '')[0];
}

// ------------------------------------------------------------------ copying

function importRosters(src: Database.Database, store: Store): void {
  for (const [rowsTable, metaTable, save] of [
    ['driver_rows', 'roster_meta', (r: Roster) => store.saveRoster(r)],
    ['previous_driver_rows', 'previous_roster_meta', (r: Roster) => store.savePreviousRoster(r)],
  ] as const) {
    const records = rowsOf(src, rowsTable, 'position, id');
    const meta = metaRow(src, metaTable);
    if (records.length === 0 && !meta) continue;
    save({
      rows: records.map((record) => {
        const row = {} as DriverRow;
        for (const name of FIELD_NAMES) row[name] = str(record[name]);
        // Dispatch times used to have a column of their own; now they are the sheet's wave time.
        // Carry across whatever an older version wrote (same rule the old version applied).
        if (!row.wave_time && str(record.dispatch_time)) row.wave_time = str(record.dispatch_time);
        return row;
      }),
      load_out_date: asDate(meta?.load_out_date),
      source_file: str(meta?.source_file),
      imported_at: asDateTime(meta?.imported_at),
      route_source: str(meta?.route_source),
    });
  }
}

function importAssociates(src: Database.Database, store: Store): void {
  const records = rowsOf(src, 'associates', 'position_index');
  const meta = metaRow(src, 'associates_meta');
  if (records.length === 0 && !meta) return;
  store.saveAssociates({
    rows: records.map((r): Associate => ({
      name: str(r.name),
      transporter_id: str(r.transporter_id),
      position: str(r.position),
      qualifications: str(r.qualifications)
        .split(',')
        .map((q) => q.trim())
        .filter(Boolean),
      id_expiration: asDate(r.id_expiration),
      personal_phone: str(r.personal_phone),
      work_phone: str(r.work_phone),
      email: str(r.email),
      status: str(r.status),
    })),
    source_file: str(meta?.source_file),
    imported_at: asDateTime(meta?.imported_at),
  });
}

function importLinks(src: Database.Database, store: Store): void {
  for (const r of rowsOf(src, 'driver_links', 'driver_key')) {
    store.setLink(
      str(r.driver_key),
      str(r.driver_name),
      r.transporter_id ? str(r.transporter_id) : null,
    );
  }
}

function importRouteData(src: Database.Database, store: Store): void {
  const entries = rowsOf(src, 'route_entries', 'kind, position, id');
  const metas = rowsOf(src, 'route_meta', 'kind');
  const pads = rowsOf(src, 'pad_assignments', 'kind, dispatch_time');
  const kinds = new Set<string>([
    ...entries.map((r) => str(r.kind)),
    ...metas.map((r) => str(r.kind)),
  ]);
  for (const kind of [...kinds].sort()) {
    const meta = metas.find((m) => str(m.kind) === kind);
    const dataset: RouteDataSet = {
      kind,
      rows: entries
        .filter((r) => str(r.kind) === kind)
        .map((r) => {
          const row = {} as RouteEntry;
          for (const name of ROUTE_FIELDS) row[name] = str(r[name]);
          return row;
        }),
      pads: {},
      day: asDate(meta?.day),
      source_file: str(meta?.source_file),
      imported_at: asDateTime(meta?.imported_at),
      source_total: meta && meta.source_total != null ? Number(meta.source_total) : null,
    };
    for (const p of pads) {
      if (str(p.kind) === kind && p.pad) dataset.pads[str(p.dispatch_time)] = Number(p.pad);
    }
    store.saveRouteData(dataset);
  }
  // PAD assignments of a kind that has no route rows or meta still belong to the user.
  for (const p of pads) {
    const kind = str(p.kind);
    if (kinds.has(kind) || !p.pad) continue;
    const mine: Record<string, number> = {};
    for (const q of pads)
      if (str(q.kind) === kind && q.pad) mine[str(q.dispatch_time)] = Number(q.pad);
    store.savePads(kind, mine);
  }
}

function importDwp(src: Database.Database, store: Store): void {
  const records = rowsOf(src, 'dwp_rows', 'position, id');
  const meta = metaRow(src, 'dwp_meta');
  if (records.length === 0 && !meta) return;
  store.saveDwp({
    rows: records.map((r): DwpEntry => ({
      route_code: str(r.route_code),
      bags: str(r.bags),
      ovs: str(r.ovs),
      staging: str(r.staging),
    })),
    day: asDate(meta?.day),
    source_file: str(meta?.source_file),
    imported_at: asDateTime(meta?.imported_at),
  });
}

function importVehicles(src: Database.Database, store: Store): void {
  const records = rowsOf(src, 'vehicles', 'position');
  const meta = metaRow(src, 'vehicles_meta');
  if (records.length === 0 && !meta) return;
  store.saveVehicles({
    rows: records.map((r) => {
      const v = {
        vin: str(r.vin),
        operational: r.operational == null ? false : Boolean(r.operational),
        registration_expiry: asDate(r.registration_expiry),
        ownership_end: asDate(r.ownership_end),
      } as Vehicle;
      for (const name of VEHICLE_FIELDS) v[name] = str(r[name]);
      return v;
    }),
    source_file: str(meta?.source_file),
    imported_at: asDateTime(meta?.imported_at),
  });
}

function importSmallTables(src: Database.Database, store: Store): void {
  for (const r of rowsOf(src, 'vehicle_priorities', 'vin')) {
    store.setVehiclePriority(str(r.vin), str(r.priority));
  }
  for (const r of rowsOf(src, 'vehicle_overrides', 'vin')) {
    store.setVehicleOverride(str(r.vin), Boolean(r.operational));
  }
  for (const r of rowsOf(src, 'lmr_approved', 'transporter_id')) {
    store.setLmrApproved(str(r.transporter_id), true);
  }
  for (const r of rowsOf(src, 'van_affinity', 'vin, slot')) {
    store.setAffinity(str(r.vin), str(r.slot), str(r.transporter_id));
  }
  const legacy: Record<string, number> = {};
  for (const r of rowsOf(src, 'associate_tenure', 'transporter_id')) {
    legacy[str(r.transporter_id)] = Number(r.years);
  }
  if (Object.keys(legacy).length > 0) store.saveLegacyTenureYears(legacy);
}

function importTenure(src: Database.Database, store: Store): void {
  const records = rowsOf(src, 'lifetime_routes', 'transporter_id');
  const meta = metaRow(src, 'tenure_meta');
  if (records.length === 0 && !meta) return;
  const book: TenureBook = {
    records: {},
    source_file: str(meta?.source_file),
    imported_at: asDateTime(meta?.imported_at),
  };
  for (const r of records) {
    book.records[str(r.transporter_id)] = {
      routes: Math.trunc(Number(r.routes)),
      year: Math.trunc(Number(r.year ?? 0)),
      week: Math.trunc(Number(r.week ?? 0)),
    };
  }
  store.saveTenure(book);
}

function importLayouts(src: Database.Database, store: Store): void {
  for (const r of rowsOf(src, 'column_order', 'view')) {
    store.setColumnOrder(str(r.view), str(r.fields).split(',').filter(Boolean));
  }
  const widths = rowsOf(src, 'column_widths', 'view, field');
  const views = new Set(widths.map((r) => str(r.view)));
  for (const view of views) {
    const mine: Record<string, number> = {};
    for (const r of widths) if (str(r.view) === view) mine[str(r.field)] = Number(r.width);
    store.setColumnWidths(view, mine);
  }
  for (const r of rowsOf(src, 'print_layouts', 'name')) {
    store.savePrintLayout(str(r.name), str(r.payload));
  }
}
