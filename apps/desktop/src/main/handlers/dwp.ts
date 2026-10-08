import type { dwpChannels } from '../../shared/channels/dwp';
import type { HandlersFor } from './types';

// Handlers for the DWP sheet (4c). One per channel declared in shared/channels/dwp.ts.
export const dwpHandlers: HandlersFor<typeof dwpChannels> = {
  'dwp:clear': (_input, ctx) => {
    ctx.state.clearDwp();
    return null;
  },
};
