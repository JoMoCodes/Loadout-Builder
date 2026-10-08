// The small rules and wordings behind the Route Data, Vehicle Data and Associates pages, checked on
// their own with hand-made rows. Names, IDs and VINs come from the made-up people in
// packages/fixtures/manifest.json.

import {
  createAssociate,
  createDwpDataSet,
  createRouteDataSet,
  createRouteEntry,
  createVehicle,
  type Associate,
  type RouteEntry,
} from '@loadout/core';
import { describe, expect, it } from 'vitest';
import type { AppSnapshot, AssociateView, RouteSetView, VehicleView } from '../../shared/snapshot';
import {
  ALL_QUALS,
  ALL_STATUSES,
  associateCell,
  associateTone,
  expiryText,
  passesAssociateFilters,
  tenureImportedMessage,
} from './associates/associateRows';
import {
  DWP_EMPTY,
  dwpDayNote,
  dwpImportedMessage,
  dwpMatchLine,
  dwpNotes,
  dwpTone,
  passesUnmatchedOnly,
  type DwpRow,
} from './routeData/dwpRows';
import {
  ALL_PADS,
  ROUTE_COLUMNS,
  UNASSIGNED_PAD,
  adoptMessage,
  buildRouteRows,
  importedMessage,
  padPlace,
  padsMessage,
  passesPadFilter,
  routeCell,
  routeNotes,
  routeTone,
} from './routeData/routeRows';
import {
  assignedMessage,
  driverOrder,
  emptiedMessage,
  gaveUpText,
  holdsSummary,
  slotCell,
} from './vehicleData/affinityRows';
import { passesLmrFilters, rentalLine } from './vehicleData/lmrRows';
import {
  FLEET_COLUMNS,
  fleetCountLine,
  noteText,
  passesFleetFilters,
  priorityProblem,
  registrationText,
  stateText,
  vehicleCell,
  vehicleTone,
} from './vehicleData/vehicleRows';

// ---- made-up people, vans and IDs (all from the fixtures' manifest)
const CARMEN = { name: 'Carmen Abernathy', id: 'A047LNAN5VQIQR' };
const BARRETT = { name: 'Barrett Ainsworth', id: 'A083QLD1CI9YSZ' };
const COLTON = { name: 'Colton Alderman', id: 'A08Z3QTIYAI58G' };
const ZANE = { name: 'Zane Applewhite', id: 'A0DZDWECHDJ5TO' };
const VIN_A = '1F61D2KP0L0W91839';
const VIN_B = '1F66B2RY9L0Y83576';

function person(who: { name: string; id: string }, values: Partial<Associate> = {}): AssociateView {
  const associate = createAssociate({
    name: who.name,
    transporterId: who.id,
    status: 'ACTIVE',
    qualifications: ['EDV'],
    ...values,
  });
  return {
    associate,
    vanBadges: associate.qualifications.includes('EDV') ? 'EDV' : '',
    lmrApproved: false,
    idState: 'ok',
    daysUntilIdExpiry: null,
    onRoster: false,
  };
}

function van(vin: string, name: string, values: Partial<VehicleView> = {}): VehicleView {
  return {
    vehicle: createVehicle({ vin, name, serviceType: 'Electric Vehicle', ownership: 'LEASED' }),
    operational: true,
    overridden: false,
    priority: '',
    affinity: {},
    rental: false,
    inUse: false,
    available: true,
    ...values,
  };
}

function snapshotWith(values: Partial<AppSnapshot>): AppSnapshot {
  return {
    revision: 1,
    today: '2026-09-11',
    mode: 'real',
    loadOutDate: null,
    roster: { sourceFile: '', importedAt: null, routeSource: '', rows: [] },
    associates: [],
    vehicles: [],
    routeSets: [],
    dwp: { set: createDwpDataSet(), matchedCount: 0, dayStatus: 'unknown' },
    lmrApproved: [],
    affinity: {},
    counts: {
      matched: 0,
      needReview: 0,
      activeAssociates: 0,
      affinitySlots: 0,
      overriddenVehicles: 0,
    },
    ...values,
  } as unknown as AppSnapshot;
}

function routeSet(kind: string, rows: Partial<RouteEntry>[], pads: [string, number][] = []) {
  return {
    ...createRouteDataSet({ kind, pads: new Map(pads) }),
    rows: rows.map((row) => createRouteEntry(row)),
    label: kind === 'schedule' ? 'Weekly Schedule' : kind === 'routes' ? 'Routes' : 'Itineraries',
  } as RouteSetView;
}

