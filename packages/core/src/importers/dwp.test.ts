// Tests for the DWP sheet reader. The made-up files in packages/fixtures were read with the old Python
// importer and the numbers and sample rows below are what it answered. The inline scenarios were
// built in a temporary folder, run through the old importer too, and its answers copied in.

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { byRouteCode, duplicateCodes } from '../models/dwp';
import { dateFromName, DwpImportError, importDwpSheet } from './dwp';
import { fixturePath, runScenario, type Sample, type Scenario } from './testkit';

const FIXTURES: Array<{
  file: string;
  count: number;
  day: string | null;
  dups: string[];
  sample: Sample;
}> = [
  {
    file: 'DWP_DSP-XXXX_09-11-2026.xlsx',
    count: 26,
    day: '2026-09-11',
    dups: [],
    sample: [
      [
        0,
        {
          routeCode: 'CX5',
          bags: '13',
          ovs: '34',
          staging: 'STG.G10',
        },
      ],
      [
        13,
        {
          routeCode: 'CX16',
          bags: '15',
          ovs: '23',
          staging: 'STG.H14',
        },
      ],
      [
        25,
        {
          routeCode: 'CX27',
          bags: '10',
          ovs: '41',
          staging: 'STG.G24',
        },
      ],
    ],
  },
  {
    file: 'DWP_DSP-XXXX_09-17-2026.xlsx',
    count: 21,
    day: '2026-09-17',
    dups: [],
    sample: [
      [
        0,
        {
          routeCode: 'CX199',
          bags: '12',
          ovs: '32',
          staging: 'STG.G10',
        },
      ],
      [
        10,
        {
          routeCode: 'CX178',
          bags: '16',
          ovs: '27',
          staging: 'STG.H11',
        },
      ],
      [
        20,
        {
          routeCode: 'CX204',
          bags: '15',
          ovs: '30',
          staging: 'STG.G24',
        },
      ],
    ],
  },
  {
    file: 'XXXX DWP 9.2.xlsx',
    count: 29,
    day: null,
    dups: [],
    sample: [
      [
        0,
        {
          routeCode: 'CX30',
          bags: '13',
          ovs: '34',
          staging: 'STG.G10',
        },
      ],
      [
        14,
        {
          routeCode: 'CX22',
          bags: '13',
          ovs: '20',
          staging: 'STG.H15',
        },
      ],
      [
        28,
        {
          routeCode: 'CX27',
          bags: '15',
          ovs: '38',
          staging: 'STG.G24',
        },
      ],
    ],
  },
];

const NAMES: Array<[string, string | null]> = [
  ['DWP_DSP-XXXX_08-14-2026.xlsx', '2026-08-14'],
  ['DWP_DSP-XXXX_8-4-2026.xlsx', '2026-08-04'],
  ['DWP_DSP-XXXX_8_4_2026.xlsx', '2026-08-04'],
  ['DWP 08.14.2026.xlsx', '2026-08-14'],
  ['DWP_2026-08-14.xlsx', '2026-08-14'],
  ['DWP_2026_8_4_final.xlsx', '2026-08-04'],
  ['XXXX DWP 7.6.xlsx', null],
  ['XXXX DWP 9.2.xlsx', null],
  ['nodate.xlsx', null],
  ['DWP_13-40-2026.xlsx', null],
  ['DWP_02-30-2026.xlsx', null],
  ['DWP_DSP-XXXX_08-14-20267.xlsx', null],
  ['DWP_108-14-2026.xlsx', null],
  ['DWP_2026-08-14_and_08-15-2026.xlsx', '2026-08-14'],
  ['DWP_99-99-2026_08-14-2026.xlsx', '2026-08-14'],
  ['DWP_08-14-2026.v2.xlsx', '2026-08-14'],
  ['DWP_2026-08-14', '2026-08-14'],
  ['08-14-2026', '2026-08-14'],
];

describe('DWP fixtures', () => {
  it.each(FIXTURES)('reads $file', async (fixture) => {
    const dataSet = await importDwpSheet(fixturePath('dwp', fixture.file));
    expect(dataSet.rows).toHaveLength(fixture.count);
    expect(dataSet.day).toBe(fixture.day);
    expect(duplicateCodes(dataSet)).toEqual(fixture.dups);
    expect(byRouteCode(dataSet).size).toBe(fixture.count - fixture.dups.length);
    for (const [index, row] of fixture.sample) expect(dataSet.rows[index]).toEqual(row);
  });
});

describe('the day a DWP file is for', () => {
  it.each(NAMES)('reads %j as %j', (name, expected) => {
    expect(dateFromName(name)).toBe(expected);
    expect(dateFromName(`some/folder/${name}`)).toBe(expected);
  });
});

describe('DWP refusals that carry the file', () => {
  it('says so when the file is not there', async () => {
    await expect(importDwpSheet(join('nowhere', 'missing.xlsx'))).rejects.toThrow(
      new DwpImportError(`File not found:\n\n${join('nowhere', 'missing.xlsx')}`),
    );
  });
});

