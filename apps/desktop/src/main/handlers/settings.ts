import type { settingsChannels } from '../../shared/channels/settings';
import type { HandlersFor } from './types';

export const settingsHandlers: HandlersFor<typeof settingsChannels> = {
  'settings:get': (_input, ctx) => ctx.services.getSettings(),
  'settings:set': (patch, ctx) => ctx.services.setSettings(patch),
};
