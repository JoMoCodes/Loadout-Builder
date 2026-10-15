import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  DATA_TABLES,
  MIGRATIONS,
  PERF_TABLES,
  RS_TABLES,
  runMigrations,
  schemaVersion,
} from './migrations';
import { PERF_TABLE_SPECS } from './perfTables';

function tableNames(db: Database.Database): string[] {
  return (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((r) => r.name);
}

describe('migration runner', () => {
  it('creates every table on a blank database', () => {
    const db = new Database(':memory:');
    expect(schemaVersion(db)).toBe(0);
    expect(runMigrations(db)).toEqual([1, 2, 3, 4, 5]);
    expect(tableNames(db)).toEqual(
      [...DATA_TABLES, ...PERF_TABLES, ...RS_TABLES, 'schema_version'].sort(),
    );
    // The 23 tables of the old schema, plus the old hand-typed tenure table it left behind.
    expect(DATA_TABLES).toHaveLength(26);
    // The 13 tables of the old weekly performance app, less its drivers table (step 4 folded it
    // into the associates table).
    expect(PERF_TABLES).toHaveLength(12);
    // The four route sheet tables.
    expect(RS_TABLES).toHaveLength(4);
    expect(schemaVersion(db)).toBe(5);
  });

  it('changes nothing when run again', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    const before = db.prepare('SELECT name, sql FROM sqlite_master ORDER BY name').all();
    const stamp = db.prepare('SELECT * FROM schema_version').all();

    expect(runMigrations(db)).toEqual([]);
    expect(db.prepare('SELECT name, sql FROM sqlite_master ORDER BY name').all()).toEqual(before);
    expect(db.prepare('SELECT * FROM schema_version').all()).toEqual(stamp);
  });

  it('applies only the steps not yet recorded, in order', () => {
    const db = new Database(':memory:');
    const steps = [
      { version: 2, name: 'second', sql: 'CREATE TABLE b (x INTEGER);' },
      { version: 1, name: 'first', sql: 'CREATE TABLE a (x INTEGER);' },
    ];
    expect(runMigrations(db, steps)).toEqual([1, 2]);
    const more = [...steps, { version: 3, name: 'third', sql: 'CREATE TABLE c (x INTEGER);' }];
    expect(runMigrations(db, more)).toEqual([3]);
    expect(schemaVersion(db)).toBe(3);
  });

  it('leaves no half-applied step behind when a step fails', () => {
    const db = new Database(':memory:');
    const broken = [{ version: 1, name: 'broken', sql: 'CREATE TABLE a (x INTEGER); NOT SQL;' }];
    expect(() => runMigrations(db, broken)).toThrow();
    expect(tableNames(db)).toEqual(['schema_version']);
    expect(schemaVersion(db)).toBe(0);
  });

  it('numbers its steps from 1 without gaps', () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual(MIGRATIONS.map((_, i) => i + 1));
  });
});

describe('step 2: the weekly performance tables', () => {
  it('keeps the performance tables out of the load-out list', () => {
    for (const table of PERF_TABLES) expect(DATA_TABLES).not.toContain(table as never);
  });

  it('has the columns the table layouts list, in the same order', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    expect(PERF_TABLE_SPECS.map((spec) => spec.table)).toEqual([...PERF_TABLES]);
    for (const spec of PERF_TABLE_SPECS) {
      const columns = (
        db.prepare(`PRAGMA table_info("${spec.table}")`).all() as { name: string }[]
      ).map((c) => c.name);
      expect(columns, spec.table).toEqual(spec.columns.map(([column]) => column));
    }
  });

  it('has the old indexes', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    const indexes = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_perf_%'")
        .all() as { name: string }[]
    ).map((r) => r.name);
    // Database.cs creates 17 named indexes.
    expect(indexes).toHaveLength(17);
  });

  it("removes a scorecard's metrics with it, and refuses a second scorecard for one week", () => {
    const db = new Database(':memory:');
    runMigrations(db);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    // A02V4L9HIELIDL is a made-up Transporter ID from packages/fixtures/manifest.json. The
    // scorecard needs no driver row first: the driver list is the associates table (step 4).
    const card = db
      .prepare(
        "INSERT INTO perf_weekly_scorecards (transporter_id, week) VALUES ('A02V4L9HIELIDL', '2026-W31')",
      )
      .run().lastInsertRowid;
    db.prepare(
      "INSERT INTO perf_metric_entries (scorecard_id, metric_name) VALUES (?, 'CDF DPMO')",
    ).run(card);
    expect(() =>
      db
        .prepare(
          "INSERT INTO perf_weekly_scorecards (transporter_id, week) VALUES ('A02V4L9HIELIDL', '2026-W31')",
        )
        .run(),
    ).toThrow();
    db.prepare('DELETE FROM perf_weekly_scorecards WHERE id = ?').run(card);
    expect(db.prepare('SELECT COUNT(*) AS n FROM perf_metric_entries').get()).toEqual({ n: 0 });
  });

  it('adds the performance tables to a database that has only step 1, keeping its data', () => {
    const db = new Database(':memory:');
    runMigrations(db, MIGRATIONS.slice(0, 1));
    db.prepare("INSERT INTO lmr_approved (transporter_id) VALUES ('A02V4L9HIELIDL')").run();
    expect(runMigrations(db, MIGRATIONS.slice(0, 2))).toEqual([2]);
    expect(schemaVersion(db)).toBe(2);
    expect(db.prepare('SELECT COUNT(*) AS n FROM lmr_approved').get()).toEqual({ n: 1 });
  });
});