const SCENARIOS: Array<[Scenario, Record<string, unknown>]> = [
  [
    {
      name: 'title row, duplicates and number kinds',
      importer: 'dwp',
      file: 'DWP_DSP-XXXX_08-14-2026.xlsx',
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            ['Title row'],
            [
              'Route Code',
              'Dispatch Time',
              'DSP',
              'DA ID',
              'Names',
              'PAD',
              'Staging',
              'Packages',
              'Bags',
              'OVS',
            ],
            [
              'CX5',
              {
                time: '09:50',
              },
              'DSP:X',
              'T001',
              'Carmen Abernathy',
              1,
              'STG.G10',
              267,
              13.0,
              34,
            ],
            [
              'cx 16',
              {
                time: '09:50',
              },
              'DSP:X',
              'T002',
              'Nadine Abernathy',
              1,
              'STG.G2',
              312,
              '14 ',
              ' 26',
            ],
            [
              'CX5',
              {
                time: '10:20',
              },
              'DSP:X',
              'T003',
              'Nolan Abernathy',
              2,
              'STG.G3',
              328,
              15,
              32,
            ],
            [
              null,
              {
                time: '10:20',
              },
              'DSP:X',
              'T004',
              'Barrett Ainsworth',
              2,
              'STG.G4',
              100,
              1,
              1,
            ],
            ['CX7', null, null, null, null, null, '  STG.G5  ', null, null, null],
          ],
        },
      ],
    },
    {
      day: '2026-08-14',
      rows: [
        {
          routeCode: 'CX5',
          bags: '13',
          ovs: '34',
          staging: 'STG.G10',
        },
        {
          routeCode: 'cx 16',
          bags: '14',
          ovs: '26',
          staging: 'STG.G2',
        },
        {
          routeCode: 'CX5',
          bags: '15',
          ovs: '32',
          staging: 'STG.G3',
        },
        {
          routeCode: 'CX7',
          bags: '',
          ovs: '',
          staging: 'STG.G5',
        },
      ],
    },
  ],
  [
    {
      name: 'other header spellings',
      importer: 'dwp',
      file: 'dwp.xlsx',
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            ['Route', 'Bag', 'OV', 'Stg'],
            ['CX1', 5, 6, 'STG.A1'],
          ],
        },
      ],
    },
    {
      day: null,
      rows: [
        {
          routeCode: 'CX1',
          bags: '5',
          ovs: '6',
          staging: 'STG.A1',
        },
      ],
    },
  ],
  [
    {
      name: 'a column is missing',
      importer: 'dwp',
      file: 'dwp.xlsx',
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            ['Route Code', 'Bags', 'Staging'],
            ['CX1', 5, 'STG.A1'],
          ],
        },
      ],
    },
    {
      error:
        "Couldn't find the header row.\n\nExpected a row containing 'Route Code', 'Bags', 'OVS' and 'Staging' - is this a DWP sheet?",
    },
  ],
  [
    {
      name: 'only the first sheet is read',
      importer: 'dwp',
      file: 'dwp.xlsx',
      sheets: [
        {
          name: 'First',
          rows: [['Name'], ['Carmen Abernathy']],
        },
        {
          name: 'Second',
          rows: [
            ['Title row'],
            [
              'Route Code',
              'Dispatch Time',
              'DSP',
              'DA ID',
              'Names',
              'PAD',
              'Staging',
              'Packages',
              'Bags',
              'OVS',
            ],
            [
              'CX5',
              {
                time: '09:50',
              },
              'DSP:X',
              'T001',
              'Carmen Abernathy',
              1,
              'STG.G10',
              267,
              13.0,
              34,
            ],
            [
              'cx 16',
              {
                time: '09:50',
              },
              'DSP:X',
              'T002',
              'Nadine Abernathy',
              1,
              'STG.G2',
              312,
              '14 ',
              ' 26',
            ],
            [
              'CX5',
              {
                time: '10:20',
              },
              'DSP:X',
              'T003',
              'Nolan Abernathy',
              2,
              'STG.G3',
              328,
              15,
              32,
            ],
            [
              null,
              {
                time: '10:20',
              },
              'DSP:X',
              'T004',
              'Barrett Ainsworth',
              2,
              'STG.G4',
              100,
              1,
              1,
            ],
            ['CX7', null, null, null, null, null, '  STG.G5  ', null, null, null],
          ],
        },
      ],
    },
    {
      error:
        "Couldn't find the header row.\n\nExpected a row containing 'Route Code', 'Bags', 'OVS' and 'Staging' - is this a DWP sheet?",
    },
  ],
  [
    {
      name: 'an empty sheet',
      importer: 'dwp',
      file: 'dwp.xlsx',
      sheets: [
        {
          name: 'Sheet1',
          rows: [],
        },
      ],
    },
    {
      error: 'The sheet is empty.',
    },
  ],
  [
    {
      name: 'a header and no routes',
      importer: 'dwp',
      file: 'dwp.xlsx',
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            [
              'Route Code',
              'Dispatch Time',
              'DSP',
              'DA ID',
              'Names',
              'PAD',
              'Staging',
              'Packages',
              'Bags',
              'OVS',
            ],
            [null, null, null, null, null, null, null, null, null, null],
          ],
        },
      ],
    },
    {
      error: 'Found the header row but no route rows below it.',
    },
  ],
];

describe('DWP scenarios', () => {
  it.each(SCENARIOS.map(([scenario, expected]) => ({ scenario, expected })))(
    '$scenario.name',
    async ({ scenario, expected }) => {
      expect(await runScenario(scenario)).toEqual(expected);
    },
  );
});

const NAMED: Scenario[] = NAMES.map(([file]) => ({
  name: file,
  importer: 'dwp',
  file,
  sheets: [
    {
      name: 'Sheet1',
      rows: [
        ['Route Code', 'Bags', 'OVS', 'Staging'],
        ['CX1', 1, 2, 'STG.A1'],
      ],
    },
  ],
}));

describe('a DWP day read off the file name of a real workbook', () => {
  it.each(NAMED.map((scenario, index) => ({ scenario, expected: NAMES[index]?.[1] })))(
    '$scenario.name',
    async ({ scenario, expected }) => {
      expect((await runScenario(scenario)).day).toBe(expected);
    },
  );
});
