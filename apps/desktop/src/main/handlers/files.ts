import type { FileKind, filesChannels } from '../../shared/channels/files';
import { ChannelRefusal } from '../channels';
import { checkDroppedFile, rememberDrop } from '../fileDrop';
import { importFile, importRouteSheetsPdf } from '../importFiles';
import type { HandlerContext, HandlersFor } from './types';

const MAX_REMEMBERED_PICKS = 50;

/** The route sheet PDF goes to the route sheets of the open data; every other kind to the core. */
function read(ctx: HandlerContext, kind: FileKind, path: string) {
  if (kind === 'route-sheets') return importRouteSheetsPdf(ctx.host.routeSheets, path);
  return importFile(ctx.state, kind, path, ctx.today());
}

export const filesHandlers: HandlersFor<typeof filesChannels> = {
  'files:pick': async ({ kind }, ctx) => {
    const path = await ctx.services.pickFile(kind);
    if (path !== null) {
      if (ctx.picked.size >= MAX_REMEMBERED_PICKS) ctx.picked.clear();
      ctx.picked.add(path);
    }
    return { path };
  },
  'files:import': ({ kind, path }, ctx) => {
    // Only a file the person chose in the file window, or dropped on the page, is read. A page
    // cannot name any other. A dropped file's token is good for one import.
    const dropped = ctx.dropped.get(path);
    if (dropped !== undefined) {
      ctx.dropped.delete(path);
      if (dropped.kind !== kind) throw new ChannelRefusal('not-allowed');
      return read(ctx, kind, dropped.path);
    }
    if (!ctx.picked.has(path)) throw new ChannelRefusal('not-allowed');
    return read(ctx, kind, path);
  },
  'files:dropped': ({ page, kind, path }, ctx) => {
    const check = checkDroppedFile(page, kind, path);
    if (!check.ok) {
      throw check.reason === 'refused'
        ? new ChannelRefusal('refused', check.message)
        : new ChannelRefusal('not-allowed');
    }
    return { token: rememberDrop(ctx.dropped, kind, path) };
  },
};
