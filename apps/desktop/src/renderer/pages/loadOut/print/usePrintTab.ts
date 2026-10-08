// What the Print tab is working on: the layout on screen and today's drivers as the sheet wants
// them. The layout is saved the moment a control moves (typing in Title or Note waits until the
// typing stops), as the old tab did, so a layout survives the window being shut straight after.

import { printing } from '@loadout/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PrintRowsView } from '../../../../shared/channels/print';
import { call, explain } from '../../../lib/channels';
import { useAppSnapshot } from '../../../lib/useAppSnapshot';
import { wholeSpec } from './logic';

type PrintSpec = printing.PrintSpec;

// Long enough that typing a title is not a save per key, short enough that nobody closes the app
// inside it.
const SAVE_DELAY_MS = 600;

// The layout last put on the tab, kept while the tab is closed and opened again (switching to the
// Roster tab and back), since saving it does not re-read the whole day. Per data source: demo mode
// has its own saved layout.
let remembered: { mode: string; spec: PrintSpec } | null = null;

export interface PrintTabState {
  /** The layout on the tab, or null until the saved data has been read. */
  spec: PrintSpec | null;
  view: PrintRowsView | null;
  presets: string[];
  /** Plain words for why the tab cannot show anything, or null. */
  problem: string | null;
  /** Puts a layout on the tab and saves it (after a pause when `typed`). */
  change(next: PrintSpec, typed?: boolean): void;
  /** Puts a layout the main process already saved on the tab (a loaded or reset one). */
  replace(next: PrintSpec): void;
  /** Saves now anything still waiting. */
  flush(): Promise<void>;
}

export function usePrintTab(): PrintTabState {
  const { snapshot, error } = useAppSnapshot();
  const mode = snapshot?.mode ?? '';
  const [held, setHeld] = useState(remembered);
  const [view, setView] = useState<PrintRowsView | null>(null);
  const [rowsProblem, setRowsProblem] = useState<string | null>(null);
  const [saveProblem, setSaveProblem] = useState<string | null>(null);
  const pending = useRef<{ spec: PrintSpec; timer: ReturnType<typeof setTimeout> } | null>(null);

  const spec = !snapshot
    ? null
    : held && held.mode === mode
      ? held.spec
      : wholeSpec(snapshot.print.spec);

  // Today's drivers, read again whenever the day's data changes.
  const revision = snapshot?.revision;
  useEffect(() => {
    if (revision === undefined) return;
    let live = true;
    void call('print:rows').then((reply) => {
      if (!live) return;
      if (reply.ok) {
        setView(reply.value);
        setRowsProblem(null);
      } else {
        setRowsProblem(explain(reply));
      }
    });
    return () => {
      live = false;
    };
  }, [revision]);

  const save = useCallback(async (next: PrintSpec) => {
    const reply = await call('print:set-spec', { spec: printing.specToDict(next) });
    setSaveProblem(reply.ok ? null : explain(reply));
  }, []);

  const flush = useCallback(async () => {
    const waiting = pending.current;
    if (!waiting) return;
    clearTimeout(waiting.timer);
    pending.current = null;
    await save(waiting.spec);
  }, [save]);

  // Leaving the tab saves whatever was still waiting.
  useEffect(() => () => void flush(), [flush]);

  const hold = useCallback(
    (next: PrintSpec) => {
      remembered = { mode, spec: next };
      setHeld(remembered);
    },
    [mode],
  );

  const change = useCallback(
    (next: PrintSpec, typed = false) => {
      hold(next);
      if (pending.current) clearTimeout(pending.current.timer);
      if (typed) {
        const timer = setTimeout(() => void flush(), SAVE_DELAY_MS);
        pending.current = { spec: next, timer };
      } else {
        pending.current = null;
        void save(next);
      }
    },
    [hold, flush, save],
  );

  const replace = useCallback(
    (next: PrintSpec) => {
      if (pending.current) clearTimeout(pending.current.timer);
      pending.current = null;
      hold(next);
    },
    [hold],
  );

  return {
    spec,
    view,
    presets: snapshot?.print.presets ?? [],
    problem: error ?? rowsProblem ?? saveProblem,
    change,
    replace,
    flush,
  };
}
