import { beforeAll, describe, expect, it } from 'vitest';
import {
  getDriverReport,
  getPsbImportedWeeks,
  getThresholds,
  type DriverReportData,
  type PerfData,
  type ThresholdView,
} from '@loadout/performance';
import { loadFixtureData } from '../../../../../../packages/performance/src/analysis/fixtureData';
import { DEFAULT_REPORT_COLOURS } from '../../../shared/performanceSettings';
import { buildReportHtml, PAGE_NAMES, type ReportInput } from './html';
import { sampleReportHtml } from './sample';
import { firstLines, pageHtml, row, rows } from './testkit';

const FROM = '2026-W31';
const TO = '2026-W40';
const ARCHER = 'A02V4L9HIELIDL';
const DESMOND = 'A05QUB9XOW4NT1';
const WEEKS = Array.from({ length: 10 }, (_, i) => `2026-W${31 + i}`);

let data: PerfData;
let thresholds: ThresholdView[];

function input(id: string, overrides: Partial<ReportInput> = {}): ReportInput {
  const report = getDriverReport(data, id, FROM, TO);
  if (!report) throw new Error('driver missing from the made-up data');
  return {
    data: report,
    thresholds,
    colours: DEFAULT_REPORT_COLOURS,
    psbImportedWeeks: getPsbImportedWeeks(data, FROM, TO),
    ...overrides,
  };
}

beforeAll(async () => {
  data = await loadFixtureData();
  thresholds = getThresholds(data);
});

