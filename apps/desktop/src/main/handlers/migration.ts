import type { migrationChannels } from '../../shared/channels/migration';
import type { HandlersFor } from './types';

export const migrationHandlers: HandlersFor<typeof migrationChannels> = {
  'migration:find': (_input, ctx) => ctx.services.oldData.find(),
  'migration:pick': async (_input, ctx) => ({ chosen: await ctx.services.oldData.pick() }),
  'migration:run': ({ from }, ctx) => ctx.services.oldData.run(from),
};
