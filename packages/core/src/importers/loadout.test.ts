// Tests for the load-out sheet reader. The made-up files in packages/fixtures were read with the old Python
// importer and the numbers and sample rows below are what it answered. The inline scenarios were
// built in a temporary folder, run through the old importer too, and its answers copied in.

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shiftTypeCounts } from '../models/roster';
import { importLoadoutSheet, LoadoutImportError } from './loadout';
import { fixturePath, runScenario, withScenarioFile, type Sample, type Scenario } from './testkit';

const FIXTURES: Array<{
  file: string;
  count: number;
  date: string | null;
  withVehicle: number;
  withRoutes: number;
  emptyWave: number;
  shifts: Array<[string, number]>;
  sample: Sample;
}> = [
  {
    file: '2026_09_02_15_27_loadout_sheet.xlsx',
    count: 43,
    date: '2026-09-01',
    withVehicle: 31,
    withRoutes: 29,
    emptyWave: 15,
    shifts: [
      ['Backup Driver', 4],
      ['Call Out', 2],
      ['Electric Route', 23],
      ['Lead Driver', 2],
      ['Light Duty', 2],
      ['ORE Trainer', 1],
      ['Operations Manager', 1],
      ['Recycle ADHOC', 2],
      ['Standard Route', 3],
      ['Step Van Route', 1],
      ['TIME OFF', 1],
      ['Uniform Compliance', 1],
    ],
    sample: [
      [
        0,
        {
          driver: 'Colton Alderman',
          shiftType: 'Call Out',
          status: 'Call Out',
          routes: '',
          vehicle: '',
          vin: '',
          device: '',
          stagingLocation: '',
          bag: 'No',
          waveTime: '',
          pad: '',
          serviceType: '',
          bags: '',
          ovs: '',
          assignMethod: '',
        },
      ],
      [
        21,
        {
          driver: 'Harlan Penrose',
          shiftType: 'Standard Route',
          status: 'Punched Out',
          routes: 'CX7',
          vehicle: 'ET5213',
          vin: '1FTRX7S01RKK24773',
          device: '706',
          stagingLocation: 'STG.G21',
          bag: 'No',
          waveTime: 'PAD 2/9:55',
          pad: '',
          serviceType: '',
          bags: '',
          ovs: '',
          assignMethod: '',
        },
      ],
      [
        42,
        {
          driver: 'Barrett Ainsworth',
          shiftType: 'Electric Route',
          status: 'Ready to Stage',
          routes: 'CX12',
          vehicle: '615837 (N)',
          vin: '7FCWETH43PN377188',
          device: '701',
          stagingLocation: 'STG.G6',
          bag: 'No',
          waveTime: 'PAD 1/9:50',
          pad: '',
          serviceType: '',
          bags: '',
          ovs: '',
          assignMethod: '',
        },
      ],
    ],
  },
  {
    file: '2026_09_11_17_37_loadout_sheet.xlsx',
    count: 40,
    date: '2026-09-11',
    withVehicle: 28,
    withRoutes: 26,
    emptyWave: 40,
    shifts: [
      ['Backup Driver', 8],
      ['Electric Route', 23],
      ['Large Van Route', 3],
      ['Lead Driver', 2],
      ['Operations Manager', 1],
      ['Recycle ADHOC', 1],
      ['Sweeper', 1],
      ['TIME OFF', 1],
    ],
    sample: [
      [
        0,
        {
          driver: 'Sabrina Woodbridge',
          shiftType: 'Operations Manager',
          status: 'No data',
          routes: '',
          vehicle: '',
          vin: '',
          device: '',
          stagingLocation: '',
          bag: 'No',
          waveTime: '',
          pad: '',
          serviceType: '',
          bags: '',
          ovs: '',
          assignMethod: '',
        },
      ],
      [
        20,
        {
          driver: 'Darcy Lindqvist',
          shiftType: 'Electric Route',
          status: 'Punched In',
          routes: 'CX7',
          vehicle: '615230',
          vin: '7FCJLRK79PN811619',
          device: '',
          stagingLocation: '',
          bag: 'No',
          waveTime: '',
          pad: '',
          serviceType: '',
          bags: '',
          ovs: '',
          assignMethod: '',
        },
      ],
      [
        39,
        {
          driver: 'Elias Calloway',
          shiftType: 'Electric Route',
          status: 'Ready to Stage',
          routes: 'CX28',
          vehicle: '615850',
          vin: '7FCBEHV84PN489498',
          device: '701',
          stagingLocation: '',
          bag: 'No',
          waveTime: '',
          pad: '',
          serviceType: '',
          bags: '',
          ovs: '',
          assignMethod: '',
        },
      ],
    ],
  },
  {
    file: '2026_09_14_12_15_loadout_sheet.xlsx',
    count: 37,
    date: '2026-09-14',
    withVehicle: 28,
    withRoutes: 0,
    emptyWave: 37,
    shifts: [
      ['Electric Route', 23],
      ['Lead Driver', 2],
      ['Operations Manager', 1],
      ['Step Van Route', 10],
      ['TIME OFF', 1],
    ],
    sample: [
      [
        0,
        {
          driver: 'Sabrina Woodbridge',
          shiftType: 'Operations Manager',
          status: 'No data',
          routes: '',
          vehicle: '',
          vin: '',
          device: '',
          stagingLocation: '',
          bag: 'No',
          waveTime: '',
          pad: '',
          serviceType: '',
          bags: '',
          ovs: '',
          assignMethod: '',
        },
      ],
      [
        18,
        {
          driver: 'Desmond Fitzroy',
          shiftType: 'Electric Route',
          status: 'No data',
          routes: '',
          vehicle: '615807',
          vin: '7FCTXUW62PN892853',
          device: '',
          stagingLocation: '',
          bag: 'No',
          waveTime: '',
          pad: '',
          serviceType: '',
          bags: '',
          ovs: '',
          assignMethod: '',
        },
      ],
      [
        36,
        {
          driver: 'Greta Underhill',
          shiftType: 'Step Van Route',
          status: 'No data',
          routes: '',
          vehicle: '655114 (LMR)',
          vin: '7FCTSDS66TN049477',
          device: '',
          stagingLocation: '',
          bag: 'No',
          waveTime: '',
          pad: '',
          serviceType: '',
          bags: '',
          ovs: '',
          assignMethod: '',
        },
      ],
    ],
  },
];

