// Van affinity: which associates belong to which van.

import { PRIMARY_SLOTS } from './constants';

/** 'primary' or 'secondary' - which of a driver's two holds this is. */
export function slotKind(slot: string): 'primary' | 'secondary' {
  return PRIMARY_SLOTS.includes(slot) ? 'primary' : 'secondary';
}

/** VIN -> slot -> Transporter ID. */
export interface VanAffinity {
  slots: Map<string, Map<string, string>>;
}

export function createVanAffinity(): VanAffinity {
  return { slots: new Map() };
}

/** How many slots are filled in all. */
export function affinitySize(affinity: VanAffinity): number {
  let total = 0;
  for (const held of affinity.slots.values()) total += held.size;
  return total;
}

export function isAffinityEmpty(affinity: VanAffinity): boolean {
  return affinitySize(affinity) === 0;
}

export function affinityGet(affinity: VanAffinity, vin: string, slot: string): string {
  return affinity.slots.get(vin)?.get(slot) ?? '';
}

export function affinityClear(affinity: VanAffinity, vin: string, slot: string): void {
  const held = affinity.slots.get(vin);
  if (held && held.size > 0) {
    held.delete(slot);
    if (held.size === 0) affinity.slots.delete(vin);
  }
}

/** Put an associate in a slot; an empty Transporter ID empties it. */
export function affinitySet(
  affinity: VanAffinity,
  vin: string,
  slot: string,
  transporterId: string,
): void {
  if (!transporterId) {
    affinityClear(affinity, vin, slot);
    return;
  }
  let held = affinity.slots.get(vin);
  if (!held) {
    held = new Map();
    affinity.slots.set(vin, held);
  }
  held.set(slot, transporterId);
}

export function affinityForVehicle(affinity: VanAffinity, vin: string): Map<string, string> {
  return new Map(affinity.slots.get(vin) ?? []);
}

/** Every [vin, slot] this associate currently holds. */
export function heldBy(affinity: VanAffinity, transporterId: string): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  for (const [vin, held] of affinity.slots) {
    for (const [slot, holder] of held) {
      if (holder === transporterId) found.push([vin, slot]);
    }
  }
  return found;
}

/** The VIN this associate is primary or secondary on, if any. */
export function vehicleOf(
  affinity: VanAffinity,
  transporterId: string,
  kind: 'primary' | 'secondary',
): string {
  for (const [vin, slot] of heldBy(affinity, transporterId)) {
    if (slotKind(slot) === kind) return vin;
  }
  return '';
}

export function affinityDrivers(affinity: VanAffinity): Set<string> {
  const drivers = new Set<string>();
  for (const held of affinity.slots.values())
    for (const holder of held.values()) drivers.add(holder);
  return drivers;
}
