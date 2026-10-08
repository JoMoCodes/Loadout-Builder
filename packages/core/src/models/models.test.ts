// Model records and their helpers. Expected answers come from the old Python models run on the
// same inputs (dates are fixed so the answers do not depend on the day the tests run).

import { describe, expect, it } from 'vitest';
import {
  activeCount,
  byTransporterId,
  canDriveEdv,
  canDriveStepVan,
  createAssociate,
  createAssociateBook,
  daysUntilIdExpiry,
  idState,
  isActive,
  isDotCertified,
  missingForShift,
  qualificationCounts,
  qualificationVocabulary,
  qualificationsLabel,
  tenureCount,
  tenureLabel,
  tenureRoutes,
  vanBadges,
} from './associates';
import {
  longDateLabel,
  daysBetween,
  makeDate,
  parseDateFormats,
  strptimeDate,
  todayDate,
} from './dates';
import {
  byRouteCode,
  createDwpApplyResult,
  createDwpDataSet,
  createDwpEntry,
  duplicateCodes,
  dwpDateLabel,
  dwpSkipped,
  routeKey,
} from './dwp';
import {
  createRoster,
  createDriverRow,
  isRosterEmpty,
  rosterDateLabel,
  shiftTypeCounts,
} from './roster';
import {
  createRouteApplyResult,
  createRouteDataSet,
  createRouteEntry,
  driverOptions,
  hasRouteCodes,
  hasServiceTypes,
  heldPads,
  isShared,
  padCounts,
  padFor,
  routeApplyLabel,
  routeApplySkipped,
  routeDataDateLabel,
  routeDataLabel,
  sharedRows,
  totalMismatch,
  unassignedTimes,
  workload,
} from './routes';
import {
  createTenureBook,
  newestWeek,
  tenureCountFor,
  tenureStamp,
  weekLabel,
  isNewerStamp,
} from './tenure';
import {
  byName,
  byVin,
  canRun,
  canServe,
  category,
  createVehicle,
  createVehicleFleet,
  daysUntilRegistrationExpiry,
  isRental,
  isStepVan,
  makeModel,
  manualOnly,
  orderRank,
  registrationState,
  serviceTypeCounts,
  serviceTypeVocabulary,
  vehicleFamily,
  vehicleRequiredQualification,
} from './vehicles';
import {
  affinityClear,
  affinityDrivers,
  affinityForVehicle,
  affinityGet,
  affinitySet,
  affinitySize,
  createVanAffinity,
  heldBy,
  isAffinityEmpty,
  slotKind,
  vehicleOf,
} from './affinity';

const TODAY = '2026-09-01';
const sorted = <K, V>(map: Map<K, V>) =>
  [...map.entries()].sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1));

const ASSOCIATES = [
  {
    qualifications: [],
    idExpiration: null,
    badges: '',
    label: '',
    edv: false,
    step: false,
    dot: false,
    days: null,
    state: 'unknown',
    missingElectric: ['EDV'],
    missingStep: ['Step Van'],
    missingOther: [],
    tenureRoutes: 0,
    tenureLabel: '',
    active: true,
  },
  {
    qualifications: ['CDV', 'EDV', 'Step Van', 'DOT'],
    idExpiration: '2026-08-31',
    badges: 'CDV EDV SV DOT',
    label: 'CDV, EDV, Step Van, DOT',
    edv: true,
    step: true,
    dot: true,
    days: -1,
    state: 'expired',
    missingElectric: [],
    missingStep: [],
    missingOther: [],
    tenureRoutes: 12,
    tenureLabel: '12',
    active: true,
  },
  {
    qualifications: ['edv '],
    idExpiration: '2026-09-01',
    badges: 'EDV',
    label: 'edv ',
    edv: true,
    step: false,
    dot: false,
    days: 0,
    state: 'expiring',
    missingElectric: [],
    missingStep: ['Step Van'],
    missingOther: [],
    tenureRoutes: 12,
    tenureLabel: '12',
    active: true,
  },
  {
    qualifications: ['Standard Parcel'],
    idExpiration: '2026-10-16',
    badges: '',
    label: 'Standard Parcel',
    edv: false,
    step: false,
    dot: false,
    days: 45,
    state: 'expiring',
    missingElectric: ['EDV'],
    missingStep: ['Step Van'],
    missingOther: [],
    tenureRoutes: 12,
    tenureLabel: '12',
    active: true,
  },
  {
    qualifications: ['Step Van', 'DOT'],
    idExpiration: '2026-10-17',
    badges: 'SV DOT',
    label: 'Step Van, DOT',
    edv: false,
    step: true,
    dot: true,
    days: 46,
    state: 'ok',
    missingElectric: ['EDV'],
    missingStep: [],
    missingOther: [],
    tenureRoutes: 12,
    tenureLabel: '12',
    active: true,
  },
  {
    qualifications: ['EDV'],
    idExpiration: '2027-02-28',
    badges: 'EDV',
    label: 'EDV',
    edv: true,
    step: false,
    dot: false,
    days: 180,
    state: 'ok',
    missingElectric: [],
    missingStep: ['Step Van'],
    missingOther: [],
    tenureRoutes: 12,
    tenureLabel: '12',
    active: true,
  },
];

