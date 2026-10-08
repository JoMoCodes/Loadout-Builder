// The Load Out page's own words and orderings, against the old page code they were ported from.
// Names are made-up ones from packages/fixtures/manifest.json.

import {
  createAssociate,
  createDriverRow,
  createDwpApplyResult,
  createRouteApplyResult,
  createRouteDataSet,
  createRouteEntry,
  createVehicle,
  type AssignmentResult,
  type DriverRow,
  type Vehicle,
} from '@loadout/core';
import { describe, expect, it } from 'vitest';
import type { AppSnapshot, RosterRowView, VehicleView } from '../../../shared/snapshot';
import {
  ALL_SHIFTS,
  applySummary,
  assignHeading,
  assignLines,
  assignSummary,
  availableEmpty,
  availableHeader,
  availableVanRow,
  describeSource,
  dwpDayProblem,
  dwpSummary,
  holdingText,
  importedAtLabel,
  linkCandidates,
  matchesShift,
  rosterHeader,
  routeTakers,
  shiftOptions,
  shortServiceType,
  vanChoices,
  vanTakers,
} from './rules';

function view(index: number, row: Partial<DriverRow>, extra: Partial<RosterRowView> = {}) {
  return {
    index,
    row: createDriverRow(row),
    match: { method: 'exact', ambiguous: false, candidates: [] },
    associateId: '',
    associateName: '',
    vanBadges: '',
    tenure: null,
    check: 'OK',
    assignMethodLabel: '',
    issues: [],
    ...extra,
  } as RosterRowView;
}

function snapshotWith(rows: RosterRowView[], extra: Partial<AppSnapshot> = {}): AppSnapshot {
  return {
    revision: 1,
    today: '2026-09-11',
    mode: 'demo',
    loadOutDate: '2026-09-11',
    roster: {
      sourceFile: 'C:\\sheets\\2026_09_11_loadout_sheet.xlsx',
      importedAt: null,
      routeSource: '',
      rows,
    },
    associates: [],
    vehicles: [],
    routeSets: [],
    dwp: {
      set: { rows: [], day: null, sourceFile: '', importedAt: null },
      matchedCount: 0,
      dayStatus: 'ok',
    },
    counts: { associates: 0, matched: 0, needReview: 0 },
    ...extra,
  } as unknown as AppSnapshot;
}

const STEP = 'Standard Parcel Step Van - US';
const ELECTRIC = 'Standard Parcel Electric - Rivian MEDIUM';

describe('the Roster header', () => {
  it('says nothing is loaded when the roster is empty', () => {
    expect(rosterHeader(snapshotWith([]))).toEqual({
      title: 'No roster loaded',
      source: '',
      count: '0 drivers',
      breakdown: '',
      anchor: '',
    });
  });

  it('names the day, the file, the shift mix, the vans, the source and the matching', () => {
    const rows = [
      view(0, { driver: 'Colton Alderman', shiftType: 'Call Out' }),
      view(1, {
        driver: 'Gideon Whitaker',
        shiftType: 'Electric Route',
        serviceType: ELECTRIC,
        vehicle: '51',
        pad: '1',
      }),
      view(2, { driver: 'Sabrina Woodbridge', shiftType: 'Electric Route', serviceType: ELECTRIC }),
    ];
    const header = rosterHeader(
      snapshotWith(rows, {
        roster: {
          sourceFile: 'C:\\sheets\\sheet.xlsx',
          importedAt: null,
          routeSource: 'routes',
          rows,
        },
        counts: { associates: 40, matched: 3, needReview: 1 } as AppSnapshot['counts'],
      }),
    );
    expect(header.title).toBe('Load Out - Friday, September 11 2026');
    expect(header.source).toBe('sheet.xlsx');
    expect(header.count).toBe('3 drivers');
    expect(header.breakdown).toBe(
      'Electric Route: 2   Call Out: 1    |    vans assigned: 1/2    |    route data: Routes (1 PADs)',
    );
    expect(header.anchor).toBe('3 of 3 drivers found in the driver list, 1 need review');
  });

  it('says when no associate data is in', () => {
    expect(rosterHeader(snapshotWith([view(0, { driver: 'Colton Alderman' })])).anchor).toBe(
      'No associate data imported',
    );
  });

  it('writes the import time the way the old app did', () => {
    expect(importedAtLabel(new Date(2026, 8, 11, 17, 37))).toBe('Sep 11, 2026 at 05:37 PM');
    expect(importedAtLabel(new Date(2026, 8, 1, 0, 5))).toBe('Sep 01, 2026 at 12:05 AM');
  });
});

