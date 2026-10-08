// What the Van Affinity tab says, worked out from the snapshot. A van holds two preferred drivers
// and two backups; a driver holds at most one van of each kind. The wording is the old page's.

import { AFFINITY_SLOTS, SLOT_LABELS, normalizeName, slotKind } from '@loadout/core';
import type { AppSnapshot, AssociateView, VehicleView } from '../../../shared/snapshot';
import type { DisplacedSlot } from '../../../shared/channels/vehicles';

export const SLOTS = AFFINITY_SLOTS.map(([id, label]) => ({ id, label }));

export function slotLabel(slot: string): string {
  return SLOT_LABELS.get(slot) ?? slot;
}

export function isSlot(columnId: string): boolean {
  return SLOT_LABELS.has(columnId);
}

export const AFFINITY_EMPTY = {
  title: 'No vehicles loaded.',
  body: 'Import the fleet on the Vehicle Management tab first - affinity is set against the vans it brings in.',
};

/** The van's name in the fleet, or the VIN itself for a van that is no longer in it. */
export function vanName(snapshot: AppSnapshot, vin: string): string {
  return snapshot.vehicles.find((view) => view.vehicle.vin === vin)?.vehicle.name ?? vin;
}

/** Transporter ID -> what they already hold ("primary on 1234, secondary on 5678"), for the window. */
export function holdsSummary(snapshot: AppSnapshot): Map<string, string> {
  const summary = new Map<string, string[]>();
  for (const [vin, held] of Object.entries(snapshot.affinity)) {
    const name = vanName(snapshot, vin);
    for (const [slot, id] of Object.entries(held)) {
      const list = summary.get(id) ?? [];
      list.push(`${slotKind(slot)} on ${name}`);
      summary.set(id, list);
    }
  }
  return new Map([...summary].map(([id, parts]) => [id, [...parts].sort().join(', ')]));
}

/** The VIN this driver is primary or secondary on, or ''. */
export function heldVin(
  snapshot: AppSnapshot,
  transporterId: string,
  kind: 'primary' | 'secondary',
): string {
  for (const [vin, held] of Object.entries(snapshot.affinity)) {
    for (const [slot, id] of Object.entries(held)) {
      if (id === transporterId && slotKind(slot) === kind) return vin;
    }
  }
  return '';
}

/** One slot's cell on the van side: the driver's name and badges, or the raw ID if not in the list. */
export function slotCell(snapshot: AppSnapshot, view: VehicleView, slot: string): string {
  const id = view.affinity[slot] ?? '';
  if (!id) return '';
  const associate = snapshot.associates.find(
    (candidate) => candidate.associate.transporterId === id,
  );
  if (!associate) return id;
  return associate.vanBadges
    ? `${associate.associate.name} [${associate.vanBadges}]`
    : associate.associate.name;
}

/** The three counts in the header: slots filled, drivers holding them, vans holding them. */
export function affinityCounts(snapshot: AppSnapshot): {
  assignments: number;
  drivers: number;
  vans: number;
} {
  const drivers = new Set<string>();
  for (const held of Object.values(snapshot.affinity)) {
    for (const id of Object.values(held)) drivers.add(id);
  }
  return {
    assignments: snapshot.counts.affinitySlots,
    drivers: drivers.size,
    vans: Object.keys(snapshot.affinity).length,
  };
}

/** A row of the driver-side table (read only). */
export interface DriverSideRow {
  view: AssociateView;
  primary: string;
  secondary: string;
}

export function driverSideRows(snapshot: AppSnapshot): DriverSideRow[] {
  return snapshot.associates.map((view) => {
    const primary = heldVin(snapshot, view.associate.transporterId, 'primary');
    const secondary = heldVin(snapshot, view.associate.transporterId, 'secondary');
    return {
      view,
      primary: primary ? vanName(snapshot, primary) : '',
      secondary: secondary ? vanName(snapshot, secondary) : '',
    };
  });
}

/** " Gave up primary driver 1 on 1234, secondary driver 2 on 5678." after a driver moved. */
export function gaveUpText(snapshot: AppSnapshot, displaced: readonly DisplacedSlot[]): string {
  if (displaced.length === 0) return '';
  const moved = displaced
    .map(({ vin, slot }) => `${slotLabel(slot).toLowerCase()} on ${vanName(snapshot, vin)}`)
    .join(', ');
  return ` Gave up ${moved}.`;
}

/** "Taylor Doe is primary driver 1 on van 1234." */
export function assignedMessage(associateName: string, slot: string, vehicleName: string): string {
  return `${associateName} is ${slotLabel(slot).toLowerCase()} on van ${vehicleName}.`;
}

export function emptiedMessage(slot: string, vehicleName: string): string {
  return `${slotLabel(slot)} on van ${vehicleName} emptied.`;
}

/**
 * The window's first order: active associates first, then those who hold nothing yet before those
 * who already hold a van, then by name. A search keeps names or IDs that contain what was typed.
 */
export function driverOrder(
  views: readonly AssociateView[],
  holds: ReadonlyMap<string, string>,
  query: string,
): AssociateView[] {
  const wanted = normalizeName(query);
  const found = wanted
    ? views.filter(
        (view) =>
          normalizeName(view.associate.name).includes(wanted) ||
          view.associate.transporterId.toLowerCase().includes(wanted.replace(/ /g, '')),
      )
    : [...views];
  const active = (view: AssociateView) => view.associate.status.trim().toUpperCase() === 'ACTIVE';
  return found.sort((a, b) => {
    if (active(a) !== active(b)) return active(a) ? -1 : 1;
    const heldA = Boolean(holds.get(a.associate.transporterId));
    const heldB = Boolean(holds.get(b.associate.transporterId));
    if (heldA !== heldB) return heldA ? 1 : -1;
    const nameA = a.associate.name.toLowerCase();
    const nameB = b.associate.name.toLowerCase();
    return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
  });
}
