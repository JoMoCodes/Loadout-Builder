// The scorecard reader against what the old app made from the same made-up files, plus small
// cases written here that follow ScorecardImporter.cs line by line.

import { describe, expect, it } from 'vitest';
import type { DriverRecord } from '../models';
import { parseAssociates } from './associates';
import { parseScorecards, type ScorecardRow } from './scorecards';
import {
  expectedImport,
  expectedTable,
  fixtureFiles,
  numbered,
  otherCountsOf,
  rowsFromFile,
  sortLikeHarness,
  toColumns,
  without,
  type Row,
} from './testkit';

const roster = parseAssociates(fixtureFiles('roster'));
const files = fixtureFiles('scorecards');
const result = parseScorecards(
  files,
  roster.drivers.map((driver) => driver.transporterId),
);

/** The scorecard and metric table rows, with the ids SQLite would have given them. */
function tableRows(scorecards: readonly ScorecardRow[]): { cards: Row[]; metrics: Row[] } {
  const cards: Row[] = [];
  const metrics: Row[] = [];
  for (const card of numbered(scorecards)) {
    const { metrics: cardMetrics, ...rest } = card;
    cards.push(toColumns(rest));
    for (const metric of cardMetrics) {
      metrics.push(toColumns({ id: metrics.length + 1, scorecardId: card.id, ...metric }));
    }
  }
  return { cards, metrics };
}

describe('parseScorecards on the made-up files, after the made-up roster', () => {
  const expected = expectedImport('ScorecardImporter');

  it('reports the counts, weeks and errors the old importer reported', () => {
    expect(result.filesProcessed).toBe(expected.filesProcessed);
    expect(result.rowsImported).toBe(expected.rowsImported);
    expect(result.weeks).toEqual(expected.weeks);
    expect(result.errors).toEqual(expected.errors);
    expect(otherCountsOf(result, expected)).toEqual(expected.otherCounts);
  });

  it('gives exactly the rows the old app wrote to WeeklyScorecards and MetricEntries', () => {
    const scorecardTable = expectedTable('WeeklyScorecards');
    const metricTable = expectedTable('MetricEntries');
    const { cards, metrics } = tableRows(result.scorecards);
    expect(sortLikeHarness(cards, scorecardTable.columns)).toEqual(scorecardTable.rows);
    expect(sortLikeHarness(metrics, metricTable.columns)).toEqual(metricTable.rows);
  });

  it('leaves Drivers as the old app did: the roster, renamed and added to by the scorecards', () => {
    const drivers = new Map<string, DriverRecord>();
    for (const driver of roster.drivers) drivers.set(driver.transporterId, { ...driver });
    for (const { transporterId, name } of result.drivers) {
      const known = drivers.get(transporterId);
      if (known) known.name = name;
      else
        drivers.set(transporterId, {
          transporterId,
          name,
          status: null,
          position: null,
          qualifications: null,
          idExpiration: null,
          personalPhone: null,
          workPhone: null,
          email: null,
        });
    }
    const table = expectedTable('Drivers');
    expect(sortLikeHarness([...drivers.values()].map(toColumns), table.columns)).toEqual(
      table.rows,
    );
  });

  it.each(files.map((file) => [file.fileName, file] as const))(
    'reads %s on its own',
    (fileName, file) => {
      const one = parseScorecards(file);
      const want = rowsFromFile(expectedTable('WeeklyScorecards').rows, fileName);
      expect(one.errors).toEqual([]);
      expect(one.rowsImported).toBe(want.length);
      const got = one.scorecards.map((card) => toColumns(without({ ...card }, 'metrics')));
      const columns = expectedTable('WeeklyScorecards').columns;
      expect(sortLikeHarness(got, columns)).toEqual(
        sortLikeHarness(
          want.map((row) => without(row, 'Id')),
          columns,
        ),
      );
    },
  );
});

describe('parseScorecards, small cases', () => {
  const HEADER =
    'Week,"Delivery Associate ",Transporter ID,Overall Standing,Overall Score,CDF DPMO,' +
    'CDF DPMO Tier,CDF DPMO Score,POD,Packages Delivered,CDF DPMO Weight Applied';

  it('reads the week from the "Week" column, skips empty metrics, and strips % signs', () => {
    const text = [
      HEADER,
      '2026-W31,Archer Gresham,A02V4L9HIELIDL,Platinum,98.39%,2574,Bronze,0,,771,7.4%',
      '2026-W31,,A05QUB9XOW4NT1,,,,,,,,',
    ].join('\r\n');
    const parsed = parseScorecards({ fileName: 'any name.csv', text: '\uFEFF' + text });
    expect(parsed.errors).toEqual([]);
    expect(parsed.weeks).toEqual(['2026-W31']);
    expect(parsed.driversAdded).toBe(2);
    expect(parsed.drivers).toEqual([
      { transporterId: 'A02V4L9HIELIDL', name: 'Archer Gresham' },
      { transporterId: 'A05QUB9XOW4NT1', name: '' },
    ]);
    expect(parsed.scorecards).toEqual([
      {
        transporterId: 'A02V4L9HIELIDL',
        week: '2026-W31',
        overallStanding: 'Platinum',
        overallScore: 98.39,
        packagesDelivered: 771,
        sourceFile: 'any name.csv',
        metrics: [
          {
            metricName: 'CDF DPMO',
            metricValue: '2574',
            tier: 'Bronze',
            score: 0,
            weightApplied: 7.4,
          },
        ],
      },
      {
        transporterId: 'A05QUB9XOW4NT1',
        week: '2026-W31',
        overallStanding: '',
        overallScore: null,
        packagesDelivered: null,
        sourceFile: 'any name.csv',
        metrics: [],
      },
    ]);
  });

  it('writes nothing from a file that fails part-way, but counts as the old app did', () => {
    const text = [
      HEADER,
      '2026-W31,Archer Gresham,A02V4L9HIELIDL,Platinum,98,1,Gold,90,,771,7',
      '2026-W31,Archer Gresham,A05QUB9XOW4NT1,Platinum',
    ].join('\n');
    const parsed = parseScorecards({ fileName: 'week31.csv', text });
    expect(parsed.errors).toEqual(['week31.csv: row 3 is missing the "Overall Score" column.']);
    expect(parsed.filesProcessed).toBe(0);
    expect(parsed.scorecards).toEqual([]);
    expect(parsed.drivers).toEqual([]);
    // The old importer had already counted these before it rolled the file back.
    expect(parsed.rowsImported).toBe(1);
    expect(parsed.driversAdded).toBe(2);
    expect(parsed.weeks).toEqual(['2026-W31']);
  });

  it('keeps the later row when a driver has two rows for one week', () => {
    const text = [
      HEADER,
      '2026-W31,Archer Gresham,A02V4L9HIELIDL,Gold,90,,,,,700,',
      '2026-W31,Archer Gresham,A02V4L9HIELIDL,Platinum,98,,,,,771,',
    ].join('\n');
    const parsed = parseScorecards({ fileName: 'week31.csv', text });
    expect(parsed.rowsImported).toBe(2);
    expect(parsed.driversAdded).toBe(1);
    expect(parsed.scorecards.map((card) => card.overallStanding)).toEqual(['Platinum']);
  });
});
