// A small made-up day for the Load Out page tests: five drivers, five associates, four vans and
// two route exports. Names, Transporter IDs and VINs come from packages/fixtures/manifest.json.
// What the snapshot would hold; the stand-in bridge hands it to the page.

import type { Page } from '@playwright/test';
import type { FakeBridgeOptions } from './fakeBridge';

const STEP = 'Standard Parcel Step Van - US';
const ELECTRIC = 'Standard Parcel Electric - Rivian MEDIUM';

export const IDS = {
  colton: 'A047LNAN5VQIQR',
  gideon: 'A083QLD1CI9YSZ',
  sabrina: 'A08Z3QTIYAI58G',
  nadine: 'A0DZDWECHDJ5TO',
  nolan: 'A0FU25U7H48VU2',
};
export const VINS = [
  '1F61D2KP0L0W91839',
  '1F66B2RY9L0Y83576',
  '1F69F2MV9L0F55866',
  '1F69K4XU1L0J31668',
];

function row(values: Record<string, string>) {
  return {
    driver: '',
    shiftType: '',
    status: '',
    routes: '',
    vehicle: '',
    vin: '',
    device: '',
    stagingLocation: '',
    bag: '',
    waveTime: '',
    pad: '',
    serviceType: '',
    bags: '',
    ovs: '',
    assignMethod: '',
    ...values,
  };
}

function rosterRow(
  index: number,
  values: Record<string, string>,
  extra: Record<string, unknown> = {},
) {
  return {
    index,
    row: row(values),
    match: { method: 'exact', ambiguous: false, candidates: [] },
    associateId: '',
    associateName: '',
    vanBadges: '',
    tenure: null,
    check: 'OK',
    assignMethodLabel: '',
    issues: [],
    ...extra,
  };
}

function associate(
  name: string,
  transporterId: string,
  qualifications: string[],
  status = 'ACTIVE',
) {
  return {
    associate: {
      name,
      transporterId,
      position: '',
      qualifications,
      idExpiration: null,
      personalPhone: '',
      workPhone: '',
      email: '',
      status,
      tenure: null,
    },
    vanBadges: qualifications.join(' '),
    lmrApproved: false,
    idState: 'ok',
    daysUntilIdExpiry: null,
    onRoster: true,
  };
}

function van(name: string, vin: string, serviceType: string, more: Record<string, unknown> = {}) {
  const { available = true, ...fields } = more;
  return {
    vehicle: {
      vin,
      name,
      serviceType,
      serviceTier: '',
      make: 'Rivian',
      model: 'EDV',
      subModel: '',
      plate: '',
      year: '',
      ownership: '',
      typeLabel: '',
      operational: true,
      status: '',
      statusNote: '',
      registrationExpiry: null,
      ownershipEnd: null,
      station: '',
      ...fields,
    },
    operational: true,
    overridden: false,
    priority: '',
    affinity: {},
    rental: false,
    inUse: !available,
    available,
  };
}

function routeSet(kind: string, label: string, times: string[]) {
  return {
    kind,
    label,
    rows: times.map((time, i) => ({
      transporterId: '',
      driverName: '',
      routeCode: kind === 'schedule' ? '' : `CX${i + 1}`,
      dispatchTime: time,
      serviceType: ELECTRIC,
      routeDuration: '',
      vin: '',
      detail: '',
      sharedDrivers: '',
      sharedIds: '',
      pad: '',
    })),
    pads: {},
    day: '2026-09-11',
    sourceFile: '',
    importedAt: null,
    sourceTotal: null,
  };
}

