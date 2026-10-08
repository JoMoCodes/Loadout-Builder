// A table's column layout (order, hand-set widths, hidden columns) and where it is kept.
//
// Ported from the old app's ColumnLayout: a stored layout is reconciled rather than trusted
// (a column the table no longer has is dropped, a new one joins the end), only widths set by
// hand are kept (the rest size themselves to their contents), and nothing is stored while the
// table is as built, so a stored row only exists for a layout somebody chose.

export interface GridLayout {
  /** Column ids left to right. Empty means "as the page built it". */
  order: string[];
  /** Only the columns somebody resized by hand, in CSS pixels at normal text size. */
  widths: Record<string, number>;
  /** Columns hidden with the Columns menu. Optional: older stores do not keep it. */
  hidden?: string[];
}

/**
 * Where layouts live. Phase 4 backs this with the database's column_order and column_widths
 * tables; until then `localStorageLayoutStore` keeps them in the window's storage.
 * Either method may return a promise (the database sits behind the app's bridge).
 */
export interface GridLayoutStore {
  load(view: string): GridLayout | null | Promise<GridLayout | null>;
  save(
    view: string,
    order: string[],
    widths: Record<string, number>,
    hidden?: string[],
  ): void | Promise<void>;
}

/** The narrowest a column can go, as in the old app. */
export const MIN_COLUMN_WIDTH = 45;

/** Fit a stored layout to the columns the table has now. */
export function reconcileLayout(
  columns: readonly string[],
  stored: Partial<GridLayout> | null | undefined,
): Required<GridLayout> {
  const known = new Set(columns);
  const wanted = (stored?.order ?? []).filter(
    (id, at, all) => known.has(id) && all.indexOf(id) === at,
  );
  const order = [...wanted, ...columns.filter((id) => !wanted.includes(id))];
  const widths: Record<string, number> = {};
  for (const [id, width] of Object.entries(stored?.widths ?? {})) {
    const value = Math.round(Number(width));
    if (known.has(id) && Number.isFinite(value) && value > 0) {
      widths[id] = Math.max(MIN_COLUMN_WIDTH, value);
    }
  }
  const hidden = (stored?.hidden ?? []).filter((id) => known.has(id));
  // Never hide every column: a table with nothing in it cannot be put back from the menu.
  return { order, widths, hidden: hidden.length >= columns.length ? [] : hidden };
}

/** What to store: no order while it matches the table as built. */
export function layoutToStore(
  columns: readonly string[],
  layout: Required<GridLayout>,
): Required<GridLayout> {
  const isBuilt =
    layout.order.length === columns.length && layout.order.every((id, at) => id === columns[at]);
  return {
    order: isBuilt ? [] : [...layout.order],
    widths: { ...layout.widths },
    hidden: [...layout.hidden],
  };
}

export function isDefaultLayout(columns: readonly string[], layout: Required<GridLayout>): boolean {
  const stored = layoutToStore(columns, layout);
  return (
    stored.order.length === 0 &&
    Object.keys(stored.widths).length === 0 &&
    stored.hidden.length === 0
  );
}

/**
 * Move a column the way dragging a heading did in the old app: dragged right, it lands after
 * the column it was dropped on; dragged left, before it. Either way it takes that place.
 */
export function moveColumn(order: readonly string[], source: string, target: string): string[] {
  if (source === target) return [...order];
  const was = order.indexOf(source);
  const to = order.indexOf(target);
  if (was < 0 || to < 0) return [...order];
  const next = order.filter((id) => id !== source);
  next.splice(next.indexOf(target) + (was < to ? 1 : 0), 0, source);
  return next;
}

/** Storage that behaves like `window.localStorage`. Passed in so tests can use their own. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const LAYOUT_KEY_PREFIX = 'loadout.grid-layout.';

/** Keeps each table's layout in the window's storage, one entry per table. */
export function localStorageLayoutStore(storage?: KeyValueStorage): GridLayoutStore {
  const pick = (): KeyValueStorage | null => {
    if (storage) return storage;
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null; // storage switched off: layouts last until the window closes
    }
  };
  return {
    load(view) {
      try {
        const raw = pick()?.getItem(LAYOUT_KEY_PREFIX + view);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<GridLayout>;
        return {
          order: Array.isArray(parsed.order) ? parsed.order.map(String) : [],
          widths: parsed.widths && typeof parsed.widths === 'object' ? parsed.widths : {},
          hidden: Array.isArray(parsed.hidden) ? parsed.hidden.map(String) : [],
        };
      } catch {
        return null; // a damaged entry is treated as "never arranged"
      }
    },
    save(view, order, widths, hidden = []) {
      try {
        pick()?.setItem(LAYOUT_KEY_PREFIX + view, JSON.stringify({ order, widths, hidden }));
      } catch {
        // Full or switched off: the layout still holds for this session.
      }
    },
  };
}
