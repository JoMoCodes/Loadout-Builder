// Tiny input checks for messages from the page. Each check says whether a value has the right
// shape, and doubles as a TypeScript guard, so one declaration gives both the run-time check
// and the type. Hand-written on purpose: a few lines each, no outside package.

export type Guard<T> = (value: unknown) => value is T;

/** What a guard accepts, as a type. */
export type Checked<G> = G extends Guard<infer T> ? T : never;

function isObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/** No input at all. */
export const nothing: Guard<undefined> = (value): value is undefined => value === undefined;

/** Any plain object. The handler must still pick out and check the fields it reads. */
export const anyObject: Guard<Record<string, unknown>> = isObject;

export const boolean: Guard<boolean> = (value): value is boolean => typeof value === 'boolean';

/** A real number (not NaN, not infinite). */
export const number: Guard<number> = (value): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const integer: Guard<number> = (value): value is number =>
  typeof value === 'number' && Number.isInteger(value);

/** A whole number from `min` up to `max`. */
export function intBetween(min: number, max: number): Guard<number> {
  return (value): value is number => integer(value) && value >= min && value <= max;
}

/** Text of at most `max` characters (default 2000). */
export function text(max = 2000): Guard<string> {
  return (value): value is string => typeof value === 'string' && value.length <= max;
}

/** Text with something in it, of at most `max` characters. */
export function filled(max = 2000): Guard<string> {
  return (value): value is string =>
    typeof value === 'string' && value.length > 0 && value.length <= max;
}

export function oneOf<const T extends readonly string[]>(options: T): Guard<T[number]> {
  return (value): value is T[number] =>
    typeof value === 'string' && (options as readonly string[]).includes(value);
}

export function optional<T>(guard: Guard<T>): Guard<T | undefined> {
  return (value): value is T | undefined => value === undefined || guard(value);
}

export function nullable<T>(guard: Guard<T>): Guard<T | null> {
  return (value): value is T | null => value === null || guard(value);
}

/** A list of at most `max` items, each passing `item`. */
export function arrayOf<T>(item: Guard<T>, max = 10_000): Guard<T[]> {
  return (value): value is T[] =>
    Array.isArray(value) && value.length <= max && value.every((entry) => item(entry));
}

/** A plain object whose values all pass `item`, with at most `max` keys. */
export function recordOf<T>(item: Guard<T>, max = 10_000): Guard<Record<string, T>> {
  return (value): value is Record<string, T> =>
    isObject(value) && Object.keys(value).length <= max && Object.values(value).every(item);
}

type Shape = Record<string, Guard<unknown>>;
type Built<S extends Shape> = { [K in keyof S]: Checked<S[K]> };

/**
 * A plain object with these fields. Each field must pass its guard; a field that may be missing
 * uses `optional(...)`. Fields that are not listed are ignored by the check, and the handler
 * only ever reads the listed ones.
 */
export function shape<S extends Shape>(fields: S): Guard<Built<S>> {
  const entries = Object.entries(fields);
  return (value): value is Built<S> =>
    isObject(value) && entries.every(([key, guard]) => guard(value[key]));
}
