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

/**
 * Step 2: the weekly performance data, from the old Weekly Performance app (its Database.cs).
 *
 * Its 13 tables, renamed with a `perf_` prefix and snake_case columns, otherwise the same:
 * same columns in the same order, same keys, unique rules, indexes and ON DELETE CASCADE. The
 * columns the old app added on open (the contact columns of Drivers, SourceFile of
 * WeeklyScorecards) are simply part of the tables here.
 */
const SCHEMA_V2_PERFORMANCE = `
CREATE TABLE perf_drivers (
    transporter_id TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    status         TEXT,
    position       TEXT,
    qualifications TEXT,
    id_expiration  TEXT,
    personal_phone TEXT,
    work_phone     TEXT,
    email          TEXT
);

CREATE TABLE perf_weekly_scorecards (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    transporter_id     TEXT NOT NULL,
    week               TEXT NOT NULL,
    overall_standing   TEXT,
    overall_score      REAL,
    packages_delivered INTEGER,
    source_file        TEXT,
    UNIQUE (transporter_id, week),
    FOREIGN KEY (transporter_id) REFERENCES perf_drivers(transporter_id)
);

CREATE TABLE perf_metric_entries (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    scorecard_id   INTEGER NOT NULL,
    metric_name    TEXT NOT NULL,
    metric_value   TEXT,
    tier           TEXT,
    score          REAL,
    weight_applied REAL,
    FOREIGN KEY (scorecard_id) REFERENCES perf_weekly_scorecards(id) ON DELETE CASCADE
);

CREATE INDEX idx_perf_scorecard_week ON perf_weekly_scorecards(week);
CREATE INDEX idx_perf_scorecard_driver ON perf_weekly_scorecards(transporter_id);
CREATE INDEX idx_perf_metric_scorecard ON perf_metric_entries(scorecard_id);

CREATE TABLE perf_metric_thresholds (
    metric_name           TEXT PRIMARY KEY,
    indicator             TEXT,
    platinum_threshold    REAL,
    gold_threshold        REAL,
    silver_threshold      REAL,
    bronze_threshold      REAL,
    overall_metric_weight REAL,
    source_week           TEXT,
    imported_at           TEXT
);

CREATE TABLE perf_pod_week_entries (
    transporter_id              TEXT NOT NULL,
    week                        TEXT NOT NULL,
    name                        TEXT,
    opportunities               INTEGER NOT NULL DEFAULT 0,
    success                     INTEGER NOT NULL DEFAULT 0,
    bypass                      INTEGER NOT NULL DEFAULT 0,
    rejects                     INTEGER NOT NULL DEFAULT 0,
    blurry_photo                INTEGER NOT NULL DEFAULT 0,
    human_in_the_picture        INTEGER NOT NULL DEFAULT 0,
    no_package_detected         INTEGER NOT NULL DEFAULT 0,
    package_in_car              INTEGER NOT NULL DEFAULT 0,
    package_in_hand             INTEGER NOT NULL DEFAULT 0,
    package_not_clearly_visible INTEGER NOT NULL DEFAULT 0,
    package_too_close           INTEGER NOT NULL DEFAULT 0,
    photo_too_dark              INTEGER NOT NULL DEFAULT 0,
    other                       INTEGER NOT NULL DEFAULT 0,
    source_file                 TEXT,
    PRIMARY KEY (transporter_id, week)
);

CREATE INDEX idx_perf_pod_week ON perf_pod_week_entries(week);
CREATE INDEX idx_perf_pod_driver ON perf_pod_week_entries(transporter_id);

CREATE TABLE perf_cdf_week_entries (
    transporter_id              TEXT NOT NULL,
    week                        TEXT NOT NULL,
    name                        TEXT,
    mishandled                  INTEGER NOT NULL DEFAULT 0,
    unprofessional              INTEGER NOT NULL DEFAULT 0,
    did_not_follow_instructions INTEGER NOT NULL DEFAULT 0,
    wrong_address               INTEGER NOT NULL DEFAULT 0,
    never_received              INTEGER NOT NULL DEFAULT 0,
    wrong_item                  INTEGER NOT NULL DEFAULT 0,
    source_file                 TEXT,
    PRIMARY KEY (transporter_id, week)
);

CREATE INDEX idx_perf_cdf_week ON perf_cdf_week_entries(week);
CREATE INDEX idx_perf_cdf_driver ON perf_cdf_week_entries(transporter_id);

CREATE TABLE perf_dsb_week_entries (
    transporter_id                    TEXT NOT NULL,
    week                              TEXT NOT NULL,
    name                              TEXT,
    simultaneous_deliveries           INTEGER NOT NULL DEFAULT 0,
    delivered_over_50m                INTEGER NOT NULL DEFAULT 0,
    incorrect_scan_attended           INTEGER NOT NULL DEFAULT 0,
    incorrect_scan_unattended         INTEGER NOT NULL DEFAULT 0,
    no_pod_on_delivery                INTEGER NOT NULL DEFAULT 0,
    scanned_not_delivered_not_returned INTEGER NOT NULL DEFAULT 0,
    source_file                       TEXT,
    PRIMARY KEY (transporter_id, week)
);

CREATE INDEX idx_perf_dsb_week ON perf_dsb_week_entries(week);
CREATE INDEX idx_perf_dsb_driver ON perf_dsb_week_entries(transporter_id);

CREATE TABLE perf_psb_week_entries (
    transporter_id         TEXT NOT NULL,
    week                   TEXT NOT NULL,
    name                   TEXT,
    early_arrivals         INTEGER NOT NULL DEFAULT 0,
    late_arrivals          INTEGER NOT NULL DEFAULT 0,
    geo_location           INTEGER NOT NULL DEFAULT 0,
    not_attempted          INTEGER NOT NULL DEFAULT 0,
    contact_compliance     INTEGER NOT NULL DEFAULT 0,
    out_of_return_label    INTEGER NOT NULL DEFAULT 0,
    picked_up_not_returned INTEGER NOT NULL DEFAULT 0,
    source_file            TEXT,
    PRIMARY KEY (transporter_id, week)
);

CREATE INDEX idx_perf_psb_week ON perf_psb_week_entries(week);
CREATE INDEX idx_perf_psb_driver ON perf_psb_week_entries(transporter_id);

-- Which weeks had a PSB file read at all, even one with no failures in it, so a report can
-- tell "no file for this week" from "file read, no failures for this driver".
CREATE TABLE perf_psb_imported_weeks (
    week        TEXT PRIMARY KEY,
    source_file TEXT,
    imported_at TEXT
);

-- One row per returned package (not added up), so a report can list each one.
CREATE TABLE perf_dcr_events (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    transporter_id         TEXT NOT NULL,
    week                   TEXT NOT NULL,
    name                   TEXT,
    tracking_id            TEXT,
    impact_dcr             TEXT,
    rts_code               TEXT,
    additional_information TEXT,
    exemption_reason       TEXT,
    planned_delivery_date  TEXT,
    source_file            TEXT
);

CREATE INDEX idx_perf_dcr_week ON perf_dcr_events(week);
CREATE INDEX idx_perf_dcr_driver_week ON perf_dcr_events(transporter_id, week);

CREATE TABLE perf_dcr_week_totals (
    transporter_id                               TEXT NOT NULL,
    week                                         TEXT NOT NULL,
    name                                         TEXT,
    dcr                                          REAL,
    packages_dispatched                          INTEGER,
    packages_delivered                           INTEGER,
    packages_returned_to_station                 INTEGER,
    packages_returned_to_station_da_controllable INTEGER,
    rescued_packages                             INTEGER,
    rts_all_exempted                             INTEGER,
    source_file                                  TEXT,
    PRIMARY KEY (transporter_id, week)
);

CREATE INDEX idx_perf_dcr_totals_week ON perf_dcr_week_totals(week);
CREATE INDEX idx_perf_dcr_totals_driver ON perf_dcr_week_totals(transporter_id);

-- One row per safety event, including those whose program impact is "None" (the counts leave
-- those out; the details list keeps them).
CREATE TABLE perf_safety_events (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    transporter_id TEXT NOT NULL,
    week           TEXT NOT NULL,
    name           TEXT,
    event_date     TEXT,
    program_impact TEXT,
    metric_type    TEXT,
    metric_subtype TEXT,
    source         TEXT,
    video_link     TEXT,
    review_details TEXT,
    source_file    TEXT
);

CREATE INDEX idx_perf_safety_week ON perf_safety_events(week);
CREATE INDEX idx_perf_safety_driver_week ON perf_safety_events(transporter_id, week);

-- Files already brought in by auto-import, so it only reads files that are new or changed
-- (same size and last-change time = already done). The time is kept the old app's way:
-- 100-nanosecond steps since 1 January of year 1, UTC.
CREATE TABLE perf_imported_files (
    source               TEXT NOT NULL,
    file_name            TEXT NOT NULL,
    file_size            INTEGER NOT NULL,
    last_write_utc_ticks INTEGER NOT NULL,
    imported_at_utc      TEXT NOT NULL,
    PRIMARY KEY (source, file_name)
);
`;

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'v1 schema from the old version', sql: SCHEMA_V1 },
  { version: 2, name: 'weekly performance tables', sql: SCHEMA_V2_PERFORMANCE },
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
 * The weekly performance tables (step 2). Kept apart from DATA_TABLES on purpose: those decide
 * whether the load-out side is empty and whether the old version's data can be brought over.
 */
export const PERF_TABLES = [
  'perf_drivers',
  'perf_weekly_scorecards',
  'perf_metric_entries',
  'perf_metric_thresholds',
  'perf_pod_week_entries',
  'perf_cdf_week_entries',
  'perf_dsb_week_entries',
  'perf_psb_week_entries',
  'perf_psb_imported_weeks',
  'perf_dcr_events',
  'perf_dcr_week_totals',
  'perf_safety_events',
  'perf_imported_files',
] as const;

export type PerfTable = (typeof PERF_TABLES)[number];

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
