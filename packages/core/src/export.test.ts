// Expected values come from running the old app's export.py on the same made-up roster.

import { describe, expect, it } from 'vitest';
import { carryingDwp, cell, defaultFilename, layout, rowsFor } from './export';
import { createDriverRow, createRoster } from './models/roster';

const roster = createRoster({
  loadOutDate: '2026-09-01',
  rows: [
    createDriverRow({
      driver: 'barrett Ainsworth',
      vehicle: '619001',
      shiftType: 'Electric Route',
      routes: 'CX16',
      pad: '2',
      bags: '12',
    }),
    createDriverRow({ driver: 'Ariana Nethercott', stagingLocation: 'STG.G02' }),
    createDriverRow({ driver: 'Archer Greta Underhill', ovs: '3' }),
  ],
});

describe('the fixed printed sheet', () => {
  it('lays out both versions', () => {
    expect(layout(false).map((c) => [c.heading, c.field, c.weight])).toEqual([
      ['', null, 61],
      ['Driver', 'driver', 113],
      ['Vehicle', 'vehicle', 78],
      ['Shift Type', 'shift_type', 90],
      ['Routes', 'routes', 46],
      ['PAD', 'pad', 32],
      ['', null, 61],
    ]);
    expect(layout(true).map((c) => [c.heading, c.field, c.weight])).toEqual([
      ['Driver', 'driver', 113],
      ['Vehicle', 'vehicle', 78],
      ['Shift Type', 'shift_type', 90],
      ['Routes', 'routes', 46],
      ['Bags', 'bags', 36],
      ['OVS', 'ovs', 36],
      ['Staging', 'staging_location', 55],
      ['PAD', 'pad', 32],
      ['', null, 61],
    ]);
  });

  it('prints every driver in name order, ignoring case', () => {
    expect(rowsFor(roster)).toEqual([
      ['', 'Archer Greta Underhill', '', '', '', '', ''],
      ['', 'Ariana Nethercott', '', '', '', '', ''],
      ['', 'barrett Ainsworth', '619001', 'Electric Route', 'CX16', '2', ''],
    ]);
    expect(rowsFor(roster, true)).toEqual([
      ['Archer Greta Underhill', '', '', '', '', '3', '', '', ''],
      ['Ariana Nethercott', '', '', '', '', '', 'STG.G02', '', ''],
      ['barrett Ainsworth', '619001', 'Electric Route', 'CX16', '12', '', '', '2', ''],
    ]);
  });

  it('names the file after the day', () => {
    expect(defaultFilename(roster)).toBe('Load Out - Tuesday, September 01 2026');
    expect(defaultFilename(roster, true)).toBe('Load Out with DWP - Tuesday, September 01 2026');
    expect(defaultFilename(createRoster())).toBe('Load Out - Unknown date');
    expect(carryingDwp(roster)).toBe(3);
  });

  it('writes numbers as numbers, but never changes what a cell says', () => {
    const texts = ['', '12', '007', '1.50', '-3', 'CX16', '1e5', '12\n', '0', '-0.5', '.5'];
    expect(texts.map(cell)).toEqual([null, 12, '007', 1.5, -3, 'CX16', '1e5', 12, 0, -0.5, '.5']);
  });
});