describe('Route Data tables', () => {
  it('keep the old page’s columns, in the old order and words', () => {
    expect(ROUTE_COLUMNS.routes!.map((column) => column.header)).toEqual([
      'Driver',
      'Transporter ID',
      'Route',
      'Dispatch Time',
      'PAD',
      'Service Type',
      'Progress',
    ]);
    expect(ROUTE_COLUMNS.itineraries!.map((column) => column.header)).toEqual([
      'Driver',
      'Transporter ID',
      'Route',
      'Dispatch Time',
      'PAD',
      'Progress',
      'Service Type',
      'Route Duration',
      'VIN',
    ]);
    expect(ROUTE_COLUMNS.schedule!.map((column) => column.header)).toEqual([
      'Associate',
      'Transporter ID',
      'Dispatch Time',
      'PAD',
      'Block',
      'Service Type',
    ]);
  });

  const set = routeSet(
    'routes',
    [
      {
        transporterId: CARMEN.id,
        driverName: CARMEN.name,
        dispatchTime: '9:50am',
        routeCode: 'CX1',
      },
      { transporterId: BARRETT.id, driverName: BARRETT.name, dispatchTime: '10:20am' },
      {
        transporterId: COLTON.id,
        driverName: COLTON.name,
        sharedDrivers: `${COLTON.name}|${ZANE.name}`,
        sharedIds: `${COLTON.id}|${ZANE.id}`,
        dispatchTime: '10:20am',
      },
      { transporterId: 'A-UNKNOWN', driverName: ZANE.name, dispatchTime: '9:50am' },
    ],
    [['9:50am', 1]],
  );
  const known = new Set([CARMEN.id, BARRETT.id, COLTON.id]);
  const rows = buildRouteRows(set, known);

  it('colour rows as the old page did: amber for an unknown ID or a shared route, grey for no PAD', () => {
    // Carmen: fine. Barrett: no PAD, so grey. Colton: shared and no PAD (grey wins, as it did).
    // The last: an ID with no associate record behind it, so amber.
    expect(rows.map((row) => routeTone(row, true))).toEqual([undefined, 'ghost', 'ghost', 'warn']);
    // With no associate list loaded, no ID is called unknown.
    expect(routeTone(rows[3]!, false)).toBeUndefined();
    // A shared route that does have a PAD is amber.
    expect(routeTone({ ...rows[2]!, pad: 2 }, true)).toBe('warn');
  });

  it('write a shared route as the name and how many more', () => {
    expect(routeCell(rows[2]!, 'driver_name')).toBe(`${COLTON.name}   (+1 more)`);
    expect(routeCell(rows[0]!, 'driver_name')).toBe(CARMEN.name);
    expect(routeCell(rows[0]!, 'pad')).toBe('PAD 1');
    expect(routeCell(rows[1]!, 'pad')).toBe('');
  });

  it('filter by PAD the way the drop-down did', () => {
    expect(rows.filter((row) => passesPadFilter(row, ALL_PADS))).toHaveLength(4);
    expect(rows.filter((row) => passesPadFilter(row, 'PAD 1'))).toHaveLength(2);
    expect(rows.filter((row) => passesPadFilter(row, 'PAD 2'))).toHaveLength(0);
    expect(rows.filter((row) => passesPadFilter(row, UNASSIGNED_PAD))).toHaveLength(2);
  });

  it('say where a time sits, even when its rows disagree', () => {
    expect(padPlace(set, '9:50am')).toBe('PAD 1');
    expect(padPlace(set, '10:20am')).toBe('unassigned');
    expect(padPlace(set, '10:20am', 'no PAD yet')).toBe('no PAD yet');
    set.rows[1]!.pad = '3';
    expect(padPlace(set, '10:20am')).toBe('partly assigned');
    set.rows[1]!.pad = '';
  });

  it('show the export’s own headcount beside the row count where it disagrees', () => {
    const counted = routeSet('schedule', [
      { transporterId: CARMEN.id },
      { transporterId: BARRETT.id },
    ]);
    expect(routeNotes(counted, known, true)).toEqual([]);
    counted.sourceTotal = 2;
    expect(routeNotes(counted, known, true)).toEqual([]);
    counted.sourceTotal = 5;
    expect(routeNotes(counted, known, true)).toEqual(['export header says 5']);
  });

  it('word the status line after each action', () => {
    expect(importedMessage(29, 'Routes_X.xlsx', 3)).toBe(
      'Imported 29 rows from Routes_X.xlsx - 3 dispatch times.',
    );
    expect(importedMessage(5, 'Routes_X.xlsx', 1)).toBe(
      'Imported 5 rows from Routes_X.xlsx - 1 dispatch time.',
    );
    expect(padsMessage('Routes', set, { '9:50am': 1 })).toBe(
      'Routes: 2 of 4 drivers placed in a PAD. 2 still unassigned.',
    );
    expect(padsMessage('Routes', set, { '9:50am': 1, '10:20am': 2 })).toBe(
      'Routes: 4 of 4 drivers placed in a PAD.',
    );
    expect(adoptMessage({ copied: 20, noPad: 2, missing: 3, total: 25 })).toBe(
      '20 of 25 PADs copied from the Weekly Schedule. 2 scheduled but with no PAD there. 3 not on the schedule.',
    );
    expect(adoptMessage({ copied: 25, noPad: 0, missing: 0, total: 25 })).toBe(
      '25 of 25 PADs copied from the Weekly Schedule.',
    );
  });
});

