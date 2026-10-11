// Test helper only: the saved data the old app had after importing every made-up file in
// packages/fixtures/performance, built with this package's own readers in the old harness's
// order (roster, thresholds, scorecards, POD, CDF, DSB, PSB, DCR, DCR totals, Safety), with the
// ids SQLite would have given the rows. Also reads the expected files the old app made.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DriverRecord, PerfData } from '../models';
import { parseAssociates } from '../importers/associates';
import { parseCdf } from '../importers/cdf';
import { parseDcr } from '../importers/dcr';
import { parseDcrTotals } from '../importers/dcrTotals';
import { parseDsb } from '../importers/dsb';
import { readPdfWords } from '../importers/pdfWords.node';
import { parsePodFiles, type PdfWords } from '../importers/pod';
import { parsePsb } from '../importers/psb';
import { parseSafety } from '../importers/safety';
import { parseScorecards } from '../importers/scorecards';
import { parseThresholds } from '../importers/thresholds';
import { fixtureFiles, numbered, ordinal } from '../importers/testkit';

const FIXTURES = new URL('../../../fixtures/performance/', import.meta.url);
const EXPECTED = new URL('../../../../scripts/parity/wpa/expected/', import.meta.url);

/** An expected file, parsed. */
export function readExpectedJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(path, EXPECTED)), 'utf8')) as T;
}

/** An expected file's raw bytes. */
export function readExpectedBytes(path: string): Buffer {
  return readFileSync(fileURLToPath(new URL(path, EXPECTED)));
}

/** The driver files the old app wrote (drivers/<id>.json), by Transporter ID. */
export function expectedDriverIds(): string[] {
  return readdirSync(fileURLToPath(new URL('drivers/', EXPECTED)))
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .sort(ordinal);
}

/** Objects with their keys sorted, all the way down (how the harness wrote JSON). */
export function normalise(value: unknown): unknown {
  const text = JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(v).sort(ordinal)) {
        sorted[key] = (v as Record<string, unknown>)[key];
      }
      return sorted;
    }
    return v;
  });
  return JSON.parse(text ?? 'null');
}

async function readPodFixtures(): Promise<PdfWords[]> {
  const folder = fileURLToPath(new URL('pod/', FIXTURES));
  const names = readdirSync(folder)
    .filter((name) => name.toLowerCase().endsWith('.pdf'))
    .sort(ordinal);
  const out: PdfWords[] = [];
  for (const fileName of names) {
    const bytes = new Uint8Array(readFileSync(fileURLToPath(new URL(`pod/${fileName}`, FIXTURES))));
    out.push({ fileName, pages: await readPdfWords(bytes) });
  }
  return out;
}

async function build(): Promise<PerfData> {
  const roster = parseAssociates(fixtureFiles('roster'));
  const thresholdFile = fixtureFiles('thresholds')[0];
  if (!thresholdFile) throw new Error('No made-up thresholds file');
  const thresholds = parseThresholds(thresholdFile);
  const scorecards = parseScorecards(
    fixtureFiles('scorecards'),
    roster.drivers.map((driver) => driver.transporterId),
  );

  // Drivers: the roster, then renamed and added to by the scorecards.
  const drivers = new Map<string, DriverRecord>();
  for (const driver of roster.drivers) drivers.set(driver.transporterId, { ...driver });
  for (const { transporterId, name } of scorecards.drivers) {
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

  // Scorecards and metrics with the ids SQLite gave them.
  const cards: PerfData['scorecards'] = [];
  const metrics: PerfData['metrics'] = [];
  for (const { metrics: cardMetrics, ...card } of numbered(scorecards.scorecards)) {
    cards.push(card);
    for (const metric of cardMetrics) {
      metrics.push({ id: metrics.length + 1, scorecardId: card.id, ...metric });
    }
  }

  const psb = parsePsb(fixtureFiles('psb'));
  return {
    drivers: [...drivers.values()],
    scorecards: cards,
    metrics,
    thresholds: thresholds.rows.map((row) => ({ ...row, importedAt: null })),
    pod: parsePodFiles(await readPodFixtures()).rows,
    cdf: parseCdf(fixtureFiles('cdf')).rows,
    dsb: parseDsb(fixtureFiles('dsb')).rows,
    psb: psb.rows,
    psbImportedWeeks: psb.importedWeeks.map((week) => ({ ...week, importedAt: null })),
    dcrEvents: numbered(parseDcr(fixtureFiles('dcr')).rows),
    dcrTotals: parseDcrTotals(fixtureFiles('dcr-totals')).rows,
    safetyEvents: numbered(parseSafety(fixtureFiles('safety')).rows),
  };
}

let cached: Promise<PerfData> | null = null;

/** The made-up data, built once per test run. */
export function loadFixtureData(): Promise<PerfData> {
  cached ??= build();
  return cached;
}
