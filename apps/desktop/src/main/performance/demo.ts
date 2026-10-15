// Demo mode's made-up weekly performance data: every kind of export in packages/fixtures/
// performance (shipped with the installed app), brought in through the usual readers into the
// throwaway demo copy of the database. The person's real data is never touched.
//
// The made-up weekly files name a different set of made-up drivers from the demo's own associate
// list, so that set's driver list (the roster folder) is folded into the demo's Associates list
// first, the way a person brings it in: then the scorecards, reports and emails have names and
// addresses to work with. The two sets share no names, so the Load Out side is unaffected.

import { join } from 'node:path';
import type { AppState } from '@loadout/core';
import { importAssociateData } from '@loadout/core/importers';
import { PERF_KINDS } from '../../shared/performance';
import type { PerfHost } from './perfHost';
import { exportFile, importExportFiles, kindFilesInFolder } from './readExports';

/** Brings in the driver list, then every fixture file, kind by kind. Rows written (for the log). */
export async function loadDemoPerformance(
  host: PerfHost,
  folder: string,
  state: AppState,
): Promise<number> {
  let rows = 0;
  const rosterFile = exportFile(join(folder, 'roster', 'AssociateData.csv'));
  if (rosterFile && !host.closed) {
    const book = await importAssociateData(rosterFile.path);
    if (host.closed) return rows;
    state.importAssociates(book);
    rows += book.rows.length;
  }
  for (const kind of PERF_KINDS) {
    if (host.closed) break;
    const files = kindFilesInFolder(kind, join(folder, kind));
    if (files.length === 0) continue;
    rows += (await importExportFiles(host, kind, files)).summary.rows;
  }
  return rows;
}