describe('associates', () => {
  it.each(ASSOCIATES)('reads the record of %j', (expected) => {
    const associate = createAssociate({
      qualifications: expected.qualifications,
      idExpiration: expected.idExpiration,
      tenure: expected.qualifications.length === 0 ? null : 12,
      status: ' active ',
    });
    expect(vanBadges(associate)).toBe(expected.badges);
    expect(qualificationsLabel(associate)).toBe(expected.label);
    expect(canDriveEdv(associate)).toBe(expected.edv);
    expect(canDriveStepVan(associate)).toBe(expected.step);
    expect(isDotCertified(associate)).toBe(expected.dot);
    expect(daysUntilIdExpiry(associate, TODAY)).toBe(expected.days);
    expect(idState(associate, TODAY)).toBe(expected.state);
    expect(missingForShift(associate, 'Electric Route')).toEqual(expected.missingElectric);
    expect(missingForShift(associate, 'Step Van Route')).toEqual(expected.missingStep);
    expect(missingForShift(associate, 'Call Out')).toEqual(expected.missingOther);
    expect(tenureRoutes(associate)).toBe(expected.tenureRoutes);
    expect(tenureLabel(associate)).toBe(expected.tenureLabel);
    expect(isActive(associate)).toBe(expected.active);
  });

  it('counts and indexes a book', () => {
    const expected = {
      active: 2,
      tenure: 2,
      counts: [
        ['CDV', 1],
        ['EDV', 2],
        ['Step Van', 1],
      ],
      vocabulary: ['CDV', 'EDV', 'Step Van'],
      byId: [
        ['T1', 'D'],
        ['T2', 'B'],
      ],
    };
    const book = createAssociateBook({
      rows: [
        createAssociate({
          name: 'A',
          transporterId: 'T1',
          qualifications: ['EDV', 'CDV'],
          status: 'ACTIVE',
          tenure: 5,
        }),
        createAssociate({
          name: 'B',
          transporterId: 'T2',
          qualifications: ['EDV'],
          status: 'Inactive',
        }),
        createAssociate({
          name: 'C',
          transporterId: '',
          qualifications: ['Step Van'],
          status: 'active',
          tenure: 0,
        }),
        createAssociate({ name: 'D', transporterId: 'T1', qualifications: [], status: '' }),
      ],
    });
    expect(activeCount(book)).toBe(expected.active);
    expect(tenureCount(book)).toBe(expected.tenure);
    expect(sorted(qualificationCounts(book))).toEqual(expected.counts);
    expect(qualificationVocabulary(book)).toEqual(expected.vocabulary);
    expect(sorted(new Map([...byTransporterId(book)].map(([id, a]) => [id, a.name])))).toEqual(
      expected.byId,
    );
  });
});

