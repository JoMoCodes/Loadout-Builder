// Export all, as a plan: which folder, which files, in what order. The main process writes them to
// disk; nothing here touches the disk. Ported from the old exportAll.

import { STATES, type Distribution } from '../matcher/distribute';
import { safeFileName } from './eml';
import { renderSummaryCsv, renderSummaryHtml } from './summary';

export const DRAFTS_FOLDER = 'Email drafts';
export const PDFS_FOLDER = 'Route sheet PDFs';

export interface PlannedFile {
  /** 'drafts' and 'pdfs' are the two sub-folders; 'root' is the run's own folder. */
  folder: 'drafts' | 'pdfs' | 'root';
  name: string;
  content: Uint8Array | string;
}

export interface ExportPlan {
  folder: string;
  draftsFolder: string;
  pdfsFolder: string;
  files: PlannedFile[];
  /** How many email drafts are in `files`. */
  written: number;
}

/** What the plan needs for one route: its PDF page(s) and its email draft. */
export interface RouteExportFiles {
  pdf: Uint8Array | null;
  eml: string;
}

export async function planExportAll(
  label: string,
  dist: Distribution,
  emailFor: (routeCode: string) => Promise<RouteExportFiles> | RouteExportFiles,
): Promise<ExportPlan> {
  const folder = safeFileName(label.replace(/·/g, '-')) || 'Route sheets';
  const files: PlannedFile[] = [];
  let written = 0;
  for (const r of dist.routes) {
    if (!r.hasSheet) continue;
    const e = await emailFor(r.routeCode);
    const who =
      r.state === STATES.READY ? r.recipients.map((p) => p.name).join(' & ') : 'UNASSIGNED';
    const base = safeFileName(`${r.routeCode} - ${who}`);
    if (e.pdf) files.push({ folder: 'pdfs', name: `${base}.pdf`, content: e.pdf });
    if (r.state === STATES.READY) {
      files.push({ folder: 'drafts', name: `${base}.eml`, content: e.eml });
      written++;
    }
  }
  files.push({
    folder: 'root',
    name: 'Distribution summary.html',
    content: renderSummaryHtml(label, dist),
  });
  files.push({ folder: 'root', name: 'Distribution summary.csv', content: renderSummaryCsv(dist) });
  return { folder, draftsFolder: DRAFTS_FOLDER, pdfsFolder: PDFS_FOLDER, files, written };
}