describe('the DWP tab', () => {
  const rosterRow = (routes: string) =>
    ({ row: { routes } }) as unknown as AppSnapshot['roster']['rows'][number];
  const dwpRow = (code: string, onRoster: boolean): DwpRow => ({
    index: 0,
    entry: { routeCode: code, bags: '', ovs: '', staging: '' },
    onRoster,
  });

  it('greys a route only once the roster has route codes to be missing from', () => {
    expect(dwpTone(dwpRow('CX1', false), true)).toBe('ghost');
    expect(dwpTone(dwpRow('CX1', true), true)).toBeUndefined();
    expect(dwpTone(dwpRow('CX1', false), false)).toBeUndefined();
  });

  it('"Not on the roster" shows nothing until there are codes to compare', () => {
    expect(passesUnmatchedOnly(dwpRow('CX1', false), true)).toBe(true);
    expect(passesUnmatchedOnly(dwpRow('CX1', true), true)).toBe(false);
    expect(passesUnmatchedOnly(dwpRow('CX1', false), false)).toBe(false);
  });

  it('says how many drivers matched, or that no roster is loaded', () => {
    expect(dwpMatchLine(snapshotWith({}))).toBe('no roster loaded');
    const loaded = snapshotWith({
      roster: { rows: [rosterRow('CX1'), rosterRow('')] } as unknown as AppSnapshot['roster'],
      dwp: { set: createDwpDataSet(), matchedCount: 1, dayStatus: 'ok' },
    });
    expect(dwpMatchLine(loaded)).toBe('1 of 2 drivers matched by route code');
  });

  it('calls out a roster with no codes and a code listed twice', () => {
    const set = createDwpDataSet({
      rows: [
        { routeCode: 'CX1', bags: '1', ovs: '', staging: '' },
        { routeCode: 'cx 1', bags: '2', ovs: '', staging: '' },
      ],
    });
    const snap = snapshotWith({
      roster: { rows: [rosterRow('')] } as unknown as AppSnapshot['roster'],
      dwp: { set, matchedCount: 0, dayStatus: 'unknown' },
    });
    expect(dwpNotes(snap)).toBe(
      'the roster carries no route codes yet   1 route code(s) listed twice',
    );
    expect(dwpImportedMessage(snap, '/a/b/DWP_X.xlsx')).toBe(
      "Imported 2 routes from DWP_X.xlsx. No driver has a route code yet - use 'Bring Over Route Data' on the Load Out page first. Listed twice: cx 1 - the first line is used.",
    );
    expect(dwpImportedMessage(snapshotWith({ dwp: snap.dwp }), 'DWP_X.xlsx')).toContain(
      'No roster loaded to match them against yet.',
    );
    const withCodes = snapshotWith({
      roster: { rows: [rosterRow('CX9')] } as unknown as AppSnapshot['roster'],
      dwp: { set, matchedCount: 0, dayStatus: 'ok' },
    });
    expect(dwpImportedMessage(withCodes, 'x.xlsx')).toContain(
      'No route code on the roster matches this sheet.',
    );
  });

  it('says whether the sheet is the roster’s day, in the old words', () => {
    const sheet = (day: string | null) =>
      createDwpDataSet({
        rows: [{ routeCode: 'CX1', bags: '', ovs: '', staging: '' }],
        day,
        sourceFile: '/x/DWP_DSP-XXXX_09-11-2026.xlsx',
      });
    expect(dwpDayNote(snapshotWith({}))).toBeNull();

    const same = dwpDayNote(
      snapshotWith({
        loadOutDate: '2026-09-11',
        dwp: { set: sheet('2026-09-11'), matchedCount: 0, dayStatus: 'ok' },
      }),
    )!;
    expect(same.tone).toBe('ok');

    const wrong = dwpDayNote(
      snapshotWith({
        loadOutDate: '2026-09-14',
        dwp: { set: sheet('2026-09-11'), matchedCount: 0, dayStatus: 'mismatch' },
      }),
    )!;
    expect(wrong.tone).toBe('warn');
    expect(wrong.text).toBe(
      'DWP_DSP-XXXX_09-11-2026.xlsx is for Friday, September 11 2026. The roster is for Monday, September 14 2026.',
    );

    const unknown = dwpDayNote(
      snapshotWith({
        loadOutDate: '2026-09-14',
        dwp: { set: sheet(null), matchedCount: 0, dayStatus: 'unknown' },
      }),
    )!;
    expect(unknown.text).toBe(
      "Can't tell which day DWP_DSP-XXXX_09-11-2026.xlsx is for - a DWP sheet carries no date inside it, and this one's file name doesn't say either. The roster is for Monday, September 14 2026.",
    );

    // A dated sheet with no roster to compare it with is not "can't tell".
    const noRoster = dwpDayNote(
      snapshotWith({ dwp: { set: sheet('2026-09-11'), matchedCount: 0, dayStatus: 'unknown' } }),
    )!;
    expect(noRoster.text).toContain('No roster is loaded to compare it with.');
    expect(DWP_EMPTY.title).toBe('No DWP sheet loaded.');
  });
});

