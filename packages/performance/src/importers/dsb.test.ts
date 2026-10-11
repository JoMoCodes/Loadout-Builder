// The DSB reader against what the old app made from the same made-up files, plus small cases
// written here that follow DsbImporter.cs line by line.

import { describe, expect, it } from 'vitest';
import { parseDsb } from './dsb';
import { describeWeekParity } from './testkit';

describeWeekParity({
  importer: 'DsbImporter',
  kind: 'dsb',
  table: 'DsbWeekEntries',
  parse: parseDsb,
  ids: false,
  hyphenOptional: false,
});

const COLUMNS =
  'Delivery Associate,Simultaneous Deliveries,Delivered > 50 m,' +
  'Incorrect Scan Usage - Attended Delivery,Incorrect Scan Usage - Unattended Delivery,' +
  'No POD on Delivery,Scanned - Not Delivered - Not Returned';

describe('parseDsb, small cases', () => {
  it('counts only events that impact the scorecard, under the older "Impacts DSB" name too', () => {
    const text = [
      `Delivery Associate Name,${COLUMNS}, Impacts DSB `,
      'Archer Gresham,A02V4L9HIELIDL,1,0,0,0,0,0,1',
      'Archer Gresham,A02V4L9HIELIDL,0,1,0,0,0,0,0',
      'Archer Gresham,A02V4L9HIELIDL,0,0,1,0,0,0,2',
    ].join('\n');
    const result = parseDsb({ fileName: 'DSP_Delivery_Concessions_XXX1_2026-W33.csv', text });
    expect(result.errors).toEqual([]);
    expect(result.csvRowsScanned).toBe(3);
    expect(result.csvRowsCounted).toBe(2);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      simultaneousDeliveries: 1,
      deliveredOver50m: 0,
      incorrectScanAttended: 1,
    });
  });

  it('refuses a file with neither impact column', () => {
    const result = parseDsb({
      fileName: 'DSP_Delivery_Concessions_XXX1_2026-W33.csv',
      text: `Delivery Associate Name,${COLUMNS}\nArcher Gresham,A02V4L9HIELIDL,1,0,0,0,0,0`,
    });
    expect(result.errors).toEqual([
      'DSP_Delivery_Concessions_XXX1_2026-W33.csv: it has neither an "Impacts Scorecard" nor an "Impacts DSB" column.',
    ]);
    expect(result.weeks).toEqual(['2026-W33']);
    expect(result.replaceWeeks).toEqual([]);
  });
});
