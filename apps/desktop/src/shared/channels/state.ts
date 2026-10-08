// The day's data, read-only. Pages draw from the snapshot; they change things with commands
// declared in their own area's file.

import type { AppSnapshot } from '../snapshot';
import { nothing } from './check';
import { as, defineEvent, defineQuery } from './define';

export interface StateChanged {
  /** Goes up by one after every command. */
  revision: number;
}

export const stateChannels = [
  /** Everything a page needs to draw (see `AppSnapshot`). */
  defineQuery('state:snapshot', { input: nothing, result: as<AppSnapshot>() }),
  /** Main process to page: a command ran, or the data was swapped (demo mode). Re-read. */
  defineEvent('state:changed', { payload: as<StateChanged>() }),
] as const;
