// The one place that turns a declared channel into a working message handler in the main
// process. Every handler goes through `registerChannel`, which:
//
//   (a) checks the message came from the app's own page (not another window or address),
//   (b) checks the input has the declared shape,
//   (c) catches anything that goes wrong and answers with a reason code (never a message that
//       could carry a name or a path, unless the app wrote the message for the person), and
//   (d) logs counts and codes only.
//
// It does not import Electron: `main.ts` hands it `ipcMain`, and the tests hand it a stand-in.

import type {
  CommandDef,
  InputOf,
  QueryDef,
  ReasonCode,
  Reply,
  ResultOf,
  SignalDef,
} from '../shared/channels/define';

/** Thrown by a handler to say "no" in plain words. The message is shown to the person. */
export class ChannelRefusal extends Error {
  constructor(
    readonly reason: Extract<ReasonCode, 'refused' | 'not-allowed' | 'no-data'>,
    message = '',
  ) {
    super(message);
    this.name = 'ChannelRefusal';
  }
}

/** The part of an Electron IPC event the checks read. */
export interface ChannelEvent {
  senderFrame: { url: string; parent?: unknown } | null;
}

/** The part of `ipcMain` that is used. */
export interface IpcLike {
  handle(name: string, listener: (event: ChannelEvent, input: unknown) => unknown): void;
  on(name: string, listener: (event: ChannelEvent, input: unknown) => void): void;
}

export interface ChannelEnv<C> {
  /** Is this address the app's own page? */
  isOwnPage(url: string): boolean;
  /** What a handler is given besides its input. Built fresh for every call. */
  context(): C;
  /** Counts and codes only. */
  log(message: string): void;
  /** Called after every command that is not declared quiet, whether it worked or not. */
  afterCommand(): void;
}

export type CallHandler<D extends QueryDef | CommandDef, C> = (
  input: InputOf<D>,
  ctx: C,
) => ResultOf<D> | Promise<ResultOf<D>>;

export type SignalHandler<D extends SignalDef, C> = (input: InputOf<D>, ctx: C) => void;

function senderIsOurs<C>(event: ChannelEvent, env: ChannelEnv<C>): boolean {
  const frame = event.senderFrame;
  // Only the top page: a frame inside it (there is none) would not be ours either.
  return frame !== null && frame.parent === null && env.isOwnPage(frame.url);
}

/** Runs one call: checks, handler, and the answer. Exported so the tests can drive it. */
export async function runCall<D extends QueryDef | CommandDef, C>(
  def: D,
  handler: CallHandler<D, C>,
  event: ChannelEvent,
  rawInput: unknown,
  env: ChannelEnv<C>,
): Promise<Reply<ResultOf<D>>> {
  const fail = (reason: ReasonCode, message?: string): Reply<ResultOf<D>> => {
    env.log(`${def.name} did not run: ${reason}`);
    return message ? { ok: false, reason, message } : { ok: false, reason };
  };
  // A rejected message never reaches the handler, and does not count as a change.
  if (!senderIsOurs(event, env)) return fail('bad-sender');
  if (!def.input(rawInput)) return fail('bad-input');

  const quiet = def.kind === 'query' || def.quiet;
  try {
    const value = await handler(rawInput as InputOf<D>, env.context());
    if (def.kind === 'command') env.log(`${def.name} ok`);
    if (!quiet) env.afterCommand();
    return { ok: true, value };
  } catch (error) {
    if (!quiet) env.afterCommand();
    if (error instanceof ChannelRefusal) {
      return fail(error.reason, error.message || undefined);
    }
    // Only the kind of error is logged, never its text: the text can quote data.
    env.log(`${def.name} failed: ${error instanceof Error ? error.name : 'unknown'}`);
    return { ok: false, reason: 'failed' };
  }
}

/** Runs one signal (a one-way note). Nothing is answered; a problem is only logged. */
export function runSignal<D extends SignalDef, C>(
  def: D,
  handler: SignalHandler<D, C>,
  event: ChannelEvent,
  rawInput: unknown,
  env: ChannelEnv<C>,
): void {
  if (!senderIsOurs(event, env)) return env.log(`${def.name} did not run: bad-sender`);
  if (!def.input(rawInput)) return env.log(`${def.name} did not run: bad-input`);
  try {
    handler(rawInput as InputOf<D>, env.context());
  } catch (error) {
    env.log(`${def.name} failed: ${error instanceof Error ? error.name : 'unknown'}`);
  }
}

/** Registers the handler for one declared channel. */
export function registerChannel<D extends QueryDef | CommandDef, C>(
  ipc: IpcLike,
  env: ChannelEnv<C>,
  def: D,
  handler: CallHandler<D, C>,
): void;
export function registerChannel<D extends SignalDef, C>(
  ipc: IpcLike,
  env: ChannelEnv<C>,
  def: D,
  handler: SignalHandler<D, C>,
): void;
export function registerChannel(
  ipc: IpcLike,
  env: ChannelEnv<unknown>,
  def: QueryDef | CommandDef | SignalDef,
  handler: (input: never, ctx: unknown) => unknown,
): void {
  if (def.kind === 'signal') {
    ipc.on(def.name, (event, input) =>
      runSignal(def, handler as SignalHandler<SignalDef, unknown>, event, input, env),
    );
  } else {
    ipc.handle(def.name, (event, input) =>
      runCall(def, handler as CallHandler<QueryDef | CommandDef, unknown>, event, input, env),
    );
  }
}
