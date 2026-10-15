// Auto-import and Sync now, ported from the old app's AutoImporter.cs. Each kind's remembered
// folder (or, for the thresholds, file) is looked at, and only files that are new
// or changed since they were last brought in are read: the record of imported files compares
// the file's name, size and last-change time. Every reader replaces a week's data on re-import,
// so reading a changed file again is safe.
//
// A remembered folder that is not there now (a USB stick that is unplugged, a renamed folder) is
// reported, not an error. Only counts come back; the page words them.

import {
  PERF_KINDS,
  PERF_KIND_WORDS,
  SINGLE_FILE_KINDS,
  type PerfKind,
  type SyncSummary,
} from '../../shared/performance';
import type { PerfHost } from './perfHost';
import {
  LEDGER_SOURCE,
  exportFile,
  importExportFiles,
  isFolder,
  kindFilesInFolder,
  type ExportFile,
} from './readExports';

/** The files a remembered place holds for its kind, or null when the place is not there now. */
export function filesAt(kind: PerfKind, place: string): ExportFile[] | null {
  if (SINGLE_FILE_KINDS.includes(kind)) {
    const file = exportFile(place);
    return file === null ? null : [file];
  }
  return isFolder(place) ? kindFilesInFolder(kind, place) : null;
}

/** Brings in every new or changed file from the remembered places. */
export async function runSync(
  host: PerfHost,
  places: Partial<Record<PerfKind, string>>,
  now: Date = new Date(),
): Promise<SyncSummary> {
  const result: SyncSummary = {
    at: now.toISOString(),
    newFiles: 0,
    weeksUpdated: 0,
    missingFolders: [],
    problems: [],
    rows: 0,
  };
  const weeks = new Set<string>();
  for (const kind of PERF_KINDS) {
    const place = places[kind];
    if (!place) continue;
    const files = filesAt(kind, place);
    if (files === null) {
      result.missingFolders.push(kind);
      continue;
    }
    const source = LEDGER_SOURCE[kind];
    const fresh = files.filter(
      (file) => !host.store.ledgerHas(source, file.fileName, file.size, file.modifiedMs),
    );
    if (fresh.length === 0) continue;
    const outcome = await importExportFiles(host, kind, fresh);
    result.newFiles += outcome.taken.length;
    result.rows += outcome.summary.rows;
    for (const week of outcome.summary.weeks) weeks.add(week);
    // Each problem says which kind of export it is about, so the list reads by kind.
    const title = PERF_KIND_WORDS[kind].title;
    result.problems.push(...outcome.summary.problems.map((problem) => `${title}: ${problem}`));
  }
  result.weeksUpdated = weeks.size;
  return result;
}
