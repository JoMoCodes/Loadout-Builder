// Channels for the Route Data page (4c): PADs, shared routes, clearing an export.
// Bringing a file in goes through `files:pick` and `files:import`; bringing route data over to the
// roster is the Load Out page's job, so it is not here.

import { arrayOf, filled, intBetween, integer, oneOf, recordOf, shape } from './check';
import { as, defineCommand } from './define';

/** The three route exports, in tab order. */
export const ROUTE_KINDS = ['routes', 'itineraries', 'schedule'] as const;
export type RouteKindName = (typeof ROUTE_KINDS)[number];

export interface AdoptPadsResult {
  /** Rows that took a PAD from the Weekly Schedule. */
  copied: number;
  /** Scheduled, but with no PAD there. */
  noPad: number;
  /** Not on the schedule at all. */
  missing: number;
  /** Rows in the export. */
  total: number;
}

export const routeDataChannels = [
  /**
   * Pins each dispatch time to a PAD (0 or a missing time means no PAD). Times left out become
   * unassigned, and PADs copied onto rows from the schedule are dropped, as in the old app.
   */
  defineCommand('routeData:set-pads', {
    input: shape({
      kind: oneOf(ROUTE_KINDS),
      pads: recordOf(intBetween(0, 3), 500),
    }),
    result: as<null>(),
  }),
  /** Copies each driver's PAD from the Weekly Schedule onto this export's rows. */
  defineCommand('routeData:adopt-schedule-pads', {
    input: shape({ kind: oneOf(ROUTE_KINDS) }),
    result: as<AdoptPadsResult>(),
  }),
  /**
   * Says which of a shared route's drivers each route belongs to. `rowIndex` is the row's place in
   * the export and is good only for the revision sent with it.
   */
  defineCommand('routeData:set-route-drivers', {
    input: shape({
      kind: oneOf(ROUTE_KINDS),
      revision: integer,
      choices: arrayOf(
        shape({ rowIndex: intBetween(0, 100_000), transporterId: filled(200) }),
        5000,
      ),
    }),
    result: as<{ set: number }>(),
  }),
  /** Empties one export and its PADs. The others and the roster are kept. */
  defineCommand('routeData:clear', {
    input: shape({ kind: oneOf(ROUTE_KINDS) }),
    result: as<null>(),
  }),
] as const;
