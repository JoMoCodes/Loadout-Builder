// The few choices the app remembers (look, text size, demo mode).

import type { AppSettings, SettingsPatch } from '../settings';
import { anyObject, nothing } from './check';
import { as, defineCommand, defineEvent, defineQuery } from './define';

export const settingsChannels = [
  defineQuery('settings:get', { input: nothing, result: as<AppSettings>() }),
  /**
   * Takes a patch, keeps only the valid fields, saves, and returns the settings as they now are.
   * Turning demo mode on or off swaps the data; the main process sends `state:changed` itself.
   */
  defineCommand('settings:set', {
    input: anyObject as (value: unknown) => value is SettingsPatch,
    result: as<AppSettings>(),
    quiet: true,
  }),
  /**
   * Main process to every window: the settings changed (in this window or another one). Each
   * window puts the new look on and shows the new choices.
   */
  defineEvent('settings:changed', { payload: as<AppSettings>() }),
] as const;