describe('buildReportHtml with the made-up drivers', () => {
  it('is one standalone document with every page of the old report, in order', () => {
    const html = buildReportHtml(input(ARCHER));
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toMatch(/<script|<link|<img|https?:\/\/(?!www\.w3\.org)/i);
    expect(html).toContain('@page { size: Letter');
    const pages = [...html.matchAll(/data-page="([^"]+)"/g)].map((m) => m[1]);
    expect(pages).toEqual([...PAGE_NAMES]);
    for (const heading of [
      'Overall Score Trend',
      'Legend',
      'Tier Thresholds — Overall',
      'Weekly Detail — Overall',
      'Tier Thresholds — Safety  (Netradyne Violations)',
      'Weekly Detail — Safety',
      'CED  (Customer Escalated Defect)',
      'CDF DPMO  (Customer Delivery Feedback)',
      'Sub-Reasons',
      'DSB  (Delivery Success Behaviors)',
      'What It Measures',
      'POD  (Photo On Delivery)',
      'PSB  (Pickup Success Behaviors)',
      'Programs Tracked',
      '1. Exemptions for Delivery Completion',
      '2. Best Practices for Delivery Completion',
      'Impact DC DPMO = Y Events  (3 total)',
    ]) {
      expect(html).toContain(heading);
    }
  });

  it('puts the name, Transporter ID and weeks at the top of every page', () => {
    const html = buildReportHtml(input(ARCHER));
    for (const name of PAGE_NAMES) {
      const page = pageHtml(html, name);
      expect(page).toContain('<h1>Archer Gresham</h1>');
      expect(page).toContain(`Transporter ID: ${ARCHER}`);
      expect(page).toContain(`Weeks: ${FROM}  to  ${TO}`);
    }
  });

  it('has a column per scorecard week in every week table', () => {
    const html = buildReportHtml(input(ARCHER));
    for (const name of ['summary', 'safety', 'cdf', 'dsb', 'pod', 'psb', 'dcr']) {
      const headers = rows(pageHtml(html, name)).filter((r) => r[1] === WEEKS[0]);
      expect(headers.length).toBeGreaterThan(0);
      for (const header of headers) expect(header.slice(1)).toEqual(WEEKS);
    }
  });

  it('shows the same page 1 numbers as the old PDF', () => {
    const page = pageHtml(buildReportHtml(input(ARCHER)), 'summary');
    expect(row(page, 'Overall Tier')).toEqual([...Array(9).fill('Platinum'), 'Gold']);
    expect(row(page, 'Overall Score')).toEqual(
      '98.4 99.1 99.2 99.4 99.5 100.0 100.0 100.0 96.3 93.6'.split(' '),
    );
    expect(row(page, 'Rank').slice(0, 3)).toEqual(['27 / 65', '22 / 65', '18 / 65']);
    expect(row(page, 'Packages')).toEqual([
      '771',
      '713',
      '910',
      '1091',
      '698',
      '1175',
      '907',
      '1180',
      '801',
      '814',
    ]);
    expect(row(page, 'Overall Score')).toHaveLength(10);
    expect(row(pageHtml(buildReportHtml(input(DESMOND)), 'summary'), 'Rank')[0]).toBe('49 / 65');
  });

  it('shows three-line metric cells like the old PDF', () => {
    const html = buildReportHtml(input(ARCHER));
    expect(row(pageHtml(html, 'safety'), 'Speeding Event Rate')[0]).toBe('0.0\n(100)\n[11.6]');
    expect(pageHtml(html, 'safety')).toContain('Lower is Better');
    const pod = row(pageHtml(html, 'pod'), 'POD');
    expect(pod[0]).toBe('99.3%\n(49)\n[3.2]');
    expect(firstLines(pod)).toEqual(
      '99.3% 99.6% 99.7% 99.8% 99.8% 100.0% 100.0% 100.0% 99.8% 100.0%'.split(' '),
    );
    const dcr = row(pageHtml(html, 'dcr'), 'Delivery Completion DPMO');
    expect(dcr[8]).toBe('1246.8\n(69)\n[10.5]');
    expect(dcr[9]).toBe('2439\n(39)\n[10.5]');
  });

  it('formats the POD and DCR counts like the old PDF', () => {
    const html = buildReportHtml(input(ARCHER));
    const pod = pageHtml(html, 'pod');
    expect(row(pod, 'Opportunities').slice(0, 3)).toEqual(['561', '540', '684']);
    expect(row(pod, 'Rejects').slice(0, 5)).toEqual(['4', '2', '2', '2', '1']);
    expect(row(pod, 'Acceptance %').slice(0, 6)).toEqual([
      '99.29%',
      '99.63%',
      '99.71%',
      '99.75%',
      '99.81%',
      '100.00%',
    ]);
    expect(row(pod, 'No Package Detected')).toEqual('2 2 0 0 0 0 0 0 1 0'.split(' '));

    const dcr = pageHtml(html, 'dcr');
    expect(row(dcr, 'Packages Dispatched')).toEqual(
      '771 713 911 1,093 699 1,175 907 1,181 802 820'.split(' '),
    );
    expect(row(dcr, 'Total RTS Events').slice(8)).toEqual(['1', '2']);
    expect(row(dcr, 'Impact DC DPMO (Y)').slice(8)).toEqual(['1', '2']);
    expect(row(dcr, 'RTS All Exempted')).toEqual('0 0 1 2 0 0 0 0 0 4'.split(' '));
    expect(row(dcr, 'W39')).toEqual([
      'Sep 22',
      'TBA563807769145',
      'OBJECT MISSING',
      'No Exemption Applied',
    ]);
    expect(row(dcr, 'W40')[3]).toBe('Made-up note for testing.');

    expect(pageHtml(buildReportHtml(input(DESMOND)), 'dcr')).toContain(
      'Impact DC DPMO = Y Events  (7 total)',
    );
  });

  it('paints counts above zero in the reject colours', () => {
    const pod = pageHtml(buildReportHtml(input(ARCHER)), 'pod');
    const rejectsRow = pod.match(/<tr[^>]*><td[^>]*>Rejects<\/td>[\s\S]*?<\/tr>/)?.[0] ?? '';
    expect(rejectsRow).toContain('class="bad" style="background:#FECACA;color:#991B1B');
    expect((rejectsRow.match(/class="bad"/g) ?? []).length).toBe(6);
  });

  it('shows dashes on the PSB page where the old PDF did', () => {
    const psb = pageHtml(buildReportHtml(input(DESMOND)), 'psb');
    const metric = row(psb, 'PSB');
    expect(metric[3]).toBe('0.00\n(100)\n[5]');
    expect(metric[0]).toBe('-\n \n ');
    expect(row(psb, 'Early Arrivals')).toEqual(Array(10).fill('-'));
    expect(psb).not.toContain('No data');
  });

  it('draws one chart point per scored week', () => {
    const html = buildReportHtml(input(ARCHER));
    const points = [...html.matchAll(/<circle class="pt" data-week="([^"]+)"/g)].map((m) => m[1]);
    expect(points).toEqual(WEEKS);
    expect(html).toContain('>98.4</text>');
    expect(html).toContain('class="band band-platinum"');
  });
});

