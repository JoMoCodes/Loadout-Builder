import type { layoutChannels } from '../../shared/channels/layout';
import type { HandlersFor } from './types';

export const layoutHandlers: HandlersFor<typeof layoutChannels> = {
  'layout:get': ({ view }, ctx) => ctx.host.getLayout(view),
  'layout:set': ({ view, order, widths }, ctx) => {
    ctx.host.setLayout(view, order, widths);
    return null;
  },
};
