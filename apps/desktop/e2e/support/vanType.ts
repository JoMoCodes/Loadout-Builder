// The type fields of a made-up van, worked out from the built-in ownership types the way the main
// process does it, so the page tests' vans say what the app would say.

import {
  BUILT_IN_TYPES,
  createVehicle,
  looksLikeLmr,
  resolveVanType,
  typeRanks,
  vanCategory,
  vanKind,
  type Vehicle,
} from '@loadout/core';

export function typeFields(values: Partial<Vehicle>): Record<string, unknown> {
  const vehicle = createVehicle(values);
  const { type, source } = resolveVanType(vehicle, BUILT_IN_TYPES, new Map());
  const kind = vanKind(vehicle, type, typeRanks(BUILT_IN_TYPES));
  return {
    rental: kind.lmrOnly,
    typeId: type.id,
    typeName: type.name,
    category: vanCategory(vehicle, type),
    typeSource: source,
    handOnly: kind.handOnly,
    rank: kind.rank,
    looksLikeLmr: looksLikeLmr(vehicle, type),
  };
}

/** The built-in types as the snapshot lists them, with no vans counted. */
export function snapshotTypes(): Array<Record<string, unknown>> {
  const ranks = typeRanks(BUILT_IN_TYPES);
  return BUILT_IN_TYPES.map((type) => ({
    ...type,
    words: [...type.words],
    vans: 0,
    place: type.drive === 'hand' ? null : (ranks.get(type.id) ?? 0) + 1,
  }));
}
