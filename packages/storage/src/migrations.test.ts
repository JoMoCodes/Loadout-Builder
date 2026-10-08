import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { DATA_TABLES, MIGRATIONS, runMigrations, schemaVersion } from './migrations';

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
    expect(runMigrations(db)).toEqual([1]);
    expect(tableNames(db)).toEqual([...DATA_TABLES, 'schema_version'].sort());
    // The 23 tables of the old schema, plus the old hand-typed tenure table it left behind.
    expect(DATA_TABLES).toHaveLength(24);
    expect(schemaVersion(db)).toBe(1);
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
