// Replays a small made-up day on the state and checks every answer against what the old Python
// app gave for the same day. The expected answers in scenario.expected.json were written by
// `python3 -I scripts/parity/ts/scenario.py`, which builds the same day on the old AppState.

import { readFileSync } from 'node:fs';
import { Store } from '@loadout/storage';
import { describe, expect, it } from 'vitest';
import { createAssociate, createAssociateBook } from '../models/associates';
import { createDwpDataSet, createDwpEntry } from '../models/dwp';
import { createDriverRow, createRoster } from '../models/roster';
import { createRouteDataSet, createRouteEntry } from '../models/routes';
import { AppState } from './appState';

const expected = JSON.parse(
  readFileSync(new URL('./scenario.expected.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

const TODAY = '2026-09-11';
const IDS = {
  carmen: 'A047LNAN5VQIQR',
  nadine: 'A083QLD1CI9YSZ',
  barrett: 'A08Z3QTIYAI58G',
  beatrice: 'A0DZDWECHDJ5TO',
  beatriceEsme: 'A0FU25U7H48VU2',
  colton: 'A0FXMBXTK81V4D',
  elodie: 'A0G8EUL2VJ2V9F',
  greta: 'A0IVCK2UTQ9OVR',
  beatriceQ: 'A0OSA9BYLF0C4L',
  andre: 'A0R9UJ713V4B0X',
  nolan: 'A0TRKAKN2V09HH',
};

function entry(
  transporterId: string,
  driverName: string,
  routeCode: string,
  dispatchTime: string,
  serviceType: string,
  extra: Record<string, string> = {},
) {
  return createRouteEntry({
    transporterId,
    driverName,
    routeCode,
    dispatchTime,
    serviceType,
    ...extra,
  });
}

function build(): AppState {
  const st = new AppState(new Store(':memory:', { now: () => new Date(2000, 0, 1) }));
  st.associates = createAssociateBook({
    rows: [
      createAssociate({
        name: 'Carmen Abernathy',
        transporterId: IDS.carmen,
        qualifications: ['EDV'],
        status: 'ACTIVE',
        idExpiration: '2026-09-21',
      }),
      createAssociate({
        name: 'Nadine Abernathy',
        transporterId: IDS.nadine,
        qualifications: ['Step Van'],
        status: 'INACTIVE',
        idExpiration: '2026-09-08',
      }),
      createAssociate({ name: 'Nolan Abernathy', transporterId: '', qualifications: [] }),
      createAssociate({
        name: 'Barrett Hadley Ainsworth',
        transporterId: IDS.barrett,
        qualifications: ['EDV', 'CDV', 'DOT'],
        status: 'ACTIVE',
      }),
      createAssociate({
        name: 'Beatrice Redmond',
        transporterId: IDS.beatrice,
        qualifications: ['EDV'],
      }),
      createAssociate({
        name: 'Beatrice Esme Redmond',
        transporterId: IDS.beatriceEsme,
        qualifications: ['EDV'],
      }),
      createAssociate({
        name: 'Colton Alderman',
        transporterId: IDS.colton,
        qualifications: ['EDV'],
      }),
    ],
  });
  st.roster = createRoster({
    rows: [
      createDriverRow({ driver: 'Carmen Abernathy', shiftType: 'Step Van Route' }),
      createDriverRow({ driver: 'Nadine Abernathy', shiftType: 'Electric Route' }),
      createDriverRow({ driver: 'Barrett Ainsworth', vehicle: 'Van 7', vin: 'VAN-7' }),
      createDriverRow({ driver: 'Carmen Abernathey' }),
      createDriverRow({ driver: 'Beatrice X Redmond' }),
      createDriverRow({
        driver: 'Zane Applewhite',
        routes: 'CX9',
        stagingLocation: 'STG.Z99',
        bags: '4',
      }),
      createDriverRow({ driver: 'Colton Alderman' }),
      createDriverRow({ driver: 'Mabel Alderman' }),
    ],
    loadOutDate: TODAY,
  });
  st.routeData.set(
    'routes',
    createRouteDataSet({
      kind: 'routes',
      rows: [
        entry(IDS.carmen, 'Carmen Abernathy', 'CX1', '10:20am', 'Standard Parcel Step Van'),
        entry(
          IDS.barrett,
          'Barrett Hadley Ainsworth',
          'CX2',
          '10:25am',
          'Standard Parcel Electric - Rivian MEDIUM',
        ),
        entry(IDS.elodie, 'Elodie Alderman', 'cx 3', '10:20am', 'Standard Parcel Step Van'),
        entry(IDS.nolan, 'Nolan Abernathy', 'CX4', '10:25am', 'On Road Experience Driver'),
        entry(IDS.greta, 'Greta Underhill', '', '10:20am', ''),
        entry(IDS.carmen, 'Carmen Abernathy', 'CX5', '10:30am', 'Standard Parcel'),
        entry(IDS.beatriceQ, 'Beatrice Q Redmond', 'CX6', '10:30am', 'Standard Parcel'),
        entry(IDS.colton, 'Colton Alderman', 'CX7', '10:30am', 'Standard Parcel'),
      ],
    }),
  );
  st.routeData.set(
    'itineraries',
    createRouteDataSet({
      kind: 'itineraries',
      rows: [
        entry(IDS.andre, 'Andre Ainsworth', '', '', 'Standard Parcel Electric'),
        entry(IDS.elodie, 'Elodie Alderman', 'CX3', '', 'Standard Parcel Step Van'),
      ],
    }),
  );
  st.routeData.set(
    'schedule',
    createRouteDataSet({
      kind: 'schedule',
      rows: [
        entry(IDS.carmen, 'Carmen Abernathy', '', '9:00am', '', { pad: '3' }),
        entry(IDS.barrett, 'Barrett Hadley Ainsworth', '', '9:30am', ''),
        entry('', '', '', '9:45am', '', {
          sharedDrivers: 'Elodie Alderman|Greta Underhill',
          sharedIds: `${IDS.elodie}|${IDS.greta}`,
        }),
      ],
      pads: new Map([['9:45am', 2]]),
    }),
  );
  st.dwp = createDwpDataSet({
    rows: [
      createDwpEntry({ routeCode: 'CX1', bags: '5', ovs: '2', staging: 'STG.A01' }),
      createDwpEntry({ routeCode: 'CX2', bags: '', ovs: '1', staging: '' }),
      createDwpEntry({ routeCode: 'CX3', bags: '7', ovs: '', staging: 'STG.B02' }),
      createDwpEntry({ routeCode: 'cx3', bags: '9', ovs: '9', staging: 'STG.B09' }),
    ],
    day: '2026-09-10',
  });
  st.previousRoster = createRoster({
    rows: [
      createDriverRow({ driver: 'Carmen Abernathy', vin: 'VAN-1' }),
      createDriverRow({ driver: 'Barrett Ainsworth', vin: 'VAN-2' }),
      createDriverRow({ driver: 'Nolan Abernathy', vin: 'VAN-3' }),
      createDriverRow({ driver: 'Zane Applewhite', vin: 'VAN-4' }),
      createDriverRow({ driver: 'Carmen Abernathy', vin: 'VAN-5' }),
      createDriverRow({ driver: 'Beatrice Redmond', vin: 'VAN-6' }),
      createDriverRow({ driver: 'Colton Alderman' }),
    ],
    loadOutDate: '2026-09-10',
  });
  st.lmrApproved = new Set([IDS.barrett]);
  st.linkDriver('Colton Alderman', null);
  return st;
}

function matches(st: AppState) {
  return Object.fromEntries(
    [...st.matches].map(([key, m]) => [
      key,
      [
        m.method,
        m.associate ? [m.associate.name, m.associate.transporterId] : null,
        m.candidates.map((a) => a.transporterId),
      ],
    ]),
  );
}

function readouts(st: AppState) {
  return st.roster.rows.map((row) => ({
    driver: row.driver,
    check: st.checkText(row, TODAY),
    issues: st.driverIssues(row, TODAY),
    badges: st.vanBadges(st.associateFor(row)),
  }));
}

describe('the day state, against the old app', () => {
  const st = build();
  const out: Record<string, unknown> = {};
  out.matches_before = matches(st);
  out.summary_before = Object.fromEntries(st.matchSummary());
  out.counts_before = [st.matchedCount(), st.reviewCount(), [...st.rosteredIds()].sort()];
  out.readouts_before = readouts(st);
  out.previous_vans = Object.fromEntries(st.previousVans());
  out.loaded = st.loadedRouteSources();
  st.setPads('routes', { '10:20am': 1, '10:25am': 2, '10:30am': 0 });
  out.pads = Object.fromEntries(st.routeSet('routes').pads);
  out.adopt = st.adoptSchedulePads('routes');
  out.entry_pads = st.routeSet('routes').rows.map((e) => e.pad);
  const result = st.applyRouteData('routes');
  out.route_result = [
    result.filled,
    result.dispatchTimes,
    result.routeCodes,
    result.serviceTypes,
    result.pads,
    result.noAssociate,
    result.notInExport,
    result.duplicates,
    result.addedDrivers,
    result.needsReview,
  ];
  out.rows_after = st.roster.rows.map((r) => [
    r.driver,
    r.shiftType,
    r.routes,
    r.waveTime,
    r.pad,
    r.serviceType,
  ]);
  out.associates_after = st.associates.rows.map((a) => [
    a.name,
    a.transporterId,
    a.position,
    [...a.qualifications],
    a.status,
    a.tenure,
  ]);
  out.links_after = Object.fromEntries(st.links);
  out.matches_after = matches(st);
  out.previous_vans_after = Object.fromEntries(st.previousVans());
  out.dwp_before = [st.dwpDayStatus(), st.dwpMatchedCount()];
  const dwp = st.applyDwp();
  out.dwp_result = [
    dwp.filled,
    dwp.staging,
    dwp.bags,
    dwp.ovs,
    dwp.noRouteCode,
    dwp.notInSheet,
    dwp.cleared,
  ];
  out.dwp_rows = st.roster.rows.map((r) => [r.driver, r.stagingLocation, r.bags, r.ovs]);
  out.readouts_after = readouts(st);
  st.linkDriver('Zane Applewhite', IDS.colton);
  out.linked = matches(st)['zane applewhite'];
  st.unlinkDriver('Zane Applewhite');
  out.unlinked = matches(st)['zane applewhite'];
  const rosterBeforeMove = structuredClone(st.roster.rows);
  out.moved = st.moveToPreviousRoster();
  const rosterAfterMove = structuredClone(st.roster.rows);
  const previousIsACopy = st.previousRoster.rows.every((row, i) => row !== st.roster.rows[i]);
  out.previous_vans_moved = Object.fromEntries(st.previousVans());
  st.clearPreviousRoster();
  out.previous_vans_cleared = Object.fromEntries(st.previousVans());
  st.clearRouteData('routes');
  out.loaded_after_clear = st.loadedRouteSources();

  it.each(Object.keys(expected))('%s', (key) => {
    expect(out[key]).toEqual(expected[key]);
  });

  it('answers every step the old app answered', () => {
    expect(Object.keys(out)).toEqual(Object.keys(expected));
  });

  it('moving to the previous roster copies the rows and leaves today alone', () => {
    expect(rosterAfterMove).toEqual(rosterBeforeMove);
    expect(previousIsACopy).toBe(true);
  });
});

describe('saved data', () => {
  it('pins links and saves new associates and the roster when route data adds someone', () => {
    const store = new Store(':memory:', { now: () => new Date(2000, 0, 1) });
    const st = build();
    Object.assign(st, { store });
    st.setPads('routes', { '10:20am': 1, '10:25am': 2 });
    st.applyRouteData('routes');
    expect(store.loadLinks()).toEqual({
      'elodie alderman': IDS.elodie,
      'nolan abernathy': IDS.nolan,
      'andre ainsworth': IDS.andre,
    });
    expect(store.loadAssociates().rows).toHaveLength(9);
    expect(store.loadRoster().rows).toHaveLength(11);
    expect(store.loadRoster().route_source).toBe('routes');
  });

  it('loads everything back the way it was saved, with tenure folded only forward', () => {
    const store = new Store(':memory:', { now: () => new Date(2000, 0, 1) });
    const st = new AppState(store);
    st.importAssociates(
      createAssociateBook({
        rows: [
          createAssociate({ name: 'Carmen Abernathy', transporterId: IDS.carmen }),
          createAssociate({ name: 'Nadine Abernathy', transporterId: IDS.nadine }),
          createAssociate({ name: 'Colton Alderman', transporterId: IDS.colton }),
        ],
      }),
    );
    st.importTenure({
      records: new Map([
        [IDS.carmen, { routes: 40, year: 2026, week: 30 }],
        [IDS.nadine, { routes: 7, year: 2026, week: 30 }],
      ]),
      sourceFile: 'a.csv',
      importedAt: null,
    });
    // An older file never rolls a count back; a driver missing from a newer one keeps theirs.
    st.importTenure({
      records: new Map([[IDS.carmen, { routes: 12, year: 2026, week: 20 }]]),
      sourceFile: 'b.csv',
      importedAt: null,
    });
    expect(st.associates.rows.map((a) => a.tenure)).toEqual([40, 7, null]);
    st.importTenure({
      records: new Map([[IDS.carmen, { routes: 45, year: 2026, week: 31 }]]),
      sourceFile: 'c.csv',
      importedAt: null,
    });
    expect(st.associates.rows.map((a) => a.tenure)).toEqual([45, 7, null]);
    st.importRoster(createRoster({ rows: [createDriverRow({ driver: 'Carmen Abernathy' })] }));
    st.linkDriver('Zane Applewhite', null);

    const again = new AppState(store);
    again.loadAll();
    expect(again.associates.rows.map((a) => a.tenure)).toEqual([45, 7, null]);
    expect(again.matchFor({ driver: 'Carmen Abernathy' })?.method).toBe('exact');
    expect(again.roster.rows.map((row) => row.driver)).toEqual(['Carmen Abernathy']);
    expect([...again.links]).toEqual([['zane applewhite', null]]);
  });

  it('clears the lifetime route counts and keeps the associates and the roster', () => {
    const store = new Store(':memory:', { now: () => new Date(2000, 0, 1) });
    const st = new AppState(store);
    st.importAssociates(
      createAssociateBook({
        rows: [createAssociate({ name: 'Carmen Abernathy', transporterId: IDS.carmen })],
      }),
    );
    st.importRoster(createRoster({ rows: [createDriverRow({ driver: 'Carmen Abernathy' })] }));
    st.importTenure({
      records: new Map([[IDS.carmen, { routes: 40, year: 2026, week: 30 }]]),
      sourceFile: 'a.csv',
      importedAt: null,
    });
    expect(st.associates.rows[0]?.tenure).toBe(40);

    st.clearTenure();
    expect(st.tenureBook.records.size).toBe(0);
    expect(st.tenureBook.sourceFile).toBe('');
    expect(st.associates.rows[0]?.tenure).toBeNull();
    expect(st.associates.rows).toHaveLength(1);
    expect(st.roster.rows).toHaveLength(1);

    // Gone from the saved data too, and an older week can land again.
    const again = new AppState(store);
    again.loadAll();
    expect(again.tenureBook.records.size).toBe(0);
    again.importTenure({
      records: new Map([[IDS.carmen, { routes: 12, year: 2026, week: 20 }]]),
      sourceFile: 'b.csv',
      importedAt: null,
    });
    expect(again.associates.rows[0]?.tenure).toBe(12);
  });
});
