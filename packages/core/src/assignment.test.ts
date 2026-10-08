// Every expected value here was produced by running the old app's assignment.py on the same
// made-up drivers and vans (names and IDs from packages/fixtures/manifest.json).

import { describe, expect, it } from 'vitest';
import {
  BY_HAND,
  byMethod,
  candidateFamily,
  candidateNeededQualification,
  candidateServiceType,
  candidateTenure,
  eligible,
  looseCount,
  methodLabel,
  plan,
  preferredFamily,
  priorityOf,
  vanSortKey,
  whyNot,
  type AssignmentResult,
  type Candidate,
} from './assignment';
import { createAssociate } from './models/associates';
import { affinitySet, createVanAffinity } from './models/affinity';
import { createDriverRow } from './models/roster';
import { createVehicle } from './models/vehicles';

const RM = 'Standard Parcel Electric - Rivian MEDIUM';
const RS = 'Standard Parcel Electric - Rivian SMALL';
const SV = 'Standard Parcel Step Van - US';
const XL = 'Standard Parcel - Extra Large Van - US';
const NURSERY = 'Nursery Route Level 2 - Electric Vehicle';
const OTHER = 'DSP Initiated Work (Standard Vehicle)';

const V = [
  '1F61D2KP0L0W91839',
  '1F66B2RY9L0Y83576',
  '1F69F2MV9L0F55866',
  '1F69K4XU1L0J31668',
  '1F69L7CU2L0L97091',
  '1FTCD6J34RKF48095',
] as const;
const T = [
  'A047LNAN5VQIQR',
  'A083QLD1CI9YSZ',
  'A08Z3QTIYAI58G',
  'A0DZDWECHDJ5TO',
  'A0FU25U7H48VU2',
  'A0FXMBXTK81V4D',
] as const;
const OFF_TODAY = 'A0G8EUL2VJ2V9F';
const ALSO_OFF = 'A0IVCK2UTQ9OVR';

const vans = [
  createVehicle({
    vin: V[0],
    name: 'Step 1',
    serviceType: SV,
    serviceTier: 'STEP_VAN_MEDIUM',
    ownership: 'AMAZON_OWNED',
  }),
  createVehicle({
    vin: V[1],
    name: '619001',
    serviceType: RM,
    serviceTier: 'ELECTRIC_RPV_MEDIUM',
    ownership: 'AMAZON_OWNED',
  }),
  createVehicle({
    vin: V[2],
    name: '619002',
    serviceType: RM,
    serviceTier: 'ELECTRIC_RPV_MEDIUM',
    ownership: 'AMAZON_OWNED',
  }),
  createVehicle({
    vin: V[3],
    name: '619003',
    serviceType: RS,
    serviceTier: 'ELECTRIC_RPV_SMALL',
    ownership: 'AMAZON_OWNED',
  }),
  createVehicle({
    vin: V[4],
    name: '655071 (LMR)',
    serviceType: RM,
    serviceTier: 'ELECTRIC_RPV_MEDIUM',
    ownership: 'AMAZON_RENTAL',
  }),
  createVehicle({
    vin: V[5],
    name: 'XL 1',
    serviceType: XL,
    serviceTier: 'EXTRA_LARGE_CARGO_VAN',
    ownership: 'RENTAL',
  }),
];

const people = [
  createAssociate({
    name: 'Barrett Ainsworth',
    transporterId: T[0],
    qualifications: ['EDV'],
    tenure: 500,
  }),
  createAssociate({
    name: 'Ariana Nethercott',
    transporterId: T[1],
    qualifications: ['EDV'],
    tenure: 400,
  }),
  createAssociate({
    name: 'Archer Greta Underhill',
    transporterId: T[2],
    qualifications: ['EDV', 'Step Van'],
  }),
  createAssociate({
    name: 'Archer Camila Yardley',
    transporterId: T[3],
    qualifications: ['CDV'],
    tenure: 100,
  }),
  createAssociate({
    name: 'Ariana Isidro Bellamy',
    transporterId: T[4],
    qualifications: ['EDV'],
    tenure: 50,
  }),
  createAssociate({
    name: 'Barrett Hadley Ainsworth',
    transporterId: T[5],
    qualifications: ['EDV'],
    tenure: 50,
  }),
];

