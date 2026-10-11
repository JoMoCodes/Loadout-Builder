// The models and small rules, checked against cases worked out from the old C# code
// (Models.cs, WeekMath.cs, IdExpirationParser.cs).

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  classify,
  delta,
  effectiveStatus,
  formatWeek,
  hasVideoLink,
  impactsDcr,
  isSafetyEventCounted,
  METRIC_DEFINITIONS,
  MetricDefinitions,
  metricNameDisplay,
  normalizeThresholdMetricName,
  parseIdExpiration,
  podAcceptanceRate,
  slope,
  thresholdCategoryOf,
  thresholdTierFor,
  ThresholdMetricNames,
  tierRank,
  weekFromFileName,
} from '.';

describe('METRIC_DEFINITIONS', () => {
  it('has the 12 metrics in the old order', () => {
    expect(METRIC_DEFINITIONS.map((m) => m.name)).toEqual([
      'FICO',
      'Speeding Event Rate',
      'Seatbelt-Off Rate',
      'Distractions Rate',
      'Sign/Signal Violations Rate',
      'Following Distance Rate',
      'CDF DPMO',
      'CED',
      'DCR',
      'DSB',
      'POD',
      'PSB',
    ]);
    expect(MetricDefinitions.All).toBe(METRIC_DEFINITIONS);
  });

  it('keeps the exact header text, including the oddities', () => {
    const sign = METRIC_DEFINITIONS[4]!;
    expect(sign.valueCol).toBe('Sign/ Signal Violations Rate (per trip)');
    const dcr = METRIC_DEFINITIONS.find((m) => m.name === 'DCR')!;
    expect(dcr).toEqual({
      name: 'DCR',
      valueCol: 'Delivery Completion DPMO',
      tierCol: 'Delivery Completion DPMO Tier',
      scoreCol: 'Delivery Completion DPMO Score',
      weightCol: 'Delivery Completion DPMO Weight Applied',
      direction: 'Lower is Better',
    });
    expect(METRIC_DEFINITIONS.find((m) => m.name === 'DSB')!.tierCol).toBe('DSB DPMO Tier');
  });

  it('finds every one of its headers in the made-up scorecard files', () => {
    const folder = new URL('../../../fixtures/performance/scorecards/', import.meta.url);
    for (const name of readdirSync(fileURLToPath(folder))) {
      const firstLine = readFileSync(fileURLToPath(new URL(name, folder)), 'utf8').split(
        /\r?\n/,
      )[0]!;
      for (const metric of METRIC_DEFINITIONS) {
        for (const header of [metric.valueCol, metric.tierCol, metric.scoreCol, metric.weightCol]) {
          expect(firstLine.includes(header), `${name}: ${header}`).toBe(true);
        }
      }
    }
  });
});

describe('normalizeThresholdMetricName', () => {
  it.each([
    ['Overall Score', 'Overall Score'],
    ['  Overall Score  ', 'Overall Score'],
    ['Safe Driving Metric (FICO)', null],
    ['Seatbelt-Off Rate', 'Seatbelt-Off Rate'],
    ['Sign/Signal Violations Rate', 'Sign/Signal Violations Rate'],
    ['Customer Delivery Feedback (CDF DPMO) (CDF)', 'CDF DPMO'],
    ['Customer Escalations Defect (CED)', 'CED'],
    ['Delivery Completion Rate (DCR)', 'DCR'],
    ['Delivery Completion DPMO (DC_DPMO)', 'DCR'],
    ['Delivery Success Behaviors (DSB)', 'DSB'],
    ['POD Acceptance Rate (POD)', 'POD'],
    ['Pickup Success Behaviors (PSB)', 'PSB'],
    ['overall score', null],
    ['Something New', null],
    ['', null],
  ])('%j -> %j', (raw, expected) => {
    expect(normalizeThresholdMetricName(raw)).toBe(expected);
    expect(ThresholdMetricNames.normalize(raw)).toBe(expected);
  });

  it('treats a missing name as unknown', () => {
    expect(normalizeThresholdMetricName(null)).toBeNull();
  });

  it('groups names for the legend', () => {
    expect(thresholdCategoryOf('Overall Score')).toBe('Overall');
    expect(thresholdCategoryOf('Distractions Rate')).toBe('Safety');
    expect(thresholdCategoryOf('CDF DPMO')).toBe('Quality');
    expect(metricNameDisplay('DCR')).toBe('Delivery Completion DPMO');
    expect(metricNameDisplay('POD')).toBe('POD');
  });
});

describe('the week rules', () => {
  it('zero-pads the week', () => {
    expect(formatWeek(2026, 7)).toBe('2026-W07');
    expect(formatWeek('2026', 20)).toBe('2026-W20');
  });

  it.each([
    ['DSP_Customer_Delivery_Feedback_negative_XXX1_2026-W31.csv', false, '2026-W31'],
    ['DSP_Pickup_Failures_XXXX_XXX1_2026-W3.csv', false, '2026-W03'],
    ['Quality_RTS_XXXX_XXX1_2026W24.csv', false, null],
    ['Quality_RTS_XXXX_XXX1_2026W24.csv', true, '2026-W24'],
    ['Quality_RTS_XXXX_XXX1_2026-W7.csv', true, '2026-W07'],
    ['AssociateData.csv', true, null],
  ])('%s (no hyphen allowed: %s) -> %j', (name, hyphenOptional, expected) => {
    expect(weekFromFileName(name, hyphenOptional)).toBe(expected);
  });
});