describe('step 3: the route sheet tables', () => {
  it('keeps the route sheet tables out of the load-out and performance lists', () => {
    for (const table of RS_TABLES) {
      expect(DATA_TABLES).not.toContain(table as never);
      expect(PERF_TABLES).not.toContain(table as never);
    }
  });

  it("removes a run's sheets, choices and sent marks with it", () => {
    const db = new Database(':memory:');
    runMigrations(db);
    const now = '2026-09-01T08:00:00.000Z';
    db.prepare('INSERT INTO rs_runs (id, created_at, updated_at) VALUES (?, ?, ?)').run(
      'XXX1_2026-09-01_CYCLE1',
      now,
      now,
    );
    for (const table of ['rs_sheets', 'rs_decisions', 'rs_sent']) {
      const extra =
        table === 'rs_sheets'
          ? ['position, sheet', "0, '{}'"]
          : table === 'rs_sent'
            ? ['how, at', `'manual', '${now}'`]
            : ['skipped', '1'];
      db.prepare(
        `INSERT INTO ${table} (run_id, route_code, ${extra[0]}) VALUES ('XXX1_2026-09-01_CYCLE1', 'CX1', ${extra[1]})`,
      ).run();
    }
    db.prepare('DELETE FROM rs_runs').run();
    for (const table of ['rs_sheets', 'rs_decisions', 'rs_sent']) {
      expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get(), table).toEqual({ n: 0 });
    }
  });

  it('adds the route sheet tables to a database that has steps 1 and 2, keeping its data', () => {
    const db = new Database(':memory:');
    runMigrations(db, MIGRATIONS.slice(0, 2));
    db.prepare("INSERT INTO lmr_approved (transporter_id) VALUES ('A02V4L9HIELIDL')").run();
    expect(runMigrations(db)).toEqual([3, 4, 5]);
    expect(schemaVersion(db)).toBe(5);
    expect(db.prepare('SELECT COUNT(*) AS n FROM lmr_approved').get()).toEqual({ n: 1 });
  });
});

