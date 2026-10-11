import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { DATA_TABLES, MIGRATIONS, PERF_TABLES, runMigrations, schemaVersion } from './migrations';
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
    expect(runMigrations(db)).toEqual([1, 2]);
    expect(tableNames(db)).toEqual([...DATA_TABLES, ...PERF_TABLES, 'schema_version'].sort());
    // The 23 tables of the old schema, plus the old hand-typed tenure table it left behind.
    expect(DATA_TABLES).toHaveLength(24);
    // The 13 tables of the old weekly performance app.
    expect(PERF_TABLES).toHaveLength(13);
    expect(schemaVersion(db)).toBe(2);
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
    // Archer Gresham is a made-up person from packages/fixtures/manifest.json.
    db.prepare(
      "INSERT INTO perf_drivers (transporter_id, name) VALUES ('A02V4L9HIELIDL', 'Archer Gresham')",
    ).run();
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
    expect(runMigrations(db)).toEqual([2]);
    expect(schemaVersion(db)).toBe(2);
    expect(db.prepare('SELECT COUNT(*) AS n FROM lmr_approved').get()).toEqual({ n: 1 });
  });
});
