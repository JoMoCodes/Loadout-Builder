import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareModule, diffValues, scan } from './diff.mjs';

describe('parity diff: comparing values', () => {
  it('finds nothing between equal values', () => {
    expect(
      diffValues({ a: [1, 2, { b: 'x' }], c: null }, { c: null, a: [1, 2, { b: 'x' }] }),
    ).toEqual([]);
  });

  it('names the path to each difference', () => {
    const found = diffValues(
      { rows: [{ m: 'exact' }, { m: 'name' }] },
      { rows: [{ m: 'exact' }, { m: 'fuzzy' }] },
    );
    expect(found).toEqual([
      { path: 'rows[1].m', expected: 'name', actual: 'fuzzy', note: undefined },
    ]);
  });

  it('reports a missing key, an extra key, and a list of the wrong length', () => {
    const found = diffValues({ a: 1, b: 2, list: [1, 2] }, { a: 1, c: 3, list: [1] });
    expect(found.map((d) => [d.path, d.note])).toEqual([
      ['b', 'missing'],
      ['c', 'extra'],
      ['list.length', 'list length'],
    ]);
  });

  it('treats numbers within a millionth as the same, unless asked to be exact', () => {
    expect(diffValues({ x: 1.0000004 }, { x: 1 })).toEqual([]);
    expect(diffValues({ x: 1.00001 }, { x: 1 })).toHaveLength(1);
    expect(diffValues({ x: 1.0000004 }, { x: 1 }, { exact: true })).toHaveLength(1);
  });

  it('does not mix up null, a missing value and an empty string', () => {
    expect(diffValues({ a: null }, { a: '' })).toHaveLength(1);
    expect(diffValues({ a: '' }, { a: null })).toHaveLength(1);
  });
});

describe('parity diff: comparing folders', () => {
  const folders = [];
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  });

  function setup(expected, actual) {
    const root = mkdtempSync(join(tmpdir(), 'parity-test-'));
    folders.push(root);
    const roots = { expected: join(root, 'expected'), actual: join(root, 'actual') };
    for (const [side, files] of [
      ['expected', expected],
      ['actual', actual],
    ]) {
      for (const [path, text] of Object.entries(files)) {
        const file = join(roots[side], path);
        mkdirSync(join(file, '..'), { recursive: true });
        writeFileSync(file, text);
      }
    }
    return roots;
  }

  it('lists days and their modules', () => {
    const roots = setup({ 'd1/a.json': '{}', 'd1/b.json': '{}', 'days.json': '{}' }, {});
    expect([...scan(roots.expected)]).toEqual([['d1', ['a', 'b']]]);
    expect(scan(roots.actual).size).toBe(0);
  });

  it('calls a module missing, same, differing or unreadable', () => {
    const roots = setup(
      {
        'd/a.json': '{"n":1}',
        'd/b.json': '{"n":1}',
        'd/c.json': '{"n":1}',
        'd/d.json': '{"n":1}',
      },
      { 'd/a.json': '{"n":1}', 'd/b.json': '{"n":2}', 'd/c.json': '{oops' },
    );
    const status = (m) => compareModule('d', m, {}, roots).status;
    expect(['a', 'b', 'c', 'd'].map(status)).toEqual(['same', 'differs', 'broken', 'missing']);
  });
});
