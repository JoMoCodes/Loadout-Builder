import { useCallback, useEffect, useMemo, useState } from 'react';
import { layoutToStore, reconcileLayout, type GridLayout, type GridLayoutStore } from './layout';

type Layout = Required<GridLayout>;

const SEP = '\u0000';

function split(text: string): string[] {
  return text ? text.split(SEP) : [];
}

/**
 * A table's column layout, loaded from the store once and saved on every change.
 * `columns` is every column id in the order the page built them.
 */
export function useGridLayout(
  view: string,
  columns: readonly string[],
  store: GridLayoutStore,
  hiddenByDefault: readonly string[],
) {
  // Keyed on the ids rather than the arrays, so a page that rebuilds its column list on every
  // render does not reload its layout.
  const columnsKey = columns.join(SEP);
  const hiddenKey = hiddenByDefault.join(SEP);
  const ids = useMemo(() => split(columnsKey), [columnsKey]);
  const built = useMemo(() => reconcileLayout(ids, { hidden: split(hiddenKey) }), [ids, hiddenKey]);
  const key = `${view}${SEP}${SEP}${columnsKey}`;

  // The layout belongs to one table; another view or column set starts from its own.
  const [state, setState] = useState<{ key: string; layout: Layout } | null>(null);
  const current = state?.key === key ? state : null;

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => store.load(view))
      .then((stored) => {
        if (cancelled) return;
        const layout = stored
          ? reconcileLayout(ids, { hidden: split(hiddenKey), ...stored })
          : built;
        setState({ key, layout });
      })
      .catch(() => {
        if (!cancelled) setState({ key, layout: built });
      });
    return () => {
      cancelled = true;
    };
  }, [key, view, ids, hiddenKey, built, store]);

  const layout = current?.layout ?? built;

  const update = useCallback(
    (change: (layout: Layout) => Layout) => {
      const next = change(layout);
      setState({ key, layout: next });
      const stored = layoutToStore(ids, next);
      Promise.resolve()
        .then(() => store.save(view, stored.order, stored.widths, stored.hidden))
        .catch(() => undefined); // a failed save leaves the layout in place for this session
    },
    [key, layout, ids, store, view],
  );

  return { layout, loaded: current !== null, update, built };
}
