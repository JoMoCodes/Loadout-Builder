import type Database from 'better-sqlite3';

/**
 * The database's setup steps, in order.
 *
 * Step 1 is the whole schema of the old Python version, as it stands after all of that version's
 * own upgrades (the columns it used to add on open are simply part of the table now). Table and
 * column names are unchanged, so the data model stays recognisable.
 *
 * To change the schema later, add a step with the next number. Never edit a step that has shipped.
 */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const SCHEMA_V1 = `
CREATE TABLE roster_meta (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    load_out_date TEXT,
    source_file   TEXT,
    imported_at   TEXT,
    route_source  TEXT DEFAULT ''
);

CREATE TABLE driver_rows (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    position         INTEGER NOT NULL,
    driver           TEXT NOT NULL,
    shift_type       TEXT DEFAULT '',
    status           TEXT DEFAULT '',
    routes           TEXT DEFAULT '',
    vehicle          TEXT DEFAULT '',
    vin              TEXT DEFAULT '',
    device           TEXT DEFAULT '',
    staging_location TEXT DEFAULT '',
    bag              TEXT DEFAULT '',
    wave_time        TEXT DEFAULT '',
    dispatch_time    TEXT DEFAULT '',
    pad              TEXT DEFAULT '',
    service_type     TEXT DEFAULT '',
    assign_method    TEXT DEFAULT '',
    bags             TEXT DEFAULT '',
    ovs              TEXT DEFAULT ''
);

CREATE TABLE associates_meta (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    source_file TEXT,
    imported_at TEXT
);

CREATE TABLE associates (
    transporter_id TEXT PRIMARY KEY,
    position_index INTEGER NOT NULL,
    name           TEXT NOT NULL,
    position       TEXT DEFAULT '',
    qualifications TEXT DEFAULT '',
    id_expiration  TEXT,
    personal_phone TEXT DEFAULT '',
    work_phone     TEXT DEFAULT '',
    email          TEXT DEFAULT '',
    status         TEXT DEFAULT ''
);

CREATE TABLE driver_links (
    driver_key     TEXT PRIMARY KEY,
    driver_name    TEXT DEFAULT '',
    transporter_id TEXT
);

CREATE TABLE route_meta (
    kind         TEXT PRIMARY KEY,
    day          TEXT,
    source_file  TEXT,
    imported_at  TEXT,
    source_total INTEGER
);

CREATE TABLE route_entries (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    kind           TEXT NOT NULL,
    position       INTEGER NOT NULL,
    transporter_id TEXT DEFAULT '',
    driver_name    TEXT DEFAULT '',
    route_code     TEXT DEFAULT '',
    dispatch_time  TEXT DEFAULT '',
    service_type   TEXT DEFAULT '',
    route_duration TEXT DEFAULT '',
    vin            TEXT DEFAULT '',
    detail         TEXT DEFAULT '',
    pad            TEXT DEFAULT '',
    shared_drivers TEXT DEFAULT '',
    shared_ids     TEXT DEFAULT ''
);

CREATE TABLE dwp_meta (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    day         TEXT,
    source_file TEXT,
    imported_at TEXT
);

CREATE TABLE dwp_rows (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    position   INTEGER NOT NULL,
    route_code TEXT DEFAULT '',
    bags       TEXT DEFAULT '',
    ovs        TEXT DEFAULT '',
    staging    TEXT DEFAULT ''
);

CREATE TABLE pad_assignments (
    kind          TEXT NOT NULL,
    dispatch_time TEXT NOT NULL,
    pad           INTEGER,
    PRIMARY KEY (kind, dispatch_time)
);

CREATE TABLE previous_roster_meta (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    load_out_date TEXT,
    source_file   TEXT,
    imported_at   TEXT,
    route_source  TEXT DEFAULT ''
);

CREATE TABLE previous_driver_rows (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    position         INTEGER NOT NULL,
    driver           TEXT NOT NULL,
    shift_type       TEXT DEFAULT '',
    status           TEXT DEFAULT '',
    routes           TEXT DEFAULT '',
    vehicle          TEXT DEFAULT '',
    vin              TEXT DEFAULT '',
    device           TEXT DEFAULT '',
    staging_location TEXT DEFAULT '',
    bag              TEXT DEFAULT '',
    wave_time        TEXT DEFAULT '',
    pad              TEXT DEFAULT '',
    service_type     TEXT DEFAULT '',
    assign_method    TEXT DEFAULT '',
    bags             TEXT DEFAULT '',
    ovs              TEXT DEFAULT ''
);

CREATE TABLE vehicle_priorities (
    vin      TEXT PRIMARY KEY,
    priority TEXT NOT NULL
);

CREATE TABLE vehicles_meta (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    source_file TEXT,
    imported_at TEXT
);

CREATE TABLE vehicles (
    vin                 TEXT PRIMARY KEY,
    position            INTEGER NOT NULL,
    name                TEXT DEFAULT '',
    service_type        TEXT DEFAULT '',
    service_tier        TEXT DEFAULT '',
    make                TEXT DEFAULT '',
    model               TEXT DEFAULT '',
    sub_model           TEXT DEFAULT '',
    plate               TEXT DEFAULT '',
    year                TEXT DEFAULT '',
    ownership           TEXT DEFAULT '',
    type_label          TEXT DEFAULT '',
    operational         INTEGER DEFAULT 1,
    status              TEXT DEFAULT '',
    status_note         TEXT DEFAULT '',
    registration_expiry TEXT,
    ownership_end       TEXT,
    station             TEXT DEFAULT ''
);

CREATE TABLE vehicle_overrides (
    vin         TEXT PRIMARY KEY,
    operational INTEGER NOT NULL
);

CREATE TABLE lmr_approved (
    transporter_id TEXT PRIMARY KEY
);

CREATE TABLE lifetime_routes (
    transporter_id TEXT PRIMARY KEY,
    routes         INTEGER NOT NULL,
    year           INTEGER NOT NULL DEFAULT 0,
    week           INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE tenure_meta (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    source_file TEXT,
    imported_at TEXT
);

CREATE TABLE column_order (
    view   TEXT PRIMARY KEY,
    fields TEXT NOT NULL
);

CREATE TABLE column_widths (
    view  TEXT NOT NULL,
    field TEXT NOT NULL,
    width INTEGER NOT NULL,
    PRIMARY KEY (view, field)
);

CREATE TABLE print_layouts (
    name    TEXT PRIMARY KEY,
    payload TEXT NOT NULL
);

CREATE TABLE van_affinity (
    vin            TEXT NOT NULL,
    slot           TEXT NOT NULL,
    transporter_id TEXT NOT NULL,
    PRIMARY KEY (vin, slot)
);

-- Old hand-typed tenure years. The old version stopped reading this table (a count of routes is
-- not a number of years) but left it in older databases. It is kept here, unread, so nothing is
-- lost when an old database is brought over.
CREATE TABLE associate_tenure (
    transporter_id TEXT PRIMARY KEY,
    years          REAL NOT NULL
);
`;

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'v1 schema from the old version', sql: SCHEMA_V1 },
];