describe('the Vehicle Management table', () => {
  it('keeps the old page’s columns', () => {
    expect(FLEET_COLUMNS.map((column) => column.header)).toEqual([
      'Vehicle',
      'Priority',
      'Status',
      'Service Type',
      'Category',
      'Assign',
      'Make / Model',
      'Plate',
      'Year',
      'Ownership',
      'Registration',
      'Note',
      'VIN',
    ]);
  });

  it('says "(set here)" for a status changed here, and greys a grounded van red', () => {
    expect(stateText(van(VIN_A, '101'))).toEqual({ text: 'Operational', tone: '' });
    expect(stateText(van(VIN_A, '101', { overridden: true }))).toEqual({
      text: 'Operational  (set here)',
      tone: '',
    });
    expect(stateText(van(VIN_A, '101', { operational: false, overridden: true }))).toEqual({
      text: 'Grounded  (set here)',
      tone: 'bad',
    });
    expect(vehicleTone(van(VIN_A, '101', { operational: false }), '2026-09-11')).toBe('bad');
  });

  it('flags a registration amber inside 45 days and red once expired', () => {
    const at = (expiry: string) => {
      const view = van(VIN_A, '101');
      view.vehicle.registrationExpiry = expiry;
      return view;
    };
    expect(registrationText(at('2026-12-31'), '2026-09-11')).toEqual({
      text: '2026-12-31',
      tone: '',
    });
    expect(registrationText(at('2026-10-11'), '2026-09-11')).toEqual({
      text: '2026-10-11  (30d left)',
      tone: 'warn',
    });
    expect(registrationText(at('2026-09-01'), '2026-09-11')).toEqual({
      text: '2026-09-01  (expired)',
      tone: 'bad',
    });
    expect(registrationText(van(VIN_A, '101'), '2026-09-11').text).toBe('');
    expect(vehicleTone(at('2026-10-11'), '2026-09-11')).toBe('warn');
  });

  it('writes the note, the assign word and the ownership as the old page did', () => {
    const grounded = van(VIN_A, '101');
    grounded.vehicle.statusNote = 'Waiting on a part';
    expect(noteText(grounded)).toBe('Waiting on a part');
    const rental = van(VIN_B, '102');
    rental.vehicle.ownership = 'AMAZON_RENTAL';
    rental.vehicle.ownershipEnd = '2026-10-01';
    expect(noteText(rental)).toBe('until 2026-10-01');
    expect(vehicleCell(rental, 'ownership', '2026-09-11')).toBe('Amazon Rental');
    expect(vehicleCell(rental, 'category', '2026-09-11')).toBe('Rental Van');
    expect(vehicleCell(rental, 'assign', '2026-09-11')).toBe('Auto');
    const own = van(VIN_B, '103');
    own.vehicle.ownership = 'SELF_OWNED';
    expect(vehicleCell(own, 'assign', '2026-09-11')).toBe('Manual');
  });

  it('counts handed out automatically vans only when they differ from the operational ones', () => {
    const own = van(VIN_B, '103');
    own.vehicle.ownership = 'SELF_OWNED';
    expect(fleetCountLine([van(VIN_A, '101')])).toBe('1 vehicles  -  1 operational');
    expect(fleetCountLine([van(VIN_A, '101'), own])).toBe(
      '2 vehicles  -  2 operational  -  1 handed out automatically',
    );
  });

  it('filters by status and service type', () => {
    const grounded = van(VIN_A, '101', { operational: false });
    expect(passesFleetFilters(grounded, 'Operational', 'All service types')).toBe(false);
    expect(passesFleetFilters(grounded, 'Grounded', 'All service types')).toBe(true);
    expect(passesFleetFilters(grounded, 'All vehicles', 'Electric Vehicle')).toBe(true);
    expect(passesFleetFilters(grounded, 'All vehicles', 'Step Van')).toBe(false);
  });

  it('accepts whole numbers or nothing for a priority, and says why not', () => {
    expect(priorityProblem('')).toBeNull();
    expect(priorityProblem('12')).toBeNull();
    expect(priorityProblem('high')).toBe(
      "'high' isn't a number. Use a whole number, or leave it empty to remove the priority.",
    );
    expect(priorityProblem('1.5')).not.toBeNull();
    expect(priorityProblem('-2')).not.toBeNull();
  });
});

