// Work out which van each driver takes.
//
// Ported from the old app's assignment.py; the rules are the old app's, unchanged. Who is in scope
// is decided by Amazon's service type alone: a driver can be scheduled a shift and not be given a
// route, and that driver does not need a van.
//
// The order follows the station's execution order:
//
// 1. Skill is absolute. A driver without the Step Van qualification is never put in a step van, and
//    a Last Mile Rental never goes to anyone off the LMR approved list. A van that isn't
//    operational is not in the pool at all, and neither is a self-owned one.
// 2. The right kind of van: the exact service type first, then the vehicle family, and only then
//    any van the driver is merely qualified for (reported separately).
// 3. Affinity, then continuity: primary van, secondary van, then the van they had on the previous
//    roster. A fallback prefers the driver's own van, then one going spare, and only last one
//    belonging to somebody who is in today.
// 4. Van priority: the highest number goes first.
// 5. Vehicle order: step vans, then branded vans, then rentals.
// 6. A stable tiebreak on the van's own name, never a random pick.
//
// Drivers are worked through most lifetime routes first, then earliest dispatch. Nothing is
// guessed: a driver with no qualified van free is left unassigned with the reason recorded.

import { tenureRoutes, hasQualification, type Associate } from './models/associates';
import {
  affinityForVehicle,
  vehicleOf,
  createVanAffinity,
  type VanAffinity,
} from './models/affinity';
import { clockKey, compareKeys, type SortKey } from './models/clock';
// Python's `assignment.needs_van(row)` is the roster's own `needsVan`, in models/roster.
import type { DriverRow } from './models/roster';
import { requiredQualification, serviceFamily } from './models/serviceType';
import {
  canRun,
  canServe,
  isRental,
  orderRank,
  vehicleFamily,
  vehicleRequiredQualification,
  type Vehicle,
} from './models/vehicles';
import { pyStrip } from './models/text';

// How a match was arrived at, loosest last.
export const BY_AFFINITY_PRIMARY = 'affinity-primary';
export const BY_AFFINITY_SECONDARY = 'affinity-secondary';
export const BY_PREVIOUS = 'previous-day';
export const BY_SERVICE_TYPE = 'service-type';
export const BY_FAMILY = 'vehicle-family';
export const BY_QUALIFICATION = 'qualified-only';
export const UNASSIGNED = 'none';

// Never produced by `plan`: it is what the roster records when somebody moves a van themselves.
export const BY_HAND = 'by-hand';

export const METHOD_LABELS: ReadonlyMap<string, string> = new Map([
  [BY_AFFINITY_PRIMARY, 'primary affinity'],
  [BY_AFFINITY_SECONDARY, 'secondary affinity'],
  [BY_PREVIOUS, 'same van as last time'],
  [BY_SERVICE_TYPE, 'service type'],
  [BY_FAMILY, 'vehicle type'],
  [BY_QUALIFICATION, 'qualification only'],
  [BY_HAND, 'given by hand'],
]);

/** `METHOD_LABELS.get(method, method)`. */
export function methodLabel(method: string): string {
  return METHOD_LABELS.get(method) ?? method;
}

/** A driver with a route, and what we know about them (Python `Candidate`). */
export interface Candidate {
  row: DriverRow;
  associate: Associate | null;
}

/** The route Amazon gave them, brought over from a route export. */
export function candidateServiceType(candidate: Candidate): string {
  return candidate.row.serviceType;
}

/** The kind of van this route calls for, where its name says. */
export function candidateFamily(candidate: Candidate): string {
  return serviceFamily(candidateServiceType(candidate));
}

/** What the route itself demands, read off Amazon's service type. */
export function candidateNeededQualification(candidate: Candidate): string {
  return requiredQualification(candidateServiceType(candidate));
}

/** `Candidate.holds`: nothing required means nothing to check. */
export function candidateHolds(candidate: Candidate, qualification: string): boolean {
  if (!qualification) return true;
  return candidate.associate !== null && hasQualification(candidate.associate, qualification);
}

