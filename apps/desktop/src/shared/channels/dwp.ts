// Channels for the DWP sheet (4c). The sheet is brought in with `files:pick` and `files:import`
// (kind "dwp"); copying it onto the roster is the Load Out page's job.

import { nothing } from './check';
import { as, defineCommand } from './define';

export const dwpChannels = [
  /** Empties the DWP sheet. The roster and the route exports are kept. */
  defineCommand('dwp:clear', { input: nothing, result: as<null>() }),
] as const;
