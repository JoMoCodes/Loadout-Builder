import { ROUTE_SCHEDULE, routeDataLabel, driverOptions } from '@loadout/core';
import type { routeDataChannels } from '../../shared/channels/routeData';
import { ChannelRefusal } from '../channels';
import type { HandlersFor } from './types';

// Handlers for the Route Data page (4c). One per channel declared in shared/channels/routeData.ts.
// Each one checks what it was given and calls the core; the rules live in the core.

export const routeDataHandlers: HandlersFor<typeof routeDataChannels> = {
  'routeData:set-pads': ({ kind, pads }, ctx) => {
    ctx.state.setPads(kind, pads);
    return null;
  },

  'routeData:adopt-schedule-pads': ({ kind }, ctx) => {
    const { state } = ctx;
    const dataset = state.routeSet(kind);
    // The same three stops the old button had, in its words.
    if (dataset.rows.length === 0) {
      throw new ChannelRefusal('refused', `Import a ${routeDataLabel(dataset)} export first.`);
    }
    const schedule = state.routeSet(ROUTE_SCHEDULE);
    if (schedule.rows.length === 0) {
      throw new ChannelRefusal(
        'refused',
        'Import a Weekly Schedule export first - its PADs are what come over.',
      );
    }
    if (schedule.pads.size === 0) {
      throw new ChannelRefusal(
        'refused',
        'The Weekly Schedule has no PADs assigned yet - use Assign PADs on its tab first.',
      );
    }
    const [copied, noPad, missing] = state.adoptSchedulePads(kind);
    return { copied, noPad, missing, total: dataset.rows.length };
  },

  'routeData:set-route-drivers': ({ kind, revision, choices }, ctx) => {
    if (revision !== ctx.host.revision) {
      throw new ChannelRefusal(
        'refused',
        'The table changed while this window was open. Close it and try again.',
      );
    }
    const { state } = ctx;
    const dataset = state.routeSet(kind);
    // Check every choice before changing anything, so a bad one leaves the export as it was.
    const checked = choices.map((choice) => {
      const entry = dataset.rows[choice.rowIndex];
      const known = entry && driverOptions(entry).some(([, id]) => id === choice.transporterId);
      if (!entry || !known) {
        throw new ChannelRefusal('refused', 'That driver is not one of the people on that route.');
      }
      return { entry, transporterId: choice.transporterId };
    });
    for (const { entry, transporterId } of checked) {
      state.setRouteDriver(kind, entry, transporterId);
    }
    return { set: checked.length };
  },

  'routeData:clear': ({ kind }, ctx) => {
    ctx.state.clearRouteData(kind);
    return null;
  },
};
