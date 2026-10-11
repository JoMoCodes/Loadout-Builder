// The DCR (returned package) reader against what the old app made from the same made-up files,
// plus small cases written here that follow DcrImporter.cs line by line.

import { describe, expect, it } from 'vitest';
import { parseDcr } from './dcr';
import { describeWeekParity } from './testkit';

describeWeekParity({
  importer: 'DcrImporter',
  kind: 'dcr',
  table: 'DcrEvents',
  parse: parseDcr,
  ids: true,
  hyphenOptional: true,
});

describe('parseDcr, small cases', () => {
  it('reads older header names, a week with no hyphen, and leaves missing notes blank', () => {
    const text = [
      'Delivery Associate ,impact dcr,Tracking ID,Transporter ID,RTS Code',
      'Archer Gresham,Y,TBA000000000001,A02V4L9HIELIDL,BUSINESS CLOSED',
      'Archer Gresham,n,TBA000000000002,A02V4L9HIELIDL,OBJECT MISSING',
    ].join('\n');
    const result = parseDcr({ fileName: 'Quality_RTS_XXXX_XXX1_2026W7.csv', text });
    // The impact column is found ignoring case, but then read by its exact name, as the old
    // reader did, so a lower-case header stops the file.
    expect(result.errors).toEqual([
      'Quality_RTS_XXXX_XXX1_2026W7.csv: there is no "Impact DCR" column.',
    ]);
    expect(result.weeks).toEqual([]);

    const fixed = parseDcr({
      fileName: 'Quality_RTS_XXXX_XXX1_2026W7.csv',
      text: text.replace('impact dcr', 'Impact DCR'),
    });
    expect(fixed.errors).toEqual([]);
    expect(fixed.weeks).toEqual(['2026-W07']);
    expect(fixed.rowsImported).toBe(2);
    expect(fixed.impactingEventsImported).toBe(1);
    expect(fixed.rows[0]).toEqual({
      transporterId: 'A02V4L9HIELIDL',
      week: '2026-W07',
      name: 'Archer Gresham',
      trackingId: 'TBA000000000001',
      impactDcr: 'Y',
      rtsCode: 'BUSINESS CLOSED',
      additionalInformation: '',
      exemptionReason: '',
      plannedDeliveryDate: '',
      sourceFile: 'Quality_RTS_XXXX_XXX1_2026W7.csv',
    });
  });

  it('names the columns it looked for when a needed one is missing', () => {
    const result = parseDcr({
      fileName: 'Quality_RTS_XXXX_XXX1_2026-W31.csv',
      text: 'Delivery Associate,Tracking ID,Transporter ID,DA Selected RTS Code\n',
    });
    expect(result.errors).toEqual([
      'Quality_RTS_XXXX_XXX1_2026-W31.csv: there is no column named "Impacts Scorecard" or "Impact DC DPMO" or "Impact DCR". Amazon may have renamed it again; the new name needs adding to the app.',
    ]);
    expect(result.weeks).toEqual([]);
  });
});
