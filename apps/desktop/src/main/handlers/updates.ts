import type { updatesChannels } from '../../shared/channels/updates';
import type { HandlersFor } from './types';

export const updatesHandlers: HandlersFor<typeof updatesChannels> = {
  'updates:get-status': (_input, ctx) => ctx.services.updates.status(),
  'updates:check': (_input, ctx) => ctx.services.updates.check(),
  'updates:install': (_input, ctx) => ctx.services.updates.install(),
};
