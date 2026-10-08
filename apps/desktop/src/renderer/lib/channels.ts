// How a page talks to the main process. Every call goes through a channel declared in
// src/shared/channels/, so the names and the types are checked at build time.
//
//   const reply = await call('files:pick', { kind: 'vehicles' });
//   if (!reply.ok) return setProblem(explain(reply));
//   reply.value.path; // typed
//
// A call never throws: it answers `{ ok: true, value }` or `{ ok: false, reason, message? }`.

import type { CallArgs, LoadoutApi } from '../../shared/api';
import type { CallName, CallResult, EventName, Reply, SignalName } from '../../shared/channels';
import type { PayloadOf } from '../../shared/channels/define';
import type { Channels } from '../../shared/channels';
import { notePrinted } from '../help/printed';

declare global {
  interface Window {
    /** Built by the preload file. Only exists inside the app window. */
    loadout?: LoadoutApi;
  }
}

export type Failure = Extract<Reply<unknown>, { ok: false }>;

/** Asks the main process (a query or a command) and waits for the answer. */
export function call<N extends CallName>(
  name: N,
  ...args: CallArgs<N>
): Promise<Reply<CallResult<N>>> {
  const api = window.loadout;
  if (!api) return Promise.resolve({ ok: false, reason: 'no-bridge' });
  const send = api.calls[name] as unknown as (...rest: unknown[]) => Promise<Reply<CallResult<N>>>;
  return send(...args)
    .catch(() => ({ ok: false, reason: 'failed' }) as const)
    .then((reply) => {
      notePrinted(name, reply);
      return reply;
    });
}

/** Sends a one-way note. Does nothing outside the app window. */
export function signal<N extends SignalName>(
  name: N,
  ...args: Parameters<LoadoutApi['signals'][N]>
): void {
  const send = window.loadout?.signals[name] as unknown as
    ((...rest: unknown[]) => void) | undefined;
  send?.(...args);
}

/** Calls `listener` whenever the main process sends this note. Returns a function that stops. */
export function listen<N extends EventName>(
  name: N,
  listener: (payload: PayloadOf<Channels[N]>) => void,
): () => void {
  const subscribe = window.loadout?.events[name] as unknown as
    ((fn: (payload: PayloadOf<Channels[N]>) => void) => () => void) | undefined;
  return subscribe ? subscribe(listener) : () => {};
}

/** Plain words for a failed call, ready to show. */
export function explain(failure: Failure): string {
  switch (failure.reason) {
    case 'refused':
      return failure.message || 'That could not be done.';
    case 'no-data':
      return 'The saved data could not be opened. Close the app and open it again.';
    case 'no-bridge':
      return 'This only works inside the Loadout Builder app.';
    case 'not-allowed':
      return 'The app will not do that. Choose the file again and try once more.';
    default:
      return 'Something went wrong. Try again. If it keeps happening, close the app and open it again.';
  }
}