const row = (driver: string, serviceType: string, waveTime = '') =>
  createDriverRow({ driver, serviceType, waveTime });

function day(): Candidate[] {
  return [
    { row: row('Barrett Ainsworth', RM, '10:25am'), associate: people[0] ?? null },
    { row: row('Ariana Nethercott', RM, '10:45am'), associate: people[1] ?? null },
    { row: row('Archer Greta Underhill', NURSERY, '10:05am'), associate: people[2] ?? null },
    { row: row('Andre Abigail Birchfield', RM, '9:50am'), associate: null },
    { row: row('Archer Camila Yardley', RM, '10:25am'), associate: people[3] ?? null },
    { row: row('Ariana Isidro Bellamy', RM, '10:45am'), associate: people[4] ?? null },
    { row: row('Barrett Hadley Ainsworth', RM, '10:45am'), associate: people[5] ?? null },
  ];
}

function summary(result: AssignmentResult) {
  return {
    assignments: result.assignments.map((a) => [
      a.driver,
      a.vehicle ? a.vehicle.name : null,
      a.method,
      a.reason,
    ]),
    considered: result.considered,
    vansAvailable: result.vansAvailable,
    byMethod: Object.fromEntries(byMethod(result)),
    loose: looseCount(result),
  };
}

describe('plan', () => {
  it('works through affinity, last time, service type, family and qualification in that order', () => {
    const affinity = createVanAffinity();
    affinitySet(affinity, V[2], 'primary_1', T[0]);
    affinitySet(affinity, V[3], 'secondary_1', OFF_TODAY);
    const result = plan(
      day(),
      vans,
      affinity,
      new Set([T[4]]),
      new Map([[T[1], V[1]]]),
      new Map([
        [V[3], ' 5 '],
        [V[0], 'x'],
      ]),
    );
    expect(summary(result)).toEqual({
      assignments: [
        ['Barrett Ainsworth', '619002', 'affinity-primary', ''],
        ['Ariana Nethercott', '619001', 'previous-day', ''],
        ['Archer Greta Underhill', 'Step 1', 'qualified-only', ''],
        ['Andre Abigail Birchfield', null, 'none', 'No associate record - qualifications unknown'],
        ['Archer Camila Yardley', 'XL 1', 'qualified-only', ''],
        ['Ariana Isidro Bellamy', '655071 (LMR)', 'service-type', ''],
        ['Barrett Hadley Ainsworth', '619003', 'vehicle-family', ''],
      ],
      considered: 7,
      vansAvailable: 6,
      byMethod: {
        'affinity-primary': 1,
        'previous-day': 1,
        'qualified-only': 2,
        'service-type': 1,
        'vehicle-family': 1,
      },
      loose: 2,
    });
  });

  it('says so when there is no fleet at all', () => {
    expect(summary(plan(day().slice(0, 2), []))).toEqual({
      assignments: [
        ['Barrett Ainsworth', null, 'none', 'No van left in the fleet'],
        ['Ariana Nethercott', null, 'none', 'No van left in the fleet'],
      ],
      considered: 2,
      vansAvailable: 0,
      byMethod: {},
      loose: 0,
    });
  });

  it('leaves a van held by somebody in today until last', () => {
    const affinity = createVanAffinity();
    affinitySet(affinity, V[1], 'primary_1', T[1]);
    affinitySet(affinity, V[2], 'primary_2', ALSO_OFF);
    const candidates: Candidate[] = [
      { row: row('Barrett Ainsworth', RM, '10:25am'), associate: people[0] ?? null },
      { row: row('Ariana Nethercott', OTHER, '10:25am'), associate: people[1] ?? null },
    ];
    expect(summary(plan(candidates, vans.slice(1, 3), affinity))).toEqual({
      assignments: [
        ['Barrett Ainsworth', '619002', 'service-type', ''],
        ['Ariana Nethercott', '619001', 'qualified-only', ''],
      ],
      considered: 2,
      vansAvailable: 2,
      byMethod: { 'service-type': 1, 'qualified-only': 1 },
      loose: 1,
    });
  });

  it('lets priority beat the name order, and an unclaimed van beat a claimed one', () => {
    const candidates: Candidate[] = [
      { row: row('Barrett Ainsworth', RM), associate: people[0] ?? null },
    ];
    const pair = vans.slice(1, 3);
    expect(plan(candidates, pair).assignments[0]?.vehicle?.name).toBe('619001');
    expect(
      plan(candidates, pair, null, null, null, new Map([[V[2], '3']])).assignments[0]?.vehicle
        ?.name,
    ).toBe('619002');
    const affinity = createVanAffinity();
    affinitySet(affinity, V[1], 'secondary_2', ALSO_OFF);
    expect(plan(candidates, pair, affinity).assignments[0]?.vehicle?.name).toBe('619002');
  });
});

