import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DROP_KINDS, FILE_KINDS } from '../shared/channels/files';
import { MAX_DROP_BYTES, checkDroppedFile, rememberDrop, type DroppedFiles } from './fileDrop';

let folder: string;

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'loadout-drop-test-'));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

function file(name: string, body = 'x'): string {
  const where = path.join(folder, name);
  writeFileSync(where, body);
  return where;
}

describe('checking a dropped file', () => {
  it('takes a file of the right kind on a page that takes that kind', () => {
    expect(checkDroppedFile('load-out', 'loadout', file('sheet.xlsx'))).toEqual({ ok: true });
    expect(checkDroppedFile('load-out', 'loadout', file('sheet.XLSM'))).toEqual({ ok: true });
    expect(checkDroppedFile('associates', 'associates', file('list.csv'))).toEqual({ ok: true });
    expect(checkDroppedFile('associates', 'tenure', file('tenure.csv'))).toEqual({ ok: true });
    for (const kind of ['routes', 'itineraries', 'schedule', 'dwp'] as const) {
      expect(checkDroppedFile('route-data', kind, file(`${kind}.xlsx`))).toEqual({ ok: true });
    }
    expect(checkDroppedFile('vehicle-data', 'vehicles', file('fleet.xlsx'))).toEqual({ ok: true });
  });

  it('refuses a kind the page does not take, without words (only another page would ask)', () => {
    const sheet = file('sheet.xlsx');
    expect(checkDroppedFile('load-out', 'vehicles', sheet)).toEqual({
      ok: false,
      reason: 'not-allowed',
    });
    expect(checkDroppedFile('vehicle-data', 'loadout', sheet)).toEqual({
      ok: false,
      reason: 'not-allowed',
    });
    // Every page takes only its own kinds, and every kind has a page.
    const taken = Object.values(DROP_KINDS).flat().sort();
    expect(taken).toEqual([...FILE_KINDS].sort());
  });

  it('says in plain words when the ending is wrong', () => {
    expect(checkDroppedFile('load-out', 'loadout', file('list.csv'))).toEqual({
      ok: false,
      reason: 'refused',
      message: "That file doesn't look like a load-out sheet. It should end in .xlsx.",
    });
    expect(checkDroppedFile('associates', 'associates', file('list.xlsx'))).toEqual({
      ok: false,
      reason: 'refused',
      message: "That file doesn't look like an associate export. It should end in .csv.",
    });
    expect(checkDroppedFile('route-data', 'schedule', file('notes'))).toMatchObject({
      reason: 'refused',
      message: "That file doesn't look like a Weekly Schedule. It should end in .xlsx.",
    });
  });

  it('refuses a missing file, a folder, an empty or relative place, and a file too big', () => {
    expect(checkDroppedFile('load-out', 'loadout', path.join(folder, 'gone.xlsx'))).toMatchObject({
      reason: 'refused',
      message: 'That file could not be found. It may have been moved or deleted.',
    });
    const asFolder = path.join(folder, 'inner.xlsx');
    mkdirSync(asFolder);
    expect(checkDroppedFile('load-out', 'loadout', asFolder)).toMatchObject({
      reason: 'refused',
      message: 'That is not a file. Drop one file at a time.',
    });
    for (const where of ['', 'sheet.xlsx']) {
      expect(checkDroppedFile('load-out', 'loadout', where)).toMatchObject({
        reason: 'refused',
        message:
          'That file could not be read from where it was dropped. Use the Import button instead.',
      });
    }
    const huge = () => ({ isFile: () => true, size: MAX_DROP_BYTES + 1 });
    expect(checkDroppedFile('load-out', 'loadout', file('big.xlsx'), huge)).toMatchObject({
      reason: 'refused',
      message: 'That file is too big to be a load-out sheet.',
    });
    const exact = () => ({ isFile: () => true, size: MAX_DROP_BYTES });
    expect(checkDroppedFile('load-out', 'loadout', file('ok.xlsx'), exact)).toEqual({ ok: true });
  });

  it('never repeats the place or the file name in its words', () => {
    const sheet = file('Private Name.csv');
    const check = checkDroppedFile('load-out', 'loadout', sheet);
    expect(check.ok).toBe(false);
    expect(JSON.stringify(check)).not.toContain('Private');
    expect(JSON.stringify(check)).not.toContain(folder);
  });
});

describe('remembering a dropped file', () => {
  it('gives a token that ends in the name only, and forgets the oldest after twenty', () => {
    const dropped: DroppedFiles = new Map();
    const first = rememberDrop(dropped, 'loadout', path.join(folder, 'one.xlsx'));
    expect(first).toMatch(/^dropped-[0-9a-f-]{36}\/one\.xlsx$/);
    expect(first).not.toContain(folder);
    expect(dropped.get(first)).toEqual({ kind: 'loadout', path: path.join(folder, 'one.xlsx') });
    for (let n = 0; n < 20; n += 1) rememberDrop(dropped, 'dwp', path.join(folder, `${n}.xlsx`));
    expect(dropped.size).toBe(20);
    expect(dropped.has(first)).toBe(false);
  });
});