// ---- made-up edge cases --------------------------------------------------------------------

function tinyReport(overrides: Partial<DriverReportData> = {}): DriverReportData {
  const card = (id: number, week: string, score: number | null) => ({
    id,
    transporterId: 'A047LNAN5VQIQR',
    week,
    overallStanding: score === null ? null : 'Gold',
    overallScore: score,
    packagesDelivered: 100,
    sourceFile: null,
    metrics: [],
  });
  return {
    transporterId: 'A047LNAN5VQIQR',
    name: 'Sample Driver',
    fromWeek: '2026-W01',
    toWeek: '2026-W03',
    scorecards: [card(1, '2026-W01', 90), card(2, '2026-W02', null), card(3, '2026-W03', 92.25)],
    ranks: {},
    pod: [],
    cdf: [],
    dsb: [],
    psb: [],
    dcrEvents: [],
    dcrTotals: [],
    ...overrides,
  };
}

function tinyInput(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    data: tinyReport(),
    thresholds: [],
    colours: DEFAULT_REPORT_COLOURS,
    psbImportedWeeks: [],
    ...overrides,
  };
}

const psbRow = (week: string, early: number) => ({
  transporterId: 'A047LNAN5VQIQR',
  week,
  name: 'Sample Driver',
  earlyArrivals: early,
  lateArrivals: 0,
  geoLocation: 0,
  notAttempted: 0,
  contactCompliance: 0,
  outOfReturnLabel: 0,
  pickedUpNotReturned: 0,
  sourceFile: null,
});

describe('buildReportHtml edge cases', () => {
  it('fills weeks with no POD, CDF or DSB rows with zeros (FillMissingWeeks)', () => {
    const html = buildReportHtml(tinyInput());
    const pod = pageHtml(html, 'pod');
    expect(row(pod, 'Opportunities')).toEqual(['0', '0', '0']);
    expect(row(pod, 'Acceptance %')).toEqual(['—', '—', '—']);
    expect(row(pod, 'Blurry Photo')).toEqual(['0', '0', '0']);
    expect(row(pageHtml(html, 'cdf'), 'DA Mishandled Package')).toEqual(['0', '0', '0']);
    expect(row(pageHtml(html, 'dsb'), 'Simultaneous Deliveries')).toEqual(['0', '0', '0']);
    expect(row(pageHtml(html, 'dcr'), 'Packages Dispatched')).toEqual(['—', '—', '—']);
    expect(html).toContain('No DC DPMO-impacting events in this range. Great work.');
    // No thresholds brought in: the legend lists the metrics instead.
    expect(html).toContain('Safety Metrics');
    expect(html).not.toContain('Tier Thresholds');
  });

  it('shows PSB counts only for weeks with a file the driver was in', () => {
    const html = buildReportHtml(
      tinyInput({
        data: tinyReport({ psb: [psbRow('2026-W01', 2), psbRow('2026-W03', 5)] }),
        psbImportedWeeks: ['2026-W01', '2026-W02'],
      }),
    );
    const psb = pageHtml(html, 'psb');
    // W01: file and driver -> the count; W02: file, driver absent -> dash; W03: no file -> dash.
    expect(row(psb, 'Early Arrivals')).toEqual(['2', '-', '-']);
    expect(row(psb, 'Late Arrivals')).toEqual(['0', '-', '-']);
  });

  it('escapes every value put into the page', () => {
    const html = buildReportHtml(tinyInput({ data: tinyReport({ name: 'Tom <b>&"Jr"</b>' }) }));
    expect(html).toContain('<h1>Tom &lt;b&gt;&amp;&quot;Jr&quot;&lt;/b&gt;</h1>');
    expect(html).not.toContain('<b>&');
  });

  it('prints black and white when colour is off', () => {
    const colours = { ...DEFAULT_REPORT_COLOURS, useColor: false };
    const html = buildReportHtml({ ...input(ARCHER), colours });
    for (const colour of ['#81DBED', '#E9DE63', '#AA4918', '#FECACA', '#E8E8E8', '#8B8B8B']) {
      expect(html).not.toContain(colour);
    }
    // (The DCR guide's own fixed colours stay, as in the old report.)
    expect(html).not.toContain('class="band');
    expect(html).toContain('class="bad" style="background:#FFFFFF;color:#000000');
    const summary = pageHtml(html, 'summary');
    expect(summary).toContain(
      '<td style="background:#FFFFFF;color:#000000;border-color:#000000">Platinum</td>',
    );
    expect(summary).toContain(
      '<th style="background:#FFFFFF;color:#000000;border-color:#000000">2026-W31</th>',
    );
  });

  it('uses the chosen colours when colour is on', () => {
    const colours = {
      ...DEFAULT_REPORT_COLOURS,
      goldBackground: '#123456',
      goldForeground: '#ABCDEF',
    };
    const html = buildReportHtml(tinyInput({ colours }));
    expect(html).toContain('background:#123456;color:#ABCDEF');
  });

  it('skips weeks with no Overall Score in the chart', () => {
    const html = buildReportHtml(tinyInput());
    const points = [...html.matchAll(/<circle class="pt" data-week="([^"]+)"/g)].map((m) => m[1]);
    expect(points).toEqual(['2026-W01', '2026-W03']);
    expect(html).toContain('>92.3</text>');
    expect(row(pageHtml(html, 'summary'), 'Overall Score')).toEqual(['90.0', '-', '92.3']);
  });

  it('works out a missing DCR tier from the DCR thresholds', () => {
    const dcrThreshold = thresholds.find((t) => t.metricName === 'DCR');
    expect(dcrThreshold).toBeDefined();
    const report = tinyReport();
    report.scorecards[0]!.metrics = [
      {
        id: 1,
        scorecardId: 1,
        metricName: 'DCR',
        metricValue: '1500',
        tier: null,
        score: 70,
        weightApplied: 10,
      },
    ];
    const html = buildReportHtml(tinyInput({ data: report, thresholds: [dcrThreshold!] }));
    const cell = pageHtml(html, 'dcr').match(/<td style="([^"]+)">1500<br>/)?.[1];
    expect(cell).toContain(`background:${DEFAULT_REPORT_COLOURS.silverBackground}`);
  });
});