const VEHICLES = [
  {
    serviceType: 'Standard Parcel Step Van - US',
    serviceTier: 'STEP_VAN_MEDIUM',
    ownership: 'AMAZON_OWNED',
    category: 'Step Van',
    rank: 0,
    step: true,
    rental: false,
    manual: false,
    family: 'step van',
    qualification: 'Step Van',
    canRun: [false, true, true, false],
    canServe: [false, true, true, false, false, false],
  },
  {
    serviceType: 'Standard Parcel Electric - Rivian MEDIUM',
    serviceTier: 'electric_rpv_medium',
    ownership: 'amazon_rental',
    category: 'Rental Van',
    rank: 2,
    step: false,
    rental: true,
    manual: false,
    family: 'electric',
    qualification: 'EDV',
    canRun: [false, true, false, false],
    canServe: [false, true, false, true, false, false],
  },
  {
    serviceType: 'Standard Parcel - Large Van',
    serviceTier: '',
    ownership: 'SELF_OWNED',
    category: 'Branded Van',
    rank: 1,
    step: false,
    rental: false,
    manual: true,
    family: 'large van',
    qualification: 'CDV',
    canRun: [false, true, false, false],
    canServe: [false, true, false, false, true, false],
  },
  {
    serviceType: 'Nursery Route Level 2 - Electric Vehicle',
    serviceTier: 'ELECTRIC_RPV_SMALL',
    ownership: 'AMAZON_OWNED',
    category: 'Branded Van',
    rank: 1,
    step: false,
    rental: false,
    manual: false,
    family: 'electric',
    qualification: 'EDV',
    canRun: [false, true, false, false],
    canServe: [false, true, false, true, false, false],
  },
  {
    serviceType: 'Standard Parcel - Cargo',
    serviceTier: 'LARGE_CARGO_VAN',
    ownership: '',
    category: 'Branded Van',
    rank: 1,
    step: false,
    rental: false,
    manual: false,
    family: 'large van',
    qualification: 'CDV',
    canRun: [false, true, false, false],
    canServe: [false, true, false, false, true, false],
  },
  {
    serviceType: 'Mystery',
    serviceTier: 'UNKNOWN',
    ownership: 'x',
    category: 'Branded Van',
    rank: 1,
    step: false,
    rental: false,
    manual: false,
    family: '',
    qualification: '',
    canRun: [false, true, false, false],
    canServe: [false, true, false, false, false, false],
  },
  {
    serviceType: 'Electric thing',
    serviceTier: '',
    ownership: 'AMAZON_RENTAL',
    category: 'Rental Van',
    rank: 2,
    step: false,
    rental: true,
    manual: false,
    family: 'electric',
    qualification: 'EDV',
    canRun: [false, true, false, false],
    canServe: [false, true, false, true, false, false],
  },
  {
    serviceType: '',
    serviceTier: '',
    ownership: '',
    category: 'Branded Van',
    rank: 1,
    step: false,
    rental: false,
    manual: false,
    family: '',
    qualification: '',
    canRun: [false, false, false, false],
    canServe: [false, false, false, false, false, false],
  },
];

describe('vehicles', () => {
  it.each(VEHICLES)('reads the van %j', (expected) => {
    const van = createVehicle({
      serviceType: expected.serviceType,
      serviceTier: expected.serviceTier,
      ownership: expected.ownership,
      make: 'Rivian',
      model: 'EDV 700',
    });
    expect(category(van)).toBe(expected.category);
    expect(orderRank(van)).toBe(expected.rank);
    expect(isStepVan(van)).toBe(expected.step);
    expect(isRental(van)).toBe(expected.rental);
    expect(manualOnly(van)).toBe(expected.manual);
    expect(vehicleFamily(van)).toBe(expected.family);
    expect(vehicleRequiredQualification(van)).toBe(expected.qualification);
    expect(makeModel(van)).toBe('Rivian EDV 700');
    const asked = [expected.serviceType, 'Standard Parcel Step Van - US', 'Some Electric Route'];
    expect(['', ...asked].map((text) => canRun(van, text))).toEqual(expected.canRun);
    expect(['', ...asked, 'Large Van Route', 'Unknown'].map((text) => canServe(van, text))).toEqual(
      expected.canServe,
    );
  });

  it.each([
    [null, null, 'unknown'],
    ['2026-08-31', -1, 'expired'],
    ['2026-09-01', 0, 'expiring'],
    ['2026-10-16', 45, 'expiring'],
    ['2026-10-17', 46, 'ok'],
  ] as Array<[string | null, number | null, string]>)(
    'registration expiring %j',
    (registrationExpiry, days, state) => {
      const van = createVehicle({ registrationExpiry });
      expect(daysUntilRegistrationExpiry(van, TODAY)).toBe(days);
      expect(registrationState(van, TODAY)).toBe(state);
    },
  );

  it('indexes and counts a fleet', () => {
    const expected = {
      byVin: [
        ['V1', '3'],
        ['V4', ''],
      ],
      byName: [
        ['1', 'V1'],
        ['2', ''],
        ['3', 'V1'],
      ],
      counts: [
        ['(none)', 1],
        ['Electric', 1],
        ['Step Van', 2],
      ],
      vocabulary: ['(none)', 'Electric', 'Step Van'],
      makeModel: ['Rivian EDV', 'Rivian', ''],
    };
    const fleet = createVehicleFleet({
      rows: [
        createVehicle({ vin: 'V1', name: '1', serviceType: 'Step Van' }),
        createVehicle({ vin: '', name: '2', serviceType: '' }),
        createVehicle({ vin: 'V1', name: '3', serviceType: 'Step Van' }),
        createVehicle({ vin: 'V4', name: '', serviceType: 'Electric' }),
      ],
    });
    expect(sorted(new Map([...byVin(fleet)].map(([vin, van]) => [vin, van.name])))).toEqual(
      expected.byVin,
    );
    expect(sorted(new Map([...byName(fleet)].map(([name, van]) => [name, van.vin])))).toEqual(
      expected.byName,
    );
    expect(sorted(serviceTypeCounts(fleet))).toEqual(expected.counts);
    expect(serviceTypeVocabulary(fleet)).toEqual(expected.vocabulary);
    expect([
      makeModel(createVehicle({ make: 'Rivian', model: 'EDV' })),
      makeModel(createVehicle({ make: 'Rivian' })),
      makeModel(createVehicle()),
    ]).toEqual(expected.makeModel);
  });
});

