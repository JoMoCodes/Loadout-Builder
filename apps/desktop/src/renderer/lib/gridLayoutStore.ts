// Keeps each table's column order and hand-set widths in the saved data (the same tables the old
// app used), so they stay with the data and not with the window.
//
// Hidden columns are kept in the window's storage, per table. The old app could not hide a
// column; this is a deliberate addition (see docs/PARITY.md) and has no table in the saved data.

import type { GridLayout, GridLayoutStore } from '../components/DataGrid';
import { call } from './channels';

export const HIDDEN_KEY_PREFIX = 'loadout.grid-hidden.';

function readHidden(view: string): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(HIDDEN_KEY_PREFIX + view);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function writeHidden(view: string, hidden: string[]): void {
  try {
    globalThis.localStorage?.setItem(HIDDEN_KEY_PREFIX + view, JSON.stringify(hidden));
  } catch {
    // Switched off or full: the choice lasts until the window closes.
  }
}

/** The layout store pages hand to `<DataGrid layoutStore={...}>`. */
export const databaseLayoutStore: GridLayoutStore = {
  async load(view): Promise<GridLayout | null> {
    const reply = await call('layout:get', { view });
    if (!reply.ok) return null;
    const hidden = readHidden(view);
    const { order, widths } = reply.value;
    if (order.length === 0 && Object.keys(widths).length === 0 && hidden.length === 0) return null;
    return { order, widths, hidden };
  },
  async save(view, order, widths, hidden = []) {
    writeHidden(view, hidden);
    await call('layout:set', { view, order, widths });
  },
};
