// Ownership types: built in, made by hand, set per van, and what Assign Vans and the Check column
// make of them. Made-up vans and drivers from packages/fixtures/manifest.json.

import { Store } from '@loadout/storage';
import { describe, expect, it } from 'vitest';
import { createAssociate, createAssociateBook } from '../models/associates';
import { createDriverRow, createRoster, type DriverRow } from '../models/roster';
import { createVehicle, createVehicleFleet } from '../models/vehicles';
import { looksLikeLmr, unknownWords, vanCategory } from '../models/vehicleTypes';
import { AppState } from './appState';

const V = [
  '1F61D2KP0L0W91839',
  '1F66B2RY9L0Y83576',
  '1F69F2MV9L0F55866',
  '1F63V3PT9L0H56725',
] as const;
const T = 'A047LNAN5VQIQR';
const RM = 'Standard Parcel Electric - Rivian MEDIUM';

function makeState(rows: DriverRow[] = [], store = new Store(':memory:')) {
  const state = new AppState(store);
  state.roster = createRoster({ rows, loadOutDate: '2026-09-01' });
  state.associates = createAssociateBook({
    rows: [
      createAssociate({ name: 'Barrett Ainsworth', transporterId: T, qualifications: ['EDV'] }),
    ],
  });
  state.vehicles = createVehicleFleet({
    rows: [
      createVehicle({ vin: V[0], name: '619001', serviceType: RM, ownership: 'AMAZON_OWNED' }),
      createVehicle({
        vin: V[1],
        name: '655071 (LMR)',
        serviceType: RM,
        ownership: 'AMAZON_RENTAL',
      }),
      createVehicle({ vin: V[2], name: '619002', serviceType: RM, ownership: 'RENTAL' }),
      createVehicle({ vin: V[3], name: '619003', serviceType: RM, ownership: 'LOANER' }),
    ],
  });
  state.rematch();
  return { state, store };
}

const typeOf = (state: AppState, index: number) =>
  state.vanType(state.vehicles.rows[index]!).type.name;

describe('which type a van is', () => {
  it('comes from the list, with plain Rental apart from LMR Rental, and an odd word flagged', () => {
    const { state } = makeState();
    expect([0, 1, 2, 3].map((i) => typeOf(state, i))).toEqual([
      'Branded Van',
      'LMR Rental',
      'Rental Van',
      'Branded Van',
    ]);
    expect(state.vanType(state.vehicles.rows[3]!).source).toBe('unknown');
    expect(unknownWords(state.vehicles.rows, state.vehicleTypes)).toEqual([
      { word: 'LOANER', vans: 1 },
    ]);
    expect(state.lmrVehicles().map((v) => v.name)).toEqual(['655071 (LMR)']);
  });

  it('can be set by hand, outlives a fresh start, and goes back to the list', () => {
    const { state, store } = makeState();
    expect(state.setVanTypes([{ vin: V[0], typeId: 'lmr-rental' }])).toBe(1);
    expect(typeOf(state, 0)).toBe('LMR Rental');
    const again = new AppState(store);
    again.loadAll();
    expect(again.vehicleTypeOverrides.get(V[0])).toBe('lmr-rental');
    state.setVanTypes([{ vin: V[0], typeId: '' }]);
    expect(typeOf(state, 0)).toBe('Branded Van');
  });

  it('names step vans by their type, and spots a name that says LMR', () => {
    const { state } = makeState();
    const step = createVehicle({ serviceType: 'Standard Parcel Step Van - US' });
    expect(vanCategory(step, state.vehicleTypes[0]!)).toBe('Step Van');
    expect(vanCategory(step, state.vehicleTypes[2]!)).toBe('Step Van, LMR Rental');
    state.setVanTypes([{ vin: V[1], typeId: 'branded' }]);
    expect(looksLikeLmr(state.vehicles.rows[1]!, state.vanType(state.vehicles.rows[1]!).type)).toBe(
      true,
    );
  });
});

