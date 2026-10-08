// Expected values come from running the same steps on the old app's AppState (state.py), with
// made-up vans and drivers from packages/fixtures/manifest.json.

import { Store } from '@loadout/storage';
import { describe, expect, it } from 'vitest';
import { createAssociate, createAssociateBook, type Associate } from '../models/associates';
import { createDriverRow, createRoster, type DriverRow } from '../models/roster';
import { createVehicle, createVehicleFleet } from '../models/vehicles';
import { createPrintSpec, defaultSpec, vansColumns } from '../printing/printing';
import { AppState } from './appState';
import { printKey } from './print';
import { assignMethodLabel } from './vans';

const V = ['1F61D2KP0L0W91839', '1F66B2RY9L0Y83576', '1F69F2MV9L0F55866'] as const;
const T = ['A047LNAN5VQIQR', 'A083QLD1CI9YSZ'] as const;
const RM = 'Standard Parcel Electric - Rivian MEDIUM';
const TODAY = '2026-09-01';

function makeState(rows: DriverRow[] = [], associates: Associate[] = []) {
  const store = new Store(':memory:', { now: () => new Date(2000, 0, 1) });
  const state = new AppState(store);
  let notified = 0;
  state.subscribe(() => {
    notified += 1;
  });
  state.roster = createRoster({ rows, loadOutDate: TODAY });
  state.associates = createAssociateBook({ rows: associates });
  state.vehicles = createVehicleFleet({
    rows: [
      createVehicle({ vin: V[0], name: '619001', serviceType: RM, ownership: 'AMAZON_OWNED' }),
      createVehicle({ vin: V[1], name: '619002', serviceType: RM, ownership: 'SELF_OWNED' }),
      createVehicle({
        vin: V[2],
        name: '655071 (LMR)',
        serviceType: RM,
        ownership: 'AMAZON_RENTAL',
        operational: false,
      }),
    ],
  });
  state.rematch();
  return { state, store, notified: () => notified };
}

const names = (vans: Array<{ name: string }>) => vans.map((v) => v.name);
const barrett = () =>
  createAssociate({ name: 'Barrett Ainsworth', transporterId: T[0], qualifications: ['EDV'] });

describe('which vans are in service', () => {
  it('keeps an override only where it differs from the export', () => {
    const { state, store, notified } = makeState();
    const [first, , rental] = state.vehicles.rows;
    state.setOperational(rental!, true);
    state.setOperational(first!, true);
    expect(Object.fromEntries(state.vehicleOverrides)).toEqual({ [V[2]]: true });
    expect(store.loadVehicleOverrides()).toEqual({ [V[2]]: true });
    expect(notified()).toBe(2);
    expect(state.overriddenCount()).toBe(1);
    expect(state.isOverridden(rental!)).toBe(true);
    expect(names(state.operationalVehicles())).toEqual(['619001', '619002', '655071 (LMR)']);
    expect(names(state.assignableVehicles())).toEqual(['619001', '655071 (LMR)']);
    expect(names(state.lmrVehicles())).toEqual(['655071 (LMR)']);
  });

  it('counts a van as taken by its name or its VIN', () => {
    const { state } = makeState([
      createDriverRow({ driver: 'Barrett Ainsworth', vehicle: '619001' }),
      createDriverRow({ driver: 'Ariana Nethercott', vin: V[1] }),
    ]);
    state.setOperational(state.vehicles.rows[2]!, true);
    expect(names(state.availableVehicles())).toEqual(['655071 (LMR)']);
  });
});

describe('handing vans out by hand', () => {
  it('swaps a route, van and DWP numbers together, and marks both by hand', () => {
    const rows = [
      createDriverRow({ driver: 'Barrett Ainsworth', vehicle: '619001' }),
      createDriverRow({
        driver: 'Ariana Nethercott',
        vin: V[1],
        routes: 'CX9',
        bags: '4',
        assignMethod: 'service-type',
      }),
    ];
    const { state, store } = makeState(rows);
    state.reassignRoute(rows[1]!, rows[0]!);
    expect(rows.map((r) => [r.driver, r.routes, r.vehicle, r.vin, r.bags, r.assignMethod])).toEqual(
      [
        ['Barrett Ainsworth', 'CX9', '', V[1], '4', 'by-hand'],
        ['Ariana Nethercott', '', '619001', '', '', 'by-hand'],
      ],
    );
    expect(store.loadRoster().rows.map((r) => r.assign_method)).toEqual(['by-hand', 'by-hand']);
    expect(state.takeVan(rows[0]!)).toBe('');
    expect(state.clearVans()).toBe(1);
    expect(rows.map((r) => [r.vehicle, r.vin, r.assignMethod])).toEqual([
      ['', '', ''],
      ['', '', ''],
    ]);
    state.giveVan(rows[1]!, state.vehicles.rows[0]!);
    expect(rows.map((r) => [r.vehicle, r.vin, r.assignMethod])).toEqual([
      ['', '', ''],
      ['619001', V[0], 'by-hand'],
    ]);
    expect(state.assignMethodLabel(rows[1]!)).toBe('given by hand');
    expect(assignMethodLabel(rows[0]!)).toBe('');
    state.reassignVan(rows[1]!, rows[0]!);
    expect(rows.map((r) => [r.vehicle, r.assignMethod])).toEqual([
      ['619001', 'by-hand'],
      ['', ''],
    ]);
  });

  it('assigns afresh, clearing every row first', () => {
    const rows = [
      createDriverRow({ driver: 'Barrett Ainsworth', serviceType: RM }),
      createDriverRow({ driver: 'Ariana Nethercott', vehicle: '619002', assignMethod: 'by-hand' }),
    ];
    const { state, store } = makeState(rows, [barrett()]);
    const result = state.assignVans();
    expect(result.considered).toBe(1);
    expect(result.vansAvailable).toBe(1);
    expect(rows.map((r) => [r.vehicle, r.vin, r.assignMethod])).toEqual([
      ['619001', V[0], 'service-type'],
      ['', '', ''],
    ]);
    expect(store.loadRoster().rows.map((r) => r.vehicle)).toEqual(['619001', '']);
  });
});

