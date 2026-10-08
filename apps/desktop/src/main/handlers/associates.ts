import type { associateChannels } from '../../shared/channels/associates';
import type { HandlersFor } from './types';

// Handlers for the Associates page (4c). One per channel declared in shared/channels/associates.ts.
// The Tenured Workforce file comes in through `files:import` (see importFiles.ts).
export const associateHandlers: HandlersFor<typeof associateChannels> = {
  'associates:clear': (_input, ctx) => {
    ctx.state.clearAssociates();
    return null;
  },
  'associates:clear-tenure': (_input, ctx) => {
    ctx.state.clearTenure();
    return null;
  },
};