describe('whyNot', () => {
  const candidate: Candidate = {
    row: row('Barrett Hadley Ainsworth', RM, '10:45am'),
    associate: people[5] ?? null,
  };
  it('names the gate that closed', () => {
    expect(whyNot(candidate, vans, new Set(vans.map((v) => v.vin)), new Set())).toBe(
      'No van left in the fleet',
    );
    expect(whyNot(candidate, vans, new Set([V[1], V[2], V[3]]), new Set())).toBe(
      'Only LMR vans left, and not on the approved list',
    );
    expect(
      whyNot(
        candidate,
        [vans[4], vans[0]].flatMap((v) => (v ? [v] : [])),
        new Set(),
        new Set(),
      ),
    ).toBe('Only LMR vans left, and not on the approved list');
    const step = vans.slice(0, 1);
    expect(
      whyNot({ row: row('x', NURSERY), associate: people[3] ?? null }, step, new Set(), new Set()),
    ).toBe('Not EDV qualified for any free van');
    expect(
      whyNot({ row: row('x', OTHER), associate: people[3] ?? null }, step, new Set(), new Set()),
    ).toBe('Not the required skill qualified for any free van');
    expect(whyNot(candidate, vans, new Set(), new Set())).toBe('No van free');
  });
});

describe('the small rules', () => {
  it('reads a priority the way Python reads a float', () => {
    const read = (text: string) => priorityOf(new Map([['a', text]]), 'a');
    expect([' 7.5 ', '', 'x', '1_000', '-2', 'inf'].map(read)).toEqual([
      7.5,
      0,
      0,
      1000,
      -2,
      Infinity,
    ]);
    expect(priorityOf(new Map(), 'a')).toBe(0);
  });

  it('orders vans by kind, then name length, then name', () => {
    expect(vans.map(vanSortKey)).toEqual([
      [0, 6, 'step 1'],
      [1, 6, '619001'],
      [1, 6, '619002'],
      [1, 6, '619003'],
      [2, 12, '655071 (lmr)'],
      [1, 4, 'xl 1'],
    ]);
  });

  it('holds skill and the LMR list as hard gates', () => {
    const approved = new Set([T[4]]);
    const answers = people
      .slice(0, 5)
      .flatMap((associate) =>
        vans.map((v) => eligible({ row: row('x', RM), associate }, v, approved)),
      );
    expect(answers).toEqual([
      false,
      true,
      true,
      true,
      false,
      false,
      false,
      true,
      true,
      true,
      false,
      false,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it('reads the candidate off the route', () => {
    const candidate: Candidate = {
      row: row('Archer Greta Underhill', NURSERY),
      associate: people[2] ?? null,
    };
    expect([
      candidateFamily(candidate),
      candidateNeededQualification(candidate),
      candidateTenure(candidate),
      candidateServiceType(candidate),
    ]).toEqual(['electric', 'EDV', 0, NURSERY]);
    expect(preferredFamily(candidate, vans[3] ?? vans[0]!)).toBe(true);
    expect(preferredFamily(candidate, vans[0]!)).toBe(false);
    expect(preferredFamily({ row: row('y', ''), associate: null }, vans[0]!)).toBe(true);
  });

  it('words each method', () => {
    expect([BY_HAND, 'qualified-only', 'odd'].map(methodLabel)).toEqual([
      'given by hand',
      'qualification only',
      'odd',
    ]);
  });
});

describe('tenure and priority', () => {
  const v1 = vans[1]!;
  const v2 = vans[2]!;
  const step = vans[0]!;
  const who = (
    name: string,
    transporterId: string,
    tenure: number | null,
    serviceType = RM,
    waveTime = '',
  ): Candidate => ({
    row: row(name, serviceType, waveTime),
    associate: createAssociate({ name, transporterId, qualifications: ['EDV'], tenure }),
  });
  const show = (result: AssignmentResult) =>
    result.assignments.map((a) => [a.driver, a.vehicle ? a.vehicle.name : null, a.method]);
  const nine = new Map([[V[2], '9']]);

  it('lets the more experienced of two holders keep the van', () => {
    const affinity = createVanAffinity();
    affinitySet(affinity, V[1], 'primary_1', T[1]);
    affinitySet(affinity, V[1], 'primary_2', T[0]);
    const result = plan(
      [who('Ariana Nethercott', T[1], 100), who('Barrett Ainsworth', T[0], 300)],
      [v1, v2],
      affinity,
    );
    expect(show(result)).toEqual([
      ['Ariana Nethercott', '619002', 'service-type'],
      ['Barrett Ainsworth', '619001', 'affinity-primary'],
    ]);
  });

  it('puts the highest-priority van with the most experienced driver', () => {
    const result = plan(
      [
        who('Ariana Nethercott', T[1], 100, RM, '9:00am'),
        who('Barrett Ainsworth', T[0], 300, RM, '10:45am'),
      ],
      [v1, v2],
      null,
      null,
      null,
      nine,
    );
    expect(show(result)).toEqual([
      ['Ariana Nethercott', '619001', 'service-type'],
      ['Barrett Ainsworth', '619002', 'service-type'],
    ]);
  });

  it('never lets priority take a van off a driver who is in today', () => {
    const affinity = createVanAffinity();
    affinitySet(affinity, V[2], 'primary_1', T[1]);
    const result = plan(
      [who('Ariana Nethercott', T[1], 100, OTHER), who('Barrett Ainsworth', T[0], 300)],
      [v1, v2],
      affinity,
      null,
      null,
      nine,
    );
    expect(show(result)).toEqual([
      ['Ariana Nethercott', '619002', 'qualified-only'],
      ['Barrett Ainsworth', '619001', 'service-type'],
    ]);
  });

  it('never lets priority open a van the skill gate has closed', () => {
    const result = plan(
      [who('Barrett Ainsworth', T[0], 300, OTHER)],
      [v1, step],
      null,
      null,
      null,
      new Map([[V[0], '99']]),
    );
    expect(show(result)).toEqual([['Barrett Ainsworth', '619001', 'qualified-only']]);
  });

  it('reads an unknown count as brand new, and lets the clock decide a tie', () => {
    const unknown = plan(
      [
        who('Ariana Nethercott', T[1], null, RM, '9:00am'),
        who('Barrett Ainsworth', T[0], 1, RM, '11:00am'),
      ],
      [v1, v2],
      null,
      null,
      null,
      nine,
    );
    expect(show(unknown)).toEqual([
      ['Ariana Nethercott', '619001', 'service-type'],
      ['Barrett Ainsworth', '619002', 'service-type'],
    ]);
    const none = plan(
      [
        who('Ariana Nethercott', T[1], null, RM, '11:00am'),
        who('Barrett Ainsworth', T[0], null, RM, '9:00am'),
      ],
      [v1, v2],
      null,
      null,
      null,
      nine,
    );
    expect(show(none)).toEqual([
      ['Ariana Nethercott', '619001', 'service-type'],
      ['Barrett Ainsworth', '619002', 'service-type'],
    ]);
  });
});