const ENTRIES = [
  {
    sharedDrivers: '',
    sharedIds: '',
    driverName: '',
    transporterId: '',
    routeCode: '',
    serviceType: '',
    options: [],
    shared: false,
    workload: '',
  },
  {
    sharedDrivers: '',
    sharedIds: '',
    driverName: 'Carmen Abernathy',
    transporterId: 'T001',
    routeCode: '',
    serviceType: '',
    options: [['Carmen Abernathy', 'T001']],
    shared: false,
    workload: '',
  },
  {
    sharedDrivers: 'Carmen Abernathy|Nadine Abernathy',
    sharedIds: 'T001|T002',
    driverName: 'Carmen Abernathy',
    transporterId: 'T001',
    routeCode: '',
    serviceType: '',
    options: [
      ['Carmen Abernathy', 'T001'],
      ['Nadine Abernathy', 'T002'],
    ],
    shared: true,
    workload: '',
  },
  {
    sharedDrivers: 'Carmen Abernathy|',
    sharedIds: 'T001|T002',
    driverName: '',
    transporterId: '',
    routeCode: '',
    serviceType: '',
    options: [
      ['Carmen Abernathy', 'T001'],
      ['', 'T002'],
    ],
    shared: true,
    workload: '',
  },
  {
    sharedDrivers: '|Nadine Abernathy',
    sharedIds: '|T002',
    driverName: '',
    transporterId: '',
    routeCode: '',
    serviceType: '',
    options: [['Nadine Abernathy', 'T002']],
    shared: false,
    workload: '',
  },
  {
    sharedDrivers: ' Carmen Abernathy | ',
    sharedIds: ' T001 ',
    driverName: '',
    transporterId: '',
    routeCode: '',
    serviceType: '',
    options: [['Carmen Abernathy', 'T001']],
    shared: false,
    workload: '',
  },
  {
    sharedDrivers: '',
    sharedIds: 'T009',
    driverName: '',
    transporterId: '',
    routeCode: '',
    serviceType: '',
    options: [['', 'T009']],
    shared: false,
    workload: '',
  },
  {
    sharedDrivers: '',
    sharedIds: '',
    driverName: '',
    transporterId: '',
    routeCode: 'CX1',
    serviceType: 'Svc',
    options: [],
    shared: false,
    workload: 'CX1',
  },
  {
    sharedDrivers: '',
    sharedIds: '',
    driverName: '',
    transporterId: '',
    routeCode: '',
    serviceType: 'Svc',
    options: [],
    shared: false,
    workload: 'Svc',
  },
];

describe('route entries', () => {
  it.each(ENTRIES)('reads the entry %j', (expected) => {
    const entry = createRouteEntry({
      sharedDrivers: expected.sharedDrivers,
      sharedIds: expected.sharedIds,
      driverName: expected.driverName,
      transporterId: expected.transporterId,
      routeCode: expected.routeCode,
      serviceType: expected.serviceType,
    });
    expect(driverOptions(entry)).toEqual(expected.options);
    expect(isShared(entry)).toBe(expected.shared);
    expect(workload(entry)).toBe(expected.workload);
  });
});

