// The day's data, for any page that draws it. One copy lives here, shared by every page; a page
// reads it with `useAppSnapshot()` and never keeps a copy of its own.
//
// The copy is read from the main process when the first page asks for it, and again every time
// the main process says it changed (`state:changed`, sent after every command). `refresh()` reads
// it again by hand.

import { useSyncExternalStore } from 'react';
import type { AppSnapshot } from '../../shared/snapshot';
import { call, explain, listen } from './channels';

export interface SnapshotState {
  snapshot: AppSnapshot | null;
  /** True until the first answer arrives, and while a newer one is on its way. */
  loading: boolean;
  /** Plain words for why there is no snapshot, or null. */
  error: string | null;
}

let current: SnapshotState = { snapshot: null, loading: true, error: null };
const listeners = new Set<() => void>();
let stopListening: (() => void) | null = null;
let latestRequest = 0;

function set(next: SnapshotState): void {
  current = next;
  for (const listener of listeners) listener();
}

/** Reads the snapshot again. The newest request wins if two overlap. */
export async function refreshSnapshot(): Promise<void> {
  const mine = ++latestRequest;
  if (!current.loading) set({ ...current, loading: true });
  const reply = await call('state:snapshot');
  if (mine !== latestRequest) return;
  if (reply.ok) set({ snapshot: reply.value, loading: false, error: null });
  else set({ snapshot: null, loading: false, error: explain(reply) });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    stopListening = listen('state:changed', () => void refreshSnapshot());
    void refreshSnapshot();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopListening?.();
      stopListening = null;
    }
  };
}

const read = () => current;

export function useAppSnapshot(): SnapshotState & { refresh: () => Promise<void> } {
  const state = useSyncExternalStore(subscribe, read, read);
  return { ...state, refresh: refreshSnapshot };
}
