// Channels for the Vehicle Data page (4c): in service or not, priorities, van affinity, LMR
// approvals. Vans are named by VIN and drivers by Transporter ID, both of which stay put between
// snapshots, so none of these needs the snapshot's revision. The fleet itself is brought in with
// `files:pick` and `files:import` (kind "vehicles").

import { arrayOf, boolean, filled, nothing, oneOf, shape, text } from './check';
import { as, defineCommand } from './define';

/** The four affinity slots on a van (the old app's names). */
export const AFFINITY_SLOT_IDS = ['primary_1', 'primary_2', 'secondary_1', 'secondary_2'] as const;

export type AffinitySlotId = (typeof AFFINITY_SLOT_IDS)[number];

export interface DisplacedSlot {
  vin: string;
  slot: string;
}

export const vehicleChannels = [
  /** Puts vans in service or takes them out. Setting a van back to the export's word drops the override. */
  defineCommand('vehicles:set-operational', {
    input: shape({ vins: arrayOf(filled(100), 1000), operational: boolean }),
    result: as<{ changed: number }>(),
  }),
  /** Drops the status set here for these vans and goes back to what the export says. */
  defineCommand('vehicles:match-export', {
    input: shape({ vins: arrayOf(filled(100), 1000) }),
    result: as<{ reset: number }>(),
  }),
  /** A whole number, or empty to remove the number. */
  defineCommand('vehicles:set-priority', {
    input: shape({ vins: arrayOf(filled(100), 1000), priority: text(12) }),
    result: as<null>(),
  }),
  /** Empties the fleet. Affinity, statuses set here, priorities and LMR approvals are kept. */
  defineCommand('vehicles:clear', { input: nothing, result: as<null>() }),
  defineCommand('vehicles:clear-overrides', { input: nothing, result: as<null>() }),
  defineCommand('vehicles:clear-priorities', { input: nothing, result: as<null>() }),

  /** Puts a driver in a van's slot. Returns the slots they gave up to take it. */
  defineCommand('vehicles:set-affinity', {
    input: shape({
      vin: filled(100),
      slot: oneOf(AFFINITY_SLOT_IDS),
      transporterId: filled(200),
    }),
    result: as<{ displaced: DisplacedSlot[] }>(),
  }),
  defineCommand('vehicles:clear-affinity', {
    input: shape({ vin: filled(100), slot: oneOf(AFFINITY_SLOT_IDS) }),
    result: as<null>(),
  }),
  defineCommand('vehicles:clear-all-affinity', { input: nothing, result: as<null>() }),

  /** Approves or removes approval for Last Mile Rentals. */
  defineCommand('vehicles:set-lmr', {
    input: shape({ transporterIds: arrayOf(filled(200), 5000), approved: boolean }),
    result: as<{ changed: number }>(),
  }),
  defineCommand('vehicles:clear-lmr', { input: nothing, result: as<null>() }),
] as const;