describe('priorities, LMR and affinity', () => {
  it('keeps a priority trimmed, and drops a blank one', () => {
    const { state } = makeState();
    const [first, second] = state.vehicles.rows;
    state.setVehiclePriority(first!, '  7 ');
    state.setVehiclePriority(second!, '3');
    state.setVehiclePriority(second!, '  ');
    expect(Object.fromEntries(state.vehiclePriorities)).toEqual({ [V[0]]: '7' });
  });

  it('gives up a slot of the same kind when taking another', () => {
    const { state } = makeState();
    expect(state.setAffinity(V[0], 'primary_1', T[0])).toEqual([]);
    expect(state.setAffinity(V[1], 'primary_2', T[0])).toEqual([[V[0], 'primary_1']]);
    expect(state.setAffinity(V[2], 'secondary_1', T[0])).toEqual([]);
    expect(state.affinity.slots).toEqual(
      new Map([
        [V[1], new Map([['primary_2', T[0]]])],
        [V[2], new Map([['secondary_1', T[0]]])],
      ]),
    );
    expect(state.setAffinity(V[2], 'secondary_1', '')).toEqual([]);
    expect(state.affinity.slots).toEqual(new Map([[V[1], new Map([['primary_2', T[0]]])]]));
    state.clearAllAffinity();
    expect(state.affinity.slots.size).toBe(0);
  });

  it('adds LMR to the badges of an approved driver', () => {
    const people = [
      createAssociate({
        name: 'Barrett Ainsworth',
        transporterId: T[0],
        qualifications: ['EDV', 'DOT'],
      }),
    ];
    const { state } = makeState([], people);
    state.setLmrApproved(T[0], true);
    state.setLmrApproved('', true);
    expect([...state.lmrApproved]).toEqual([T[0]]);
    expect(state.vanBadges(people[0]!)).toBe('EDV DOT LMR');
    expect(state.vanBadges(createAssociate({ name: 'x', transporterId: T[0] }))).toBe('LMR');
    expect(state.vanBadges(null)).toBe('');
    state.setAffinity(V[1], 'primary_2', T[0]);
    expect(state.affinityAssociate(V[1], 'primary_2')?.name).toBe('Barrett Ainsworth');
    expect(state.affinityAssociate(V[0], 'primary_1')).toBeNull();
  });
});

describe('printing from the state', () => {
  it('fills every field of every row, keyed by ID where there is one', () => {
    const people = [
      createAssociate({
        name: 'Barrett Ainsworth',
        transporterId: T[0],
        qualifications: ['EDV'],
        tenure: 158,
      }),
    ];
    const rows = [
      createDriverRow({
        driver: 'Barrett Ainsworth',
        shiftType: 'Electric Route',
        vehicle: '619001',
        vin: V[0],
        assignMethod: 'previous-day',
        pad: '2',
      }),
      createDriverRow({ driver: 'Ariana Nethercott', bags: '4' }),
    ];
    const { state } = makeState(rows, people);
    const out = state.printRows(TODAY);
    expect(out.map((r) => r.key)).toEqual(['id:A047LNAN5VQIQR', 'name:ariana nethercott']);
    expect(out[0]?.values).toEqual({
      driver: 'Barrett Ainsworth',
      shift_type: 'Electric Route',
      transporter_id: T[0],
      tenure: '158',
      vans: 'EDV',
      check: 'OK',
      routes: '',
      wave_time: '',
      pad: '2',
      service_type: '',
      vehicle: '619001',
      vin: V[0],
      assign_method: 'same van as last time',
      device: '',
      staging_location: '',
      bags: '',
      ovs: '',
      bag: '',
    });
    expect(out[1]?.values.check).toBe('No associate found');
    expect(out[1]?.values.tenure).toBe('');
    expect(printKey(rows[1]!, createAssociate({ name: 'x' }))).toBe('name:ariana nethercott');
  });

  it('keeps the working layout and named layouts', () => {
    const { state } = makeState();
    expect(state.printSpec()).toEqual(defaultSpec());
    const vans = createPrintSpec({ columns: vansColumns(), title: 'Vans' });
    state.setPrintSpec(vans);
    expect(state.printSpec()).toEqual(vans);
    state.savePrintPreset('Yard', vans);
    state.savePrintPreset('Desk', defaultSpec());
    expect(state.printPresets()).toEqual(['Desk', 'Yard']);
    expect(state.printPreset('Yard')).toEqual(vans);
    state.deletePrintPreset('Yard');
    expect(state.printPreset('Yard')).toBeNull();
  });
});
