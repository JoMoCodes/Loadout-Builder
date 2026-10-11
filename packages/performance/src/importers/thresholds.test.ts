// The thresholds reader against what the old app made from the same made-up file, plus small
// cases written here that follow ThresholdImporter.cs line by line.

import { describe, expect, it } from 'vitest';
import { parseThresholds } from './thresholds';
import {
  expectedImport,
  expectedTable,
  fixtureFiles,
  otherCountsOf,
  sortLikeHarness,
  toColumns,
} from './testkit';

const HEADER =
  'Metric,Scorecard Week,Indicator,Platinum Threshold,Gold Threshold,Silver Threshold,' +
  'Bronze Threshold,Overall Metric Weight';

describe('parseThresholds on the made-up file', () => {
  const files = fixtureFiles('thresholds');
  const expected = expectedImport('ThresholdImporter');
  const table = expectedTable('MetricThresholds');
  const result = parseThresholds(files[0]!);

  it('reports the counts, week and errors the old importer reported', () => {
    expect(files).toHaveLength(1);
    expect(result.rowsImported).toBe(expected.rowsImported);
    expect(result.errors).toEqual(expected.errors);
    expect(otherCountsOf(result, expected)).toEqual(expected.otherCounts);
    expect([result.sourceWeek]).toEqual(expected.weeks);
    expect(result.replaceAll).toBe(true);
  });

  it('gives exactly the rows the old app wrote to MetricThresholds', () => {
    const rows = result.rows.map((row) => toColumns({ ...row, importedAt: null }));
    expect(sortLikeHarness(rows, table.columns)).toEqual(table.rows);
  });
});

describe('parseThresholds, small cases', () => {
  it('skips FICO and unknown names, and maps both delivery completion names to DCR', () => {
    const text = [
      HEADER,
      'Safe Driving Metric (FICO),2026-W32,POSITIVE,850,800,750,700,0',
      'Something New,2026-W32,NEGATIVE,0,1,2,3,4',
      ' Delivery Completion DPMO (DC_DPMO) ,2026-W32,NEGATIVE,0,"1,000",2000,3000,10',
      'Delivery Completion Rate (DCR),2026-W32,POSITIVE,100,99,98,97,10',
    ].join('\n');
    const result = parseThresholds({ fileName: 'thresholds.csv', text });
    expect(result.rowsRead).toBe(4);
    expect(result.rowsSkipped).toBe(2);
    expect(result.rowsImported).toBe(1);
    expect(result.sourceWeek).toBe('2026-W32');
    expect(result.rows).toEqual([
      {
        metricName: 'DCR',
        indicator: 'NEGATIVE',
        platinumThreshold: 0,
        goldThreshold: 1000,
        silverThreshold: 2000,
        bronzeThreshold: 3000,
        overallMetricWeight: 10,
        sourceWeek: '2026-W32',
      },
    ]);
    expect(result.errors).toEqual([
      'thresholds.csv: row 5 was skipped because the metric "DCR" appears more than once; the first one was kept.',
    ]);
  });

  it('leaves the stored thresholds alone when the file is empty', () => {
    const result = parseThresholds({ fileName: 'thresholds.csv', text: '\uFEFF' });
    expect(result.replaceAll).toBe(false);
    expect(result.errors).toEqual(['thresholds.csv: the file is empty (it has no header row).']);
  });
});
