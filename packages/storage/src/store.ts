import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { dateFromName } from './dates';
import { DATA_TABLES, runMigrations } from './migrations';
import type { DataTable } from './migrations';
import { FIELD_NAMES, ROUTE_FIELDS, VEHICLE_FIELDS } from './types';
import type {
  AffinityEntry,
  Associate,
  AssociateBook,
  DriverRow,
  DwpDataSet,
  Roster,
  RouteDataSet,
  RouteEntry,
  TenureBook,
  Vehicle,
  VehicleFleet,
} from './types';

type Row = Record<string, unknown>;

export interface StoreOptions {
  /** Used for "imported at" when a record has none. Defaults to the computer's clock. */
  now?: () => Date;
}

/** Reads and writes everything the app keeps between runs. Mirrors the old version's Store. */
export class Store {
  /** What the working Print layout is filed under. Empty, so it can never collide with a name. */
  static readonly WORKING_LAYOUT = '';

  readonly db: Database.Database;
  private readonly now: () => Date;

  /** `path` may be ':memory:' for a throwaway database. */
  constructor(path: string, options: StoreOptions = {}) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.now = options.now ?? (() => new Date());
    if (path !== ':memory:') {
      // Same settings as the old version: commits append to one side file instead of creating
      // and deleting a journal every time.
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
    }
    runMigrations(this.db);
  }

  /** Let go of the database file. */
  close(): void {
    this.db.close();
  }

  /** Run several changes as one: all of them land, or none do. */
  transaction<T>(work: () => T): T {
    return this.db.transaction(work)();
  }

  /** How many rows each saved-data table holds. Counts only. */
  tableCounts(): Record<DataTable, number> {
    const counts = {} as Record<DataTable, number>;
    for (const table of DATA_TABLES) {
      const row = this.db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number };
      counts[table] = row.n;
    }
    return counts;
  }

  private stamp(value: string | null | undefined): string {
    return value || isoSeconds(this.now());
  }

  // ------------------------------------------------------------- load-out

  saveRoster(roster: Roster): void {
    this.saveRosterInto(roster, 'driver_rows', 'roster_meta');
  }

  loadRoster(): Roster {
    return this.loadRosterFrom('driver_rows', 'roster_meta');
  }

  clearRoster(): void {
    this.transaction(() => {
      this.db.exec('DELETE FROM driver_rows');
      this.db.exec('DELETE FROM roster_meta');
    });
  }

  // ------------------------------------------------------- previous roster

  savePreviousRoster(roster: Roster): void {
    this.saveRosterInto(roster, 'previous_driver_rows', 'previous_roster_meta');
  }

  loadPreviousRoster(): Roster {
    return this.loadRosterFrom('previous_driver_rows', 'previous_roster_meta');
  }

  clearPreviousRoster(): void {
    this.transaction(() => {
      this.db.exec('DELETE FROM previous_driver_rows');
      this.db.exec('DELETE FROM previous_roster_meta');
    });
  }

  private saveRosterInto(roster: Roster, rowsTable: string, metaTable: string): void {
    const columns = FIELD_NAMES.join(', ');
    const marks = FIELD_NAMES.map(() => '?').join(', ');
    this.transaction(() => {
      this.db.exec(`DELETE FROM ${rowsTable}`);
      this.db.exec(`DELETE FROM ${metaTable}`);
      this.db
        .prepare(
          `INSERT INTO ${metaTable} (id, load_out_date, source_file, imported_at, route_source)
           VALUES (1, ?, ?, ?, ?)`,
        )
        .run(
          roster.load_out_date || null,
          roster.source_file,
          this.stamp(roster.imported_at),
          roster.route_source,
        );
      const insert = this.db.prepare(
        `INSERT INTO ${rowsTable} (position, ${columns}) VALUES (?, ${marks})`,
      );
      roster.rows.forEach((row, index) => {
        insert.run(index, ...FIELD_NAMES.map((name) => row[name]));
      });
    });
  }

  private loadRosterFrom(rowsTable: string, metaTable: string): Roster {
    const meta = this.db.prepare(`SELECT * FROM ${metaTable} WHERE id = 1`).get() as
      Row | undefined;
    const records = this.db.prepare(`SELECT * FROM ${rowsTable} ORDER BY position`).all() as Row[];
    const rows = records.map((record) => {
      const row = {} as DriverRow;
      for (const name of FIELD_NAMES) row[name] = text(record[name]);
      return row;
    });
    return {
      rows,
      load_out_date: meta ? asDate(meta.load_out_date) : null,
      source_file: meta ? text(meta.source_file) : '',
      imported_at: meta ? asDateTime(meta.imported_at) : null,
      route_source: meta ? text(meta.route_source) : '',
    };
  }

  // ------------------------------------------------------- vehicle priority

  loadVehiclePriorities(): Record<string, string> {
    const records = this.db.prepare('SELECT vin, priority FROM vehicle_priorities').all() as Row[];
    const out: Record<string, string> = {};
    for (const r of records) if (r.priority) out[text(r.vin)] = text(r.priority);
    return out;
  }

  /** An empty priority removes the entry. */
  setVehiclePriority(vin: string, priority: string): void {
    if (priority) {
      this.db
        .prepare('INSERT OR REPLACE INTO vehicle_priorities (vin, priority) VALUES (?, ?)')
        .run(vin, priority);
    } else {
      this.db.prepare('DELETE FROM vehicle_priorities WHERE vin = ?').run(vin);
    }
  }

  clearVehiclePriorities(): void {
    this.db.exec('DELETE FROM vehicle_priorities');
  }

  // ----------------------------------------------------------- associates

  saveAssociates(book: AssociateBook): void {
    this.transaction(() => {
      this.db.exec('DELETE FROM associates');
      this.db.exec('DELETE FROM associates_meta');
      this.db
        .prepare('INSERT INTO associates_meta (id, source_file, imported_at) VALUES (1, ?, ?)')
        .run(book.source_file, this.stamp(book.imported_at));
      const insert = this.db.prepare(
        `INSERT OR REPLACE INTO associates
           (transporter_id, position_index, name, position, qualifications,
            id_expiration, personal_phone, work_phone, email, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      book.rows.forEach((a, index) => {
        insert.run(
          a.transporter_id,
          index,
          a.name,
          a.position,
          a.qualifications.join(', '),
          a.id_expiration || null,
          a.personal_phone,
          a.work_phone,
          a.email,
          a.status,
        );
      });
    });
  }

  loadAssociates(): AssociateBook {
    const meta = this.db.prepare('SELECT * FROM associates_meta WHERE id = 1').get() as
      Row | undefined;
    const records = this.db
      .prepare('SELECT * FROM associates ORDER BY position_index')
      .all() as Row[];
    const rows: Associate[] = records.map((r) => ({
      name: text(r.name),
      transporter_id: text(r.transporter_id),
      position: text(r.position),
      qualifications: text(r.qualifications)
        .split(',')
        .map((q) => q.trim())
        .filter(Boolean),
      id_expiration: asDate(r.id_expiration),
      personal_phone: text(r.personal_phone),
      work_phone: text(r.work_phone),
      email: text(r.email),
      status: text(r.status),
    }));
    return {
      rows,
      source_file: meta ? text(meta.source_file) : '',
      imported_at: meta ? asDateTime(meta.imported_at) : null,
    };
  }

  clearAssociates(): void {
    this.transaction(() => {
      this.db.exec('DELETE FROM associates');
      this.db.exec('DELETE FROM associates_meta');
    });
  }

  // --------------------------------------------------------- manual links

  /** driver key -> transporter id, or null for "not an associate". */
  loadLinks(): Record<string, string | null> {
    const records = this.db
      .prepare('SELECT driver_key, transporter_id FROM driver_links')
      .all() as Row[];
    const out: Record<string, string | null> = {};
    for (const r of records) out[text(r.driver_key)] = (r.transporter_id as string | null) ?? null;
    return out;
  }

  setLink(driverKey: string, driverName: string, transporterId: string | null): void {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO driver_links (driver_key, driver_name, transporter_id) VALUES (?, ?, ?)',
      )
      .run(driverKey, driverName, transporterId || null);
  }

  /** Drop a manual link so the driver goes back to automatic matching. */
  deleteLink(driverKey: string): void {
    this.db.prepare('DELETE FROM driver_links WHERE driver_key = ?').run(driverKey);
  }

  clearLinks(): void {
    this.db.exec('DELETE FROM driver_links');
  }

  // ----------------------------------------------------------- route data

  /** Replace the stored export of this kind, PAD assignments included. */
  saveRouteData(dataset: RouteDataSet): void {
    const columns = ROUTE_FIELDS.join(', ');
    const marks = ROUTE_FIELDS.map(() => '?').join(', ');
    this.transaction(() => {
      this.deleteRouteKind(dataset.kind);
      this.db
        .prepare(
          `INSERT INTO route_meta (kind, day, source_file, imported_at, source_total)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          dataset.kind,
          dataset.day || null,
          dataset.source_file,
          this.stamp(dataset.imported_at),
          dataset.source_total,
        );
      const insert = this.db.prepare(
        `INSERT INTO route_entries (kind, position, ${columns}) VALUES (?, ?, ${marks})`,
      );
      dataset.rows.forEach((row, index) => {
        insert.run(dataset.kind, index, ...ROUTE_FIELDS.map((name) => row[name]));
      });
      const pad = this.db.prepare(
        'INSERT OR REPLACE INTO pad_assignments (kind, dispatch_time, pad) VALUES (?, ?, ?)',
      );
      for (const [time, number] of Object.entries(dataset.pads))
        pad.run(dataset.kind, time, number);
    });
  }

  loadRouteData(kind: string): RouteDataSet {
    const meta = this.db.prepare('SELECT * FROM route_meta WHERE kind = ?').get(kind) as
      Row | undefined;
    const records = this.db
      .prepare('SELECT * FROM route_entries WHERE kind = ? ORDER BY position')
      .all(kind) as Row[];
    const padRows = this.db
      .prepare('SELECT dispatch_time, pad FROM pad_assignments WHERE kind = ?')
      .all(kind) as Row[];
    const pads: Record<string, number> = {};
    for (const r of padRows) if (r.pad) pads[text(r.dispatch_time)] = Number(r.pad);
    return {
      kind,
      rows: records.map((record) => {
        const row = {} as RouteEntry;
        for (const name of ROUTE_FIELDS) row[name] = text(record[name]);
        return row;
      }),
      pads,
      day: meta ? asDate(meta.day) : null,
      source_file: meta ? text(meta.source_file) : '',
      imported_at: meta ? asDateTime(meta.imported_at) : null,
      source_total: meta && meta.source_total != null ? Number(meta.source_total) : null,
    };
  }

  /** Replace this kind's PAD assignments. A PAD of 0 is left out. */
  savePads(kind: string, pads: Record<string, number>): void {
    this.transaction(() => {
      this.db.prepare('DELETE FROM pad_assignments WHERE kind = ?').run(kind);
      const insert = this.db.prepare(
        'INSERT OR REPLACE INTO pad_assignments (kind, dispatch_time, pad) VALUES (?, ?, ?)',
      );
      for (const [time, number] of Object.entries(pads)) if (number) insert.run(kind, time, number);
    });
  }

  clearRouteData(kind: string): void {
    this.transaction(() => this.deleteRouteKind(kind));
  }

  private deleteRouteKind(kind: string): void {
    this.db.prepare('DELETE FROM route_entries WHERE kind = ?').run(kind);
    this.db.prepare('DELETE FROM route_meta WHERE kind = ?').run(kind);
    this.db.prepare('DELETE FROM pad_assignments WHERE kind = ?').run(kind);
  }

  // ------------------------------------------------------------------ dwp

  saveDwp(dataset: DwpDataSet): void {
    this.transaction(() => {
      this.db.exec('DELETE FROM dwp_rows');
      this.db.exec('DELETE FROM dwp_meta');
      this.db
        .prepare('INSERT INTO dwp_meta (id, day, source_file, imported_at) VALUES (1, ?, ?, ?)')
        .run(dataset.day || null, dataset.source_file, this.stamp(dataset.imported_at));
      const insert = this.db.prepare(
        'INSERT INTO dwp_rows (position, route_code, bags, ovs, staging) VALUES (?, ?, ?, ?, ?)',
      );
      dataset.rows.forEach((row, index) => {
        insert.run(index, row.route_code, row.bags, row.ovs, row.staging);
      });
    });
  }

  loadDwp(): DwpDataSet {
    const meta = this.db.prepare('SELECT * FROM dwp_meta WHERE id = 1').get() as Row | undefined;
    const records = this.db.prepare('SELECT * FROM dwp_rows ORDER BY position').all() as Row[];
    const rows = records.map((r) => ({
      route_code: text(r.route_code),
      bags: text(r.bags),
      ovs: text(r.ovs),
      staging: text(r.staging),
    }));
    if (!meta) return { rows, day: null, source_file: '', imported_at: null };
    const sourceFile = text(meta.source_file);
    // A sheet stored before the day was recorded has none saved. Read it off the file name so
    // those rows can answer for themselves.
    return {
      rows,
      day: asDate(meta.day) ?? dateFromName(sourceFile),
      source_file: sourceFile,
      imported_at: asDateTime(meta.imported_at),
    };
  }

  clearDwp(): void {
    this.transaction(() => {
      this.db.exec('DELETE FROM dwp_rows');
      this.db.exec('DELETE FROM dwp_meta');
    });
  }

  // -------------------------------------------------------------- vehicles

  /** Replace the stored fleet. Operational overrides are left alone. */
  saveVehicles(fleet: VehicleFleet): void {
    const columns = VEHICLE_FIELDS.join(', ');
    const marks = VEHICLE_FIELDS.map(() => '?').join(', ');
    this.transaction(() => {
      this.db.exec('DELETE FROM vehicles');
      this.db.exec('DELETE FROM vehicles_meta');
      this.db
        .prepare('INSERT INTO vehicles_meta (id, source_file, imported_at) VALUES (1, ?, ?)')
        .run(fleet.source_file, this.stamp(fleet.imported_at));
      const insert = this.db.prepare(
        `INSERT OR REPLACE INTO vehicles
           (vin, position, ${columns}, operational, registration_expiry, ownership_end)
         VALUES (?, ?, ${marks}, ?, ?, ?)`,
      );
      fleet.rows.forEach((v, index) => {
        insert.run(
          v.vin,
          index,
          ...VEHICLE_FIELDS.map((name) => v[name]),
          v.operational ? 1 : 0,
          v.registration_expiry || null,
          v.ownership_end || null,
        );
      });
    });
  }

  loadVehicles(): VehicleFleet {
    const meta = this.db.prepare('SELECT * FROM vehicles_meta WHERE id = 1').get() as
      Row | undefined;
    const records = this.db.prepare('SELECT * FROM vehicles ORDER BY position').all() as Row[];
    const rows = records.map((r) => {
      const v = {
        vin: text(r.vin),
        operational: Boolean(r.operational),
        registration_expiry: asDate(r.registration_expiry),
        ownership_end: asDate(r.ownership_end),
      } as Vehicle;
      for (const name of VEHICLE_FIELDS) v[name] = text(r[name]);
      return v;
    });
    return {
      rows,
      source_file: meta ? text(meta.source_file) : '',
      imported_at: meta ? asDateTime(meta.imported_at) : null,
    };
  }

  clearVehicles(): void {
    this.transaction(() => {
      this.db.exec('DELETE FROM vehicles');
      this.db.exec('DELETE FROM vehicles_meta');
    });
  }

  // ----------------------------------------------------- vehicle overrides

  loadVehicleOverrides(): Record<string, boolean> {
    const records = this.db
      .prepare('SELECT vin, operational FROM vehicle_overrides')
      .all() as Row[];
    const out: Record<string, boolean> = {};
    for (const r of records) out[text(r.vin)] = Boolean(r.operational);
    return out;
  }

  setVehicleOverride(vin: string, operational: boolean): void {
    this.db
      .prepare('INSERT OR REPLACE INTO vehicle_overrides (vin, operational) VALUES (?, ?)')
      .run(vin, operational ? 1 : 0);
  }

  deleteVehicleOverride(vin: string): void {
    this.db.prepare('DELETE FROM vehicle_overrides WHERE vin = ?').run(vin);
  }

  clearVehicleOverrides(): void {
    this.db.exec('DELETE FROM vehicle_overrides');
  }

  // ---------------------------------------------------------- LMR approval

  loadLmrApproved(): Set<string> {
    const records = this.db.prepare('SELECT transporter_id FROM lmr_approved').all() as Row[];
    return new Set(records.map((r) => text(r.transporter_id)).filter(Boolean));
  }

  setLmrApproved(transporterId: string, approved: boolean): void {
    if (approved) {
      this.db
        .prepare('INSERT OR REPLACE INTO lmr_approved (transporter_id) VALUES (?)')
        .run(transporterId);
    } else {
      this.db.prepare('DELETE FROM lmr_approved WHERE transporter_id = ?').run(transporterId);
    }
  }

  clearLmrApproved(): void {
    this.db.exec('DELETE FROM lmr_approved');
  }

  // ---------------------------------------------------------------- tenure

  /** The lifetime route counts, with where and when they last came from. */
  loadTenure(): TenureBook {
    const meta = this.db.prepare('SELECT * FROM tenure_meta WHERE id = 1').get() as Row | undefined;
    const rows = this.db
      .prepare('SELECT transporter_id, routes, year, week FROM lifetime_routes')
      .all() as Row[];
    const records: TenureBook['records'] = {};
    for (const r of rows) {
      if (!r.transporter_id || r.routes == null) continue;
      records[text(r.transporter_id)] = {
        routes: Math.trunc(Number(r.routes)),
        year: Math.trunc(Number(r.year)),
        week: Math.trunc(Number(r.week)),
      };
    }
    return {
      records,
      source_file: meta ? text(meta.source_file) : '',
      imported_at: meta ? asDateTime(meta.imported_at) : null,
    };
  }

  /**
   * Fold an import's route counts into the stored ones. Only ever moves forward: a driver
   * missing from this week's export keeps the count an earlier one gave them, and a count from
   * an older week never replaces a newer one. Returns how many counts actually landed.
   */
  saveTenure(book: TenureBook): number {
    return this.transaction(() => {
      const upsert = this.db.prepare(
        `INSERT INTO lifetime_routes (transporter_id, routes, year, week)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(transporter_id) DO UPDATE SET
           routes = excluded.routes, year = excluded.year, week = excluded.week
         WHERE (excluded.year, excluded.week, excluded.routes) > (year, week, routes)`,
      );
      let landed = 0;
      for (const [id, record] of Object.entries(book.records)) {
        landed += upsert.run(id, record.routes, record.year, record.week).changes;
      }
      this.db.exec('DELETE FROM tenure_meta');
      this.db
        .prepare('INSERT INTO tenure_meta (id, source_file, imported_at) VALUES (1, ?, ?)')
        .run(book.source_file, this.stamp(book.imported_at));
      return landed;
    });
  }

  /** Forgets every lifetime route count and where they came from. The old hand-typed years stay. */
  clearTenure(): void {
    this.transaction(() => {
      this.db.exec('DELETE FROM lifetime_routes');
      this.db.exec('DELETE FROM tenure_meta');
    });
  }

  // ------------------------------------------- old hand-typed tenure years

  /** Transporter ID -> years, as an old database left them. Nothing in the app reads these. */
  loadLegacyTenureYears(): Record<string, number> {
    const rows = this.db
      .prepare('SELECT transporter_id, years FROM associate_tenure')
      .all() as Row[];
    const out: Record<string, number> = {};
    for (const r of rows) out[text(r.transporter_id)] = Number(r.years);
    return out;
  }

  saveLegacyTenureYears(years: Record<string, number>): void {
    this.transaction(() => {
      this.db.exec('DELETE FROM associate_tenure');
      const insert = this.db.prepare(
        'INSERT OR REPLACE INTO associate_tenure (transporter_id, years) VALUES (?, ?)',
      );
      for (const [id, value] of Object.entries(years)) insert.run(id, value);
    });
  }

  // --------------------------------------------------------- column layout

  /** The field names this table was last left in, or [] for untouched. */
  loadColumnOrder(view: string): string[] {
    const record = this.db.prepare('SELECT fields FROM column_order WHERE view = ?').get(view) as
      Row | undefined;
    if (!record || !record.fields) return [];
    return text(record.fields).split(',').filter(Boolean);
  }

  /** An empty list puts the table back to its usual order. */
  setColumnOrder(view: string, fields: string[]): void {
    if (fields.length > 0) {
      this.db
        .prepare('INSERT OR REPLACE INTO column_order (view, fields) VALUES (?, ?)')
        .run(view, fields.join(','));
    } else {
      this.db.prepare('DELETE FROM column_order WHERE view = ?').run(view);
    }
  }

  /** The widths set by hand on this table, keyed by field. */
  loadColumnWidths(view: string): Record<string, number> {
    const records = this.db
      .prepare('SELECT field, width FROM column_widths WHERE view = ?')
      .all(view) as Row[];
    const out: Record<string, number> = {};
    for (const r of records) if (r.width) out[text(r.field)] = Math.trunc(Number(r.width));
    return out;
  }

  /** Replace this table's hand-set widths with these. */
  setColumnWidths(view: string, widths: Record<string, number>): void {
    this.transaction(() => {
      this.db.prepare('DELETE FROM column_widths WHERE view = ?').run(view);
      const insert = this.db.prepare(
        'INSERT OR REPLACE INTO column_widths (view, field, width) VALUES (?, ?, ?)',
      );
      for (const [field, width] of Object.entries(widths))
        insert.run(view, field, Math.trunc(width));
    });
  }

  // ---------------------------------------------------------- print layouts

  /** The stored spec as JSON, or '' where there isn't one. */
  loadPrintLayout(name: string = Store.WORKING_LAYOUT): string {
    const record = this.db.prepare('SELECT payload FROM print_layouts WHERE name = ?').get(name) as
      Row | undefined;
    return record ? text(record.payload) : '';
  }

  savePrintLayout(name: string, payload: string): void {
    this.db
      .prepare('INSERT OR REPLACE INTO print_layouts (name, payload) VALUES (?, ?)')
      .run(name, payload);
  }

  deletePrintLayout(name: string): void {
    this.db.prepare('DELETE FROM print_layouts WHERE name = ?').run(name);
  }

  /** The saved layouts, by name. The working one has no name and is left out. */
  printLayoutNames(): string[] {
    const records = this.db
      .prepare("SELECT name FROM print_layouts WHERE name <> '' ORDER BY name COLLATE NOCASE")
      .all() as Row[];
    return records.map((r) => text(r.name));
  }

  // ----------------------------------------------------------- van affinity

  loadAffinity(): AffinityEntry[] {
    const records = this.db
      .prepare('SELECT vin, slot, transporter_id FROM van_affinity ORDER BY vin, slot')
      .all() as Row[];
    return records
      .filter((r) => r.transporter_id)
      .map((r) => ({
        vin: text(r.vin),
        slot: text(r.slot),
        transporter_id: text(r.transporter_id),
      }));
  }

  setAffinity(vin: string, slot: string, transporterId: string): void {
    this.db
      .prepare('INSERT OR REPLACE INTO van_affinity (vin, slot, transporter_id) VALUES (?, ?, ?)')
      .run(vin, slot, transporterId);
  }

  deleteAffinity(vin: string, slot: string): void {
    this.db.prepare('DELETE FROM van_affinity WHERE vin = ? AND slot = ?').run(vin, slot);
  }

  clearAffinity(): void {
    this.db.exec('DELETE FROM van_affinity');
  }
}

// ------------------------------------------------------------------ helpers

/** A stored value as text; empty or missing becomes ''. */
function text(value: unknown): string {
  return value == null || value === '' ? '' : String(value);
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'YYYY-MM-DD' if the value is a real calendar day, else null. */
export function asDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = DATE_ONLY.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  const real =
    probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
  return real ? value : null;
}

const DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;

/** The value if it reads as a date and time, else null. */
export function asDateTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = DATE_TIME.exec(value);
  if (!m || !asDate(m[1])) return null;
  if (Number(m[2]) > 23 || Number(m[3]) > 59 || Number(m[4] ?? 0) > 59) return null;
  return value;
}

/** Local date and time to the second, like Python's isoformat(timespec="seconds"). */
function isoSeconds(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` +
    `T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
  );
}
