// The Load Out page's commands. Each one checks what it was sent, calls the core `AppState`
// method that does the work, and returns. The rules (matching, links, van assignment, hand moves)
// all live in the core; nothing here decides anything.

import type { AppState, DriverRow } from '@loadout/core';
import type { loadOutChannels } from '../../shared/channels/loadOut';
import { ChannelRefusal } from '../channels';
import type { HandlerContext, HandlersFor } from './types';

/** Plain words for the person when the roster moved on since the page last looked. */
export const STALE_ROSTER =
  'The roster changed while you were choosing. Look at it again and try once more.';

/**
 * The roster row a command is about. Refuses when the snapshot the page read is no longer the
 * current one (the index could now point at somebody else) or the row is gone.
 */
function rowAt(ctx: HandlerContext, revision: number, index: number): DriverRow {
  const state: AppState = ctx.state;
  if (revision !== ctx.host.revision) throw new ChannelRefusal('refused', STALE_ROSTER);
  const row = state.roster.rows[index];
  if (row === undefined) throw new ChannelRefusal('refused', STALE_ROSTER);
  return row;
}

function twoRows(
  ctx: HandlerContext,
  revision: number,
  from: number,
  to: number,
): [DriverRow, DriverRow] {
  if (from === to) {
    throw new ChannelRefusal('refused', 'Pick somebody else: that is the same driver.');
  }
  return [rowAt(ctx, revision, from), rowAt(ctx, revision, to)];
}

export const loadOutHandlers: HandlersFor<typeof loadOutChannels> = {
  'loadOut:clear-previous-roster': (_input, ctx) => {
    ctx.state.clearPreviousRoster();
    return null;
  },

  'loadOut:move-to-previous-roster': (_input, ctx) => ctx.state.moveToPreviousRoster(),

  'loadOut:clear-roster': (_input, ctx) => {
    ctx.state.clearRoster();
    return null;
  },

  'loadOut:bring-over-route-data': ({ kind }, ctx) => ctx.state.applyRouteData(kind),

  'loadOut:bring-over-dwp': (_input, ctx) => ctx.state.applyDwp(),

  'loadOut:assign-vans': (_input, ctx) => ctx.state.assignVans(),

  'loadOut:clear-vans': (_input, ctx) => ctx.state.clearVans(),

  'loadOut:clear-links': (_input, ctx) => {
    ctx.state.clearLinks();
    return null;
  },

  'loadOut:remove-driver': ({ revision, rowIndex }, ctx) => {
    ctx.state.removeDriver(rowAt(ctx, revision, rowIndex));
    return null;
  },

  'loadOut:link-driver': ({ revision, rowIndex, transporterId }, ctx) => {
    const row = rowAt(ctx, revision, rowIndex);
    if (
      transporterId !== null &&
      !ctx.state.associates.rows.some((a) => a.transporterId === transporterId)
    ) {
      throw new ChannelRefusal(
        'refused',
        'That associate is no longer in the driver list. Look again.',
      );
    }
    ctx.state.linkDriver(row.driver, transporterId);
    return null;
  },

  'loadOut:unlink-driver': ({ revision, rowIndex }, ctx) => {
    ctx.state.unlinkDriver(rowAt(ctx, revision, rowIndex).driver);
    return null;
  },

  'loadOut:reassign-route': ({ revision, from, to }, ctx) => {
    const [source, target] = twoRows(ctx, revision, from, to);
    ctx.state.reassignRoute(source, target);
    return null;
  },

  'loadOut:reassign-van': ({ revision, from, to }, ctx) => {
    const [source, target] = twoRows(ctx, revision, from, to);
    ctx.state.reassignVan(source, target);
    return null;
  },

  'loadOut:give-van': ({ revision, rowIndex, vin }, ctx) => {
    const row = rowAt(ctx, revision, rowIndex);
    // Only a van that is free right now, as the van list offered.
    const vehicle = ctx.state.availableVehicles().find((v) => v.vin === vin);
    if (vehicle === undefined) {
      throw new ChannelRefusal(
        'refused',
        'That van is no longer free. Look at the Available Vans tab and pick again.',
      );
    }
    ctx.state.giveVan(row, vehicle);
    return null;
  },

  'loadOut:take-van': ({ revision, rowIndex }, ctx) =>
    ctx.state.takeVan(rowAt(ctx, revision, rowIndex)),
};
