// Ownership types: what kind of van each one is, which decides who may drive it and where it
// comes in the Assign Vans order.
//
// A van's type comes from the vehicle list's Ownership Type column: each type lists the words
// that mean it. A van can also be set to a type by hand, which wins over the list. A word no type
// knows, or a blank one, leaves the van a Branded Van and is flagged so somebody can look.
//
// Step vans are not a type. Whatever their owner, they go first in the Assign Vans order, as
// they always have; their type still decides who may drive them.

import { isStepVan, type Vehicle } from './vehicles';

/** Who may drive a van of this type. */
export type DriveRule = 'anyone' | 'lmr' | 'hand';

export const DRIVE_RULES: readonly DriveRule[] = ['anyone', 'lmr', 'hand'];

export const DRIVE_LABELS: Readonly<Record<DriveRule, string>> = {
  anyone: 'Anyone qualified',
  lmr: 'LMR approved drivers only',
  hand: 'Nobody. Given by hand only',
};

export interface VehicleType {
  id: string;
  name: string;
  drive: DriveRule;
  /** Place in the Assign Vans order, lowest first. Not used for a hand-only type. */
  position: number;
  /** The vehicle list's ownership words that mean this type, upper case. */
  words: string[];
  /** One of the four the app starts with. They can be changed, not deleted. */
  builtIn: boolean;
}

export const BRANDED = 'branded';
export const LMR_RENTAL = 'lmr-rental';
export const RENTAL = 'rental';
export const SELF_OWNED = 'self-owned';

/**
 * The types the app starts with. Branded Van is also where a van goes when the list's word is one
 * no type knows. Rental Van is for plain rentals, which anyone qualified may drive.
 */
export const BUILT_IN_TYPES: readonly VehicleType[] = [
  {
    id: BRANDED,
    name: 'Branded Van',
    drive: 'anyone',
    position: 1,
    words: ['AMAZON_OWNED', 'AMAZON_LEASED'],
    builtIn: true,
  },
  {
    id: RENTAL,
    name: 'Rental Van',
    drive: 'anyone',
    position: 2,
    words: ['RENTAL'],
    builtIn: true,
  },
  {
    id: LMR_RENTAL,
    name: 'LMR Rental',
    drive: 'lmr',
    position: 3,
    words: ['AMAZON_RENTAL'],
    builtIn: true,
  },
  {
    id: SELF_OWNED,
    name: 'Self-Owned',
    drive: 'hand',
    position: 4,
    words: ['SELF_OWNED'],
    builtIn: true,
  },
];

/** A word from the list as the types keep it: trimmed, upper case. */
export function ownershipWord(text: string): string {
  return text.trim().toUpperCase();
}

/**
 * The built-in types with any saved changes laid over them, then the ones somebody made. Sorted
 * by their place in the order.
 */
export function mergeTypes(saved: readonly VehicleType[]): VehicleType[] {
  const byId = new Map(saved.map((type) => [type.id, type]));
  const types = BUILT_IN_TYPES.map((type) => ({ ...(byId.get(type.id) ?? type), builtIn: true }));
  for (const type of saved) {
    if (!BUILT_IN_TYPES.some((built) => built.id === type.id))
      types.push({ ...type, builtIn: false });
  }
  return sortTypes(types);
}

