// Every channel the app has, merged into one map. A channel that is not listed here does not
// exist: the main process registers handlers only for these, and the bridge exposes only these.
//
// To add a channel, declare it in its area's file (this file does not change).

import { appChannels } from './app';
import { associateChannels } from './associates';
import { indexChannels } from './define';
import type { CommandDef, EventDef, InputOf, QueryDef, ResultOf, SignalDef } from './define';
import { dwpChannels } from './dwp';
import { filesChannels } from './files';
import { layoutChannels } from './layout';
import { loadOutChannels } from './loadOut';
import { migrationChannels } from './migration';
import { printChannels } from './print';
import { routeDataChannels } from './routeData';
import { settingsChannels } from './settings';
import { stateChannels } from './state';
import { updatesChannels } from './updates';
import { vehicleChannels } from './vehicles';

const ALL = [
  ...appChannels,
  ...settingsChannels,
  ...updatesChannels,
  ...stateChannels,
  ...filesChannels,
  ...migrationChannels,
  ...layoutChannels,
  ...loadOutChannels,
  ...printChannels,
  ...routeDataChannels,
  ...dwpChannels,
  ...vehicleChannels,
  ...associateChannels,
] as const;

export const CHANNELS = indexChannels(ALL);
export type Channels = typeof CHANNELS;
export type ChannelName = keyof Channels;

type NamesOf<K extends { kind: string }> = {
  [N in ChannelName]: Channels[N] extends K ? N : never;
}[ChannelName];

/** Channels a page calls and waits for an answer from. */
export type CallName = NamesOf<QueryDef | CommandDef>;
/** Channels a page sends a note on. */
export type SignalName = NamesOf<SignalDef>;
/** Channels the main process sends notes on. */
export type EventName = NamesOf<EventDef>;

export type CallInput<N extends CallName> = InputOf<Channels[N]>;
export type CallResult<N extends CallName> = ResultOf<Channels[N]>;

export type { Reply, ReasonCode } from './define';
export type { StateChanged } from './state';
