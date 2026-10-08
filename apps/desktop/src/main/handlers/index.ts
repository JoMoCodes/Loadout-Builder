// Joins every area's handlers and registers them. The type below makes the build fail if a
// declared channel has no handler (or a handler has no channel).

import { CHANNELS, type CallName, type Channels, type SignalName } from '../../shared/channels';
import type { CommandDef, QueryDef, SignalDef } from '../../shared/channels/define';
import {
  registerChannel,
  type CallHandler,
  type ChannelEnv,
  type IpcLike,
  type SignalHandler,
} from '../channels';
import { appHandlers } from './app';
import { associateHandlers } from './associates';
import { dwpHandlers } from './dwp';
import { filesHandlers } from './files';
import { layoutHandlers } from './layout';
import { loadOutHandlers } from './loadOut';
import { migrationHandlers } from './migration';
import { printHandlers } from './print';
import { routeDataHandlers } from './routeData';
import { settingsHandlers } from './settings';
import { stateHandlers } from './state';
import type { HandlerContext } from './types';
import { updatesHandlers } from './updates';
import { vehicleHandlers } from './vehicles';

export type { HandlerContext, Services } from './types';

type AllHandlers = {
  [N in CallName]: Channels[N] extends QueryDef | CommandDef
    ? CallHandler<Channels[N], HandlerContext>
    : never;
} & {
  [N in SignalName]: Channels[N] extends SignalDef
    ? SignalHandler<Channels[N], HandlerContext>
    : never;
};

const HANDLERS: AllHandlers = {
  ...appHandlers,
  ...settingsHandlers,
  ...updatesHandlers,
  ...stateHandlers,
  ...filesHandlers,
  ...migrationHandlers,
  ...layoutHandlers,
  ...loadOutHandlers,
  ...printHandlers,
  ...routeDataHandlers,
  ...dwpHandlers,
  ...vehicleHandlers,
  ...associateHandlers,
};

/** Registers a handler for every query, command and signal in the registry. */
export function registerAllChannels(ipc: IpcLike, env: ChannelEnv<HandlerContext>): void {
  const handlers = HANDLERS as Record<string, (input: never, ctx: HandlerContext) => unknown>;
  for (const def of Object.values(CHANNELS)) {
    if (def.kind === 'event') continue;
    const handler = handlers[def.name];
    if (!handler) throw new Error(`No handler for channel ${def.name}`);
    registerChannel(ipc, env, def as QueryDef | CommandDef, handler as never);
  }
}