describe('the Van Affinity tab', () => {
  const people = [person(CARMEN), person(BARRETT, { status: 'INACTIVE' }), person(COLTON)];
  const vans = [van(VIN_A, '101', { affinity: { primary_1: CARMEN.id } }), van(VIN_B, '102')];
  const snap = snapshotWith({
    associates: people,
    vehicles: vans,
    affinity: {
      [VIN_A]: { primary_1: CARMEN.id, secondary_2: COLTON.id },
      'VIN-GONE': { primary_2: ZANE.id },
    },
  });

  it('writes a slot as the name with their van badges, or the raw ID if they are not in the list', () => {
    expect(slotCell(snap, vans[0]!, 'primary_1')).toBe(`${CARMEN.name} [EDV]`);
    expect(slotCell(snap, vans[0]!, 'primary_2')).toBe('');
    const stranger = van(VIN_B, '102', { affinity: { primary_1: 'A-UNLISTED' } });
    expect(slotCell(snap, stranger, 'primary_1')).toBe('A-UNLISTED');
  });

  it('tells the window what each driver already holds, vans no longer in the fleet by VIN', () => {
    const holds = holdsSummary(snap);
    expect(holds.get(CARMEN.id)).toBe('primary on 101');
    expect(holds.get(COLTON.id)).toBe('secondary on 101');
    expect(holds.get(ZANE.id)).toBe('primary on VIN-GONE');
  });

  it('opens the window with active drivers first, the free before the busy, then by name', () => {
    const holds = new Map([[CARMEN.id, 'primary on 101']]);
    const order = (query = '') =>
      driverOrder(people, holds, query).map((view) => view.associate.name);
    expect(order()).toEqual([COLTON.name, CARMEN.name, BARRETT.name]);
    expect(order('carm')).toEqual([CARMEN.name]);
    // Letters of an ID find the person too. (The old search ran the words through the name
    // cleaner first, which drops digits, so a search of only digits shows everyone.)
    expect(order('qtiyai')).toEqual([COLTON.name]);
    expect(order('0123')).toHaveLength(3);
    expect(order('nobody by this name')).toEqual([]);
  });

  it('words what happened when a driver took a slot and gave another up', () => {
    expect(assignedMessage(CARMEN.name, 'primary_1', '101')).toBe(
      `${CARMEN.name} is primary driver 1 on van 101.`,
    );
    expect(emptiedMessage('secondary_2', '101')).toBe('Secondary Driver 2 on van 101 emptied.');
    expect(gaveUpText(snap, [])).toBe('');
    expect(
      gaveUpText(snap, [
        { vin: VIN_A, slot: 'primary_2' },
        { vin: 'VIN-GONE', slot: 'secondary_1' },
      ]),
    ).toBe(' Gave up primary driver 2 on 101, secondary driver 1 on VIN-GONE.');
  });
});