describe('load-out sheet fixtures', () => {
  it.each(FIXTURES)('reads $file', async (fixture) => {
    const roster = await importLoadoutSheet(fixturePath('loadout-sheets', fixture.file));
    expect(roster.rows).toHaveLength(fixture.count);
    expect(roster.loadOutDate).toBe(fixture.date);
    expect(roster.rows.filter((row) => row.vehicle)).toHaveLength(fixture.withVehicle);
    expect(roster.rows.filter((row) => row.routes)).toHaveLength(fixture.withRoutes);
    expect(roster.rows.filter((row) => !row.waveTime)).toHaveLength(fixture.emptyWave);
    expect(Object.fromEntries(shiftTypeCounts(roster))).toEqual(Object.fromEntries(fixture.shifts));
    for (const [index, row] of fixture.sample) expect(roster.rows[index]).toEqual(row);
    expect(roster.importedAt).toBeInstanceOf(Date);
    expect(roster.sourceFile).toContain(fixture.file);
  });
});

describe('load-out sheet refusals that carry the file', () => {
  it('says so when the file is not there', async () => {
    await expect(importLoadoutSheet(join('nowhere', 'missing.xlsx'))).rejects.toThrow(
      new LoadoutImportError(`File not found:\n\n${join('nowhere', 'missing.xlsx')}`),
    );
  });

  it('says so when the file is not a workbook', async () => {
    const scenario = { file: 'not-a-workbook.xlsx', text: 'just some words' };
    await withScenarioFile(scenario, async (path) => {
      await expect(importLoadoutSheet(path)).rejects.toThrow(/^Couldn't open the workbook:\n\n/);
    });
  });
});

const SCENARIOS: Array<[Scenario, Record<string, unknown>]> = [
  [
    {
      name: 'title date, spacer rows, placeholders and cell kinds',
      importer: 'loadout',
      file: 'loadout.xlsx',
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            ['Load Out Export for Tuesday, August 04th 2026'],
            [],
            [
              'Driver',
              'ShiftType',
              'Status',
              'Routes',
              'Vehicle',
              'Vin',
              'Device',
              'Staging Location',
              'Bag',
              'Wave Time',
            ],
            [
              'Carmen Abernathy',
              'Electric Route',
              'On Time',
              'CX1',
              615850,
              'VIN1',
              722,
              'STG.G17',
              'No',
              'PAD 2/9:55',
            ],
            ['Nadine Abernathy', 'Call Out', 'No data', 'n/a', '-', '--', null, null, null, null],
            [null, null, null, null, null, null, null, null, null, null],
            [null, 'Step Van Route'],
            [
              'Nolan Abernathy',
              '  Backup   Driver  ',
              'Late',
              3.0,
              2.5,
              true,
              null,
              null,
              null,
              'No Data',
            ],
            ['Total: 3'],
          ],
        },
      ],
    },
    {
      loadOutDate: '2026-08-04',
      rows: [
        {
          driver: 'Carmen Abernathy',
          shiftType: 'Electric Route',
          status: 'On Time',
          routes: 'CX1',
          vehicle: '615850',
          vin: 'VIN1',
          device: '722',
          stagingLocation: 'STG.G17',
          bag: 'No',
          waveTime: 'PAD 2/9:55',
          pad: '',
          serviceType: '',
          bags: '',
          ovs: '',
          assignMethod: '',
        },
        {
          driver: 'Nadine Abernathy',
          shiftType: 'Call Out',
          status: 'No data',
          routes: '',
          vehicle: '',
          vin: '',
          device: '',
          stagingLocation: '',
          bag: '',
          waveTime: '',
          pad: '',
          serviceType: '',
          bags: '',
          ovs: '',
          assignMethod: '',
        },
        {
          driver: 'Nolan Abernathy',
          shiftType: 'Backup   Driver',
          status: 'Late',
          routes: '3',
          vehicle: '2.5',
          vin: 'True',
          device: '',
          stagingLocation: '',
          bag: '',
          waveTime: '',
          pad: '',
          serviceType: '',
          bags: '',
          ovs: '',
          assignMethod: '',
        },
        {
          driver: 'Total: 3',
          shiftType: '',
          status: '',
          routes: '',
          vehicle: '',
          vin: '',
          device: '',
          stagingLocation: '',
          bag: '',
          waveTime: '',
          pad: '',
          serviceType: '',
          bags: '',
          ovs: '',
          assignMethod: '',
        },
      ],
    },
  ],
  [
    {
      name: 'header names with other spellings',
      importer: 'loadout',
      file: '2026_08_03_22_45_loadout_sheet.xlsx',
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            [
              'Driver',
              'Shift_Type',
              'Status',
              'Route',
              'Van',
              'VIN',
              'Phone',
              'Stage',
              'Bags',
              'Wave',
            ],
            [
              'Barrett Ainsworth',
              'Electric Route',
              'On Time',
              'CX2',
              '55',
              'VIN2',
              '700',
              'STG.G1',
              'Yes',
              'PAD 1/9:50',
            ],
          ],
        },
      ],
    },
    {
      loadOutDate: '2026-08-03',
      rows: [
        {
          driver: 'Barrett Ainsworth',
          shiftType: 'Electric Route',
          status: 'On Time',
          routes: 'CX2',
          vehicle: '55',
          vin: 'VIN2',
          device: '700',
          stagingLocation: 'STG.G1',
          bag: 'Yes',
          waveTime: 'PAD 1/9:50',
          pad: '',
          serviceType: '',
          bags: '',
          ovs: '',
          assignMethod: '',
        },
      ],
    },
  ],
  [
    {
      name: 'the title date wins over the file name, month spelled short',
      importer: 'loadout',
      file: '2026_08_03_22_45_loadout_sheet.xlsx',
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            ['Load Out Export for Sept 5, 2026'],
            [
              'Driver',
              'ShiftType',
              'Status',
              'Routes',
              'Vehicle',
              'Vin',
              'Device',
              'Staging Location',
              'Bag',
              'Wave Time',
            ],
            ['Colton Alderman', 'Electric Route', 'On Time'],
          ],
        },
      ],
    },
    {
      loadOutDate: '2026-09-05',
      rows: [
        {
          driver: 'Colton Alderman',
          shiftType: 'Electric Route',
          status: 'On Time',
          routes: '',
          vehicle: '',
          vin: '',
          device: '',
          stagingLocation: '',
          bag: '',
          waveTime: '',
          pad: '',
          serviceType: '',
          bags: '',
          ovs: '',
          assignMethod: '',
        },
      ],
    },
  ],
  [
    {
      name: 'an impossible title date falls back to the file name',
      importer: 'loadout',
      file: '2026_08_03_22_45_loadout_sheet.xlsx',
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            ['Load Out Export for February 30th 2026'],
            [
              'Driver',
              'ShiftType',
              'Status',
              'Routes',
              'Vehicle',
              'Vin',
              'Device',
              'Staging Location',
              'Bag',
              'Wave Time',
            ],
            ['Colton Alderman', 'Electric Route', 'On Time'],
          ],
        },
      ],
    },
    {
      loadOutDate: '2026-08-03',
      rows: [
        {
          driver: 'Colton Alderman',
          shiftType: 'Electric Route',
          status: 'On Time',
          routes: '',
          vehicle: '',
          vin: '',
          device: '',
          stagingLocation: '',
          bag: '',
          waveTime: '',
          pad: '',
          serviceType: '',
          bags: '',
          ovs: '',
          assignMethod: '',
        },
      ],
    },
  ],
  [
    {
      name: 'a file name date that is not a real day',
      importer: 'loadout',
      file: '2026_13_45_loadout_sheet.xlsx',
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            [
              'Driver',
              'ShiftType',
              'Status',
              'Routes',
              'Vehicle',
              'Vin',
              'Device',
              'Staging Location',
              'Bag',
              'Wave Time',
            ],
            ['Colton Alderman', 'Electric Route', 'On Time'],
          ],
        },
      ],
    },
    {
      loadOutDate: null,
      rows: [
        {
          driver: 'Colton Alderman',
          shiftType: 'Electric Route',
          status: 'On Time',
          routes: '',
          vehicle: '',
          vin: '',
          device: '',
          stagingLocation: '',
          bag: '',
          waveTime: '',
          pad: '',
          serviceType: '',
          bags: '',
          ovs: '',
          assignMethod: '',
        },
      ],
    },
  ],
  [
    {
      name: 'no date anywhere',
      importer: 'loadout',
      file: 'sheet.xlsx',
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            [
              'Driver',
              'ShiftType',
              'Status',
              'Routes',
              'Vehicle',
              'Vin',
              'Device',
              'Staging Location',
              'Bag',
              'Wave Time',
            ],
            ['Zane Applewhite', 'Electric Route', 'On Time'],
          ],
        },
      ],
    },
    {
      loadOutDate: null,
      rows: [
        {
          driver: 'Zane Applewhite',
          shiftType: 'Electric Route',
          status: 'On Time',
          routes: '',
          vehicle: '',
          vin: '',
          device: '',
          stagingLocation: '',
          bag: '',
          waveTime: '',
          pad: '',
          serviceType: '',
          bags: '',
          ovs: '',
          assignMethod: '',
        },
      ],
    },
  ],
  [
    {
      name: 'only the first sheet is read',
      importer: 'loadout',
      file: 'sheet.xlsx',
      sheets: [
        {
          name: 'First',
          rows: [
            [
              'Driver',
              'ShiftType',
              'Status',
              'Routes',
              'Vehicle',
              'Vin',
              'Device',
              'Staging Location',
              'Bag',
              'Wave Time',
            ],
            ['Zane Applewhite', 'Electric Route', 'On Time'],
          ],
        },
        {
          name: 'Second',
          rows: [
            [
              'Driver',
              'ShiftType',
              'Status',
              'Routes',
              'Vehicle',
              'Vin',
              'Device',
              'Staging Location',
              'Bag',
              'Wave Time',
            ],
            ['Elodie Ashdown', 'Step Van Route', 'Late'],
          ],
        },
      ],
    },
    {
      loadOutDate: null,
      rows: [
        {
          driver: 'Zane Applewhite',
          shiftType: 'Electric Route',
          status: 'On Time',
          routes: '',
          vehicle: '',
          vin: '',
          device: '',
          stagingLocation: '',
          bag: '',
          waveTime: '',
          pad: '',
          serviceType: '',
          bags: '',
          ovs: '',
          assignMethod: '',
        },
      ],
    },
  ],
  [
    {
      name: 'time and date cells',
      importer: 'loadout',
      file: 'sheet.xlsx',
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            [
              'Driver',
              'ShiftType',
              'Status',
              'Routes',
              'Vehicle',
              'Vin',
              'Device',
              'Staging Location',
              'Bag',
              'Wave Time',
            ],
            [
              'Elodie Ashdown',
              'Electric Route',
              'On Time',
              'CX3',
              {
                datetime: '2026-09-01 00:00',
              },
              'VIN3',
              {
                datetime: '2026-09-01 10:20',
              },
              'STG.G2',
              'No',
              {
                time: '09:50',
              },
            ],
          ],
        },
      ],
    },
    {
      loadOutDate: null,
      rows: [
        {
          driver: 'Elodie Ashdown',
          shiftType: 'Electric Route',
          status: 'On Time',
          routes: 'CX3',
          vehicle: '2026-09-01 00:00',
          vin: 'VIN3',
          device: '2026-09-01 10:20',
          stagingLocation: 'STG.G2',
          bag: 'No',
          waveTime: '09:50:00',
          pad: '',
          serviceType: '',
          bags: '',
          ovs: '',
          assignMethod: '',
        },
      ],
    },
  ],
  [
    {
      name: 'short and long rows, repeated headings',
      importer: 'loadout',
      file: 'sheet.xlsx',
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            ['Driver', 'ShiftType', 'Status', 'Status', 'Wave Time'],
            ['Hadley Ashdown'],
            [
              'Xavier Bannister',
              'Electric Route',
              'First',
              'Second',
              'PAD 3/10:25',
              'extra',
              'extra',
            ],
          ],
        },
      ],
    },
    {
      loadOutDate: null,
      rows: [
        {
          driver: 'Hadley Ashdown',
          shiftType: '',
          status: '',
          routes: '',
          vehicle: '',
          vin: '',
          device: '',
          stagingLocation: '',
          bag: '',
          waveTime: '',
          pad: '',
          serviceType: '',
          bags: '',
          ovs: '',
          assignMethod: '',
        },
        {
          driver: 'Xavier Bannister',
          shiftType: 'Electric Route',
          status: 'Second',
          routes: '',
          vehicle: '',
          vin: '',
          device: '',
          stagingLocation: '',
          bag: '',
          waveTime: 'PAD 3/10:25',
          pad: '',
          serviceType: '',
          bags: '',
          ovs: '',
          assignMethod: '',
        },
      ],
    },
  ],
  [
    {
      name: 'no header row',
      importer: 'loadout',
      file: 'sheet.xlsx',
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            ['Name', 'Team'],
            ['Carmen Abernathy', 'Blue'],
          ],
        },
      ],
    },
    {
      error:
        "Couldn't find the header row.\n\nExpected a row containing 'Driver' and 'ShiftType' - is this a DSP Workplace load-out export?",
    },
  ],
  [
    {
      name: 'an empty sheet',
      importer: 'loadout',
      file: 'sheet.xlsx',
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
      name: 'a header and no drivers',
      importer: 'loadout',
      file: 'sheet.xlsx',
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            [
              'Driver',
              'ShiftType',
              'Status',
              'Routes',
              'Vehicle',
              'Vin',
              'Device',
              'Staging Location',
              'Bag',
              'Wave Time',
            ],
            [null, null, null, null, null, null, null, null, null, null],
          ],
        },
      ],
    },
    {
      error: 'Found the header row but no driver rows below it.',
    },
  ],
  [
    {
      name: 'driver cells all empty',
      importer: 'loadout',
      file: 'sheet.xlsx',
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            [
              'Driver',
              'ShiftType',
              'Status',
              'Routes',
              'Vehicle',
              'Vin',
              'Device',
              'Staging Location',
              'Bag',
              'Wave Time',
            ],
            [null, 'Electric Route'],
            ['No data', 'Call Out'],
          ],
        },
      ],
    },
    {
      error: 'Found the header row but no driver rows below it.',
    },
  ],
];

describe('load-out sheet scenarios', () => {
  it.each(SCENARIOS.map(([scenario, expected]) => ({ scenario, expected })))(
    '$scenario.name',
    async ({ scenario, expected }) => {
      expect(await runScenario(scenario)).toEqual(expected);
    },
  );
});