/** Lifetime routes delivered. Nobody we have no record of counts as new. */
export function candidateTenure(candidate: Candidate): number {
  return candidate.associate ? tenureRoutes(candidate.associate) : 0;
}

/** One driver's outcome (Python `Assignment`). */
export interface Assignment {
  driver: string;
  vehicle: Vehicle | null;
  method: string;
  reason: string;
}

export function createAssignment(values: Partial<Assignment> = {}): Assignment {
  return { driver: '', vehicle: null, method: UNASSIGNED, reason: '', ...values };
}

export function isAssigned(assignment: Assignment): boolean {
  return assignment.vehicle !== null;
}

/** What a run of the assigner did (Python `AssignmentResult`). */
export interface AssignmentResult {
  assignments: Assignment[];
  considered: number;
  /** Python `vans_available`. */
  vansAvailable: number;
}

export function assignedOf(result: AssignmentResult): Assignment[] {
  return result.assignments.filter(isAssigned);
}

export function unassignedOf(result: AssignmentResult): Assignment[] {
  return result.assignments.filter((a) => !isAssigned(a));
}

/** `AssignmentResult.by_method`: method to count, over the assigned only, in first-seen order. */
export function byMethod(result: AssignmentResult): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of assignedOf(result))
    counts.set(item.method, (counts.get(item.method) ?? 0) + 1);
  return counts;
}

/** Assigned a van that is not the service type the route asked for. */
export function looseCount(result: AssignmentResult): number {
  return assignedOf(result).filter((a) => a.method === BY_QUALIFICATION).length;
}

/** `_van_sort_key`: vehicle order first, then a stable name - never random. */
export function vanSortKey(vehicle: Vehicle): SortKey {
  const name = vehicle.name.toLowerCase();
  return [orderRank(vehicle), Array.from(name).length, name];
}

/** Python's `float(text)` for a priority typed by hand, or null where that would raise. */
function pyFloat(text: string): number | null {
  const value = text.replace(/_/g, (match, offset: number, whole: string) =>
    /\d/.test(whole[offset - 1] ?? '') && /\d/.test(whole[offset + 1] ?? '') ? '' : match,
  );
  if (/^[+-]?(\d+\.?\d*([eE][+-]?\d+)?|\.\d+([eE][+-]?\d+)?)$/.test(value)) return Number(value);
  const special = value.toLowerCase().replace(/^[+-]/, '');
  if (special === 'inf' || special === 'infinity')
    return value.startsWith('-') ? -Infinity : Infinity;
  if (special === 'nan') return Number.NaN;
  return null;
}

/**
 * `_priority_of`: the number set against a van by hand, 0 where there is none. Higher goes out
 * first. A van nobody numbered sits below every van somebody did.
 */
export function priorityOf(priorities: ReadonlyMap<string, string>, vin: string): number {
  const text = pyStrip(String(priorities.get(vin) ?? ''));
  const value = pyFloat(text);
  return value === null ? 0.0 : value;
}

/** `_eligible`: the gates nothing below them can override - skill, and the LMR list for a rental. */
export function eligible(
  candidate: Candidate,
  vehicle: Vehicle,
  lmrApproved: ReadonlySet<string>,
): boolean {
  if (!candidateHolds(candidate, vehicleRequiredQualification(vehicle))) return false;
  if (isRental(vehicle)) {
    const transporterId = candidate.associate ? candidate.associate.transporterId : '';
    return lmrApproved.has(transporterId);
  }
  return true;
}

/** `_why_not`: a plain reason this driver ended up with nothing. */
export function whyNot(
  candidate: Candidate,
  vehicles: readonly Vehicle[],
  taken: ReadonlySet<string>,
  lmrApproved: ReadonlySet<string>,
): string {
  if (candidate.associate === null) return 'No associate record - qualifications unknown';

  const free = vehicles.filter((v) => !taken.has(v.vin));
  if (free.length === 0) return 'No van left in the fleet';

  const qualified = free.filter((v) => eligible(candidate, v, lmrApproved));
  if (qualified.length > 0) return 'No van free';

  // Say which gate closed. If skill alone would have been enough, the LMR list stopped them.
  const bySkill = free.filter((v) => candidateHolds(candidate, vehicleRequiredQualification(v)));
  if (bySkill.length > 0 && bySkill.every((v) => isRental(v))) {
    return 'Only LMR vans left, and not on the approved list';
  }
  const wanted = candidateNeededQualification(candidate) || 'the required skill';
  return `Not ${wanted} qualified for any free van`;
}

