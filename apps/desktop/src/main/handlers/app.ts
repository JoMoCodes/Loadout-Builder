import type { appChannels } from '../../shared/channels/app';
import { isAllowedLink } from '../../shared/links';
import { ChannelRefusal } from '../channels';
import type { HandlersFor } from './types';

export const appHandlers: HandlersFor<typeof appChannels> = {
  'app:get-version': (_input, ctx) => ctx.services.version(),
  'app:renderer-ready': (version, ctx) => ctx.services.rendererReady(version),
  'data:get-source-info': (_input, ctx) => ctx.services.dataSourceInfo(),
  'data:open-folder': (_input, ctx) => ctx.services.openDataFolder(),
  'app:open-link': async (link, ctx) => {
    // Only the help forum and the app's release pages. The link itself is never logged.
    if (!isAllowedLink(link)) throw new ChannelRefusal('not-allowed');
    const opened = await ctx.services.openLink(link);
    if (!opened) {
      throw new ChannelRefusal(
        'refused',
        'The web page could not be opened. Check the computer is online, then try again.',
      );
    }
    return null;
  },
};