describe('the shift filter', () => {
  it('lists every shift type in name order, after everyone, with blanks as (none)', () => {
    const rows = [
      view(0, { shiftType: 'Step Van Route' }),
      view(1, { shiftType: '' }),
      view(2, { shiftType: 'Call Out' }),
    ];
    expect(shiftOptions(rows)).toEqual([ALL_SHIFTS, '(none)', 'Call Out', 'Step Van Route']);
    expect(matchesShift(rows[1]!, '(none)')).toBe(true);
    expect(matchesShift(rows[0]!, 'Call Out')).toBe(false);
    expect(matchesShift(rows[0]!, ALL_SHIFTS)).toBe(true);
  });
});

describe('status lines', () => {
  it('says what route data brought over', () => {
    const result = createRouteApplyResult({
      kind: 'routes',
      filled: 29,
      dispatchTimes: 29,
      routeCodes: 29,
      serviceTypes: 29,
      pads: 0,
      notInExport: 9,
      noAssociate: 2,
    });
    expect(applySummary(result, 40)).toBe(
      'Brought over Routes to 29 of 40 drivers - 29 dispatch times, 29 routes, 29 service ' +
        'types, 0 PADs. 9 not in the export. 2 not found in the driver list.',
    );
    expect(applySummary(createRouteApplyResult({ kind: 'schedule' }), 40)).toBe(
      "Nothing to bring over from Weekly Schedule - none of the roster's drivers appear in it.",
    );
  });

  it('says what the DWP brought over, and how many it cleared', () => {
    expect(
      dwpSummary(
        createDwpApplyResult({
          filled: 20,
          staging: 20,
          bags: 19,
          ovs: 18,
          notInSheet: 3,
          cleared: 2,
        }),
      ),
    ).toBe(
      'DWP: 20 staging, 19 bags, 18 OVS onto 20 drivers. 3 without a match. 2 cleared - this ' +
        'sheet has nothing for the route they hold now.',
    );
    expect(dwpSummary(createDwpApplyResult({ noRouteCode: 40 }))).toBe(
      'No DWP data brought over - no driver has a route code to match on yet.',
    );
    expect(dwpSummary(createDwpApplyResult({ noRouteCode: 10, notInSheet: 30 }))).toBe(
      'No DWP data brought over - no route on the roster is in the DWP sheet.',
    );
  });

  it('says what Assign Vans did, and the read-out puts anyone not placed first', () => {
    const van = (name: string, serviceType = ELECTRIC) =>
      createVehicle({ name, vin: `VIN${name}`, serviceType });
    const result: AssignmentResult = {
      considered: 3,
      vansAvailable: 24,
      assignments: [
        { driver: 'Gideon Whitaker', vehicle: van('51'), method: 'affinity-primary', reason: '' },
        { driver: 'Colton Alderman', vehicle: van('52'), method: 'qualified-only', reason: '' },
        { driver: 'Sabrina Woodbridge', vehicle: null, method: 'none', reason: 'No van free' },
      ],
    };
    expect(assignSummary(result)).toBe(
      'Assigned 2 of 3 drivers from 24 operational vans. 1 on qualification only. 1 left without one.',
    );
    expect(assignHeading(result)).toEqual({
      title: '2 of 3 drivers have a van',
      summary: '1 by primary affinity, 1 by qualification only.  24 operational vans in the fleet.',
      loose: "1 took a van that isn't the service type their route asked for - amber below.",
    });
    expect(assignLines(result).map((l) => [l.driver, l.how, l.severity])).toEqual([
      ['Sabrina Woodbridge', 'not assigned', 'bad'],
      ['Colton Alderman', 'qualification only', 'warn'],
      ['Gideon Whitaker', 'primary affinity', ''],
    ]);
    expect(assignLines(result)[0]!.detail).toBe('No van free');
    expect(assignLines(result)[2]!.detail).toBe(`${ELECTRIC}  -  Branded Van`);
    expect(assignSummary({ considered: 4, vansAvailable: 0, assignments: [] })).toBe(
      'No vans assigned - none of the 4 drivers could be matched to a free van.',
    );
  });
});

