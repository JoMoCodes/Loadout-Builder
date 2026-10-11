// The PSB reader against what the old app made from the same made-up files, plus small cases
// written here that follow PsbImporter.cs line by line.

import { describe, expect, it } from 'vitest';
import { parsePsb } from './psb';
import { describeWeekParity, expectedTable, fixtureFiles, without } from './testkit';

describeWeekParity({
  importer: 'PsbImporter',
  kind: 'psb',
  table: 'PsbWeekEntries',
  parse: parsePsb,
  ids: false,
  hyphenOptional: false,
});

const HEADER =
  'Delivery Associate,Transporter ID,Early Arrivals,Late Arrivals,Geo Location,Not Attempted,' +
  'Contact Compliance,Out of Return Label,"Picked up, Not Returned"';

describe('parsePsb, imported weeks', () => {
  it('marks every week with a file as imported, as the old PsbImportedWeeks table shows', () => {
    const result = parsePsb(fixtureFiles('psb'));
    const table = expectedTable('PsbImportedWeeks');
    expect(result.importedWeeks).toEqual(
      table.rows
        .map((row) => without(row, 'ImportedAt'))
        .map((row) => ({ week: row.Week, sourceFile: row.SourceFile })),
    );
  });

  it('marks a week as imported even when its file has no failures', () => {
    const result = parsePsb({
      fileName: 'DSP_Pickup_Failures_XXXX_XXX1_2026-W13.csv',
      text: HEADER,
    });
    expect(result.rows).toEqual([]);
    expect(result.replaceWeeks).toEqual(['2026-W13']);
    expect(result.importedWeeks).toEqual([
      { week: '2026-W13', sourceFile: 'DSP_Pickup_Failures_XXXX_XXX1_2026-W13.csv' },
    ]);
  });

  it('uses "Delivery Associate" as the ID when the Transporter ID cell is blank', () => {
    const text = `${HEADER}\nA05QUB9XOW4NT1,,0,0,0,1,0,0,0`;
    const result = parsePsb({ fileName: 'x_2026-W15.csv', text });
    expect(result.rows).toEqual([
      {
        transporterId: 'A05QUB9XOW4NT1',
        week: '2026-W15',
        name: 'A05QUB9XOW4NT1',
        earlyArrivals: 0,
        lateArrivals: 0,
        geoLocation: 0,
        notAttempted: 1,
        contactCompliance: 0,
        outOfReturnLabel: 0,
        pickedUpNotReturned: 0,
        sourceFile: 'x_2026-W15.csv',
      },
    ]);
  });
});
