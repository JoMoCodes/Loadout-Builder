// Bringing over the old app's saved data. The old file is found and read in the main process; the
// page never sees where it is, only whether it was found and how many of each thing came over.

import type { OldDataFind, OldDataResult } from '../oldData';
import { OLD_DATA_SOURCES } from '../oldData';
import { nothing, oneOf, shape } from './check';
import { as, defineCommand, defineQuery } from './define';

export const migrationChannels = [
  /** Looks for the old app's file in its usual place and says whether the new app is empty. */
  defineQuery('migration:find', { input: nothing, result: as<OldDataFind>() }),
  /**
   * Opens the file window (only `.db` files) so the person can choose the old app's file. The
   * main process remembers the choice; the answer only says whether a file was chosen.
   */
  defineCommand('migration:pick', {
    input: nothing,
    result: as<{ chosen: boolean }>(),
    quiet: true,
  }),
  /**
   * Copies the old app's data in, from its usual place or the file chosen with `migration:pick`.
   * Never writes over saved data: when the new app already has some, nothing is copied and the
   * answer says "skipped". A file that cannot be read is refused with a reason in plain words.
   */
  defineCommand('migration:run', {
    input: shape({ from: oneOf(OLD_DATA_SOURCES) }),
    result: as<OldDataResult>(),
  }),
] as const;
