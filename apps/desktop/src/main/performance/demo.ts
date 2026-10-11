// Demo mode's made-up weekly performance data: every kind of export in packages/fixtures/
// performance (shipped with the installed app), brought in through the usual readers into the
// throwaway demo copy of the database. The person's real data is never touched.

import { join } from 'node:path';
import { PERF_KINDS } from '../../shared/performance';
import type { PerfHost } from './perfHost';
import { importExportFiles, kindFilesInFolder } from './readExports';

/** Brings in every fixture file, kind by kind. Rows written (a count, for the log). */
export async function loadDemoPerformance(host: PerfHost, folder: string): Promise<number> {
  let rows = 0;
  for (const kind of PERF_KINDS) {
    if (host.closed) break;
    const files = kindFilesInFolder(kind, join(folder, kind));
    if (files.length === 0) continue;
    rows += (await importExportFiles(host, kind, files)).summary.rows;
  }
  return rows;
}
