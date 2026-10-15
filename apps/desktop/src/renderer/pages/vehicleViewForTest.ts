// Tests only: a VehicleView for a van, with its type worked out from the built-in types the way
// the main process does it, so a test only names what it cares about.

import {
  BUILT_IN_TYPES,
  looksLikeLmr,
  resolveVanType,
  typeRanks,
  vanCategory,
  vanKind,
  type Vehicle,
} from '@loadout/core';
import type { VehicleView } from '../../shared/snapshot';

export function vehicleView(vehicle: Vehicle, values: Partial<VehicleView> = {}): VehicleView {
  const { type, source } = resolveVanType(vehicle, BUILT_IN_TYPES, new Map());
  const kind = vanKind(vehicle, type, typeRanks(BUILT_IN_TYPES));
  return {
    vehicle,
    operational: true,
    overridden: false,
    priority: '',
    affinity: {},
    rental: kind.lmrOnly,
    typeId: type.id,
    typeName: type.name,
    category: vanCategory(vehicle, type),
    typeSource: source,
    handOnly: kind.handOnly,
    rank: kind.rank,
    looksLikeLmr: looksLikeLmr(vehicle, type),
    inUse: false,
    available: true,
    ...values,
  };
}