describe('route data sets', () => {
  it('works out PADs, shared rows and the headcount', () => {
    const expected = {
      pads: {
        '10:20am': 2,
        '9:50am': 1,
      },
      padFor: [1, 2, 1, 3, 2, null, null],
      held: 4,
      codes: true,
      types: true,
      unassigned: ['11:00am', ''],
      padCounts: [
        [1, 2],
        [2, 2],
        [3, 1],
      ],
      sharedCount: 1,
      mismatch: 9,
      label: 'Itineraries',
      dateLabel: 'Tuesday, September 01 2026',
      otherLabel: 'weird',
      otherMismatch: null,
      noDay: 'Unknown date',
    };
    const rows = [
      createRouteEntry({ dispatchTime: '10:20am', pad: '1' }),
      createRouteEntry({ dispatchTime: '10:20am' }),
      createRouteEntry({ dispatchTime: '9:50am' }),
      createRouteEntry({ dispatchTime: '9:50am', pad: '3' }),
      createRouteEntry({ dispatchTime: '', pad: '2' }),
      createRouteEntry({ dispatchTime: '', pad: 'x' }),
      createRouteEntry({
        dispatchTime: '11:00am',
        routeCode: 'CX1',
        serviceType: 'Svc',
        sharedDrivers: 'A B|C D',
        sharedIds: '1|2',
      }),
    ];
    const dataSet = createRouteDataSet({
      kind: 'itineraries',
      rows,
      pads: new Map([
        ['10:20am', 2],
        ['9:50am', 1],
      ]),
      day: TODAY,
      sourceTotal: 9,
    });
    const other = createRouteDataSet({ kind: 'weird', rows: [createRouteEntry()], sourceTotal: 1 });
    expect(rows.map((row) => padFor(dataSet, row))).toEqual(expected.padFor);
    expect(heldPads(dataSet)).toBe(expected.held);
    expect(hasRouteCodes(dataSet)).toBe(expected.codes);
    expect(hasServiceTypes(dataSet)).toBe(expected.types);
    expect(unassignedTimes(dataSet)).toEqual(expected.unassigned);
    expect(sorted(padCounts(dataSet))).toEqual(expected.padCounts);
    expect(sharedRows(dataSet)).toHaveLength(expected.sharedCount);
    expect(totalMismatch(dataSet)).toBe(expected.mismatch);
    expect(routeDataLabel(dataSet)).toBe(expected.label);
    expect(routeDataDateLabel(dataSet)).toBe(expected.dateLabel);
    expect(routeDataLabel(other)).toBe(expected.otherLabel);
    expect(totalMismatch(other)).toBe(expected.otherMismatch);
    expect(routeDataDateLabel(createRouteDataSet())).toBe(expected.noDay);
  });

  it('adds up what a route run skipped', () => {
    const expected = {
      keys: ['CX16', 'CX5', 'CX16', '', 'CX5', 'CX5', 'CX16', 'AX1'],
      byCode: [
        ['CX16', '0'],
        ['CX5', '1'],
        ['AX1', '7'],
      ],
      duplicates: ['CX16', 'cx5'],
      dateLabel: 'Friday, August 14 2026',
      noDay: 'Unknown date',
      applySkipped: 5,
      routeApplySkipped: 5,
      routeApplyLabel: 'Weekly Schedule',
    };
    expect(routeApplySkipped(createRouteApplyResult({ noAssociate: 4, notInExport: 1 }))).toBe(
      expected.routeApplySkipped,
    );
    expect(routeApplyLabel(createRouteApplyResult({ kind: 'schedule' }))).toBe(
      expected.routeApplyLabel,
    );
    expect(dwpSkipped(createDwpApplyResult({ noRouteCode: 2, notInSheet: 3 }))).toBe(
      expected.applySkipped,
    );
  });
});

