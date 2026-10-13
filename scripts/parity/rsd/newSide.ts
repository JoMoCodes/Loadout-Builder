// Runs the NEW package (@loadout/route-sheets) over the same inputs the old core was given
// (expected/<layout>/inputs.json and the synthetic PDFs) and writes the same set of files to
// actual/<layout>/. diff.mjs runs this with tsx and then compares the two folders.
//
// The routes and associates lists come from inputs.json (the old app's own readers made them;
// in the app they come from the Route Data and Associates pages, which phase 2 proves).

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import {
  buildRouteEmail,
  distribute,
  planExportAll,
  runIdFor,
  runLabel,
  safeFileName,
  type AssociateInput,
  type Decision,
  type RouteInput,
} from '../../../packages/route-sheets/src/index.ts';
import { parseRouteSheetPdf } from '../../../packages/route-sheets/src/parser/pdfItems.node.ts';
import { ACTUAL, DAYS, EXPECTED, readLayoutPdf, toJson } from './inputs.mjs';

interface Inputs {
  routes: RouteInput[];
  associates: AssociateInput[];
  decisions: Record<string, Decision>;
  wavePads: Record<string, string>;
  boundaries: { mixed: string; alt: string };
}

async function runLayout(layout: string): Promise<void> {
  const inputs = JSON.parse(readFileSync(join(EXPECTED, layout, 'inputs.json'), 'utf8')) as Inputs;
  const out = join(ACTUAL, layout);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'eml'), { recursive: true });

  const pdf = new Uint8Array(readLayoutPdf(layout));
  const parsed = await parseRouteSheetPdf(pdf);
  const { sheets } = parsed;
  writeFileSync(join(out, 'sheets.json'), toJson(parsed));

  const first = distribute({ sheets, routes: inputs.routes, associates: inputs.associates });
  writeFileSync(join(out, 'distribution-undecided.json'), toJson(first));

  const dist = distribute({
    sheets,
    routes: inputs.routes,
    associates: inputs.associates,
    decisions: inputs.decisions,
    wavePads: inputs.wavePads,
  });
  writeFileSync(join(out, 'distribution.json'), toJson(dist));

  const firstSheet = sheets[0];
  if (!firstSheet) throw new Error('no sheets');
  const run = {
    id: runIdFor(firstSheet),
    station: firstSheet.station,
    date: firstSheet.date,
    cycle: firstSheet.cycle,
    dateLabel: firstSheet.dateLabel,
  };
  const label = runLabel(run);

  const emailFor = async (routeCode: string) => {
    const sheet = sheets.find((s) => s.routeCode === routeCode);
    if (!sheet) throw new Error('no sheet');
    const r = dist.routes.find((x) => x.routeCode === routeCode);
    const withPad = { ...sheet, pad: (sheet.waveTime && inputs.wavePads[sheet.waveTime]) || null };
    const recipients = r && r.state === 'ready' ? r.recipients : [];
    return buildRouteEmail(withPad, recipients, pdf, inputs.boundaries);
  };

  const emails: Record<string, unknown> = {};
  let drafts = 0;
  for (const r of dist.routes) {
    if (!r.hasSheet) continue;
    const e = await emailFor(r.routeCode);
    emails[r.routeCode] = {
      subject: e.subject,
      html: e.html,
      text: e.text,
      pdfName: e.pdfName,
      attachmentPages: e.pdf ? (await PDFDocument.load(e.pdf)).getPageCount() : 0,
    };
    if (r.state === 'ready') {
      const who = r.recipients.map((p) => p.name).join(' & ');
      writeFileSync(join(out, 'eml', `${safeFileName(`${r.routeCode} - ${who}`)}.eml`), e.eml);
      drafts++;
    }
  }
  writeFileSync(join(out, 'emails.json'), toJson(emails));

  const plan = await planExportAll(label, dist, emailFor);
  const sub = { drafts: plan.draftsFolder, pdfs: plan.pdfsFolder, root: '' };
  const files = plan.files
    .map((f) => (sub[f.folder] ? `${sub[f.folder]}/${f.name}` : f.name))
    .sort();
  writeFileSync(
    join(out, 'export-files.json'),
    toJson({ folder: plan.folder, drafts: plan.written, files }),
  );
  for (const f of plan.files) {
    if (f.folder !== 'root' || typeof f.content !== 'string') continue;
    if (f.name === 'Distribution summary.html') writeFileSync(join(out, 'summary.html'), f.content);
    if (f.name === 'Distribution summary.csv') writeFileSync(join(out, 'summary.csv'), f.content);
  }
  writeFileSync(join(out, 'run.json'), toJson({ ...run, label }));
  console.log(
    `${layout}: ${parsed.pageCount} pages, ${sheets.length} sheets, ${parsed.pageErrors.length} skipped pages, ` +
      `${dist.routes.length} routes (${dist.counts.ready} ready), ${drafts} drafts`,
  );
}

async function main(): Promise<void> {
  mkdirSync(ACTUAL, { recursive: true });
  for (const dayInfo of DAYS) {
    for (const layout of dayInfo.layouts) await runLayout(layout);
  }
}

main().catch((err: unknown) => {
  const code = err instanceof Error ? err.name : 'error';
  console.error(`The new side failed: ${code}`);
  process.exit(1);
});
