// Channels for the Load Out page (4a): roster, available vans, previous roster, links.
// See docs/PAGE-PATTERN.md. Each command is thin: it checks its input, calls one core `AppState`
// method, and lets `state:changed` tell the page to read the snapshot again.
//
// A command that acts on a roster row takes the row's `index` from the snapshot together with the
// snapshot's `revision`. When the data has changed since, the command refuses (the index may now
// point at somebody else) and the page asks the person to look again.

import type { AssignmentResult, DwpApplyResult, RouteApplyResult } from '@loadout/core';
import { filled, intBetween, integer, nothing, nullable, oneOf, shape } from './check';
import { as, defineCommand } from './define';

/** The most rows a roster can have, for the input checks. */
export const MAX_ROSTER_ROWS = 5000;

const rowIndex = intBetween(0, MAX_ROSTER_ROWS);
const revision = integer;

/** The route exports a roster can take route data from. */
export const ROUTE_KINDS = ['routes', 'itineraries', 'schedule'] as const;

export const loadOutChannels = [
  /** Forgets the previous roster (the one kept from the last run). */
  defineCommand('loadOut:clear-previous-roster', { input: nothing, result: as<null>() }),

  /** Copies today's roster to the Previous Roster. Today's roster is untouched. Rows copied. */
  defineCommand('loadOut:move-to-previous-roster', { input: nothing, result: as<number>() }),

  /** Empties today's roster. Associate data and manual links are kept. */
  defineCommand('loadOut:clear-roster', { input: nothing, result: as<null>() }),

  /** Copies dispatch time, route code, service type and PAD from one route export. */
  defineCommand('loadOut:bring-over-route-data', {
    input: shape({ kind: oneOf(ROUTE_KINDS) }),
    result: as<RouteApplyResult>(),
  }),

  /** Copies staging, bags and OVS from the DWP sheet, matched on route code. */
  defineCommand('loadOut:bring-over-dwp', { input: nothing, result: as<DwpApplyResult>() }),

  /** Works out a van for every driver who needs one (a full recompute). */
  defineCommand('loadOut:assign-vans', { input: nothing, result: as<AssignmentResult>() }),

  /** Empties the Vehicle and VIN columns. How many drivers lost a van. */
  defineCommand('loadOut:clear-vans', { input: nothing, result: as<number>() }),

  /** Forgets every hand-made link; every driver goes back to automatic matching. */
  defineCommand('loadOut:clear-links', { input: nothing, result: as<null>() }),

  /** Takes one driver off the roster, with whatever they were holding. */
  defineCommand('loadOut:remove-driver', {
    input: shape({ revision, rowIndex }),
    result: as<null>(),
  }),

  /** Links a driver to an associate by hand, or (transporterId null) marks them as not one. */
  defineCommand('loadOut:link-driver', {
    input: shape({ revision, rowIndex, transporterId: nullable(filled(64)) }),
    result: as<null>(),
  }),

  /** Drops the hand-made link of one driver: back to automatic matching. */
  defineCommand('loadOut:unlink-driver', {
    input: shape({ revision, rowIndex }),
    result: as<null>(),
  }),

  /** Hands one driver's route (and its van and DWP numbers) to another; a swap if they had one. */
  defineCommand('loadOut:reassign-route', {
    input: shape({ revision, from: rowIndex, to: rowIndex }),
    result: as<null>(),
  }),

  /** Hands one driver's van to another; a swap if they had one. */
  defineCommand('loadOut:reassign-van', {
    input: shape({ revision, from: rowIndex, to: rowIndex }),
    result: as<null>(),
  }),

  /** Puts a driver in a free van by hand. */
  defineCommand('loadOut:give-van', {
    input: shape({ revision, rowIndex, vin: filled(64) }),
    result: as<null>(),
  }),

  /** Takes a driver's van away. Answers with the van's name. */
  defineCommand('loadOut:take-van', {
    input: shape({ revision, rowIndex }),
    result: as<string>(),
  }),
] as const;
