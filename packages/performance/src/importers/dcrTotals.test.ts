// The DCR totals reader against what the old app made from the same made-up files, plus small
// cases written here that follow DcrTotalsImporter.cs line by line.

import { describe, expect, it } from 'vitest';
import { parseDcrTotals } from './dcrTotals';
import { describeWeekParity } from './testkit';

describeWeekParity({
  importer: 'DcrTotalsImporter',
  kind: 'dcr-totals',
  table: 'DcrWeekTotals',
  parse: parseDcrTotals,
  ids: false,
  hyphenOptional: true,
});

const HEADER =
  'Week,"Delivery Associate ",Transporter ID,DCR,Packages Delivered,Packages Dispatched,' +
  'Packages Returned To Station,Packages Returned to Station - DA Controllable,' +
  'Rescued Packages,RTS All Exempted';

describe('parseDcrTotals, small cases', () => {
  it('falls back to the older "DCR" column and reads percentages and thousands', () => {
    const text = `${HEADER}\n2026-W31,Archer Gresham,A02V4L9HIELIDL,99.5%,"1,091",1092,1,0,,x`;
    const result = parseDcrTotals({ fileName: 'Quality_DCR_XXXX_XXX1_2026-W31.csv', text });
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      dcr: 99.5,
      packagesDelivered: 1091,
      packagesDispatched: 1092,
      packagesReturnedToStation: 1,
      packagesReturnedToStationDaControllable: 0,
      rescuedPackages: null,
      rtsAllExempted: null,
    });
  });

  it('refuses a file that has the same driver twice, as the old table could not hold it', () => {
    const row = '2026-W31,Archer Gresham,A02V4L9HIELIDL,0,1,1,0,0,0,0';
    const result = parseDcrTotals({
      fileName: 'Quality_DCR_XXXX_XXX1_2026-W31.csv',
      text: `${HEADER}\n${row}\n${row}`,
    });
    expect(result.errors).toEqual([
      'Quality_DCR_XXXX_XXX1_2026-W31.csv: row 3 is a second row for a driver already in this file.',
    ]);
    expect(result.rows).toEqual([]);
    expect(result.weeks).toEqual(['2026-W31']);
    expect(result.replaceWeeks).toEqual([]);
  });
});
