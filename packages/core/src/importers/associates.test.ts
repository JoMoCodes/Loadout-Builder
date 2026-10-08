// Tests for the associate export reader. The made-up files in packages/fixtures were read with the old Python
// importer and the numbers and sample rows below are what it answered. The inline scenarios were
// built in a temporary folder, run through the old importer too, and its answers copied in.

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { activeCount, qualificationCounts } from '../models/associates';
import { AssociateImportError, importAssociateData } from './associates';
import { fixturePath, runScenario, withScenarioFile, type Sample, type Scenario } from './testkit';

const FIXTURE: {
  count: number;
  active: number;
  withExpiry: number;
  quals: Array<[string, number]>;
  sample: Sample;
} = {
  count: 78,
  active: 71,
  withExpiry: 78,
  quals: [
    ['AMZL_HELPER', 54],
    ['CDV', 77],
    ['DOT', 19],
    ['EDV', 76],
    ['In Home Delivery', 1],
    ['Standard Parcel', 77],
    ['Step Van', 24],
  ],
  sample: [
    [
      0,
      {
        name: 'Carmen Abernathy',
        transporterId: 'AK92X3BJNUBTF',
        position: 'Helper, Driver',
        qualifications: ['AMZL_HELPER', 'CDV', 'Standard Parcel', 'EDV', 'DOT', 'Step Van'],
        idExpiration: '2032-05-19',
        personalPhone: '3955550124',
        workPhone: '+15865550105',
        email: 'driver031@example.com',
        status: 'ACTIVE',
        tenure: null,
      },
    ],
    [
      39,
      {
        name: 'Phoebe Gemma Holloway',
        transporterId: 'A4S6I3ZV10EUC4',
        position: 'Helper, Driver',
        qualifications: ['AMZL_HELPER', 'CDV', 'Standard Parcel', 'EDV', 'DOT', 'Step Van'],
        idExpiration: '2033-07-12',
        personalPhone: '7245550157',
        workPhone: '+15085550137',
        email: 'driver040@example.com',
        status: 'ACTIVE',
        tenure: null,
      },
    ],
    [
      77,
      {
        name: 'Flora Orson Huxley',
        transporterId: 'A1LSR7SEOTKE3I',
        position: 'Helper, Driver',
        qualifications: ['AMZL_HELPER', 'CDV', 'Standard Parcel', 'EDV'],
        idExpiration: '2031-09-22',
        personalPhone: '5025550122',
        workPhone: '+15515550124',
        email: 'driver082@example.com',
        status: 'INACTIVE',
        tenure: null,
      },
    ],
  ],
};

describe('associate export fixture', () => {
  it('reads AssociateData.csv', async () => {
    const book = await importAssociateData(fixturePath('associates', 'AssociateData.csv'));
    expect(book.rows).toHaveLength(FIXTURE.count);
    expect(activeCount(book)).toBe(FIXTURE.active);
    expect(book.rows.filter((row) => row.idExpiration)).toHaveLength(FIXTURE.withExpiry);
    expect(Object.fromEntries(qualificationCounts(book))).toEqual(
      Object.fromEntries(FIXTURE.quals),
    );
    for (const [index, row] of FIXTURE.sample) expect(book.rows[index]).toEqual(row);
  });
});

