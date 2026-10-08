import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HIDDEN_KEY_PREFIX, databaseLayoutStore } from './gridLayoutStore';

type Reply = { ok: boolean; value?: unknown; reason?: string };

const sent: Array<{ name: string; input: unknown }> = [];
let layouts: Record<string, { order: string[]; widths: Record<string, number> }> = {};
let storage: Record<string, string> = {};

beforeEach(() => {
  sent.length = 0;
  layouts = {};
  storage = {};
  const answer = async (
    name: string,
    input: { view: string; order: string[]; widths: Record<string, number> },
  ): Promise<Reply> => {
    sent.push({ name, input });
    if (name === 'layout:get')
      return { ok: true, value: layouts[input.view] ?? { order: [], widths: {} } };
    layouts[input.view] = { order: input.order, widths: input.widths };
    return { ok: true, value: null };
  };
  vi.stubGlobal('window', {
    loadout: {
      calls: {
        'layout:get': (input: { view: string; order: string[]; widths: Record<string, number> }) =>
          answer('layout:get', input),
        'layout:set': (input: { view: string; order: string[]; widths: Record<string, number> }) =>
          answer('layout:set', input),
      },
    },
  });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => {
      storage[key] = value;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the table layout store backed by the saved data', () => {
  it('says "never arranged" for a table nobody has touched', async () => {
    expect(await databaseLayoutStore.load('roster')).toBeNull();
  });

  it('keeps order and widths in the saved data, and hidden columns in the window', async () => {
    await databaseLayoutStore.save('roster', ['vehicle', 'driver'], { driver: 200 }, ['bags']);
    expect(layouts.roster).toEqual({ order: ['vehicle', 'driver'], widths: { driver: 200 } });
    expect(JSON.parse(storage[HIDDEN_KEY_PREFIX + 'roster'] ?? '[]')).toEqual(['bags']);
    expect(await databaseLayoutStore.load('roster')).toEqual({
      order: ['vehicle', 'driver'],
      widths: { driver: 200 },
      hidden: ['bags'],
    });
  });

  it('keeps each table apart', async () => {
    await databaseLayoutStore.save('roster', ['a'], {}, []);
    expect(await databaseLayoutStore.load('vehicles')).toBeNull();
  });

  it('a table with only hidden columns still comes back', async () => {
    await databaseLayoutStore.save('vehicles', [], {}, ['plate']);
    expect(await databaseLayoutStore.load('vehicles')).toEqual({
      order: [],
      widths: {},
      hidden: ['plate'],
    });
  });

  it('puts the table back to usual when order and widths are emptied', async () => {
    await databaseLayoutStore.save('roster', ['a', 'b'], { a: 90 }, []);
    await databaseLayoutStore.save('roster', [], {}, []);
    expect(await databaseLayoutStore.load('roster')).toBeNull();
  });

  it('carries on without a layout when the saved data cannot be reached', async () => {
    vi.stubGlobal('window', { loadout: undefined });
    expect(await databaseLayoutStore.load('roster')).toBeNull();
    await expect(databaseLayoutStore.save('roster', ['a'], {}, [])).resolves.toBeUndefined();
  });
});
