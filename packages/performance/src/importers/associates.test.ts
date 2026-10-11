// The roster reader against what the old app made from the same made-up file, plus small cases
// written here that follow AssociateImporter.cs line by line.

import { describe, expect, it } from 'vitest';
import { parseAssociates } from './associates';
import { expectedImport, fixtureFiles, otherCountsOf } from './testkit';

const HEADER =
  'Name and ID,TransporterID,Position,Qualifications,ID expiration,Personal Phone Number,' +
  'Work Phone Number,Email,Status';

describe('parseAssociates on the made-up roster', () => {
  const files = fixtureFiles('roster');
  const expected = expectedImport('AssociateImporter');
  const result = parseAssociates(files);

  it('reports the counts and errors the old importer reported', () => {
    expect(files).toHaveLength(1);
    expect(result.filesProcessed).toBe(expected.filesProcessed);
    expect(result.rowsImported).toBe(expected.rowsImported);
    expect(result.errors).toEqual(expected.errors);
    expect(otherCountsOf(result, expected)).toEqual(expected.otherCounts);
    expect(result.drivers).toHaveLength(result.rowsImported);
  });

  it('keeps each column as the file had it, trimmed, with the status in capitals', () => {
    // The roster's first data row (a made-up person from the manifest).
    expect(result.drivers[0]).toEqual({
      transporterId: 'AL90S1HKKSEQK',
      name: 'Zelda Oakley',
      status: 'ACTIVE',
      position: 'Helper, Driver',
      qualifications: 'AMZL_HELPER, CDV, Standard Parcel , EDV, DOT, Step Van',
      idExpiration: '2032-05-19',
      personalPhone: '5905550108',
      workPhone: '+15535550162',
      email: 'driver030@example.com',
    });
  });

  it('counts known drivers as updated', () => {
    const again = parseAssociates(
      files,
      result.drivers.map((driver) => driver.transporterId),
    );
    expect(again.driversAdded).toBe(0);
    expect(again.driversUpdated).toBe(result.rowsImported);
  });
});

describe('parseAssociates, small cases', () => {
  it('uses the ID as the name when the name is blank and skips rows with no ID', () => {
    const text = [
      HEADER,
      ',A02V4L9HIELIDL,Driver,CDV,2031-03-24,,,,inactive ',
      'Archer Gresham,,Driver,CDV,,,,,ACTIVE',
      'Archer Gresham,A02V4L9HIELIDL,Driver,CDV,2031-03-24,,,,',
    ].join('\r\n');
    const result = parseAssociates({ fileName: 'AssociateData.csv', text: '\uFEFF' + text });
    expect(result.errors).toEqual([]);
    expect(result.rowsImported).toBe(2);
    expect(result.driversAdded).toBe(1);
    expect(result.driversUpdated).toBe(1);
    expect(result.inactiveCount).toBe(1);
    expect(result.activeCount).toBe(0);
    expect(result.drivers).toEqual([
      {
        transporterId: 'A02V4L9HIELIDL',
        name: 'Archer Gresham',
        status: '',
        position: 'Driver',
        qualifications: 'CDV',
        idExpiration: '2031-03-24',
        personalPhone: '',
        workPhone: '',
        email: '',
      },
    ]);
  });

  it('skips a row that runs short, saying which row, and keeps the rest', () => {
    const text = [
      HEADER,
      'Archer Gresham,A02V4L9HIELIDL,Driver,CDV',
      'Desmond Marisol Penrose,A05QUB9XOW4NT1,Driver,CDV,,,,,ACTIVE',
    ].join('\n');
    const result = parseAssociates({ fileName: 'AssociateData.csv', text });
    expect(result.errors).toEqual([
      'AssociateData.csv: row 2 was skipped because it is missing the "Status" column.',
    ]);
    expect(result.rowsImported).toBe(1);
    expect(result.drivers.map((driver) => driver.transporterId)).toEqual(['A05QUB9XOW4NT1']);
  });

  it('says so when the file is empty', () => {
    const result = parseAssociates({ fileName: 'AssociateData.csv', text: '' });
    expect(result.filesProcessed).toBe(0);
    expect(result.errors).toEqual(['AssociateData.csv: the file is empty (it has no header row).']);
  });
});
