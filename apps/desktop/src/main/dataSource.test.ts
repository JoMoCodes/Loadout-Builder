import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DB_FILE_NAME, DataSource, totalRows } from './dataSource';

const fixtureDb = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'fixtures',
  'v1',
  'loadout.db',
);

// Demo mode loads a whole database into a temporary copy. On a busy Windows build machine
// that can take longer than the usual five seconds, so these tests get more time.
describe('data source', { timeout: 30_000 }, () => {
  let scratch: string;
  let source: DataSource;

  beforeEach(() => {
    scratch = mkdtempSync(path.join(tmpdir(), 'loadout-ds-test-'));
    source = new DataSource({
      dataFolder: path.join(scratch, 'data'),
      fixtureDb,
      tempFolder: path.join(scratch, 'temp'),
    });
  });

  afterEach(() => {
    source.close();
    rmSync(scratch, { recursive: true, force: true });
  });

  it('opens the real database empty on a first run, with every table', () => {
    const info = source.open(false);
    expect(info.ok).toBe(true);
    expect(info.mode).toBe('real');
    expect(Object.keys(info.counts).length).toBeGreaterThanOrEqual(20);
    expect(totalRows(info.counts)).toBe(0);
    expect(existsSync(path.join(scratch, 'data', DB_FILE_NAME))).toBe(true);
  });

  it('loads made-up data in demo mode without touching the real database', () => {
    const info = source.open(true);
    expect(info.ok).toBe(true);
    expect(info.mode).toBe('demo');
    expect(totalRows(info.counts)).toBeGreaterThan(0);
    expect(existsSync(path.join(scratch, 'data', DB_FILE_NAME))).toBe(false);
  });

  it('cleans up the demo copy when it is switched off', () => {
    source.open(true);
    const temp = path.join(scratch, 'temp');
    expect(readdirSync(temp).length).toBe(1);
    source.open(false);
    expect(readdirSync(temp)).toEqual([]);
    expect(source.getInfo().mode).toBe('real');
  });

  it('says why when the demo file is missing', () => {
    const broken = new DataSource({
      dataFolder: path.join(scratch, 'data'),
      fixtureDb: path.join(scratch, 'nope.db'),
      tempFolder: path.join(scratch, 'temp'),
    });
    const info = broken.open(true);
    expect(info).toEqual({ mode: 'demo', ok: false, reason: 'fixture-missing', counts: {} });
  });
});
