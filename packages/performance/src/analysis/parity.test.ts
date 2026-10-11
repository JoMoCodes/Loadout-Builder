// Every analysis function over the made-up data, against what the old app's own code made from
// the same files (scripts/parity/wpa/expected). Run over the whole range, first to last
// scorecard week, as the harness did.

import { describe, expect, it } from 'vitest';
import { buildVerificationExport, verificationCsv } from '../export';
import { ordinal } from '../importers/testkit';
import {
  buildFleetSummary,
  categoryHitsByDriverWeek,
  categoryRollup,
  computeAverages,
  computeSafetyCounts,
  computeTrends,
  DEFAULT_COACHING_SETTINGS,
  DEFAULT_COMPLIANCE_WINDOW_DAYS,
  driverGridRow,
  evaluateCoaching,
  evaluateCompliance,
  getAllWeeks,
  getAllWithLatest,
  getDriverReport,
  getThresholds,
} from './index';
import {
  expectedDriverIds,
  loadFixtureData,
  normalise,
  readExpectedBytes,
  readExpectedJson,
} from './fixtureData';

const data = await loadFixtureData();
const weeks = getAllWeeks(data);
const fromWeek = weeks[0] as string;
const toWeek = weeks[weeks.length - 1] as string;
const byId = (a: { transporterId: string }, b: { transporterId: string }): number =>
  ordinal(a.transporterId, b.transporterId);

function expectSame(actual: unknown, expectedFile: string): void {
  expect(normalise(actual)).toEqual(normalise(readExpectedJson(expectedFile)));
}

describe('the made-up data, read by this package', () => {
  it('covers the weeks the old app had', () => {
    expect([fromWeek, toWeek]).toEqual(['2026-W31', '2026-W40']);
    expectSame(weeks, 'weeks.json');
  });

  it('drivers.json: every driver with their newest scorecard and rank', () => {
    const drivers = getAllWithLatest(data);
    expectSame(drivers.map((driver) => driverGridRow(driver)).sort(byId), 'drivers.json');
  });

  it('thresholds.json: in display order with their texts', () => {
    expectSame(
      getThresholds(data).map((t) => ({
        metricName: t.metricName,
        metricNameDisplay: t.metricNameDisplay,
        indicator: t.indicator,
        platinumThreshold: t.platinumThreshold,
        goldThreshold: t.goldThreshold,
        silverThreshold: t.silverThreshold,
        bronzeThreshold: t.bronzeThreshold,
        overallMetricWeight: t.overallMetricWeight,
        sourceWeek: t.sourceWeek,
        platinumDisplay: t.platinumDisplay,
        goldDisplay: t.goldDisplay,
        silverDisplay: t.silverDisplay,
        bronzeDisplay: t.bronzeDisplay,
      })),
      'thresholds.json',
    );
  });

  it('averages.json, to the last digit', () => {
    expectSame(computeAverages(data, fromWeek, toWeek), 'averages.json');
  });

  it('safety-counts.json', () => {
    expectSame(computeSafetyCounts(data, fromWeek, toWeek), 'safety-counts.json');
  });

  it('trends.json', () => {
    expectSame(computeTrends(data, fromWeek, toWeek), 'trends.json');
  });

  it('category-rollup.json, in the old order', () => {
    expectSame(categoryRollup(data, fromWeek, toWeek), 'category-rollup.json');
  });

  it('category-hits.json', () => {
    expectSame(categoryHitsByDriverWeek(data, fromWeek, toWeek), 'category-hits.json');
  });

  it('fleet-summary.json, top 5', () => {
    expectSame({ ...buildFleetSummary(data, fromWeek, toWeek, 5), topN: 5 }, 'fleet-summary.json');
  });

  it('coaching.json, with the old default settings', () => {
    const flags = evaluateCoaching(data, fromWeek, toWeek, DEFAULT_COACHING_SETTINGS);
    expectSame(
      { settings: DEFAULT_COACHING_SETTINGS, flags: [...flags].sort(byId) },
      'coaching.json',
    );
  });

  it('compliance.json, as of the day the harness ran, in the old order', () => {
    const expected = readExpectedJson<{ asOf: string; windowDays: number }>('compliance.json');
    expect(expected.asOf).toBe('2026-10-10');
    expect(expected.windowDays).toBe(DEFAULT_COMPLIANCE_WINDOW_DAYS);
    // The harness fed the driver list in Transporter ID order.
    const drivers = [...getAllWithLatest(data)].sort(byId);
    expectSame(
      {
        asOf: expected.asOf,
        windowDays: DEFAULT_COMPLIANCE_WINDOW_DAYS,
        alerts: evaluateCompliance(drivers, DEFAULT_COMPLIANCE_WINDOW_DAYS, expected.asOf),
      },
      'compliance.json',
    );
  });

  it('verification.csv, byte for byte', () => {
    const ids = getAllWithLatest(data).map((driver) => driver.transporterId);
    const expected = readExpectedBytes('verification.csv');
    // The repository stores text files with LF line ends (.gitattributes), so the committed
    // copy has LF where the old app wrote CRLF.
    expect(Buffer.from(verificationCsv(data, ids, { newline: '\n' }), 'utf8')).toEqual(expected);
    const crlf = Buffer.from(expected.toString('utf8').replace(/\n/g, '\r\n'), 'utf8');
    const result = buildVerificationExport(data, ids);
    expect(Buffer.from(result.csv, 'utf8')).toEqual(crlf);
    expect(result.csv.startsWith('﻿Source File,Transporter ID,')).toBe(true);
    const summary = readExpectedJson<{ verificationRows: number }>('summary.json');
    expect(result.rowsWritten).toBe(summary.verificationRows);
  });
});

describe('each driver file (drivers/<id>.json)', () => {
  const ids = expectedDriverIds();

  it('has one file per driver', () => {
    expect(ids).toHaveLength(92);
    expect(ids).toEqual(data.drivers.map((d) => d.transporterId).sort(ordinal));
  });

  it.each(ids)('%s', (id) => {
    expectSame(getDriverReport(data, id, fromWeek, toWeek, weeks), `drivers/${id}.json`);
  });
});
