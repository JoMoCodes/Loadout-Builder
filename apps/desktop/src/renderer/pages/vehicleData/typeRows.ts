// What the Vehicle Types tab says, worked out from the snapshot: each van's type and why it is
// flagged, the Assign Vans order, and what a change would do before it is made.

import {
  ownershipWord,
  placeType,
  resolveVanType,
  sortTypes,
  typeRanks,
  vanKind,
  withWords,
  type DriveRule,
  type VehicleType,
} from '@loadout/core';
import type { AppSnapshot, VehicleView } from '../../../shared/snapshot';
import { nameList, ownershipLabel } from '../dataPages/format';

export const ALL_TYPES = 'All types';

export const typeVanId = (view: VehicleView): string => view.vehicle.vin;

/** The types as plain records (the snapshot adds counts and places). */
export function plainTypes(snapshot: Pick<AppSnapshot, 'vehicleTypes'>): VehicleType[] {
  return snapshot.vehicleTypes.map((type) => ({
    id: type.id,
    name: type.name,
    drive: type.drive,
    position: type.position,
    words: [...type.words],
    builtIn: type.builtIn,
  }));
}

/** What the vehicle list's Ownership Type column says, as people read it. */
export function listSays(view: VehicleView): string {
  return view.vehicle.ownership.trim() ? ownershipLabel(view.vehicle.ownership) : 'Blank';
}

/** Why a van stands out on this tab, and in which colour. Empty for a van that does not. */
export function whyListed(view: VehicleView): { text: string; tone: 'warn' | 'bad' | '' } {
  if (view.looksLikeLmr) return { text: `Name says LMR, type is ${view.typeName}`, tone: 'bad' };
  if (view.typeSource === 'set-here') return { text: 'Set here', tone: 'warn' };
  if (view.typeSource === 'unknown') {
    return { text: `The app doesn't know "${listSays(view)}"`, tone: 'bad' };
  }
  if (view.typeSource === 'blank') return { text: "The list doesn't say", tone: 'bad' };
  return { text: '', tone: '' };
}

export function typeFilterOptions(snapshot: Pick<AppSnapshot, 'vehicleTypes'>): string[] {
  return [ALL_TYPES, ...snapshot.vehicleTypes.map((type) => type.name)];
}

export function passesTypeFilters(view: VehicleView, typeName: string, flaggedOnly: boolean) {
  if (typeName !== ALL_TYPES && view.typeName !== typeName) return false;
  return !flaggedOnly || whyListed(view).tone !== '';
}

/** "Branded Van: 38   LMR Rental: 5": vans of each type, in the order's order. */
export function typeMix(snapshot: Pick<AppSnapshot, 'vehicleTypes'>): string {
  return snapshot.vehicleTypes
    .filter((type) => type.vans > 0)
    .map((type) => `${type.name}: ${type.vans}`)
    .join('   ');
}

/** One step of the Assign Vans order, as the strip and the windows show it. */
export interface OrderStep {
  place: number;
  id: string;
  name: string;
  who: string;
  builtIn: boolean;
}

export const STEP_VANS: OrderStep = {
  place: 1,
  id: '',
  name: 'Step vans',
  who: 'Any owner. Always first',
  builtIn: true,
};

const WHO_SHORT: Record<DriveRule, string> = {
  anyone: 'Anyone qualified',
  lmr: 'LMR approved only',
  hand: 'Given by hand only',
};

export function whoShort(drive: DriveRule): string {
  return WHO_SHORT[drive];
}

/** The order: step vans, then each handed-out type. Hand-only types are not in it. */
export function orderSteps(types: readonly VehicleType[]): OrderStep[] {
  const handedOut = sortTypes(types).filter((type) => type.drive !== 'hand');
  return [
    STEP_VANS,
    ...handedOut.map((type, index) => ({
      place: index + 2,
      id: type.id,
      name: type.name,
      who: WHO_SHORT[type.drive],
      builtIn: type.builtIn,
    })),
  ];
}

// ----------------------------------------------------------- what a change does

/** The id a new type has before it is saved. */
export const NEW_TYPE = '__new__';

