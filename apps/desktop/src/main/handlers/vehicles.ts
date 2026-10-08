import type { AppState, Vehicle } from '@loadout/core';
import { byTransporterId } from '@loadout/core';
import type { vehicleChannels } from '../../shared/channels/vehicles';
import { ChannelRefusal } from '../channels';
import type { HandlersFor } from './types';

// Handlers for the Vehicle Data page (4c). One per channel declared in shared/channels/vehicles.ts.
// Vans are found by VIN and drivers by Transporter ID. A VIN or ID that is not in the data is
// refused rather than stored.

/** The vans with these VINs, in the order asked. Refuses if one of them is not in the fleet. */
function vansFor(state: AppState, vins: readonly string[]): Vehicle[] {
  const byVin = new Map(state.vehicles.rows.map((vehicle) => [vehicle.vin, vehicle]));
  return vins.map((vin) => {
    const vehicle = byVin.get(vin);
    if (vehicle === undefined) {
      throw new ChannelRefusal(
        'refused',
        'That van is no longer in the list. Look at the table again and try once more.',
      );
    }
    return vehicle;
  });
}

export const vehicleHandlers: HandlersFor<typeof vehicleChannels> = {
  'vehicles:set-operational': ({ vins, operational }, ctx) => {
    const vans = vansFor(ctx.state, vins);
    let changed = 0;
    for (const vehicle of vans) {
      if (ctx.state.isOperational(vehicle) === operational) continue;
      ctx.state.setOperational(vehicle, operational);
      changed += 1;
    }
    return { changed };
  },

  'vehicles:match-export': ({ vins }, ctx) => {
    // The old right-click item: only vans with a status set here are touched, and each one goes
    // back to what the export said (which removes the stored change).
    const reset = vansFor(ctx.state, vins).filter((vehicle) => ctx.state.isOverridden(vehicle));
    for (const vehicle of reset) ctx.state.setOperational(vehicle, vehicle.operational);
    return { reset: reset.length };
  },

  'vehicles:set-priority': ({ vins, priority }, ctx) => {
    const wanted = priority.trim();
    if (wanted !== '' && !/^[0-9]+$/.test(wanted)) {
      throw new ChannelRefusal(
        'refused',
        "That isn't a number. Use a whole number, or leave it empty to remove the priority.",
      );
    }
    for (const vehicle of vansFor(ctx.state, vins)) ctx.state.setVehiclePriority(vehicle, wanted);
    return null;
  },

  'vehicles:clear': (_input, ctx) => {
    ctx.state.clearVehicles();
    return null;
  },
  'vehicles:clear-overrides': (_input, ctx) => {
    ctx.state.clearVehicleOverrides();
    return null;
  },
  'vehicles:clear-priorities': (_input, ctx) => {
    ctx.state.clearVehiclePriorities();
    return null;
  },

  'vehicles:set-affinity': ({ vin, slot, transporterId }, ctx) => {
    const { state } = ctx;
    vansFor(state, [vin]);
    if (!byTransporterId(state.associates).has(transporterId)) {
      throw new ChannelRefusal(
        'refused',
        'That driver is not in the associate list. Import the associate list first.',
      );
    }
    const displaced = state
      .setAffinity(vin, slot, transporterId)
      .map(([heldVin, heldSlot]) => ({ vin: heldVin, slot: heldSlot }));
    return { displaced };
  },
  'vehicles:clear-affinity': ({ vin, slot }, ctx) => {
    ctx.state.clearAffinity(vin, slot);
    return null;
  },
  'vehicles:clear-all-affinity': (_input, ctx) => {
    ctx.state.clearAllAffinity();
    return null;
  },

  'vehicles:set-lmr': ({ transporterIds, approved }, ctx) => {
    // Only people on the associate list can be approved. Taking an approval away is always
    // allowed, so one left over from an old list can still be removed.
    const known = byTransporterId(ctx.state.associates);
    if (approved && transporterIds.some((id) => !known.has(id))) {
      throw new ChannelRefusal(
        'refused',
        'That driver is not in the associate list. Import the associate list first.',
      );
    }
    let changed = 0;
    for (const id of new Set(transporterIds)) {
      if (ctx.state.isLmrApproved(id) === approved) continue;
      ctx.state.setLmrApproved(id, approved);
      changed += 1;
    }
    return { changed };
  },
  'vehicles:clear-lmr': (_input, ctx) => {
    ctx.state.clearLmrApproved();
    return null;
  },
};