export function sortTypes(types: readonly VehicleType[]): VehicleType[] {
  return [...types].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

/** Why a van has the type it has. */
export type TypeSource = 'set-here' | 'list' | 'unknown' | 'blank';

export interface VanType {
  type: VehicleType;
  source: TypeSource;
}

function fallback(types: readonly VehicleType[]): VehicleType {
  return types.find((type) => type.id === BRANDED) ?? (BUILT_IN_TYPES[0] as VehicleType);
}

/** A van's type: set here, else the one whose words hold the list's word, else Branded Van. */
export function resolveVanType(
  vehicle: Pick<Vehicle, 'vin' | 'ownership'>,
  types: readonly VehicleType[],
  overrides: ReadonlyMap<string, string>,
): VanType {
  const setHere = overrides.get(vehicle.vin);
  const chosen = setHere ? types.find((type) => type.id === setHere) : undefined;
  if (chosen) return { type: chosen, source: 'set-here' };
  const word = ownershipWord(vehicle.ownership);
  if (!word) return { type: fallback(types), source: 'blank' };
  const listed = types.find((type) => type.words.includes(word));
  if (listed) return { type: listed, source: 'list' };
  return { type: fallback(types), source: 'unknown' };
}

/** What Assign Vans needs to know about a van's type. */
export interface VanKind {
  /** Only LMR approved drivers may take it. */
  lmrOnly: boolean;
  /** Never handed out by Assign Vans. */
  handOnly: boolean;
  /** Its place in the order: step vans 0, then each handed-out type in turn. */
  rank: number;
}

/** Each type's place in the order, counting step vans as the first. Hand-only types come last. */
export function typeRanks(types: readonly VehicleType[]): Map<string, number> {
  const ranks = new Map<string, number>();
  const handedOut = sortTypes(types).filter((type) => type.drive !== 'hand');
  handedOut.forEach((type, index) => ranks.set(type.id, index + 1));
  for (const type of types) if (!ranks.has(type.id)) ranks.set(type.id, handedOut.length + 1);
  return ranks;
}

export function vanKind(
  vehicle: Pick<Vehicle, 'serviceType'>,
  type: VehicleType,
  ranks: ReadonlyMap<string, number>,
): VanKind {
  return {
    lmrOnly: type.drive === 'lmr',
    handOnly: type.drive === 'hand',
    rank: isStepVan(vehicle) ? 0 : (ranks.get(type.id) ?? ranks.size + 1),
  };
}

/** The kind of van as the pages name it: its type, or a step van and its type. */
export function vanCategory(vehicle: Pick<Vehicle, 'serviceType'>, type: VehicleType): string {
  if (!isStepVan(vehicle)) return type.name;
  return type.id === BRANDED ? 'Step Van' : `Step Van, ${type.name}`;
}

/** A name says LMR but its type is not one only LMR approved drivers may take. */
export function looksLikeLmr(vehicle: Pick<Vehicle, 'name'>, type: VehicleType): boolean {
  return /\bLMR\b/i.test(vehicle.name) && type.drive !== 'lmr';
}

/** The list's words no type knows, with how many vans carry each. Most vans first. */
export function unknownWords(
  vehicles: readonly Pick<Vehicle, 'ownership'>[],
  types: readonly VehicleType[],
): Array<{ word: string; vans: number }> {
  const known = new Set(types.flatMap((type) => type.words));
  const counts = new Map<string, number>();
  for (const vehicle of vehicles) {
    const word = ownershipWord(vehicle.ownership);
    if (word && !known.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts]
    .map(([word, vans]) => ({ word, vans }))
    .sort((a, b) => b.vans - a.vans || a.word.localeCompare(b.word));
}

/**
 * Give `type` these words, taking each away from any other type that had it (a word means one
 * type). Returns the whole list as it is after.
 */
export function withWords(
  types: readonly VehicleType[],
  id: string,
  words: readonly string[],
): VehicleType[] {
  const clean = [...new Set(words.map(ownershipWord).filter((word) => word))];
  return types.map((type) =>
    type.id === id
      ? { ...type, words: clean }
      : { ...type, words: type.words.filter((word) => !clean.includes(word)) },
  );
}

/**
 * Put a handed-out type at this place among the handed-out types (1 is first after step vans).
 * A hand-only type goes after them all. Positions renumbered.
 */
export function placeType(types: readonly VehicleType[], id: string, place: number): VehicleType[] {
  const sorted = sortTypes(types);
  const target = sorted.find((type) => type.id === id);
  if (!target) return [...types];
  const rest = sorted.filter((type) => type.id !== id);
  const handedOut = rest.filter((type) => type.drive !== 'hand');
  const hand = rest.filter((type) => type.drive === 'hand');
  if (target.drive === 'hand') hand.push(target);
  else handedOut.splice(Math.max(0, Math.min(place - 1, handedOut.length)), 0, target);
  return [...handedOut, ...hand].map((type, index) => ({ ...type, position: index + 1 }));
}

/** The types as they should be saved: the ones somebody made, and built-in ones they changed. */
export function typesToSave(types: readonly VehicleType[]): VehicleType[] {
  return types.filter((type) => {
    const built = BUILT_IN_TYPES.find((b) => b.id === type.id);
    if (!built) return true;
    return (
      built.name !== type.name ||
      built.drive !== type.drive ||
      built.position !== type.position ||
      built.words.join('\n') !== type.words.join('\n')
    );
  });
}
