// The CDF reader against what the old app made from the same made-up files, plus small cases
// written here that follow CdfImporter.cs line by line.

import { describe, expect, it } from 'vitest';
import { parseCdf } from './cdf';
import { describeWeekParity } from './testkit';

describeWeekParity({
  importer: 'CdfImporter',
  kind: 'cdf',
  table: 'CdfWeekEntries',
  parse: parseCdf,
  ids: false,
  hyphenOptional: false,
});

const HEADER =
  'Delivery Group ID,Delivery Associate,Delivery Associate Name,Impacts Scorecard,Tracking ID,' +
  'DA Mishandled Package,DA was Unprofessional,DA did not follow my delivery instructions,' +
  'Delivered to Wrong Address,Never Received Delivery,Received Wrong Item';

describe('parseCdf, small cases', () => {
  it('adds up events per driver, ignoring case, with a byte-order mark and Windows line ends', () => {
    const text =
      '\uFEFF' +
      [
        HEADER,
        'G1,A02V4L9HIELIDL,Archer Gresham,0,T1,1,0,0,0,0,0',
        'G2,a02v4l9hielidl,Archer Gresham,1,T2,1,0,1,0,0,junk',
        '',
        'G3,,Nobody,1,T3,1,1,1,1,1,1',
      ].join('\r\n');
    const result = parseCdf({
      fileName: 'DSP_Customer_Delivery_Feedback_negative_XXX1_2026-W7.csv',
      text,
    });
    expect(result.errors).toEqual([]);
    expect(result.weeks).toEqual(['2026-W07']);
    expect(result.csvRowsScanned).toBe(3);
    expect(result.rows).toEqual([
      {
        transporterId: 'A02V4L9HIELIDL',
        week: '2026-W07',
        name: 'Archer Gresham',
        mishandled: 2,
        unprofessional: 0,
        didNotFollowInstructions: 1,
        wrongAddress: 0,
        neverReceived: 0,
        wrongItem: 0,
        sourceFile: 'DSP_Customer_Delivery_Feedback_negative_XXX1_2026-W7.csv',
      },
    ]);
  });

  it('refuses a file with no week in its name', () => {
    const result = parseCdf({ fileName: 'feedback.csv', text: HEADER });
    expect(result.filesProcessed).toBe(0);
    expect(result.weeks).toEqual([]);
    expect(result.errors).toEqual([
      'feedback.csv: the file name has no week in it (like "2026-W07").',
    ]);
  });

  it('refuses a file that lacks a category column, but still lists its week as the old app did', () => {
    const text = 'Delivery Associate,Delivery Associate Name\nA02V4L9HIELIDL,Archer Gresham';
    const result = parseCdf({ fileName: 'cdf_2026-W31.csv', text });
    expect(result.errors).toEqual([
      'cdf_2026-W31.csv: there is no "DA Mishandled Package" column.',
    ]);
    expect(result.weeks).toEqual(['2026-W31']);
    expect(result.replaceWeeks).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it('lets a later file for the same week replace the earlier one', () => {
    const first = `${HEADER}\nG1,A02V4L9HIELIDL,Archer Gresham,1,T1,1,0,0,0,0,0`;
    const second = `${HEADER}\nG1,A05QUB9XOW4NT1,Desmond Marisol Penrose,1,T1,0,1,0,0,0,0`;
    const result = parseCdf([
      { fileName: 'a_2026-W31.csv', text: first },
      { fileName: 'b_2026-W31.csv', text: second },
    ]);
    expect(result.rowsImported).toBe(2);
    expect(result.rows.map((row) => row.transporterId)).toEqual(['A05QUB9XOW4NT1']);
  });
});
