// The ownership side of the day's state: which type each van is, the types themselves, and
// changing either. Like vans.ts, each function takes the state first and `AppState` delegates.

import type { KindOf } from '../assignment';
import {
  DRIVE_RULES,
  mergeTypes,
  ownershipWord,
  placeType,
  resolveVanType,
  sortTypes,
  typeRanks,
  typesToSave,
  vanKind,
  withWords,
  BRANDED,
  type DriveRule,
  type VanType,
  type VehicleType,
} from '../models/vehicleTypes';
import type { Vehicle } from '../models/vehicles';
import type { AppState } from './appState';
import type { StoredVehicleType } from './store';

export function typesFromStored(saved: readonly StoredVehicleType[]): VehicleType[] {
  return mergeTypes(
    saved.map((type) => ({
      ...type,
      drive: (DRIVE_RULES as readonly string[]).includes(type.drive)
        ? (type.drive as DriveRule)
        : 'anyone',
      words: type.words.map(ownershipWord).filter((word) => word),
    })),
  );
}

export function vanTypeOf(state: AppState, vehicle: Vehicle): VanType {
  return resolveVanType(vehicle, state.vehicleTypes, state.vehicleTypeOverrides);
}

/** Who may take each van and its place in the order, as Assign Vans asks. */
export function kindOf(state: AppState): KindOf {
  const ranks = typeRanks(state.vehicleTypes);
  return (vehicle) => vanKind(vehicle, vanTypeOf(state, vehicle).type, ranks);
}

function saveAll(state: AppState, types: readonly VehicleType[]): void {
  const next = sortTypes(types);
  for (const type of state.store.loadVehicleTypes()) state.store.deleteVehicleType(type.id);
  for (const type of typesToSave(next)) state.store.saveVehicleType(type);
  state.vehicleTypes = next;
  // A van set to a type that is gone goes back to its list's type.
  for (const [vin, id] of [...state.vehicleTypeOverrides]) {
    if (!next.some((type) => type.id === id)) {
      state.store.setVehicleTypeOverride(vin, '');
      state.vehicleTypeOverrides.delete(vin);
    }
  }
}

/** Set vans to a type by hand. An empty type id puts a van back on its list's type. */
export function setVanTypes(
  state: AppState,
  changes: ReadonlyArray<{ vin: string; typeId: string }>,
): number {
  let changed = 0;
  for (const { vin, typeId } of changes) {
    const now = state.vehicleTypeOverrides.get(vin) ?? '';
    if (now === typeId) continue;
    if (typeId && !state.vehicleTypes.some((type) => type.id === typeId)) continue;
    state.store.setVehicleTypeOverride(vin, typeId);
    if (typeId) state.vehicleTypeOverrides.set(vin, typeId);
    else state.vehicleTypeOverrides.delete(vin);
    changed += 1;
  }
  if (changed) state.notify();
  return changed;
}

export interface TypeFields {
  name: string;
  drive: DriveRule;
  words: readonly string[];
  /** Place among the handed-out types, 1 first (after step vans). */
  place: number;
}

/** Make a type, or change one (`id` given). Returns its id. */
export function saveType(state: AppState, id: string | null, fields: TypeFields): string {
  const name = fields.name.trim();
  let types = [...state.vehicleTypes];
  let typeId = id ?? '';
  if (id === null) {
    typeId = newId(name, types);
    types.push({ id: typeId, name, drive: fields.drive, position: 999, words: [], builtIn: false });
  } else {
    types = types.map((type) => (type.id === id ? { ...type, name, drive: fields.drive } : type));
  }
  types = withWords(types, typeId, fields.words);
  types = placeType(types, typeId, fields.place);
  saveAll(state, types);
  state.notify();
  return typeId;
}

function newId(name: string, types: readonly VehicleType[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'type';
  let id = base;
  for (let n = 2; types.some((type) => type.id === id); n++) id = `${base}-${n}`;
  return id;
}

/** Add one of the list's words to a type (taking it from any other). */
export function addWord(state: AppState, typeId: string, word: string): void {
  const type = state.vehicleTypes.find((t) => t.id === typeId);
  if (!type) return;
  saveAll(state, withWords(state.vehicleTypes, typeId, [...type.words, word]));
  state.notify();
}

/** Move a type earlier or later in the Assign Vans order. */
export function moveTypeInOrder(state: AppState, id: string, direction: 'earlier' | 'later'): void {
  const sorted = sortTypes(state.vehicleTypes).filter((type) => type.drive !== 'hand');
  const at = sorted.findIndex((type) => type.id === id);
  if (at === -1) return;
  const to = direction === 'earlier' ? at : at + 2;
  if (to < 1 || to > sorted.length) return;
  saveAll(state, placeType(state.vehicleTypes, id, to));
  state.notify();
}

/**
 * Delete a type somebody made. Its vans go to `moveTo`: the ones set here are set to it, and its
 * words become that type's, so vans from the list follow too. Built-in types stay.
 */
export function deleteType(state: AppState, id: string, moveTo: string): void {
  const type = state.vehicleTypes.find((t) => t.id === id);
  const target = state.vehicleTypes.find((t) => t.id === moveTo && t.id !== id);
  if (!type || type.builtIn) return;
  const destination = target ?? state.vehicleTypes.find((t) => t.id === BRANDED);
  if (!destination) return;
  for (const [vin, typeId] of [...state.vehicleTypeOverrides]) {
    if (typeId === id) {
      state.store.setVehicleTypeOverride(vin, destination.id);
      state.vehicleTypeOverrides.set(vin, destination.id);
    }
  }
  const moved = withWords(state.vehicleTypes, destination.id, [
    ...destination.words,
    ...type.words,
  ]).filter((t) => t.id !== id);
  saveAll(state, moved);
  state.notify();
}

/** Put the types and the vans set here back exactly as given (Undo). */
export function restoreTypes(
  state: AppState,
  types: readonly VehicleType[],
  overrides: Readonly<Record<string, string>>,
): void {
  saveAll(state, mergeTypes(types.filter((type) => type.id && type.name)));
  state.store.clearVehicleTypeOverrides();
  state.vehicleTypeOverrides = new Map();
  for (const [vin, typeId] of Object.entries(overrides)) {
    if (!state.vehicleTypes.some((type) => type.id === typeId)) continue;
    state.store.setVehicleTypeOverride(vin, typeId);
    state.vehicleTypeOverrides.set(vin, typeId);
  }
  state.notify();
}

export function clearVanTypes(state: AppState): void {
  state.store.clearVehicleTypeOverrides();
  state.vehicleTypeOverrides = new Map();
  state.notify();
}