export interface TypeFields {
  name: string;
  drive: DriveRule;
  words: string[];
  place: number;
}

/** The types as they would be after saving these fields (the same steps the main side takes). */
export function typesAfterSave(
  types: readonly VehicleType[],
  id: string | null,
  fields: TypeFields,
): VehicleType[] {
  const typeId = id ?? NEW_TYPE;
  let next: VehicleType[] =
    id === null
      ? [
          ...types,
          {
            id: typeId,
            name: fields.name,
            drive: fields.drive,
            position: 999,
            words: [],
            builtIn: false,
          },
        ]
      : types.map((type) =>
          type.id === id ? { ...type, name: fields.name, drive: fields.drive } : type,
        );
  next = withWords(next, typeId, fields.words);
  return placeType(next, typeId, fields.place);
}

export function typesAfterMove(
  types: readonly VehicleType[],
  id: string,
  direction: 'earlier' | 'later',
): VehicleType[] {
  const handedOut = sortTypes(types).filter((type) => type.drive !== 'hand');
  const at = handedOut.findIndex((type) => type.id === id);
  const to = direction === 'earlier' ? at : at + 2;
  if (at === -1 || to < 1 || to > handedOut.length) return [...types];
  return placeType(types, id, to);
}

export function typesAfterWord(
  types: readonly VehicleType[],
  typeId: string,
  word: string,
): VehicleType[] {
  const type = types.find((t) => t.id === typeId);
  return type ? withWords(types, typeId, [...type.words, word]) : [...types];
}

export function afterDelete(
  types: readonly VehicleType[],
  overrides: Readonly<Record<string, string>>,
  id: string,
  moveTo: string,
): { types: VehicleType[]; overrides: Record<string, string> } {
  const type = types.find((t) => t.id === id);
  const target = types.find((t) => t.id === moveTo);
  if (!type || !target) return { types: [...types], overrides: { ...overrides } };
  const moved = withWords(types, moveTo, [...target.words, ...type.words]).filter(
    (t) => t.id !== id,
  );
  const next: Record<string, string> = {};
  for (const [vin, typeId] of Object.entries(overrides))
    next[vin] = typeId === id ? moveTo : typeId;
  return { types: moved, overrides: next };
}

export interface Impact {
  /** Vans whose type, who may drive them, or place in the order would change. */
  changed: VehicleView[];
  /** Of those, the ones a driver on today's roster is holding. */
  held: VehicleView[];
}

/** What a change to the types or to the vans set here would do to the fleet. */
export function impactOf(
  vehicles: readonly VehicleView[],
  types: readonly VehicleType[],
  overrides: Readonly<Record<string, string>>,
): Impact {
  const ranks = typeRanks(types);
  const setHere = new Map(Object.entries(overrides));
  const changed = vehicles.filter((view) => {
    const { type } = resolveVanType(view.vehicle, types, setHere);
    const kind = vanKind(view.vehicle, type, ranks);
    return (
      type.name !== view.typeName ||
      kind.lmrOnly !== view.rental ||
      kind.handOnly !== view.handOnly ||
      kind.rank !== view.rank
    );
  });
  return { changed, held: changed.filter((view) => view.inUse) };
}

/**
 * The question asked before a change that moves vans, or null when nothing moves. It names the
 * vans a driver on today's roster is holding, so nobody is surprised at the Check column.
 */
export function impactQuestion(impact: Impact): string | null {
  const count = impact.changed.length;
  if (count === 0) return null;
  const vans = count === 1 ? '1 van' : `${count} vans`;
  const names = nameList(impact.changed.map((view) => view.vehicle.name));
  let body = `This changes ${vans}: ${names}.`;
  if (impact.held.length > 0) {
    const held = nameList(impact.held.map((view) => view.vehicle.name));
    body +=
      `\n\n${impact.held.length === 1 ? '1 of them is' : `${impact.held.length} of them are`} ` +
      `with a driver on today's roster: ${held}. The Check column says if a driver may no longer ` +
      'take one.';
  }
  return `${body}\n\nGo ahead?`;
}

/** A word as the types keep it, or '' for one that is only spaces. */
export function cleanWord(text: string): string {
  return ownershipWord(text);
}