/** `_preferred_family`: whether this van is the kind the route called for. Used for reporting. */
export function preferredFamily(candidate: Candidate, vehicle: Vehicle): boolean {
  const serviceType = candidateServiceType(candidate);
  return serviceType ? canServe(vehicle, serviceType) : true;
}

/** Python's `sorted(items, key=...)`: stable, comparing keys as Python compares tuples. */
function sortedBy<T>(items: readonly T[], key: (item: T) => SortKey): T[] {
  return items
    .map((item) => ({ item, key: key(item) }))
    .sort((a, b) => compareKeys(a.key, b.key))
    .map((entry) => entry.item);
}

/**
 * Work out the assignments. `vehicles` should already be the assignable ones: operational, and not
 * the self-owned vans that are always handed out by hand. `previousVans` maps a Transporter ID to
 * the VIN that driver had on the previous roster; `priorities` maps a VIN to the number set
 * against that van by hand.
 */
export function plan(
  candidates: readonly Candidate[],
  vehicles: readonly Vehicle[],
  affinity: VanAffinity | null = null,
  lmrApproved: ReadonlySet<string> | null = null,
  previousVans: ReadonlyMap<string, string> | null = null,
  priorities: ReadonlyMap<string, string> | null = null,
): AssignmentResult {
  const held = affinity ?? createVanAffinity();
  const approved = lmrApproved ?? new Set<string>();
  const previous = previousVans ?? new Map<string, string>();
  const numbers = priorities ?? new Map<string, string>();
  const result: AssignmentResult = {
    assignments: [],
    considered: candidates.length,
    vansAvailable: vehicles.length,
  };

  const pool = sortedBy(vehicles, vanSortKey);
  const byVin = new Map<string, Vehicle>();
  for (const v of pool) byVin.set(v.vin, v);
  const taken = new Set<string>();
  const outcome = new Map<number, Assignment>();

  // Most routes first, then earliest dispatch, then name.
  const ordered: Array<[number, Candidate]> = sortedBy(
    candidates.map((candidate, index): [number, Candidate] => [index, candidate]),
    ([, candidate]) => [
      -candidateTenure(candidate),
      clockKey(candidate.row.waveTime),
      candidate.row.driver.toLowerCase(),
    ],
  );

  const claim = (index: number, candidate: Candidate, vehicle: Vehicle, method: string): void => {
    taken.add(vehicle.vin);
    outcome.set(index, createAssignment({ driver: candidate.row.driver, vehicle, method }));
  };

  const affinityVan = (candidate: Candidate, kind: 'primary' | 'secondary'): Vehicle | null => {
    if (candidate.associate === null) return null;
    const vin = vehicleOf(held, candidate.associate.transporterId, kind);
    if (!vin || taken.has(vin)) return null;
    return byVin.get(vin) ?? null;
  };

  // Who is out today, so a van can be left for its own driver rather than handed to a stranger.
  const working = new Set<string>();
  for (const [, candidate] of ordered) {
    if (candidate.associate) working.add(candidate.associate.transporterId);
  }

  // Their own van first, then anything going spare, and only last one held by somebody in today.
  // A van whose holders are all off counts as going spare.
  const preference = (candidate: Candidate, vehicle: Vehicle): number => {
    const transporterId = candidate.associate ? candidate.associate.transporterId : '';
    if (transporterId) {
      if (vehicleOf(held, transporterId, 'primary') === vehicle.vin) return 0;
      if (vehicleOf(held, transporterId, 'secondary') === vehicle.vin) return 1;
    }
    const holders = affinityForVehicle(held, vehicle.vin);
    if (holders.size > 0 && [...holders.values()].some((holder) => working.has(holder))) return 3;
    return 2;
  };

  // 0 for a van nobody holds, 1 for one held by somebody who is off. Sits below priority.
  const spokenFor = (vehicle: Vehicle): number =>
    affinityForVehicle(held, vehicle.vin).size > 0 ? 1 : 0;

  const pick = (candidate: Candidate, allows: (vehicle: Vehicle) => boolean): Vehicle | null => {
    let best: Vehicle | null = null;
    let bestKey: SortKey | null = null;
    for (const vehicle of pool) {
      if (taken.has(vehicle.vin)) continue;
      if (!eligible(candidate, vehicle, approved)) continue;
      if (!allows(vehicle)) continue;
      // Priority sits under affinity and over the vehicle order.
      const key: SortKey = [
        preference(candidate, vehicle),
        -priorityOf(numbers, vehicle.vin),
        spokenFor(vehicle),
        vanSortKey(vehicle),
      ];
      if (bestKey === null || compareKeys(key, bestKey) < 0) {
        best = vehicle;
        bestKey = key;
      }
    }
    return best;
  };

  // 1 & 2 - affinity, primary then secondary, still behind the skill gate.
  const affinityPasses: Array<['primary' | 'secondary', string]> = [
    ['primary', BY_AFFINITY_PRIMARY],
    ['secondary', BY_AFFINITY_SECONDARY],
  ];
  for (const [kind, method] of affinityPasses) {
    for (const [index, candidate] of ordered) {
      if (outcome.has(index)) continue;
      const vehicle = affinityVan(candidate, kind);
      if (vehicle === null || !eligible(candidate, vehicle, approved)) continue;
      // Their van, but is it the right kind for today's work? Judged on family.
      const serviceType = candidateServiceType(candidate);
      if (serviceType && !canServe(vehicle, serviceType)) continue;
      claim(index, candidate, vehicle, method);
    }
  }

  // 3 - the van they had last time out.
  for (const [index, candidate] of ordered) {
    if (outcome.has(index) || candidate.associate === null) continue;
    const vin = previous.get(candidate.associate.transporterId);
    if (!vin || taken.has(vin)) continue;
    const vehicle = byVin.get(vin);
    if (vehicle === undefined || !eligible(candidate, vehicle, approved)) continue;
    const serviceType = candidateServiceType(candidate);
    if (serviceType && !canServe(vehicle, serviceType)) continue; // wrong work for it today
    claim(index, candidate, vehicle, BY_PREVIOUS);
  }

  // 4 - the service type the route actually asked for.
  for (const [index, candidate] of ordered) {
    const serviceType = candidateServiceType(candidate);
    if (outcome.has(index) || !serviceType) continue;
    const vehicle = pick(candidate, (v) => canRun(v, serviceType));
    if (vehicle !== null) claim(index, candidate, vehicle, BY_SERVICE_TYPE);
  }

  // 5 - the right kind of van, where the exact name never appears in the fleet.
  for (const [index, candidate] of ordered) {
    const family = candidateFamily(candidate);
    if (outcome.has(index) || !family) continue;
    const vehicle = pick(candidate, (v) => vehicleFamily(v) === family);
    if (vehicle !== null) claim(index, candidate, vehicle, BY_FAMILY);
  }

  // 6 - anything they are qualified for. Reported apart from a clean match.
  for (const [index, candidate] of ordered) {
    if (outcome.has(index)) continue;
    const vehicle = pick(candidate, () => true);
    if (vehicle !== null) claim(index, candidate, vehicle, BY_QUALIFICATION);
  }

  for (const [index, candidate] of ordered) {
    if (!outcome.has(index)) {
      outcome.set(
        index,
        createAssignment({
          driver: candidate.row.driver,
          reason: whyNot(candidate, pool, taken, approved),
        }),
      );
    }
  }

  result.assignments = candidates.map((_, index) => outcome.get(index) as Assignment);
  return result;
}
