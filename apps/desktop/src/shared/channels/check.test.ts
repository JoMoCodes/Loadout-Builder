import { describe, expect, it } from 'vitest';
import {
  anyObject,
  arrayOf,
  filled,
  intBetween,
  nothing,
  nullable,
  number,
  oneOf,
  optional,
  recordOf,
  shape,
  text,
} from './check';

describe('input checks', () => {
  it('nothing accepts only "no input"', () => {
    expect(nothing(undefined)).toBe(true);
    expect(nothing(null)).toBe(false);
    expect(nothing({})).toBe(false);
    expect(nothing('')).toBe(false);
  });

  it('numbers must be real numbers', () => {
    expect(number(3)).toBe(true);
    expect(number(Number.NaN)).toBe(false);
    expect(number(Number.POSITIVE_INFINITY)).toBe(false);
    expect(number('3')).toBe(false);
    expect(intBetween(0, 5)(5)).toBe(true);
    expect(intBetween(0, 5)(6)).toBe(false);
    expect(intBetween(0, 5)(2.5)).toBe(false);
  });

  it('text has a length limit, and filled text is not empty', () => {
    expect(text(3)('abc')).toBe(true);
    expect(text(3)('abcd')).toBe(false);
    expect(text()('')).toBe(true);
    expect(filled(3)('')).toBe(false);
    expect(filled(3)('ab')).toBe(true);
    expect(filled()(4)).toBe(false);
  });

  it('oneOf accepts only the listed words', () => {
    const kind = oneOf(['a', 'b'] as const);
    expect(kind('a')).toBe(true);
    expect(kind('c')).toBe(false);
    expect(kind(undefined)).toBe(false);
    expect(kind('toString')).toBe(false);
  });

  it('optional and nullable widen a check', () => {
    expect(optional(number)(undefined)).toBe(true);
    expect(optional(number)(null)).toBe(false);
    expect(nullable(number)(null)).toBe(true);
    expect(nullable(number)(undefined)).toBe(false);
  });

  it('lists and records check every entry and their size', () => {
    expect(arrayOf(number, 2)([1, 2])).toBe(true);
    expect(arrayOf(number, 2)([1, 2, 3])).toBe(false);
    expect(arrayOf(number)([1, 'x'])).toBe(false);
    expect(arrayOf(number)({ length: 1 })).toBe(false);
    expect(recordOf(number)({ a: 1, b: 2 })).toBe(true);
    expect(recordOf(number)({ a: 1, b: 'x' })).toBe(false);
    expect(recordOf(number, 1)({ a: 1, b: 2 })).toBe(false);
    expect(recordOf(number)([1])).toBe(false);
  });

  it('a shape needs a plain object with every field right', () => {
    const input = shape({ view: filled(10), size: optional(number) });
    expect(input({ view: 'roster' })).toBe(true);
    expect(input({ view: 'roster', size: 4 })).toBe(true);
    expect(input({ view: 'roster', size: 'big' })).toBe(false);
    expect(input({ size: 4 })).toBe(false);
    expect(input(null)).toBe(false);
    expect(input([])).toBe(false);
    expect(input('roster')).toBe(false);
    expect(input(new Date())).toBe(false);
    expect(anyObject(new Map())).toBe(false);
    expect(anyObject({})).toBe(true);
  });
});