describe('the pickers', () => {
  const rows = [
    view(0, { driver: 'Gideon Whitaker', routes: 'CX1', vehicle: '51' }),
    view(1, { driver: 'colton Alderman', routes: 'CX2' }),
    view(2, { driver: 'Sabrina Woodbridge' }),
    view(3, { driver: 'Nadine Abernathy', serviceType: ELECTRIC }),
    view(4, { driver: 'Carmen Abernathy', routes: 'CX4', vehicle: '52' }),
  ];

  it('lists drivers with no work first for a route, then everyone else by name', () => {
    expect(routeTakers(rows, rows[0]!).map((v) => v.index)).toEqual([2, 4, 1, 3]);
  });

  it('lists only drivers with a route for a van, those without a van first', () => {
    expect(vanTakers(rows, rows[0]!).map((v) => v.index)).toEqual([1, 4]);
  });

  it('says what each driver is holding', () => {
    expect(rows.map((v) => holdingText(v.row))).toEqual([
      'route + van',
      'a route',
      'free',
      'free',
      'route + van',
    ]);
  });

  it('lists every free van, best fit first, saying how it fits', () => {
    const associate = createAssociate({
      name: 'Gideon Whitaker',
      transporterId: 'A1E4CRQE9TMGKN',
      qualifications: ['EDV'],
    });
    const fleet: Vehicle[] = [
      createVehicle({ name: '70', vin: 'V70', serviceType: STEP }),
      createVehicle({
        name: '61',
        vin: 'V61',
        serviceType: 'Standard Parcel Electric - Rivian LARGE',
      }),
      createVehicle({ name: '60', vin: 'V60', serviceType: ELECTRIC }),
      createVehicle({ name: '80', vin: 'V80', serviceType: ELECTRIC, ownership: 'AMAZON_RENTAL' }),
    ];
    const row = createDriverRow({ driver: 'Gideon Whitaker', serviceType: ELECTRIC });
    expect(
      vanChoices(row, associate, fleet, new Set()).map((c) => [c.vehicle.name, c.fit]),
    ).toEqual([
      ['60', 'Matches the route'],
      ['61', 'Qualified, other service type'],
      ['80', 'Not approved for LMR'],
      ['70', 'Not Step Van qualified'],
    ]);
    expect(vanChoices(row, associate, fleet, new Set(['A1E4CRQE9TMGKN']))[1]!.fit).toBe(
      'Matches the route',
    );
    expect(
      vanChoices(row, null, fleet, new Set()).every(
        (c) => c.severity === 'bad' || c.vehicle.name === '80' || c.fit.startsWith('Not'),
      ),
    ).toBe(true);
  });

  it('puts suggestions first in the link window, then active people, and searches loosely', () => {
    const people = [
      createAssociate({ name: 'Carmen Abernathy', transporterId: 'A2', status: 'ACTIVE' }),
      createAssociate({ name: 'Nadine Abernathy', transporterId: 'Q7X', status: 'INACTIVE' }),
      createAssociate({ name: 'Colton Alderman', transporterId: 'A1', status: 'ACTIVE' }),
    ];
    expect(linkCandidates(people, new Set(['A1']), '').map((a) => a.transporterId)).toEqual([
      'A1',
      'A2',
      'Q7X',
    ]);
    expect(linkCandidates(people, new Set(), 'abernathy').map((a) => a.transporterId)).toEqual([
      'A2',
      'Q7X',
    ]);
    expect(linkCandidates(people, new Set(), 'q 7').map((a) => a.transporterId)).toEqual(['Q7X']);
  });
});