describe('making and changing types', () => {
  it('makes a type with its words and place, taking a word from the type that had it', () => {
    const { state, store } = makeState();
    const id = state.saveVehicleType(null, {
      name: 'Loaner',
      drive: 'anyone',
      words: ['loaner', 'rental'],
      place: 1,
    });
    expect(id).toBe('loaner');
    expect(typeOf(state, 3)).toBe('Loaner');
    expect(typeOf(state, 2)).toBe('Loaner');
    expect(state.vehicleTypes.map((t) => t.name)).toEqual([
      'Loaner',
      'Branded Van',
      'Rental Van',
      'LMR Rental',
      'Self-Owned',
    ]);
    expect(
      store
        .loadVehicleTypes()
        .map((t) => t.id)
        .sort(),
    ).toEqual(['branded', 'lmr-rental', 'loaner', 'rental', 'self-owned']);
  });

  it('moves a type in the order, and keeps a hand-only one out of it', () => {
    const { state } = makeState();
    state.moveVehicleType('lmr-rental', 'earlier');
    expect(state.vehicleTypes.map((t) => t.id)).toEqual([
      'branded',
      'lmr-rental',
      'rental',
      'self-owned',
    ]);
    state.moveVehicleType('self-owned', 'earlier');
    expect(state.vehicleTypes.at(-1)!.id).toBe('self-owned');
  });

  it('deletes a made type, moving its vans and its words to another', () => {
    const { state } = makeState();
    state.saveVehicleType(null, { name: 'Loaner', drive: 'anyone', words: ['LOANER'], place: 9 });
    state.setVanTypes([{ vin: V[0], typeId: 'loaner' }]);
    state.deleteVehicleType('loaner', 'rental');
    expect(typeOf(state, 0)).toBe('Rental Van');
    expect(typeOf(state, 3)).toBe('Rental Van');
    state.deleteVehicleType('branded', 'rental');
    expect(state.vehicleTypes.some((t) => t.id === 'branded')).toBe(true);
  });

  it('puts everything back as it was for Undo', () => {
    const { state } = makeState();
    const before = state.vehicleTypes.map((t) => ({ ...t }));
    state.saveVehicleType(null, { name: 'Loaner', drive: 'hand', words: ['LOANER'], place: 1 });
    state.setVanTypes([{ vin: V[0], typeId: 'loaner' }]);
    state.restoreVehicleTypes(before, {});
    expect(state.vehicleTypes).toEqual(before);
    expect(state.vehicleTypeOverrides.size).toBe(0);
  });
});

describe('what Assign Vans and the Check column make of it', () => {
  it('keeps a hand-only type out of the run, and a rental LMR only', () => {
    const rows = [createDriverRow({ driver: 'Barrett Ainsworth', serviceType: RM })];
    const { state } = makeState(rows);
    state.setVanTypes([
      { vin: V[0], typeId: 'self-owned' },
      { vin: V[2], typeId: 'self-owned' },
      { vin: V[3], typeId: 'self-owned' },
    ]);
    const result = state.assignVans();
    // The only van left is the LMR rental, and Barrett is not approved for it.
    expect(result.assignments[0]!.vehicle).toBeNull();
    expect(result.assignments[0]!.reason).toBe('Only LMR vans left, and not on the approved list');
  });

  it('flags a driver holding a grounded van, or an LMR van they are not approved for', () => {
    const rows = [createDriverRow({ driver: 'Barrett Ainsworth', vehicle: '655071 (LMR)' })];
    const { state } = makeState(rows);
    expect(state.vanIssues(rows[0]!)).toEqual(['Not LMR approved for this van']);
    state.setOperational(state.vehicles.rows[1]!, false);
    expect(state.rowCheck(rows[0]!, '2026-09-01')).toBe(
      'Van is grounded, Not LMR approved for this van',
    );
    state.setLmrApproved(T, true);
    expect(state.vanIssues(rows[0]!)).toEqual(['Van is grounded']);
  });

  it('never keeps a grounded van, even one given by hand', () => {
    const rows = [
      createDriverRow({
        driver: 'Barrett Ainsworth',
        serviceType: RM,
        vehicle: '619001',
        vin: V[0],
        assignMethod: 'by-hand',
      }),
    ];
    const { state } = makeState(rows);
    state.setOperational(state.vehicles.rows[0]!, false);
    const result = state.assignVans();
    expect(result.kept).toBe(0);
    expect(rows[0]!.vehicle).not.toBe('619001');
  });
});
