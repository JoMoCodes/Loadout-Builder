// Run every CSV reader over the made-up files in the old harness's order and check each
// driver's file (scripts/parity/wpa/expected/drivers/<id>.json): their scorecards with metrics,
// and their CDF, DSB, PSB, DCR and DCR totals rows over the scorecard week range.

import { describe, expect, it } from 'vitest';
import { impactsDcr } from '../models';
import { parseCdf } from './cdf';
import { parseDcr } from './dcr';
import { parseDcrTotals } from './dcrTotals';
import { parseDsb } from './dsb';
import { parsePsb } from './psb';
import { parseScorecards } from './scorecards';
import {
  expectedDriver,
  expectedRange,
  fixtureFiles,
  numbered,
  ordinal,
  parseFixtureRoster,
} from './testkit';

const roster = { drivers: parseFixtureRoster() };
const scorecards = parseScorecards(
  fixtureFiles('scorecards'),
  roster.drivers.map((driver) => driver.transporterId),
);
const cdf = parseCdf(fixtureFiles('cdf')).rows;
const dsb = parseDsb(fixtureFiles('dsb')).rows;
const psb = parsePsb(fixtureFiles('psb')).rows;
const dcrEvents = numbered(parseDcr(fixtureFiles('dcr')).rows);
const dcrTotals = parseDcrTotals(fixtureFiles('dcr-totals')).rows;
const range = expectedRange();

// Scorecards and metric entries with the ids the old database gave them.
let metricId = 0;
const cards = numbered(scorecards.scorecards).map((card) => ({
  ...card,
  metrics: card.metrics.map((metric) => ({ id: ++metricId, scorecardId: card.id, ...metric })),
}));

function inRange(week: string): boolean {
  return week >= range.fromWeek && week <= range.toWeek;
}

function forDriver<T extends { transporterId: string; week: string }>(
  rows: readonly T[],
  transporterId: string,
): T[] {
  return rows
    .filter((row) => row.transporterId === transporterId && inRange(row.week))
    .sort((a, b) => ordinal(a.week, b.week));
}

describe('each driver file matches what the readers give', () => {
  it('covers every driver', () => {
    expect(range.drivers).toHaveLength(92);
  });

  it.each(range.drivers)('%s', (transporterId) => {
    const expected = expectedDriver(transporterId);
    expect(
      forDriver(cards, transporterId).map((card) => ({
        ...card,
        metrics: [...card.metrics].sort((a, b) => ordinal(a.metricName, b.metricName)),
      })),
    ).toEqual(expected.scorecards);
    expect(forDriver(cdf, transporterId)).toEqual(expected.cdf);
    expect(forDriver(dsb, transporterId)).toEqual(expected.dsb);
    expect(forDriver(psb, transporterId)).toEqual(expected.psb);
    expect(forDriver(dcrTotals, transporterId)).toEqual(expected.dcrTotals);
    expect(
      forDriver(dcrEvents, transporterId)
        .sort(
          (a, b) => ordinal(a.week, b.week) || ordinal(a.trackingId, b.trackingId) || a.id - b.id,
        )
        .map((event) => ({ ...event, impactsDcr: impactsDcr(event) })),
    ).toEqual(expected.dcrEvents);
  });
});

describe('spot checks on one made-up driver', () => {
  // Archer Gresham is a made-up person from packages/fixtures/manifest.json.
  const id = 'A02V4L9HIELIDL';

  it('has their week 31 scorecard as the old app stored it', () => {
    const card = cards.find((c) => c.transporterId === id && c.week === '2026-W31');
    expect(card).toMatchObject({
      overallStanding: 'Platinum',
      overallScore: 98.39,
      packagesDelivered: 771,
      sourceFile: 'DSP_Overview_Dashboard_XXXX_XXX1_2026-W31.csv',
    });
  });

  it('has their week 33 delivery completion totals', () => {
    expect(dcrTotals.find((t) => t.transporterId === id && t.week === '2026-W33')).toMatchObject({
      packagesDispatched: 911,
      packagesDelivered: 910,
      packagesReturnedToStation: 1,
      rtsAllExempted: 1,
    });
  });

  it('has their three returned packages in weeks 39 and 40', () => {
    const events = dcrEvents.filter((e) => e.transporterId === id);
    expect(events.map((e) => [e.week, e.rtsCode])).toEqual([
      ['2026-W39', 'OBJECT MISSING'],
      ['2026-W40', 'ADDRESS NOT FOUND'],
      ['2026-W40', 'BUSINESS CLOSED'],
    ]);
  });
});