/** The day, as the snapshot fields the stand-in bridge replaces. */
export function loadOutDay(): NonNullable<FakeBridgeOptions['snapshot']> {
  const rows = [
    rosterRow(
      0,
      {
        driver: 'Colton Alderman',
        shiftType: 'Step Van Route',
        routes: 'CX1',
        waveTime: '9:50am',
        pad: '1',
        serviceType: STEP,
        vehicle: '51',
        vin: VINS[0]!,
        assignMethod: 'affinity-primary',
      },
      {
        associateId: IDS.colton,
        associateName: 'Colton Alderman',
        vanBadges: 'CDV EDV SV',
        tenure: 120,
        assignMethodLabel: 'primary affinity',
      },
    ),
    rosterRow(
      1,
      {
        driver: 'Gideon Whitaker',
        shiftType: 'Electric Route',
        routes: 'CX2',
        waveTime: '10:20am',
        serviceType: ELECTRIC,
      },
      {
        associateId: IDS.gideon,
        associateName: 'Gideon Whitaker',
        vanBadges: 'EDV',
        check: 'ID expires in 10d',
        issues: ['ID expires in 10d'],
      },
    ),
    rosterRow(
      2,
      { driver: 'Sabrina Woodbridge', shiftType: 'Call Out' },
      { associateId: IDS.sabrina, associateName: 'Sabrina Woodbridge', vanBadges: 'EDV' },
    ),
    rosterRow(
      3,
      { driver: 'Carmen Abernathy', shiftType: 'Electric Route' },
      {
        match: {
          method: 'none',
          ambiguous: true,
          candidates: [{ name: 'Nolan Abernathy', transporterId: IDS.nolan }],
        },
        check: 'Ambiguous - pick one',
        issues: ['No associate record'],
      },
    ),
    rosterRow(
      4,
      {
        driver: 'Nadine Abernathy',
        shiftType: 'Electric Route',
        routes: 'CX4',
        waveTime: '10:20am',
        serviceType: ELECTRIC,
        vehicle: '52',
        vin: VINS[1]!,
        assignMethod: 'service-type',
      },
      {
        associateId: IDS.nadine,
        associateName: 'Nadine Abernathy',
        vanBadges: 'EDV',
        assignMethodLabel: 'service type',
      },
    ),
  ];
  return {
    revision: 7,
    loadOutDate: '2026-09-11',
    roster: {
      sourceFile: 'C:\\Exports\\2026_09_11_17_37_loadout_sheet.xlsx',
      importedAt: null,
      routeSource: '',
      rows,
    },
    associates: [
      associate('Colton Alderman', IDS.colton, ['CDV', 'EDV', 'Step Van']),
      associate('Gideon Whitaker', IDS.gideon, ['EDV']),
      associate('Sabrina Woodbridge', IDS.sabrina, ['EDV']),
      associate('Nadine Abernathy', IDS.nadine, ['EDV']),
      associate('Nolan Abernathy', IDS.nolan, ['EDV'], 'INACTIVE'),
    ],
    vehicles: [
      van('51', VINS[0]!, STEP, { available: false }),
      van('52', VINS[1]!, ELECTRIC, { available: false }),
      van('60', VINS[2]!, ELECTRIC),
      van('70', VINS[3]!, STEP, { ownership: 'SELF_OWNED' }),
    ],
    routeSets: [
      routeSet('routes', 'Routes', ['9:50am', '10:20am']),
      routeSet('itineraries', 'Itineraries', ['9:20am']),
      routeSet('schedule', 'Weekly Schedule', []),
    ],
    dwp: {
      set: {
        rows: [{ routeCode: 'CX1', staging: 'STG.G02', bags: '20', ovs: '3' }],
        day: '2026-09-17',
        sourceFile: 'DWP_DSP-XXXX_09-17-2026.xlsx',
        importedAt: null,
      },
      matchedCount: 1,
      dayStatus: 'mismatch',
    },
    previousRoster: {
      rows: [
        row({
          driver: 'Colton Alderman',
          shiftType: 'Step Van Route',
          vehicle: '51',
          vin: VINS[0]!,
        }),
        row({ driver: 'Sabrina Woodbridge', shiftType: 'Call Out' }),
      ],
      loadOutDate: '2026-09-10',
      sourceFile: '',
      importedAt: null,
      routeSource: '',
    },
    counts: {
      rosterRows: rows.length,
      associates: 5,
      activeAssociates: 4,
      matched: 4,
      needReview: 1,
      vehicles: 4,
      operationalVehicles: 4,
      availableVehicles: 2,
      links: 3,
      previousRosterRows: 2,
      previousOnToday: 1,
    },
  } as unknown as NonNullable<FakeBridgeOptions['snapshot']>;
}

/** The PAD maps cannot cross into the page as Maps from here; this rebuilds them there. */
export async function withMaps(page: Page) {
  await page.addInitScript(() => {
    const snap = window.__fake!.snapshot as { routeSets?: Array<{ pads: unknown }> };
    for (const set of snap.routeSets ?? []) {
      if (!(set.pads instanceof Map)) set.pads = new Map(Object.entries(set.pads ?? {}));
    }
  });
}
