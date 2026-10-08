// How a channel is declared. A channel is one named message between a page and the main
// process. Each is declared once, with its name, what it takes in and what it gives back, and
// everything else (the main side, the bridge, the page's call) is derived from that.
//
//   export const clearPrevious = defineCommand('loadOut:clear-previous-roster', {
//     input: nothing,
//     result: as<null>(),
//   });
//
// Four kinds:
//   query    asks for something; changes nothing.
//   command  does something. After every command the main process tells the pages that the
//            saved data may have changed (`state:changed`), unless it is declared `quiet`.
//   signal   one-way note from the page; no answer comes back.
//   event    one-way note from the main process to the page.

import type { Guard } from './check';

/** Why a channel call did not work. Codes only: never a name, a path or a message from code. */
export type ReasonCode =
  | 'bad-sender' //  the message did not come from the app's own page
  | 'bad-input' //   the message had the wrong shape
  | 'no-data' //     the saved data could not be opened
  | 'not-allowed' // the app will not do this (for example, read a file nobody picked)
  | 'refused' //     understood but cannot be done; `message` says why in plain words
  | 'failed' //      something went wrong inside; nothing more is said
  | 'no-bridge'; //  the page is not running inside the app (a plain browser)

export type Reply<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      reason: ReasonCode;
      /**
       * Plain words for the person, only where the app wrote them (for example why a file
       * was refused). Never set for 'failed'.
       */
      message?: string;
    };

/** Carries a result type without carrying a value: `result: as<Thing>()`. */
export function as<T>(): T {
  return undefined as unknown as T;
}

export interface QueryDef<N extends string = string, I = unknown, O = unknown> {
  readonly kind: 'query';
  readonly name: N;
  readonly input: Guard<I>;
  readonly result?: O;
}

export interface CommandDef<N extends string = string, I = unknown, O = unknown> {
  readonly kind: 'command';
  readonly name: N;
  readonly input: Guard<I>;
  readonly result?: O;
  /** Do not send `state:changed` afterwards (for things that are not the day's data). */
  readonly quiet: boolean;
}

export interface SignalDef<N extends string = string, I = unknown> {
  readonly kind: 'signal';
  readonly name: N;
  readonly input: Guard<I>;
}

export interface EventDef<N extends string = string, P = unknown> {
  readonly kind: 'event';
  readonly name: N;
  readonly payload?: P;
}

export type CallDef = QueryDef | CommandDef;
export type AnyDef = QueryDef | CommandDef | SignalDef | EventDef;

export function defineQuery<const N extends string, I, O>(
  name: N,
  spec: { input: Guard<I>; result: O },
): QueryDef<N, I, O> {
  return { kind: 'query', name, input: spec.input };
}

export function defineCommand<const N extends string, I, O>(
  name: N,
  spec: { input: Guard<I>; result: O; quiet?: boolean },
): CommandDef<N, I, O> {
  return { kind: 'command', name, input: spec.input, quiet: spec.quiet === true };
}

export function defineSignal<const N extends string, I>(
  name: N,
  spec: { input: Guard<I> },
): SignalDef<N, I> {
  return { kind: 'signal', name, input: spec.input };
}

export function defineEvent<const N extends string, P>(
  name: N,
  spec: { payload: P },
): EventDef<N, P> {
  void spec;
  return { kind: 'event', name };
}

// ---- Types derived from declarations

export type InputOf<D> = D extends { input: Guard<infer I> } ? I : never;
export type ResultOf<D> = D extends { result?: infer O } ? O : never;
export type PayloadOf<D> = D extends { payload?: infer P } ? P : never;

/** The declarations of one area, as a map from channel name to declaration. */
export type ByName<Defs extends readonly AnyDef[]> = {
  [D in Defs[number] as D['name']]: D;
};

/** Builds a name-to-declaration map, and refuses a name that is used twice. */
export function indexChannels<const Defs extends readonly AnyDef[]>(defs: Defs): ByName<Defs> {
  const map: Record<string, AnyDef> = {};
  for (const def of defs) {
    if (Object.hasOwn(map, def.name)) throw new Error(`Channel declared twice: ${def.name}`);
    map[def.name] = def;
  }
  return map as ByName<Defs>;
}
