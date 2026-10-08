// Choosing a file and bringing it in, the way docs/PAGE-PATTERN.md describes, with the old pages'
// habit of saying "Import failed." in the status line and showing the reader's words in a box.

import type { CallArgs } from '../../../shared/api';
import type { CallName, CallResult } from '../../../shared/channels';
import type { FileKind } from '../../../shared/channels/files';
import type { AppSnapshot } from '../../../shared/snapshot';
import { call, explain } from '../../lib/channels';
import type { Messages } from './PageParts';

/** The snapshot as it is right now. A page uses this after a command to word what happened. */
export async function readNow(): Promise<AppSnapshot | null> {
  const reply = await call('state:snapshot');
  return reply.ok ? reply.value : null;
}

export interface BroughtIn {
  path: string;
  rows: number;
}

/**
 * Opens the file window for this kind of file and reads what is chosen. Returns null if the
 * person closed the window or the file was refused (in which case the page shows why). With
 * `dropped` (the token of a file dropped on the tab), the file window is skipped.
 */
export async function bringInFile(
  kind: FileKind,
  messages: Messages,
  dropped?: string,
): Promise<BroughtIn | null> {
  messages.clearProblem();
  const path = dropped ?? (await chooseFile(kind, messages));
  if (path === null) return null;

  const done = await call('files:import', { kind, path });
  if (!done.ok) {
    messages.setProblem({ title: 'Import failed', message: explain(done) });
    messages.setStatus('Import failed.');
    return null;
  }
  return { path, rows: done.value.rows };
}

/** Opens the file window only; null if closed. For a command that reads the file itself. */
export async function chooseFile(kind: FileKind, messages: Messages): Promise<string | null> {
  messages.clearProblem();
  const picked = await call('files:pick', { kind });
  if (!picked.ok) {
    messages.setProblem({ title: 'Import failed', message: explain(picked) });
    messages.setStatus('Import failed.');
    return null;
  }
  return picked.value.path;
}

/** Shows why a dropped file was refused, the way a refused import is shown. */
export function dropRefused(messages: Messages, words: string): void {
  messages.setProblem({ title: 'Import failed', message: words });
  messages.setStatus('Import failed.');
}

export type Done<T> = { ok: true; value: T } | { ok: false };

/**
 * Runs a command. When it does not go through, the page shows the plain words in its banner and
 * the answer is `{ ok: false }`.
 */
export async function command<N extends CallName>(
  messages: Messages,
  name: N,
  ...args: CallArgs<N>
): Promise<Done<CallResult<N>>> {
  const send = call as unknown as (
    name: N,
    ...rest: unknown[]
  ) => Promise<{ ok: true; value: CallResult<N> } | Parameters<typeof explain>[0]>;
  const reply = await send(name, ...args);
  if (reply.ok) return { ok: true, value: reply.value };
  messages.setProblem({ title: 'That did not go through', message: explain(reply) });
  return { ok: false };
}
