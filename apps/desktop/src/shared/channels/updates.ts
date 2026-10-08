// Checking for a newer version of the app.

import type { UpdateStatus } from '../shell';
import { nothing } from './check';
import { as, defineCommand, defineEvent, defineQuery, defineSignal } from './define';

export const updatesChannels = [
  defineQuery('updates:get-status', { input: nothing, result: as<UpdateStatus>() }),
  defineCommand('updates:check', { input: nothing, result: as<UpdateStatus>(), quiet: true }),
  /** Restart the app to finish installing a downloaded update. */
  defineSignal('updates:install', { input: nothing }),
  /** Main process to page: the update status changed. */
  defineEvent('updates:status-changed', { payload: as<UpdateStatus>() }),
] as const;