describe('what the report holds and leaves out', () => {
  it('explains the three values in each cell, and why a return can show "No RTS Code Selected"', () => {
    const html = buildReportHtml(input(ARCHER));
    expect(pageHtml(html, 'summary')).toContain('Each data cell shows three values:');
    expect(html).toContain('"No RTS Code Selected"');
  });

  it('never lists safety events (they show on the Drivers tab only)', () => {
    const events = data.safetyEvents.filter((e) => e.transporterId === DESMOND);
    expect(events.length).toBeGreaterThan(0);
    const html = buildReportHtml(input(DESMOND));
    expect(html).not.toMatch(/video|program impact/i);
    for (const event of events) if (event.videoLink) expect(html).not.toContain(event.videoLink);
  });

  it('leaves out a metric with no data in any week, but always shows PSB', () => {
    const report = tinyReport();
    report.scorecards[0]!.metrics = [
      {
        id: 1,
        scorecardId: 1,
        metricName: 'Speeding Event Rate',
        metricValue: '0.1',
        tier: 'Gold',
        score: 90,
        weightApplied: 10,
      },
    ];
    const html = buildReportHtml(tinyInput({ data: report }));
    const safety = pageHtml(html, 'safety');
    expect(firstLines(row(safety, 'Speeding Event Rate'))).toEqual(['0.1', '-', '-']);
    expect(() => row(safety, 'Seatbelt-Off Rate')).toThrow();
    expect(() => row(safety, 'FICO')).toThrow();
    expect(firstLines(row(pageHtml(html, 'psb'), 'PSB'))).toEqual(['-', '-', '-']);
  });
});

describe('sampleReportHtml', () => {
  it('is page 1 only, for the made-up sample driver, in the given colours', () => {
    const html = sampleReportHtml({ ...DEFAULT_REPORT_COLOURS, platinumBackground: '#00FF00' });
    expect([...html.matchAll(/data-page="/g)]).toHaveLength(1);
    expect(html).toContain('<h1>Sample Driver</h1>');
    expect(html).toContain('background:#00FF00');
    expect(row(html, 'Overall Tier')).toEqual(['Platinum', 'Gold', 'Silver', 'Bronze']);
    expect([...html.matchAll(/<circle class="pt"/g)]).toHaveLength(4);
  });
});
