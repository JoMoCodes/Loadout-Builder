// How cells read as text. Expected answers come from Python's str() on the same values.

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleanSqueeze } from './clean';
import { pathText, pyStr, TimeOfDay } from './files';

describe('pyStr', () => {
  it.each([
    [0.1, '0.1'],
    [2.5, '2.5'],
    [1e-7, '1e-07'],
    [1.5e-5, '1.5e-05'],
    [0.0001, '0.0001'],
    [0.00012345, '0.00012345'],
    [123456789.123, '123456789.123'],
    [12345678901234.5, '12345678901234.5'],
    [-0.75, '-0.75'],
    [1.1e-10, '1.1e-10'],
    [15, '15'],
    [-0, '0'],
    [1e22, '10000000000000000000000'],
  ])('writes the number %j as %j', (value, expected) => {
    expect(pyStr(value)).toBe(expected);
  });

  it('writes words, truth values and nothing', () => {
    expect(pyStr('text')).toBe('text');
    expect(pyStr(true)).toBe('True');
    expect(pyStr(false)).toBe('False');
    expect(pyStr(null)).toBe('None');
  });

  it('writes times and dates', () => {
    expect(pyStr(new TimeOfDay(9, 5))).toBe('09:05:00');
    expect(pyStr(new Date(Date.UTC(2026, 8, 1, 10, 20, 5, 120)))).toBe(
      '2026-09-01 10:20:05.120000',
    );
    expect(pyStr(new Date(Date.UTC(2026, 8, 1, 10, 20)))).toBe('2026-09-01 10:20:00');
  });
});

describe('cleanSqueeze', () => {
  it('turns nothing into empty text and squeezes the rest', () => {
    expect(cleanSqueeze(null)).toBe('');
    expect(cleanSqueeze(undefined)).toBe('');
    expect(cleanSqueeze('  a   b ')).toBe('a b');
    expect(cleanSqueeze(15)).toBe('15');
  });
});

describe('pathText', () => {
  it('tidies a path without making it absolute', () => {
    // Slashes follow the computer: forward on Linux and Mac, back on Windows, as in the old app.
    expect(pathText('./a//b/')).toBe(join('a', 'b'));
    expect(pathText('nowhere/missing.xlsx')).toBe(join('nowhere', 'missing.xlsx'));
  });
});