describe('step 4: one driver list', () => {
  // Made-up people from packages/fixtures/manifest.json.
  const ARCHER = 'A02V4L9HIELIDL';
  const NADINE = 'A083QLD1CI9YSZ';
  const CARMEN = 'A047LNAN5VQIQR';

  /** A database at step 3 with people on both lists, and a scorecard with a metric. */
  function openV3(): Database.Database {
    const db = new Database(':memory:');
    runMigrations(db, MIGRATIONS.slice(0, 3));
    db.prepare(
      `INSERT INTO associates (transporter_id, position_index, name, status, qualifications)
       VALUES (?, 0, 'Archer Gresham', 'ACTIVE', 'EDV'), (?, 1, 'Carmen Abernathy', 'INACTIVE', '')`,
    ).run(ARCHER, CARMEN);
    db.prepare(
      `INSERT INTO perf_drivers
         (transporter_id, name, status, position, qualifications, id_expiration, personal_phone,
          work_phone, email)
       VALUES
         (?, 'Archer G', 'ACTIVE', 'Driver', 'CDV', '2027-01-31', '1', '2', 'driver001@example.com'),
         (?, 'Nadine Abernathy', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
         ('A0FXMBXTK81V4D', 'Colton Alderman', ' ', 'Helper', 'DOT', '2028-02-02', '', '', '')`,
    ).run(ARCHER, NADINE);
    const card = db
      .prepare(
        `INSERT INTO perf_weekly_scorecards (transporter_id, week, overall_standing, overall_score)
         VALUES (?, '2026-W31', 'Gold', 88.5)`,
      )
      .run(NADINE).lastInsertRowid;
    db.prepare(
      "INSERT INTO perf_metric_entries (scorecard_id, metric_name, score) VALUES (?, 'POD', 90)",
    ).run(card);
    // A scorecard since deleted, so the id counter is past the rows that are there.
    db.prepare(
      "INSERT INTO perf_weekly_scorecards (transporter_id, week) VALUES (?, '2026-W32')",
    ).run(ARCHER);
    db.prepare('DELETE FROM perf_weekly_scorecards WHERE week = ?').run('2026-W32');
    return db;
  }

  it('moves the drivers the associate list does not have onto it, and drops the old table', () => {
    const db = openV3();
    expect(runMigrations(db)).toEqual([4, 5]);
    expect(tableNames(db)).not.toContain('perf_drivers');
    const rows = db.prepare('SELECT * FROM associates ORDER BY position_index').all() as Record<
      string,
      unknown
    >[];
    expect(rows.map((r) => [r.transporter_id, r.position_index, r.name, r.status])).toEqual([
      [ARCHER, 0, 'Archer Gresham', 'ACTIVE'], // kept as the list had them
      [CARMEN, 1, 'Carmen Abernathy', 'INACTIVE'],
      [NADINE, 2, 'Nadine Abernathy', 'OFFBOARDED'], // no status: offboarded
      ['A0FXMBXTK81V4D', 3, 'Colton Alderman', 'OFFBOARDED'],
    ]);
    expect(rows[0]).toMatchObject({ qualifications: 'EDV', position: '' });
    expect(rows[2]).toMatchObject({
      position: '',
      qualifications: '',
      id_expiration: null,
      personal_phone: '',
      work_phone: '',
      email: '',
    });
    expect(rows[3]).toMatchObject({
      position: 'Helper',
      qualifications: 'DOT',
      id_expiration: '2028-02-02',
    });
  });

  it('keeps the scorecards and their metrics, and the id counter, without the link to the old table', () => {
    const db = openV3();
    runMigrations(db);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(
      db
        .prepare('SELECT id, transporter_id, week, overall_score FROM perf_weekly_scorecards')
        .all(),
    ).toEqual([{ id: 1, transporter_id: NADINE, week: '2026-W31', overall_score: 88.5 }]);
    expect(db.prepare('SELECT scorecard_id, metric_name FROM perf_metric_entries').all()).toEqual([
      { scorecard_id: 1, metric_name: 'POD' },
    ]);
    const sql = (
      db.prepare("SELECT sql FROM sqlite_master WHERE name = 'perf_weekly_scorecards'").get() as {
        sql: string;
      }
    ).sql;
    expect(sql).not.toContain('perf_drivers');
    expect(sql).toContain('UNIQUE (transporter_id, week)');
    const indexes = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_perf_scorecard%'",
        )
        .all() as { name: string }[]
    ).map((r) => r.name);
    expect(indexes.sort()).toEqual(['idx_perf_scorecard_driver', 'idx_perf_scorecard_week']);
    // A scorecard for someone the list does not know can still be written (no key check now),
    // and it is numbered after the one that was deleted.
    const next = db
      .prepare(
        "INSERT INTO perf_weekly_scorecards (transporter_id, week) VALUES ('A0G8EUL2VJ2V9F', '2026-W33')",
      )
      .run().lastInsertRowid;
    expect(next).toBe(3);
    // Deleting a scorecard still takes its metrics with it.
    db.prepare('DELETE FROM perf_weekly_scorecards WHERE id = 1').run();
    expect(db.prepare('SELECT COUNT(*) AS n FROM perf_metric_entries').get()).toEqual({ n: 0 });
  });

  it('runs on an empty database and on one with no drivers to move', () => {
    const db = new Database(':memory:');
    runMigrations(db, MIGRATIONS.slice(0, 3));
    expect(runMigrations(db)).toEqual([4, 5]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM associates').get()).toEqual({ n: 0 });
  });
});
