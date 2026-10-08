// What the LMR Approved Drivers tab says, worked out from the snapshot. The wording is the old page's.

import type { AppSnapshot, AssociateView } from '../../../shared/snapshot';

export const ALL_DRIVERS = 'All associates';
export const APPROVED_ONLY = 'Approved';
export const NOT_APPROVED = 'Not approved';
export const SHOW_OPTIONS = [ALL_DRIVERS, APPROVED_ONLY, NOT_APPROVED] as const;

export const idOf = (view: AssociateView) => view.associate.transporterId || view.associate.name;

/** The line under the count: how many rentals there are, how many can go out, and which. */
export function rentalLine(snapshot: AppSnapshot): string {
  const rentals = snapshot.vehicles.filter((view) => view.rental);
  if (rentals.length === 0) return 'No LMR vans in the fleet';
  const operational = rentals.filter((view) => view.operational).length;
  const names = rentals.map((view) => view.vehicle.name).join(', ');
  return `${operational} of ${rentals.length} LMR vans operational:  ${names}`;
}

export function passesLmrFilters(view: AssociateView, show: string, onLoadOutOnly: boolean) {
  if (show === APPROVED_ONLY && !view.lmrApproved) return false;
  if (show === NOT_APPROVED && view.lmrApproved) return false;
  if (onLoadOutOnly && !view.onRoster) return false;
  return true;
}
