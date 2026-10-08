// Plain data shapes the app's frame shares between the main process and the page.

export type UpdateState =
  'idle' | 'unsupported' | 'checking' | 'current' | 'downloading' | 'ready' | 'error';

export interface UpdateStatus {
  state: UpdateState;
  version: string | null;
  percent: number | null;
  message: string | null;
}

export interface DataSourceInfo {
  /** "real" is the person's saved data. "demo" is the made-up demo data. */
  mode: 'real' | 'demo';
  /** Whether the saved data opened. When false, `reason` says why (a code, never a name). */
  ok: boolean;
  reason: 'fixture-missing' | 'open-failed' | null;
  /** How many rows each table holds. Counts only. */
  counts: Record<string, number>;
}

export interface OpenFolderResult {
  ok: boolean;
}