describe('DWP data sets', () => {
  it('compares route codes without caring about case or spacing, first line winning', () => {
    const expected = {
      keys: ['CX16', 'CX5', 'CX16', '', 'CX5', 'CX5', 'CX16', 'AX1'],
      byCode: [
        ['CX16', '0'],
        ['CX5', '1'],
        ['AX1', '7'],
      ],
      duplicates: ['CX16', 'cx5'],
      dateLabel: 'Friday, August 14 2026',
      noDay: 'Unknown date',
      applySkipped: 5,
      routeApplySkipped: 5,
      routeApplyLabel: 'Weekly Schedule',
    };
    const codes = ['cx 16', 'CX5', 'CX16', '', 'cx5', 'CX-5', 'cx16', 'AX1'];
    const dataSet = createDwpDataSet({
      rows: codes.map((routeCode, index) => createDwpEntry({ routeCode, bags: String(index) })),
      day: '2026-08-14',
    });
    expect(codes.map(routeKey)).toEqual(expected.keys);
    expect([...byRouteCode(dataSet)].map(([key, entry]) => [key, entry.bags])).toEqual(
      expected.byCode,
    );
    expect(duplicateCodes(dataSet)).toEqual(expected.duplicates);
    expect(dwpDateLabel(dataSet)).toBe(expected.dateLabel);
    expect(dwpDateLabel(createDwpDataSet())).toBe(expected.noDay);
  });
});

describe('tenure books', () => {
  it('names the newest week', () => {
    const expected = {
      empty: ['', null, null],
      label: 'Week 34, 2026',
      newest: [2026, 34],
      count: [1, null],
      stamp: [2, 3, 1],
    };
    const book = createTenureBook();
    expect([weekLabel(book), newestWeek(book), tenureCountFor(book, 'x')]).toEqual(expected.empty);
    book.records.set('T1', { routes: 5, year: 2026, week: 9 });
    book.records.set('T2', { routes: 7, year: 2025, week: 52 });
    book.records.set('T3', { routes: 1, year: 2026, week: 34 });
    expect(weekLabel(book)).toBe(expected.label);
    expect(newestWeek(book)).toEqual(expected.newest);
    expect([tenureCountFor(book, 'T3'), tenureCountFor(book, 'nope')]).toEqual(expected.count);
    expect(tenureStamp({ routes: 1, year: 2, week: 3 })).toEqual(expected.stamp);
  });

  it('lets a newer week win, and on the same week the higher count', () => {
    const older = { routes: 99, year: 2026, week: 33 };
    const newer = { routes: 1, year: 2026, week: 34 };
    expect(isNewerStamp(newer, older)).toBe(true);
    expect(isNewerStamp(older, newer)).toBe(false);
    expect(isNewerStamp({ ...newer, routes: 2 }, newer)).toBe(true);
    expect(isNewerStamp(newer, newer)).toBe(false);
  });
});

describe('rosters', () => {
  it('counts shift types and labels the day', () => {
    const expected = {
      counts: [
        ['(none)', 1],
        ['Call Out', 1],
        ['Electric Route', 2],
      ],
      label: 'Tuesday, September 01 2026',
      noDate: 'Unknown date',
      empty: [true, false],
    };
    const roster = createRoster({
      rows: ['Electric Route', '', 'Electric Route', 'Call Out'].map((shiftType) =>
        createDriverRow({ shiftType }),
      ),
      loadOutDate: TODAY,
    });
    expect(sorted(shiftTypeCounts(roster))).toEqual(expected.counts);
    expect(rosterDateLabel(roster)).toBe(expected.label);
    expect(rosterDateLabel(createRoster())).toBe(expected.noDate);
    expect([isRosterEmpty(createRoster()), isRosterEmpty(roster)]).toEqual(expected.empty);
  });
});