describe('WeekMath', () => {
  it('ranks tiers', () => {
    expect(['Platinum', 'Gold', 'Silver', 'Bronze', 'platinum', '', null].map(tierRank)).toEqual([
      4, 3, 2, 1, 0, 0, 0,
    ]);
  });

  it('works out the least-squares slope', () => {
    expect(slope([])).toBeNull();
    expect(slope([90])).toBeNull();
    expect(slope([90, 92])).toBe(2);
    expect(slope([1, 2, 3, 4])).toBe(1);
    expect(slope([95, 90, 85])).toBe(-5);
    expect(slope([80, 90, 80, 90])).toBeCloseTo(2, 10);
  });

  it('classifies a slope with a dead band of half a point', () => {
    expect(classify(null)).toBe('Flat');
    expect(classify(0.5)).toBe('Flat');
    expect(classify(0.51)).toBe('Improving');
    expect(classify(-0.5)).toBe('Flat');
    expect(classify(-0.51)).toBe('Declining');
    expect(classify(1, 2)).toBe('Flat');
  });

  it('gives a change only when both sides are there', () => {
    expect(delta(90, 95.5)).toBe(5.5);
    expect(delta(null, 95)).toBeNull();
    expect(delta(90, null)).toBeNull();
  });
});

describe('parseIdExpiration', () => {
  it.each([
    ['2031-03-24', '2031-03-24'],
    [' 2031-03-24 ', '2031-03-24'],
    ['2031/3/4', '2031-03-04'],
    ['2031-03-24T00:00:00', '2031-03-24'],
    ['2031-03-24 10:30 PM', '2031-03-24'],
    ['3/24/2031', '2031-03-24'],
    ['03/24/2031', '2031-03-24'],
    ['3/24/31', '2031-03-24'],
    ['3/24/75', '1975-03-24'],
    ['3/24/49', '2049-03-24'],
    ['3/24/50', '1950-03-24'],
    ['24-Mar-2031', '2031-03-24'],
    ['4-mar-2031', '2031-03-04'],
    ['24 March 2031', '2031-03-24'],
    ['Mar 24, 2031', '2031-03-24'],
    ['March 24, 2031', '2031-03-24'],
    ['2/29/2028', '2028-02-29'],
  ])('reads %j as %s', (raw, expected) => {
    expect(parseIdExpiration(raw)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    '',
    '   ',
    'n/a',
    'unknown',
    '2/29/2027',
    '13/01/2031',
    '2031-02-30',
    'Smarch 3, 2031',
  ])('treats %j as unknown', (raw) => {
    expect(parseIdExpiration(raw)).toBeNull();
  });
});

describe('the small record rules', () => {
  it('reads a blank status as OFFBOARDED', () => {
    expect(effectiveStatus({ status: null })).toBe('OFFBOARDED');
    expect(effectiveStatus({ status: '  ' })).toBe('OFFBOARDED');
    expect(effectiveStatus({ status: ' active ' })).toBe('ACTIVE');
  });

  it('counts a safety event unless its Program Impact is blank or "None"', () => {
    expect(isSafetyEventCounted({ programImpact: 'Scorecard, ORCAS' })).toBe(true);
    expect(isSafetyEventCounted({ programImpact: ' none ' })).toBe(false);
    expect(isSafetyEventCounted({ programImpact: '' })).toBe(false);
    expect(isSafetyEventCounted({ programImpact: null })).toBe(false);
  });

  it('knows a video link from a blank one', () => {
    expect(hasVideoLink({ videoLink: 'https://example.com/video/000009' })).toBe(true);
    expect(hasVideoLink({ videoLink: ' HTTP://example.com ' })).toBe(true);
    expect(hasVideoLink({ videoLink: 'n/a' })).toBe(false);
    expect(hasVideoLink({ videoLink: null })).toBe(false);
  });

  it('reads Impact DCR "Y" either case', () => {
    expect(impactsDcr({ impactDcr: 'y' })).toBe(true);
    expect(impactsDcr({ impactDcr: 'N' })).toBe(false);
  });

  it('works out the POD acceptance rate', () => {
    expect(podAcceptanceRate({ opportunities: 617, success: 616, bypass: 0 })).toBeCloseTo(
      99.83792544570503,
      12,
    );
    expect(podAcceptanceRate({ opportunities: 0, success: 0, bypass: 0 })).toBeNull();
  });

  it('puts a value in its tier from a lower-is-better threshold row', () => {
    const dsb = {
      indicator: 'NEGATIVE',
      platinumThreshold: 0,
      goldThreshold: 233,
      silverThreshold: 450,
      bronzeThreshold: 750,
    };
    expect(thresholdTierFor(dsb, 0)).toBe('Platinum');
    expect(thresholdTierFor(dsb, 233)).toBe('Gold');
    expect(thresholdTierFor(dsb, 451)).toBe('Bronze');
    expect(thresholdTierFor(dsb, 2198)).toBe('Bronze');
    expect(thresholdTierFor({ ...dsb, indicator: 'POSITIVE' }, 1)).toBeNull();
    expect(
      thresholdTierFor(
        {
          indicator: 'NEGATIVE',
          platinumThreshold: null,
          goldThreshold: null,
          silverThreshold: null,
          bronzeThreshold: null,
        },
        1,
      ),
    ).toBeNull();
  });
});
