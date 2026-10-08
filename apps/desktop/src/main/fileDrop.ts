// Checking a file that was dropped on a page, before the app is willing to read it. The page only
// says which page and which kind; the place on the computer came from the bridge. A file that
// passes is remembered under a token, and `files:import` reads it as if it had been picked in the
// file window. Nothing here logs or repeats the place or the file's name.

import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { basename, extname, isAbsolute } from 'node:path';
import { DROP_KINDS, FILE_WORDS, type DropPage, type FileKind } from '../shared/channels/files';

/** No export the app reads comes near this; anything bigger is not one of them. */
export const MAX_DROP_BYTES = 50 * 1024 * 1024;

/** Dropped files that passed the check, by token: the kind they were dropped as, and the place. */
export type DroppedFiles = Map<string, { kind: FileKind; path: string }>;

/** How many dropped files are remembered at once (the oldest is forgotten first). */
const MAX_REMEMBERED_DROPS = 20;

export type DropCheck =
  | { ok: true }
  | { ok: false; reason: 'not-allowed' }
  | { ok: false; reason: 'refused'; message: string };

/** The part of `fs.statSync` the check uses, so the tests can stand in for the disk. */
export type StatFile = (path: string) => { isFile(): boolean; size: number } | undefined;

const realStat: StatFile = (path) => statSync(path, { throwIfNoEntry: false });

/** Is this dropped file one the app should read for this page and kind? */
export function checkDroppedFile(
  page: DropPage,
  kind: FileKind,
  path: string,
  stat: StatFile = realStat,
): DropCheck {
  // The page decides the kind from the tab it is on; any other pair is not the app's own page.
  if (!DROP_KINDS[page].includes(kind)) return { ok: false, reason: 'not-allowed' };

  const words = FILE_WORDS[kind];
  const refuse = (message: string): DropCheck => ({ ok: false, reason: 'refused', message });
  if (!path || !isAbsolute(path)) {
    return refuse(
      'That file could not be read from where it was dropped. Use the Import button instead.',
    );
  }
  if (!words.endings.includes(extname(path).toLowerCase())) {
    return refuse(`That file doesn't look like ${words.a}. It should end in ${words.endings[0]}.`);
  }
  let found: ReturnType<StatFile>;
  try {
    found = stat(path);
  } catch {
    found = undefined;
  }
  if (!found) return refuse('That file could not be found. It may have been moved or deleted.');
  if (!found.isFile()) return refuse('That is not a file. Drop one file at a time.');
  if (found.size > MAX_DROP_BYTES) {
    return refuse(`That file is too big to be ${words.a}.`);
  }
  return { ok: true };
}

/**
 * Remembers a checked file and gives back the token that stands for it. The token ends in the
 * file's name, so the page can say which file it read; it is not a place on the computer.
 */
export function rememberDrop(dropped: DroppedFiles, kind: FileKind, path: string): string {
  if (dropped.size >= MAX_REMEMBERED_DROPS) {
    const oldest = dropped.keys().next().value;
    if (oldest !== undefined) dropped.delete(oldest);
  }
  const token = `dropped-${randomUUID()}/${basename(path)}`;
  dropped.set(token, { kind, path });
  return token;
}
