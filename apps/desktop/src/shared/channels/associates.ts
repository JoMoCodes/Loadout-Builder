// Channels for the Associates page (4c). The associate list and the Tenured Workforce file are
// brought in with `files:pick` and `files:import` (kinds "associates" and "tenure"); the tenure
// import's answer says whether the file was older than what is already kept.

import { nothing } from './check';
import { as, defineCommand } from './define';

export type { TenureImportResult } from './files';

export const associateChannels = [
  /** Empties the associate list. Lifetime route counts and the roster are kept. */
  defineCommand('associates:clear', { input: nothing, result: as<null>() }),
  /** Forgets every lifetime route count. The associate list and the roster are kept. */
  defineCommand('associates:clear-tenure', { input: nothing, result: as<null>() }),
] as const;
