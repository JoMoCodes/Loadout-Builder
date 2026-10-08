// Tests for the Tenured Workforce reader. The made-up files in packages/fixtures were read with the old Python
// importer and the numbers and sample rows below are what it answered. The inline scenarios were
// built in a temporary folder, run through the old importer too, and its answers copied in.

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { newestWeek, tenureCountFor, weekLabel } from '../models/tenure';
import { asCount, importTenureExport, TenureImportError } from './tenure';
import { fixturePath, runScenario, type Scenario } from './testkit';

const FIXTURES: Array<{
  file: string;
  count: number;
  week: string;
  newest: [number, number] | null;
  sample: Array<[number, string, { routes: number; year: number; week: number }]>;
}> = [
  {
    file: 'Tenured_Workforce_DA_1756800000.csv',
    count: 10,
    week: 'Week 36, 2026',
    newest: [2026, 36],
    sample: [
      [
        0,
        'AK92X3BJNUBTF',
        {
          routes: 412,
          year: 2026,
          week: 35,
        },
      ],
      [
        5,
        'A5WB9Y629G3A95',
        {
          routes: 0,
          year: 2026,
          week: 35,
        },
      ],
      [
        9,
        'AO2I4MJ59WDHS',
        {
          routes: 203,
          year: 2026,
          week: 35,
        },
      ],
    ],
  },
  {
    file: 'Tenured_Workforce_DA_1756900000.csv',
    count: 3,
    week: 'Week 36, 2026',
    newest: [2026, 36],
    sample: [
      [
        0,
        'A9CW8HB7Y0K8F4',
        {
          routes: 999,
          year: 2026,
          week: 33,
        },
      ],
      [
        1,
        'AK92X3BJNUBTF',
        {
          routes: 420,
          year: 2026,
          week: 36,
        },
      ],
      [
        2,
        'A1QVVPYVZD6R9F',
        {
          routes: 287,
          year: 2026,
          week: 35,
        },
      ],
    ],
  },
];

describe('tenure fixtures', () => {
  it.each(FIXTURES)('reads $file', async (fixture) => {
    const book = await importTenureExport(fixturePath('tenure', fixture.file));
    expect(book.records.size).toBe(fixture.count);
    expect(weekLabel(book)).toBe(fixture.week);
    expect(newestWeek(book)).toEqual(fixture.newest);
    for (const [, id, record] of fixture.sample) {
      expect(book.records.get(id)).toEqual(record);
      expect(tenureCountFor(book, id)).toBe(record.routes);
    }
  });
});

describe('tenure refusals that carry the file', () => {
  it('says so when the file is not there', async () => {
    await expect(importTenureExport(join('nowhere', 'missing.csv'))).rejects.toThrow(
      new TenureImportError(`File not found:\n\n${join('nowhere', 'missing.csv')}`),
    );
  });
});

describe('reading a count', () => {
  it.each([
    ['43', 43],
    ['43.0', 43],
    ['1,234', 1234],
    ['12,34', null],
    [' 7 ', 7],
    ['1e3', 1000],
    ['1_000', 1000],
    ['-5', null],
    ['7.5', null],
    ['NaN', null],
    ['inf', null],
    ['', null],
    [null, null],
  ])('reads %j as %j', (text, expected) => {
    expect(asCount(text)).toBe(expected);
  });
});