describe('the LMR tab', () => {
  it('lists the rental vans and how many can go out', () => {
    expect(rentalLine(snapshotWith({ vehicles: [van(VIN_A, '101')] }))).toBe(
      'No LMR vans in the fleet',
    );
    const rentals = [
      van(VIN_A, '101', { rental: true }),
      van(VIN_B, '102', { rental: true, operational: false }),
      van('1F69F2MV9L0F55866', '103'),
    ];
    expect(rentalLine(snapshotWith({ vehicles: rentals }))).toBe(
      '1 of 2 LMR vans operational:  101, 102',
    );
  });

  it('filters by approval and by who is on the load out', () => {
    const approved = { ...person(CARMEN), lmrApproved: true, onRoster: true };
    const other = person(BARRETT);
    expect(passesLmrFilters(approved, 'Approved', false)).toBe(true);
    expect(passesLmrFilters(other, 'Approved', false)).toBe(false);
    expect(passesLmrFilters(approved, 'Not approved', false)).toBe(false);
    expect(passesLmrFilters(other, 'Not approved', true)).toBe(false);
    expect(passesLmrFilters(approved, 'All associates', true)).toBe(true);
  });
});

describe('the Associates tables', () => {
  it('write an ID expiry with its state in words, and colour it', () => {
    const expiring = {
      ...person(CARMEN, { idExpiration: '2026-10-01' }),
      idState: 'expiring' as const,
      daysUntilIdExpiry: 20,
    };
    expect(expiryText(expiring)).toEqual({ text: '2026-10-01  (20d left)', tone: 'warn' });
    const expired = {
      ...person(CARMEN, { idExpiration: '2026-08-01' }),
      idState: 'expired' as const,
    };
    expect(expiryText(expired)).toEqual({ text: '2026-08-01  (expired)', tone: 'bad' });
    expect(expiryText(person(CARMEN, { idExpiration: '2027-01-01' }))).toEqual({
      text: '2027-01-01',
      tone: '',
    });
    expect(expiryText(person(CARMEN)).text).toBe('');
    expect(associateTone(expired)).toBe('bad');
    expect(associateTone(person(BARRETT, { status: 'INACTIVE' }))).toBe('ghost');
    expect(associateTone(person(CARMEN))).toBeUndefined();
  });

  it('show a lifetime route count, or nothing where none has been read', () => {
    expect(associateCell(person(CARMEN, { tenure: 158 }), 'tenure')).toBe('158');
    expect(associateCell(person(CARMEN, { tenure: 0 }), 'tenure')).toBe('0');
    expect(associateCell(person(CARMEN), 'tenure')).toBe('');
    expect(associateCell({ ...person(CARMEN), onRoster: true }, 'on_loadout')).toBe('Yes');
  });

  it('filter by status, a single qualification and who is on the load out', () => {
    const view = { ...person(CARMEN, { qualifications: ['EDV', 'DOT'] }), onRoster: true };
    expect(passesAssociateFilters(view, ALL_STATUSES, ALL_QUALS, false)).toBe(true);
    expect(passesAssociateFilters(view, 'INACTIVE', ALL_QUALS, false)).toBe(false);
    expect(passesAssociateFilters(view, 'ACTIVE', 'dot', false)).toBe(true);
    expect(passesAssociateFilters(view, 'ACTIVE', 'Step Van', false)).toBe(false);
    expect(
      passesAssociateFilters({ ...view, onRoster: false }, ALL_STATUSES, ALL_QUALS, true),
    ).toBe(false);
  });

  it('say what a Tenured Workforce file did, and when it was older than what is kept', () => {
    const base = {
      fileName: 'Tenured_Workforce_X.csv',
      fileWeek: 'Week 34, 2026',
      kept: 167,
      keptWeek: 'Week 35, 2026',
      older: false,
      covered: 68,
      associates: 78,
    };
    expect(tenureImportedMessage(base)).toBe(
      'Imported Tenured_Workforce_X.csv. Lifetime routes for 167 drivers, through Week 35, 2026. 68/78 associates covered.',
    );
    expect(tenureImportedMessage({ ...base, older: true })).toBe(
      "Imported Tenured_Workforce_X.csv (Week 34, 2026) - older than what's on file, newer counts kept. Lifetime routes for 167 drivers, through Week 35, 2026. 68/78 associates covered.",
    );
    expect(tenureImportedMessage({ ...base, associates: 0, covered: 0 })).toContain(
      'Import associate data to see them against their records.',
    );
  });
});