/** Every table a migration creates for saved data (not the bookkeeping table). */
export const DATA_TABLES = [
  'roster_meta',
  'driver_rows',
  'associates_meta',
  'associates',
  'driver_links',
  'route_meta',
  'route_entries',
  'dwp_meta',
  'dwp_rows',
  'pad_assignments',
  'previous_roster_meta',
  'previous_driver_rows',
  'vehicle_priorities',
  'vehicles_meta',
  'vehicles',
  'vehicle_overrides',
  'lmr_approved',
  'lifetime_routes',
  'tenure_meta',
  'column_order',
  'column_widths',
  'print_layouts',
  'van_affinity',
  'associate_tenure',
] as const;

export type DataTable = (typeof DATA_TABLES)[number];

/**
 * Bring a database up to date. Each step not yet recorded in `schema_version` is applied, in
 * order, inside its own transaction. Running it again does nothing. Returns the step numbers
 * applied by this call.
 */
export function runMigrations(
  db: Database.Database,
  migrations: readonly Migration[] = MIGRATIONS,
): number[] {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_version (
       version    INTEGER PRIMARY KEY,
       name       TEXT NOT NULL,
       applied_at TEXT NOT NULL
     )`,
  );
  const done = new Set(
    (db.prepare('SELECT version FROM schema_version').all() as { version: number }[]).map(
      (r) => r.version,
    ),
  );
  const record = db.prepare(
    'INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)',
  );
  const applied: number[] = [];
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  for (const step of ordered) {
    if (done.has(step.version)) continue;
    db.transaction(() => {
      db.exec(step.sql);
      record.run(step.version, step.name, new Date().toISOString());
    })();
    applied.push(step.version);
  }
  return applied;
}

/** The highest step recorded, or 0 for a blank database. */
export function schemaVersion(db: Database.Database): number {
  const table = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'")
    .get();
  if (!table) return 0;
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as {
    v: number | null;
  };
  return row.v ?? 0;
}
