// The CSV and number reading helpers, checked against how CsvHelper and .NET read the same text.

import { describe, expect, it } from 'vitest';
import {
  cleanText,
  FileProblem,
  parseFlag,
  parseNetNumber,
  parseNullableDouble,
  parseNullableInt,
  readCsv,
} from './csv';

describe('readCsv', () => {
  it('drops a byte-order mark, skips blank lines and numbers rows from the header', () => {
    const sheet = readCsv('\uFEFF\r\nA,"B, b"\r\n1,2\r\n\r\n3,"4\r\nfour"\r\n', {
      trimHeaders: false,
    });
    expect(sheet.headers).toEqual(['A', 'B, b']);
    expect(sheet.rows).toEqual([
      { rowNumber: 2, cells: ['1', '2'] },
      { rowNumber: 3, cells: ['3', '4\nfour'] },
    ]);
  });

  it('matches headers exactly, or trimmed when asked', () => {
    const text = '"Delivery Associate ",Week\nArcher Gresham,2026-W31';
    const exact = readCsv(text, { trimHeaders: false });
    const row = exact.rows[0]!;
    expect(exact.field(row, 'Delivery Associate')).toBeNull();
    expect(exact.field(row, 'Delivery Associate ')).toBe('Archer Gresham');
    const trimmedSheet = readCsv(text, { trimHeaders: true });
    expect(trimmedSheet.get(trimmedSheet.rows[0]!, 'Delivery Associate')).toBe('Archer Gresham');
    expect(() => trimmedSheet.get(trimmedSheet.rows[0]!, 'week')).toThrow(FileProblem);
  });

  it('finds an alias ignoring case and returns it as written in the list', () => {
    const sheet = readCsv(' impacts dsb ,x\n1,2', { trimHeaders: true });
    expect(sheet.findAlias('Impacts Scorecard', 'Impacts DSB')).toBe('Impacts DSB');
    expect(sheet.findAlias('Nope')).toBeNull();
  });

  it('refuses an empty file', () => {
    expect(() => readCsv('\uFEFF\r\n\r\n', { trimHeaders: false })).toThrow(
      'the file is empty (it has no header row).',
    );
  });

  it('turns Windows line ends into plain ones', () => {
    expect(cleanText('\uFEFFa\r\nb\rc')).toBe('a\nb\nc');
  });
});

describe('numbers, read as .NET read them', () => {
  it.each([
    ['98.39', 98.39],
    [' 98.39 ', 98.39],
    ['1,091', 1091],
    ['1,091.5', 1091.5],
    ['-2', -2],
    ['2-', -2],
    ['(2)', -2],
    ['+3', 3],
    ['.5', 0.5],
    ['5.', 5],
    ['1e3', 1000],
    ['¤12', 12],
    ['1.0.0', null],
    ['1.000,5', null],
    ['abc', null],
    ['', null],
    ['--1', null],
  ])('%j -> %j', (raw, expected) => {
    expect(parseNetNumber(raw)).toBe(expected);
  });

  it('strips % signs only where the old reader did', () => {
    expect(parseNullableDouble('99.5%', true)).toBe(99.5);
    expect(parseNullableDouble('99.5%')).toBeNull();
    expect(parseNullableDouble('  ')).toBeNull();
    expect(parseNullableDouble(null)).toBeNull();
  });

  it('reads whole numbers only for counts', () => {
    expect(parseNullableInt('771')).toBe(771);
    expect(parseNullableInt('771.0')).toBe(771);
    expect(parseNullableInt('771.5')).toBeNull();
    expect(parseNullableInt('3000000000')).toBeNull();
    expect(parseNullableInt('')).toBeNull();
  });

  it('reads 0/1 flags, with anything odd as 0', () => {
    expect(['1', ' 1 ', '0', '2', '-1', '1.0', 'yes', '', null].map(parseFlag)).toEqual([
      1, 1, 0, 2, 0, 0, 0, 0, 0,
    ]);
  });
});