describe('van affinity', () => {
  it('holds drivers on vans by slot', () => {
    const expected = {
      size: 4,
      get: ['T1', '', ''],
      forVehicle: [
        ['primary_1', 'T1'],
        ['secondary_1', 'T2'],
      ],
      heldBy: [
        ['V1', 'primary_1'],
        ['V2', 'primary_2'],
      ],
      vehicleOf: ['V1', '', 'V1', ''],
      drivers: ['T1', 'T2', 'T3'],
      afterClear: [3, '', ['V1', 'V2']],
      afterClearAll: [2, ['V2']],
      empty: [false, true],
      kinds: [
        ['primary_1', 'primary'],
        ['primary_2', 'primary'],
        ['secondary_1', 'secondary'],
        ['secondary_2', 'secondary'],
        ['other', 'secondary'],
      ],
    };
    const affinity = createVanAffinity();
    affinitySet(affinity, 'V1', 'primary_1', 'T1');
    affinitySet(affinity, 'V1', 'secondary_1', 'T2');
    affinitySet(affinity, 'V2', 'primary_2', 'T1');
    affinitySet(affinity, 'V2', 'secondary_2', 'T3');
    expect(affinitySize(affinity)).toBe(expected.size);
    expect([
      affinityGet(affinity, 'V1', 'primary_1'),
      affinityGet(affinity, 'V1', 'primary_2'),
      affinityGet(affinity, 'nope', 'x'),
    ]).toEqual(expected.get);
    expect(sorted(affinityForVehicle(affinity, 'V1'))).toEqual(expected.forVehicle);
    expect(heldBy(affinity, 'T1')).toEqual(expected.heldBy);
    expect([
      vehicleOf(affinity, 'T1', 'primary'),
      vehicleOf(affinity, 'T2', 'primary'),
      vehicleOf(affinity, 'T2', 'secondary'),
      vehicleOf(affinity, 'T9', 'secondary'),
    ]).toEqual(expected.vehicleOf);
    expect([...affinityDrivers(affinity)].sort()).toEqual(expected.drivers);
    affinitySet(affinity, 'V1', 'primary_1', '');
    expect([
      affinitySize(affinity),
      affinityGet(affinity, 'V1', 'primary_1'),
      [...affinity.slots.keys()].sort(),
    ]).toEqual(expected.afterClear);
    affinityClear(affinity, 'V1', 'secondary_1');
    expect([affinitySize(affinity), [...affinity.slots.keys()].sort()]).toEqual(
      expected.afterClearAll,
    );
    affinityClear(affinity, 'nope', 'x');
    expect([isAffinityEmpty(affinity), isAffinityEmpty(createVanAffinity())]).toEqual(
      expected.empty,
    );
    expect(
      ['primary_1', 'primary_2', 'secondary_1', 'secondary_2', 'other'].map((s) => [
        s,
        slotKind(s),
      ]),
    ).toEqual(expected.kinds);
  });
});

describe('dates', () => {
  it.each([
    ['2026-09-01', 'Tuesday, September 01 2026'],
    ['2026-02-28', 'Saturday, February 28 2026'],
    ['2027-12-31', 'Friday, December 31 2027'],
    ['2024-02-29', 'Thursday, February 29 2024'],
    ['2026-01-04', 'Sunday, January 04 2026'],
  ] as Array<[string, string]>)('writes %s as %s', (iso, label) => {
    expect(longDateLabel(iso)).toBe(label);
  });

  it('makes only real days', () => {
    expect(makeDate(2026, 2, 29)).toBeNull();
    expect(makeDate(2024, 2, 29)).toBe('2024-02-29');
    expect(makeDate(2026, 13, 1)).toBeNull();
    expect(makeDate(0, 1, 1)).toBeNull();
    expect(makeDate(10000, 1, 1)).toBeNull();
    expect(makeDate(2026, 4, 31)).toBeNull();
  });

  it('counts days between two days', () => {
    expect(daysBetween('2026-10-16', '2026-09-01')).toBe(45);
    expect(daysBetween('2026-08-31', '2026-09-01')).toBe(-1);
    expect(daysBetween('2027-03-01', '2026-03-01')).toBe(365);
  });

  it('reads dates the way the old strptime did', () => {
    expect(strptimeDate('2026-9-1', '%Y-%m-%d')).toBe('2026-09-01');
    expect(strptimeDate('9/1/2026', '%m/%d/%Y')).toBe('2026-09-01');
    expect(strptimeDate('09/01/26', '%m/%d/%y')).toBe('2026-09-01');
    expect(strptimeDate('09/01/69', '%m/%d/%y')).toBe('1969-09-01');
    expect(strptimeDate('09/01/68', '%m/%d/%y')).toBe('2068-09-01');
    expect(strptimeDate('2026-09-01x', '%Y-%m-%d')).toBeNull();
    expect(strptimeDate('2026-02-30', '%Y-%m-%d')).toBeNull();
    expect(strptimeDate('Sep 05 2026', '%b %d %Y')).toBe('2026-09-05');
    expect(strptimeDate('sep  5 2026', '%b %d %Y')).toBe('2026-09-05');
    expect(strptimeDate('Foo 05 2026', '%b %d %Y')).toBeNull();
    expect(parseDateFormats('31/12/2026', ['%m/%d/%Y', '%d/%m/%Y'])).toBe('2026-12-31');
    expect(parseDateFormats('nope', ['%m/%d/%Y'])).toBeNull();
    expect(() => strptimeDate('1', '%Z')).toThrow();
  });

  it('knows today', () => {
    expect(todayDate(new Date(2026, 8, 1, 23, 59))).toBe('2026-09-01');
  });
});
