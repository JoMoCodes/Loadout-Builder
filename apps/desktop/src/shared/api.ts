// What the screens are allowed to ask the app for. The preload file builds this object from the
// channel registry (src/shared/channels/) and hands it to the page as `window.loadout`; the
// page gets nothing else from Electron or Node. There is no "send anything" door: each channel
// is declared once, with its own name and its own types.
//
// Pages do not use this object directly; they use `call()` from renderer/lib/channels.ts.

import type {
  CallInput,
  CallName,
  CallResult,
  ChannelName,
  Channels,
  EventName,
  Reply,
  SignalName,
} from './channels';
import type { PayloadOf } from './channels/define';
import type { DropFromPage } from './channels/files';

export type { DataSourceInfo, OpenFolderResult, UpdateState, UpdateStatus } from './shell';

/**
 * What the page sends on a call. The same as the main process receives, except for a dropped
 * file: the page hands over the file itself and the bridge turns it into a place on the computer.
 */
export type PageInput<N extends CallName> = N extends 'files:dropped' ? DropFromPage : CallInput<N>;

type Args<N extends ChannelName> = N extends CallName
  ? [PageInput<N>] extends [undefined]
    ? []
    : [input: PageInput<N>]
  : N extends SignalName
    ? [Channels[N]] extends [{ input: (value: unknown) => value is infer I }]
      ? [I] extends [undefined]
        ? []
        : [input: I]
      : []
    : [];

export type CallArgs<N extends CallName> = Args<N>;

export interface LoadoutApi {
  /** Queries and commands: ask, and wait for an answer. */
  calls: { [N in CallName]: (...args: Args<N>) => Promise<Reply<CallResult<N>>> };
  /** One-way notes from the page. */
  signals: { [N in SignalName]: (...args: Args<N>) => void };
  /** Notes from the main process. Each returns a function that stops listening. */
  events: {
    [N in EventName]: (listener: (payload: PayloadOf<Channels[N]>) => void) => () => void;
  };
}