describe('bringing data over', () => {
  it('describes each route export in the source window', () => {
    const set = createRouteDataSet({
      kind: 'routes',
      rows: [
        createRouteEntry({ dispatchTime: '9:50am', routeCode: 'CX1', serviceType: ELECTRIC }),
        createRouteEntry({ dispatchTime: '10:20am', routeCode: 'CX2' }),
      ],
      pads: new Map([['9:50am', 1]]),
    });
    expect(describeSource(set)).toEqual([
      '2 rows  -  brings dispatch time, route code, service type, PAD',
      '9:50am -> PAD 1 (1)   10:20am -> no PAD yet (1)',
      'Some rows have no PAD - assign them on the Route Data page.',
    ]);
    // The schedule names no routes, so it brings only the time and the PAD.
    const schedule = createRouteDataSet({
      kind: 'schedule',
      rows: [createRouteEntry({ dispatchTime: '9:55am' })],
      pads: new Map([['9:55am', 2]]),
    });
    expect(describeSource(schedule)).toEqual([
      '1 rows  -  brings dispatch time, PAD',
      '9:55am -> PAD 2 (1)',
    ]);
  });

  it("asks about a DWP sheet that may be another day's", () => {
    const base = snapshotWith([]);
    expect(dwpDayProblem(base)).toBe('');
    const mismatch = {
      ...base,
      dwp: {
        ...base.dwp,
        dayStatus: 'mismatch',
        set: { ...base.dwp.set, day: '2026-09-17', sourceFile: 'D:\\DWP_DSP-XXXX_09-17-2026.xlsx' },
      },
    } as AppSnapshot;
    expect(dwpDayProblem(mismatch)).toBe(
      'DWP_DSP-XXXX_09-17-2026.xlsx is for Thursday, September 17 2026.\n\nThe roster is for Friday, September 11 2026.',
    );
    const unknown = { ...base, dwp: { ...base.dwp, dayStatus: 'unknown' } } as AppSnapshot;
    expect(dwpDayProblem(unknown)).toContain("Can't tell which day The DWP sheet is for");
  });
});

describe('Available Vans', () => {
  const fleet = (overrides: Partial<VehicleView>[]): VehicleView[] =>
    overrides.map((o, i) => ({
      vehicle: createVehicle({ name: String(50 + i), vin: `V${i}`, serviceType: ELECTRIC }),
      operational: true,
      overridden: false,
      priority: '',
      affinity: {},
      rental: false,
      inUse: false,
      available: true,
      ...o,
    }));

  it('shortens the service type the way the old header did', () => {
    expect(shortServiceType(ELECTRIC)).toBe('Electric - Rivian MEDIUM');
    expect(shortServiceType('')).toBe('(none)');
  });

  it('counts what is free, what is out, the mix, and the hand-assign-only vans', () => {
    const vans = fleet([
      {},
      { available: false, inUse: true },
      {
        vehicle: createVehicle({
          name: '90',
          vin: 'V9',
          serviceType: STEP,
          ownership: 'SELF_OWNED',
        }),
      },
      { operational: false, available: false },
    ]);
    expect(availableHeader(vans)).toEqual({
      count: '2 available',
      source: 'Operational vans nobody on the roster is holding. 1 of 3 are out.',
      mix: 'Electric - Rivian MEDIUM: 1   Step Van - US: 1',
      manual: '1 hand-assign only: 90',
    });
    expect(availableVanRow(vans[2]!, '2026-09-11').values.assign).toBe('Manual');
    expect(availableVanRow(vans[0]!, '2026-09-11').values.assign).toBe('Auto');
  });

  it('marks a registration that has run out or is about to', () => {
    const [van] = fleet([{}]);
    const expired = { ...van!, vehicle: { ...van!.vehicle, registrationExpiry: '2026-09-01' } };
    expect(availableVanRow(expired, '2026-09-11').values.registration).toBe(
      '2026-09-01  (expired)',
    );
    expect(availableVanRow(expired, '2026-09-11').severity).toBe('bad');
    const soon = { ...van!, vehicle: { ...van!.vehicle, registrationExpiry: '2026-09-21' } };
    expect(availableVanRow(soon, '2026-09-11').values.registration).toBe('2026-09-21  (10d left)');
    expect(availableVanRow(soon, '2026-09-11').severity).toBe('warn');
  });

  it('explains an empty list', () => {
    expect(availableEmpty([]).title).toBe('No vehicles loaded.');
    expect(availableEmpty(fleet([{ operational: false, available: false }])).title).toBe(
      'Every van in the fleet is grounded.',
    );
    expect(availableEmpty(fleet([{ available: false }])).title).toBe(
      'Every operational van is out with a driver.',
    );
  });
});
