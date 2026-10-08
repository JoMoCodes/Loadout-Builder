// The three channels that bring over the old app's data reach the right service calls, and the
// registry checks their input.

import { describe, expect, it, vi } from 'vitest';
import { CHANNELS } from '../../shared/channels';
import { migrationHandlers } from './migration';
import type { HandlerContext, Services } from './types';

function contextWith(oldData: Services['oldData']): HandlerContext {
  return { services: { oldData } } as unknown as HandlerContext;
}

describe('migration channels', () => {
  const find = { found: true, empty: true, demo: false };
  const result = { status: 'imported' as const, counts: [{ table: 'associates', imported: 3 }] };
  const oldData = {
    find: vi.fn(() => find),
    pick: vi.fn(async () => true),
    run: vi.fn(() => result),
  };
  const ctx = contextWith(oldData);

  it('looks, picks and runs through the service', async () => {
    expect(migrationHandlers['migration:find'](undefined, ctx)).toEqual(find);
    await expect(migrationHandlers['migration:pick'](undefined, ctx)).resolves.toEqual({
      chosen: true,
    });
    expect(migrationHandlers['migration:run']({ from: 'usual' }, ctx)).toEqual(result);
    expect(oldData.run).toHaveBeenCalledWith('usual');
  });

  it('never carries a file place from the page: only the two named sources are allowed', () => {
    const input = CHANNELS['migration:run'].input;
    expect(input({ from: 'usual' })).toBe(true);
    expect(input({ from: 'chosen' })).toBe(true);
    expect(input({ from: 'C:/somewhere/loadout.db' })).toBe(false);
    expect(input(undefined)).toBe(false);
  });

  it('opening the file window changes nothing, so it does not announce a change', () => {
    expect(CHANNELS['migration:pick'].quiet).toBe(true);
    expect(CHANNELS['migration:run'].quiet).toBe(false);
    expect(CHANNELS['migration:find'].kind).toBe('query');
  });
});
