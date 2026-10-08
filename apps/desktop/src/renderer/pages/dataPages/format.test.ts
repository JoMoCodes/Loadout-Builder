import { describe, expect, it } from 'vitest';
import {
  baseName,
  codeList,
  importedLabel,
  nameList,
  ownershipLabel,
  plural,
  sourceLine,
} from './format';

describe('words the data pages share', () => {
  it('counts things the way the old pages did', () => {
    expect(plural(1, 'driver')).toBe('1 driver');
    expect(plural(0, 'driver')).toBe('0 drivers');
    expect(plural(2, 'dispatch time')).toBe('2 dispatch times');
  });

  it('takes the file name off a path, whichever way the slashes lean', () => {
    expect(baseName('D:\\Exports\\Today\\Routes_X.xlsx')).toBe('Routes_X.xlsx');
    expect(baseName('/home/someone/VehiclesData.xlsx')).toBe('VehiclesData.xlsx');
    expect(baseName('plain.csv')).toBe('plain.csv');
    expect(baseName('')).toBe('');
  });

  it('writes the import time like the old header', () => {
    expect(importedLabel(new Date(2026, 8, 11, 17, 37))).toBe('imported Sep 11, 2026 at 05:37 PM');
    expect(importedLabel(new Date(2026, 0, 3, 0, 5))).toBe('imported Jan 03, 2026 at 12:05 AM');
    expect(importedLabel(new Date(2026, 0, 3, 12, 0))).toBe('imported Jan 03, 2026 at 12:00 PM');
    expect(importedLabel(null)).toBe('');
  });

  it('joins the file name and the time with two spaced dashes', () => {
    expect(sourceLine('/a/b/Week-36-Schedule.xlsx', new Date(2026, 8, 1, 9, 5))).toBe(
      'Week-36-Schedule.xlsx  -  imported Sep 01, 2026 at 09:05 AM',
    );
    expect(sourceLine('', null)).toBe('');
    expect(sourceLine('/x/y.csv', null)).toBe('y.csv');
  });

  it('names the first four and counts the rest', () => {
    expect(nameList(['1', '2', '3'])).toBe('1, 2, 3');
    expect(nameList(['1', '2', '3', '4', '5', '6'])).toBe('1, 2, 3, 4 and 2 more');
    expect(nameList(['1', '2', '3', '4'])).toBe('1, 2, 3, 4');
  });

  it('lists route codes the way the DWP message did', () => {
    expect(codeList(['A', 'B'])).toBe('A, B');
    expect(codeList(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C +2 more');
  });

  it('writes ownership as words', () => {
    expect(ownershipLabel('AMAZON_RENTAL')).toBe('Amazon Rental');
    expect(ownershipLabel('SELF_OWNED')).toBe('Self Owned');
    expect(ownershipLabel('')).toBe('');
  });
});
