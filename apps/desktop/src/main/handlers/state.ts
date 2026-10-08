import type { stateChannels } from '../../shared/channels/state';
import type { HandlersFor } from './types';

export const stateHandlers: HandlersFor<typeof stateChannels> = {
  'state:snapshot': (_input, ctx) => ctx.host.snapshot(),
};