describe('associate export refusals that carry the file', () => {
  it('says so when the file is not there', async () => {
    await expect(importAssociateData(join('nowhere', 'missing.csv'))).rejects.toThrow(
      new AssociateImportError(`File not found:\n\n${join('nowhere', 'missing.csv')}`),
    );
  });

  it('reads an Excel file saved as .csv as the wrong kind of file', async () => {
    await withScenarioFile({ file: 'a.csv', text: 'PK\x03\x04binary' }, async (path) => {
      await expect(importAssociateData(path)).rejects.toThrow(/^This isn't a CSV/);
    });
  });
});

const SCENARIOS: Array<[Scenario, Record<string, unknown>]> = [
  [
    {
      name: 'aliases, quotes, duplicates, blanks, qualifications and dates',
      importer: 'associates',
      file: 'associates.csv',
      text: '\ufeffName and ID,TransporterID,Position,Qualifications,ID Expiration,Personal Phone Number,Work Phone Number,Email,Status\nCarmen Abernathy,T001,Associate,"CDV, EDV ,Step Van , EDV",2026-09-01,312-555-0101,,carmen@example.com,ACTIVE\n"Abernathy,  Nadine",T002,,"",9/1/2026,,,,Inactive\n\nNolan Abernathy,T001,dup,,,,,,\nBarrett Ainsworth,T003,,Standard Parcel,09/01/26,,,,ACTIVE\nColton Alderman,T004,,,31/12/2026,,,,\nZane Applewhite,T005,,,2026/09/01,,,,\nElodie Ashdown,T006,,,13/45/2026,,,,\n,,,,,,,,\n,T007,,,,,,,\nHadley Ashdown,T008\nXavier Bannister,T009,,,,,,,ACTIVE,extra,extra\nYara Beaumont,,,,,,,,\nYara Beaumont,,,,,,,,\n  Carmen Abernathy   ,  T010 ,   lead  ,,2/29/2027,,,,  active \n',
    },
    {
      rows: [
        {
          name: 'Carmen Abernathy',
          transporterId: 'T001',
          position: 'Associate',
          qualifications: ['CDV', 'EDV', 'Step Van'],
          idExpiration: '2026-09-01',
          personalPhone: '312-555-0101',
          workPhone: '',
          email: 'carmen@example.com',
          status: 'ACTIVE',
          tenure: null,
        },
        {
          name: 'Abernathy, Nadine',
          transporterId: 'T002',
          position: '',
          qualifications: [],
          idExpiration: '2026-09-01',
          personalPhone: '',
          workPhone: '',
          email: '',
          status: 'Inactive',
          tenure: null,
        },
        {
          name: 'Barrett Ainsworth',
          transporterId: 'T003',
          position: '',
          qualifications: ['Standard Parcel'],
          idExpiration: '2026-09-01',
          personalPhone: '',
          workPhone: '',
          email: '',
          status: 'ACTIVE',
          tenure: null,
        },
        {
          name: 'Colton Alderman',
          transporterId: 'T004',
          position: '',
          qualifications: [],
          idExpiration: '2026-12-31',
          personalPhone: '',
          workPhone: '',
          email: '',
          status: '',
          tenure: null,
        },
        {
          name: 'Zane Applewhite',
          transporterId: 'T005',
          position: '',
          qualifications: [],
          idExpiration: '2026-09-01',
          personalPhone: '',
          workPhone: '',
          email: '',
          status: '',
          tenure: null,
        },
        {
          name: 'Elodie Ashdown',
          transporterId: 'T006',
          position: '',
          qualifications: [],
          idExpiration: null,
          personalPhone: '',
          workPhone: '',
          email: '',
          status: '',
          tenure: null,
        },
        {
          name: '',
          transporterId: 'T007',
          position: '',
          qualifications: [],
          idExpiration: null,
          personalPhone: '',
          workPhone: '',
          email: '',
          status: '',
          tenure: null,
        },
        {
          name: 'Hadley Ashdown',
          transporterId: 'T008',
          position: '',
          qualifications: [],
          idExpiration: null,
          personalPhone: '',
          workPhone: '',
          email: '',
          status: '',
          tenure: null,
        },
        {
          name: 'Xavier Bannister',
          transporterId: 'T009',
          position: '',
          qualifications: [],
          idExpiration: null,
          personalPhone: '',
          workPhone: '',
          email: '',
          status: 'ACTIVE',
          tenure: null,
        },
        {
          name: 'Yara Beaumont',
          transporterId: '',
          position: '',
          qualifications: [],
          idExpiration: null,
          personalPhone: '',
          workPhone: '',
          email: '',
          status: '',
          tenure: null,
        },
        {
          name: 'Yara Beaumont',
          transporterId: '',
          position: '',
          qualifications: [],
          idExpiration: null,
          personalPhone: '',
          workPhone: '',
          email: '',
          status: '',
          tenure: null,
        },
        {
          name: 'Carmen Abernathy',
          transporterId: 'T010',
          position: 'lead',
          qualifications: [],
          idExpiration: null,
          personalPhone: '',
          workPhone: '',
          email: '',
          status: 'active',
          tenure: null,
        },
      ],
    },
  ],
  [
    {
      name: 'other header spellings',
      importer: 'associates',
      file: 'associates.csv',
      text: 'Associate,Transporter,Role,Quals,Expiration,Phone,Work Phone,Email Address,Status\nCarmen Abernathy,T001,Lead,EDV,2026-12-31,312-555-0102,312-555-0103,c@example.com,ACTIVE',
    },
    {
      rows: [
        {
          name: 'Carmen Abernathy',
          transporterId: 'T001',
          position: 'Lead',
          qualifications: ['EDV'],
          idExpiration: '2026-12-31',
          personalPhone: '312-555-0102',
          workPhone: '312-555-0103',
          email: 'c@example.com',
          status: 'ACTIVE',
          tenure: null,
        },
      ],
    },
  ],
  [
    {
      name: 'windows line endings and a quoted line break',
      importer: 'associates',
      file: 'associates.csv',
      text: 'Name and ID,TransporterID,Qualifications\r\nCarmen Abernathy,T001,"CDV,\r\nEDV"\r\nNadine Abernathy,T002,DOT\r\n',
    },
    {
      rows: [
        {
          name: 'Carmen Abernathy',
          transporterId: 'T001',
          position: '',
          qualifications: ['CDV', 'EDV'],
          idExpiration: null,
          personalPhone: '',
          workPhone: '',
          email: '',
          status: '',
          tenure: null,
        },
        {
          name: 'Nadine Abernathy',
          transporterId: 'T002',
          position: '',
          qualifications: ['DOT'],
          idExpiration: null,
          personalPhone: '',
          workPhone: '',
          email: '',
          status: '',
          tenure: null,
        },
      ],
    },
  ],
  [
    {
      name: 'latin-1 bytes',
      importer: 'associates',
      file: 'associates.csv',
      text: 'Name and ID,TransporterID,Position\nCarmen Abernathy,T001,Caf\u00e9 lead\n',
      latin1: true,
    },
    {
      rows: [
        {
          name: 'Carmen Abernathy',
          transporterId: 'T001',
          position: 'Caf\u00e9 lead',
          qualifications: [],
          idExpiration: null,
          personalPhone: '',
          workPhone: '',
          email: '',
          status: '',
          tenure: null,
        },
      ],
    },
  ],
  [
    {
      name: 'not an associate export',
      importer: 'associates',
      file: 'associates.csv',
      text: 'Col A,Col B\n1,2\n',
    },
    {
      error:
        "This doesn't look like an associate export.\n\nExpected columns 'Name and ID' and 'TransporterID', but the file has: Col A, Col B",
    },
  ],
  [
    {
      name: 'only the transporter column is missing',
      importer: 'associates',
      file: 'associates.csv',
      text: 'Name and ID,Position\nx,y\n',
    },
    {
      error:
        "This doesn't look like an associate export.\n\nExpected columns 'Name and ID' and 'TransporterID', but the file has: Name and ID, Position",
    },
  ],
  [
    {
      name: 'long and odd headers',
      importer: 'associates',
      file: 'associates.csv',
      text: 'Col\u0001A,BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB,\u00a0c\n1,2,3\n',
    },
    {
      error:
        "This doesn't look like an associate export.\n\nExpected columns 'Name and ID' and 'TransporterID', but the file has: Col A, BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB...",
    },
  ],
  [
    {
      name: 'an Excel file saved as csv',
      importer: 'associates',
      file: 'associates.csv',
      text: 'PK\u0003\u0004junk\u0000\u0000binary',
    },
    {
      error:
        "This isn't a CSV - it looks like an Excel workbook or another binary file.\n\nSave the associate export as .csv and import that.",
    },
  ],
  [
    {
      name: 'a file with a null byte',
      importer: 'associates',
      file: 'associates.csv',
      text: 'Name and ID,TransporterID\nx\u0000y,T1\n',
    },
    {
      error:
        "This isn't a CSV - it looks like an Excel workbook or another binary file.\n\nSave the associate export as .csv and import that.",
    },
  ],
  [
    {
      name: 'an empty file',
      importer: 'associates',
      file: 'associates.csv',
      text: '',
    },
    {
      error: 'The file is empty.',
    },
  ],
  [
    {
      name: 'a blank first line',
      importer: 'associates',
      file: 'associates.csv',
      text: '\nName and ID,TransporterID\nx,T1\n',
    },
    {
      error: 'The file is empty.',
    },
  ],
  [
    {
      name: 'a header and no rows',
      importer: 'associates',
      file: 'associates.csv',
      text: 'Name and ID,TransporterID,Position,Qualifications,ID Expiration,Personal Phone Number,Work Phone Number,Email,Status\n',
    },
    {
      error: 'Found the header row but no associate rows below it.',
    },
  ],
  [
    {
      name: 'only blank rows',
      importer: 'associates',
      file: 'associates.csv',
      text: 'Name and ID,TransporterID,Position,Qualifications,ID Expiration,Personal Phone Number,Work Phone Number,Email,Status\n,,,,,,,,\n\n,,,,,,,,\n',
    },
    {
      error: 'Found the header row but no associate rows below it.',
    },
  ],
];

describe('associate export scenarios', () => {
  it.each(SCENARIOS.map(([scenario, expected]) => ({ scenario, expected })))(
    '$scenario.name',
    async ({ scenario, expected }) => {
      expect(await runScenario(scenario)).toEqual(expected);
    },
  );
});
