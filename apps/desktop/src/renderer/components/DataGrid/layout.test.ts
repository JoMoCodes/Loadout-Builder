// Column order and widths: the old app's ColumnLayout rules, and the store that keeps them.

import { describe, expect, it } from 'vitest';
import {
  isDefaultLayout,
  LAYOUT_KEY_PREFIX,
  layoutToStore,
  localStorageLayoutStore,
  moveColumn,
  reconcileLayout,
  type KeyValueStorage,
} from './layout';

const COLUMNS = ['driver', 'routes', 'wave_time', 'vehicle', 'vin'];

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

describe('moving a column', () => {
  it('dragged right, it lands after the column it was dropped on', () => {
    expect(moveColumn(COLUMNS, 'driver', 'wave_time')).toEqual([
      'routes',
      'wave_time',
      'driver',
      'vehicle',
      'vin',
    ]);
  });

  it('dragged left, it lands before it', () => {
    expect(moveColumn(COLUMNS, 'vin', 'routes')).toEqual([
      'driver',
      'vin',
      'routes',
      'wave_time',
      'vehicle',
    ]);
  });

  it('dropped on itself, nothing moves', () => {
    expect(moveColumn(COLUMNS, 'vehicle', 'vehicle')).toEqual(COLUMNS);
  });
});

describe('a stored layout', () => {
  it('is reconciled: unknown columns dropped, new ones join the end', () => {
    const layout = reconcileLayout(COLUMNS, {
      order: ['vin', 'gone', 'driver'],
      widths: { vin: 180, gone: 90, routes: 0 },
    });
    expect(layout.order).toEqual(['vin', 'driver', 'routes', 'wave_time', 'vehicle']);
    expect(layout.widths).toEqual({ vin: 180 });
  });

  it('never goes narrower than the old minimum', () => {
    expect(reconcileLayout(COLUMNS, { widths: { pad: 1, vin: 10 } }).widths).toEqual({ vin: 45 });
  });

  it('never hides every column', () => {
    expect(reconcileLayout(['a', 'b'], { hidden: ['a', 'b'] }).hidden).toEqual([]);
  });

  it('stores no order while the table is as built, and only hand-set widths', () => {
    const built = reconcileLayout(COLUMNS, null);
    expect(isDefaultLayout(COLUMNS, built)).toBe(true);
    expect(layoutToStore(COLUMNS, { ...built, widths: { vin: 200 } })).toEqual({
      order: [],
      widths: { vin: 200 },
      hidden: [],
    });
    const moved = { ...built, order: moveColumn(COLUMNS, 'vin', 'driver') };
    expect(layoutToStore(COLUMNS, moved).order).toEqual(moved.order);
    expect(isDefaultLayout(COLUMNS, moved)).toBe(false);
  });
});

describe('the storage-backed layout store', () => {
  it('keeps one entry per table and gives it back', () => {
    const storage = memoryStorage();
    const store = localStorageLayoutStore(storage);
    store.save('roster', ['vin', 'driver'], { vin: 210 }, ['routes']);
    store.save('associates', [], {}, []);
    expect(storage.data.has(`${LAYOUT_KEY_PREFIX}roster`)).toBe(true);
    expect(store.load('roster')).toEqual({
      order: ['vin', 'driver'],
      widths: { vin: 210 },
      hidden: ['routes'],
    });
    expect(store.load('associates')).toEqual({ order: [], widths: {}, hidden: [] });
    expect(store.load('never-saved')).toBeNull();
  });

  it('treats a damaged entry as never arranged', () => {
    const storage = memoryStorage();
    storage.setItem(`${LAYOUT_KEY_PREFIX}roster`, '{not json');
    expect(localStorageLayoutStore(storage).load('roster')).toBeNull();
  });

  it('carries on when storage refuses to save', () => {
    const store = localStorageLayoutStore({
      getItem: () => null,
      setItem: () => {
        throw new Error('full');
      },
    });
    expect(() => store.save('roster', [], {})).not.toThrow();
  });
});
