import { Store } from '@loadout/storage';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describeCounts } from '../shared/oldData';
import { ChannelRefusal } from './channels';
import { OldData, usualOldDbPath } from './oldData';

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

describe('bringing over the old app data', { timeout: 30_000 }, () => {
  let scratch: string;
  let store: Store;
  let demo: boolean;
  let chosenByPerson: string | null;
  let rebuilt: number;
  let oldData: OldData;
  let usual: string;

  beforeEach(() => {
    scratch = mkdtempSync(path.join(tmpdir(), 'loadout-olddata-test-'));
    store = new Store(path.join(scratch, 'new.db'));
    demo = false;
    chosenByPerson = null;
    rebuilt = 0;
    usual = path.join(scratch, 'not-there', 'loadout.db');
    oldData = new OldData({
      usualFile: () => usual,
      store: () => store,
      demo: () => demo,
      pickFile: async () => chosenByPerson,
      rebuild: () => {
        rebuilt += 1;
      },
    });
  });

  afterEach(() => {
    store.close();
    rmSync(scratch, { recursive: true, force: true });
  });

  function putOldFileInUsualPlace() {
    mkdirSync(path.dirname(usual), { recursive: true });
    copyFileSync(fixtureDb, usual);
  }

  it('knows the old app usual place', () => {
    expect(usualOldDbPath(path.join('home', 'someone'))).toBe(
      path.join(
        'home',
        'someone',
        'OneDrive',
        'Desktop App - Loadout Builder',
        'data',
        'loadout.db',
      ),
    );
  });

  it('finds nothing when the old file is not there, and an empty app', () => {
    expect(oldData.find()).toEqual({ found: false, empty: true, demo: false });
  });

  it('finds the old file and says the app is empty', () => {
    putOldFileInUsualPlace();
    expect(oldData.find()).toEqual({ found: true, empty: true, demo: false });
  });

  it('brings the data over from the usual place, with counts in words', () => {
    putOldFileInUsualPlace();
    const result = oldData.run('usual');
    expect(result.status).toBe('imported');
    expect(rebuilt).toBe(1);
    const words = describeCounts(result.counts);
    expect(words.length).toBeGreaterThan(3);
    expect(words.some((w) => / drivers?$/.test(w))).toBe(true);
    expect(words.some((w) => / vans?$/.test(w))).toBe(true);
    expect(oldData.find().empty).toBe(false);
  });

  it('never imports twice over saved data', () => {
    putOldFileInUsualPlace();
    oldData.run('usual');
    const before = store.tableCounts();
    const again = oldData.run('usual');
    expect(again.status).toBe('skipped');
    expect(store.tableCounts()).toEqual(before);
    expect(rebuilt).toBe(1);
  });

  it('brings data over from a file the person chose', async () => {
    const elsewhere = path.join(scratch, 'elsewhere.db');
    copyFileSync(fixtureDb, elsewhere);
    chosenByPerson = elsewhere;
    await expect(oldData.pick()).resolves.toBe(true);
    expect(oldData.run('chosen').status).toBe('imported');
  });

  it('cannot run from a chosen file when none was chosen, or one that is not a .db file', async () => {
    expect(() => oldData.run('chosen')).toThrowError(ChannelRefusal);
    chosenByPerson = path.join(scratch, 'notes.txt');
    await expect(oldData.pick()).resolves.toBe(false);
    expect(() => oldData.run('chosen')).toThrowError(ChannelRefusal);
    chosenByPerson = null;
    await expect(oldData.pick()).resolves.toBe(false);
  });

  it('explains in words when the usual file is missing', () => {
    expect(() => oldData.run('usual')).toThrowError(/not found/);
    // An untouched database has the same counts as ours, so nothing was imported. It is closed
    // before the folder is removed; Windows will not delete a file that is still open.
    const untouched = new Store(path.join(scratch, 'other.db'));
    try {
      expect(store.tableCounts()).toEqual(untouched.tableCounts());
    } finally {
      untouched.close();
    }
  });

  it('explains in words when the file is not a database', async () => {
    const junk = path.join(scratch, 'junk.db');
    writeFileSync(junk, 'this is not a database file at all, just words');
    chosenByPerson = junk;
    await oldData.pick();
    let message = '';
    try {
      oldData.run('chosen');
    } catch (error) {
      expect(error).toBeInstanceOf(ChannelRefusal);
      message = (error as Error).message;
    }
    expect(message).toMatch(/could not be read/);
    expect(message).not.toContain(scratch);
    expect(rebuilt).toBe(0);
  });

  it('refuses in demo mode', () => {
    putOldFileInUsualPlace();
    demo = true;
    expect(oldData.find().demo).toBe(true);
    expect(() => oldData.run('usual')).toThrowError(/Demo mode/);
  });
});
