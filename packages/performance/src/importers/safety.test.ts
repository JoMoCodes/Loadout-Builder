// The Safety reader against what the old app made from the same made-up files, plus small cases
// written here that follow SafetyImporter.cs line by line.

import { describe, expect, it } from 'vitest';
import { parseSafety } from './safety';
import { describeWeekParity } from './testkit';

describeWeekParity({
  importer: 'SafetyImporter',
  kind: 'safety',
  table: 'SafetyEvents',
  parse: parseSafety,
  ids: true,
  hyphenOptional: true,
});

describe('parseSafety, small cases', () => {
  it('keeps "None" events but does not count them, and leaves missing columns empty', () => {
    const text = [
      'Date,"Delivery Associate ",Transporter ID,Program Impact,Metric Type',
      '2026-08-03,Archer Gresham,A02V4L9HIELIDL,"Scorecard, ORCAS",Speeding',
      '2026-08-04,Archer Gresham,A02V4L9HIELIDL,none,Seatbelt',
      '2026-08-05,Archer Gresham,A02V4L9HIELIDL,,Seatbelt',
    ].join('\n');
    const result = parseSafety({ fileName: 'Safety_Dashboard_XXXX_XXX1_2026W32.csv', text });
    expect(result.errors).toEqual([]);
    expect(result.rowsImported).toBe(3);
    expect(result.countedEvents).toBe(1);
    expect(result.rows[0]).toEqual({
      transporterId: 'A02V4L9HIELIDL',
      week: '2026-W32',
      name: 'Archer Gresham',
      eventDate: '2026-08-03',
      programImpact: 'Scorecard, ORCAS',
      metricType: 'Speeding',
      metricSubtype: null,
      source: null,
      videoLink: null,
      reviewDetails: null,
      sourceFile: 'Safety_Dashboard_XXXX_XXX1_2026W32.csv',
    });
  });

  it('refuses a file with no Transporter ID column once it has a row to read', () => {
    // Like the old reader, a missing column only matters when a row is read.
    const empty = parseSafety({ fileName: 'Safety_2026-W32.csv', text: 'Date,Metric Type\n' });
    expect(empty.errors).toEqual([]);
    expect(empty.replaceWeeks).toEqual(['2026-W32']);
    const result = parseSafety({
      fileName: 'Safety_2026-W32.csv',
      text: 'Date,Metric Type\n2026-08-03,Speeding',
    });
    expect(result.errors).toEqual(['Safety_2026-W32.csv: there is no "Transporter ID" column.']);
    expect(result.replaceWeeks).toEqual([]);
  });
});
