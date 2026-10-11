// A file or folder dropped on the Imports tab. The page says which card it landed on (or none:
// dropped on the tab, so the files are sorted by kind from their names); the place on the
// computer came from the bridge. What passes the check is remembered under a token, one per kind
// found, and `performance:import` reads a token once. Nothing here logs or repeats the place.

import { randomUUID } from 'node:crypto';
import { basename, isAbsolute } from 'node:path';
import {
  PERF_KIND_WORDS,
  SINGLE_FILE_KINDS,
  kindOfFileName,
  type PerfKind,
} from '../../shared/performance';
import { ChannelRefusal } from '../channels';
import {
  MAX_EXPORT_BYTES,
  exportFile,
  filesByKind,
  hasEnding,
  isFolder,
  kindFilesInFolder,
  type ExportFile,
} from './readExports';

/** Dropped files that passed the check, by token. */
export type PerfDrops = Map<string, { kind: PerfKind; files: ExportFile[] }>;

/** How many dropped tokens are remembered at once (the oldest is forgotten first). */
const MAX_REMEMBERED = 30;

function refuse(message: string): never {
  throw new ChannelRefusal('refused', message);
}

function remember(drops: PerfDrops, kind: PerfKind, name: string, files: ExportFile[]): string {
  while (drops.size >= MAX_REMEMBERED) {
    const oldest = drops.keys().next().value;
    if (oldest === undefined) break;
    drops.delete(oldest);
  }
  const token = `dropped-${randomUUID()}/${name}`;
  drops.set(token, { kind, files });
  return token;
}

/** The files of a dropped folder, by kind (one kind when it was dropped on a card). */
function folderFiles(kind: PerfKind | null, folder: string): Map<PerfKind, ExportFile[]> {
  if (kind !== null) {
    const files = kindFilesInFolder(kind, folder);
    if (files.length === 0) {
      refuse(`There are no files for ${PERF_KIND_WORDS[kind].the} in that folder.`);
    }
    // The driver list and thresholds are one file: the newest name wins.
    const kept = SINGLE_FILE_KINDS.includes(kind) ? files.slice(-1) : files;
    return new Map([[kind, kept]]);
  }
  const byKind = filesByKind(folder);
  if (byKind.size === 0) {
    refuse(
      'No weekly export files were found in that folder. The app knows them by their names ' +
        '(like DSP_Overview_Dashboard_...csv).',
    );
  }
  for (const single of SINGLE_FILE_KINDS) {
    const files = byKind.get(single);
    if (files && files.length > 1) byKind.set(single, files.slice(-1));
  }
  return byKind;
}

/** One dropped file: the kind it is, after checking it fits. */
function fileKind(kind: PerfKind | null, file: ExportFile): PerfKind {
  if (file.size > MAX_EXPORT_BYTES) refuse('That file is too big to be one of the weekly exports.');
  if (kind !== null) {
    if (!hasEnding(kind, file.fileName)) {
      const words = PERF_KIND_WORDS[kind];
      refuse(`That file doesn't look like ${words.the}. It should end in ${words.endings[0]}.`);
    }
    return kind;
  }
  const found = kindOfFileName(file.fileName);
  if (found === null || !hasEnding(found, file.fileName)) {
    refuse(
      "The app couldn't tell which export that file is from its name. Drop it on its card instead.",
    );
  }
  return found;
}

/** Checks a dropped file or folder and gives back one token per kind found. */
export function takeDrop(
  drops: PerfDrops,
  kind: PerfKind | null,
  path: string,
): Array<{ kind: PerfKind; token: string; files: number }> {
  if (!path || !isAbsolute(path)) {
    refuse('That could not be read from where it was dropped. Use the Choose button instead.');
  }
  if (isFolder(path)) {
    const out: Array<{ kind: PerfKind; token: string; files: number }> = [];
    for (const [found, files] of folderFiles(kind, path)) {
      out.push({
        kind: found,
        token: remember(drops, found, basename(path), files),
        files: files.length,
      });
    }
    return out;
  }
  const file = exportFile(path);
  if (file === null) refuse('That could not be found. It may have been moved or deleted.');
  const found = fileKind(kind, file);
  return [{ kind: found, token: remember(drops, found, file.fileName, [file]), files: 1 }];
}

/** The files behind a token, once. Refuses a token that is not there or is for another kind. */
export function useDrop(drops: PerfDrops, kind: PerfKind, token: string): ExportFile[] {
  const dropped = drops.get(token);
  if (dropped === undefined) throw new ChannelRefusal('not-allowed');
  drops.delete(token);
  if (dropped.kind !== kind) throw new ChannelRefusal('not-allowed');
  return dropped.files;
}