const SCENARIOS: Array<[Scenario, Record<string, unknown>]> = [
  [
    {
      name: 'latest week wins; spellings and number formats',
      importer: 'tenure',
      file: 'tenure.csv',
      text: 'Trabsporter ID,Year,Week,Lifetime Routes,Note\nT001,2026,33,100,a\nT001,2026,34,"1,234",b\nT001,2026,34,1200,c\nT002,2025,52,43.0,d\nT002,2026,1,44,e\nT003,2026,34,-5,f\nT003,2026,34,NaN,g\nT004,2026,34,abc,h\nT004,2026,34,"12,34",i\n,2026,34,10,j\nT005,2026.0,34.0,7.5,k\nT006,2026,34,1e3,l\nT007,2026,34,1_000,m\nT008,2026,34,  7  ,n\nT009,2026,34,+8,o\nT010,2026,34,inf,p\nT011,2026,34,.5,q\nT012,2026,34,5.,r\nT013,2026\nT014,2026,34,0,s\nT015,2026,34,-0,t\nT016,2026,34,1,2345,u\nT017,2026,35,3,v\nT017,2026,35,9,w\nT017,2026,35,4,x\nT018,2027,1,2,y\nT018,2026,53,99,z',
    },
    {
      records: [
        [
          'T001',
          {
            routes: 1234,
            year: 2026,
            week: 34,
          },
        ],
        [
          'T002',
          {
            routes: 44,
            year: 2026,
            week: 1,
          },
        ],
        [
          'T006',
          {
            routes: 1000,
            year: 2026,
            week: 34,
          },
        ],
        [
          'T007',
          {
            routes: 1000,
            year: 2026,
            week: 34,
          },
        ],
        [
          'T008',
          {
            routes: 7,
            year: 2026,
            week: 34,
          },
        ],
        [
          'T009',
          {
            routes: 8,
            year: 2026,
            week: 34,
          },
        ],
        [
          'T012',
          {
            routes: 5,
            year: 2026,
            week: 34,
          },
        ],
        [
          'T014',
          {
            routes: 0,
            year: 2026,
            week: 34,
          },
        ],
        [
          'T015',
          {
            routes: 0,
            year: 2026,
            week: 34,
          },
        ],
        [
          'T016',
          {
            routes: 1,
            year: 2026,
            week: 34,
          },
        ],
        [
          'T017',
          {
            routes: 9,
            year: 2026,
            week: 35,
          },
        ],
        [
          'T018',
          {
            routes: 2,
            year: 2027,
            week: 1,
          },
        ],
      ],
    },
  ],
  [
    {
      name: 'the correct spelling of the anchor column',
      importer: 'tenure',
      file: 'tenure.csv',
      text: 'Transporter ID,Year,Week,Lifetime Routes\nT001,2026,34,10\n',
    },
    {
      records: [
        [
          'T001',
          {
            routes: 10,
            year: 2026,
            week: 34,
          },
        ],
      ],
    },
  ],
  [
    {
      name: 'headers in another order and case',
      importer: 'tenure',
      file: 'tenure.csv',
      text: 'lifetime routes,WEEK,year,transporter\n5,12,2026,T001\n',
    },
    {
      records: [
        [
          'T001',
          {
            routes: 5,
            year: 2026,
            week: 12,
          },
        ],
      ],
    },
  ],
  [
    {
      name: 'not a tenure export',
      importer: 'tenure',
      file: 'tenure.csv',
      text: 'Col A,Col B\n1,2\n',
    },
    {
      error:
        "This doesn't look like a Tenured Workforce export.\n\nExpected columns 'Transporter ID', 'Year', 'Week' and 'Lifetime Routes', but the file has: Col A, Col B",
    },
  ],
  [
    {
      name: 'an Excel file saved as csv',
      importer: 'tenure',
      file: 'tenure.csv',
      text: 'PK\u0003\u0004junk\u0000\u0000binary',
    },
    {
      error:
        "This isn't a CSV - it looks like an Excel workbook or another binary file.\n\nSave the Tenured Workforce export as .csv and import that.",
    },
  ],
  [
    {
      name: 'an empty file',
      importer: 'tenure',
      file: 'tenure.csv',
      text: '',
    },
    {
      error: 'The file is empty.',
    },
  ],
  [
    {
      name: 'no usable rows',
      importer: 'tenure',
      file: 'tenure.csv',
      text: 'Transporter ID,Year,Week,Lifetime Routes\nT001,2026,34,abc\n,2026,34,5\n',
    },
    {
      error:
        'Found the header row but no usable rows below it - every row is missing its Transporter ID, Year, Week or Lifetime Routes.',
    },
  ],
  [
    {
      name: 'a header and no rows',
      importer: 'tenure',
      file: 'tenure.csv',
      text: 'Transporter ID,Year,Week,Lifetime Routes\n',
    },
    {
      error:
        'Found the header row but no usable rows below it - every row is missing its Transporter ID, Year, Week or Lifetime Routes.',
    },
  ],
];

describe('tenure scenarios', () => {
  it.each(SCENARIOS.map(([scenario, expected]) => ({ scenario, expected })))(
    '$scenario.name',
    async ({ scenario, expected }) => {
      expect(await runScenario(scenario)).toEqual(expected);
    },
  );
});
