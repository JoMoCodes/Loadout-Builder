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
  buildEml,
  distribute,
  extractPages,
  renderEmailHtml,
  renderEmailText,
  renderSummaryCsv,
  renderSummaryHtml,
  runIdFor,
  runLabel,
  safeFileName,
  subjectFor,
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

  const dist = distribute({
    sheets,
    routes: inputs.routes,
    associates: inputs.associates,
    decisions: inputs.decisions,
    wavePads: inputs.wavePads,
  });
  writeFileSync(join(out, 'distribution.json'), toJson(dist));

  const first = sheets[0];
  if (!first) throw new Error('no sheets');
  const run = {
    id: runIdFor(first),
    station: first.station,
    date: first.date,
    cycle: first.cycle,
    dateLabel: first.dateLabel,
  };
  const emails: Record<string, unknown> = {};
  let drafts = 0;
  for (const r of dist.routes) {
    if (!r.hasSheet) continue;
    const sheet = sheets.find((s) => s.routeCode === r.routeCode);
    if (!sheet) continue;
    const withPad = { ...sheet, pad: (sheet.waveTime && inputs.wavePads[sheet.waveTime]) || null };
    const recipients = r.state === 'ready' ? r.recipients : [];
    const primary = recipients[0];
    const html = renderEmailHtml(withPad, primary);
    const text = renderEmailText(withPad, primary);
    const subject = subjectFor(withPad);
    const pages = await extractPages(pdf, sheet.pageNumbers);
    const pdfName = safeFileName(`${sheet.routeCode} ${sheet.staging || ''} route sheet.pdf`);
    emails[r.routeCode] = {
      subject,
      html,
      text,
      pdfName,
      attachmentPages: (await PDFDocument.load(pages)).getPageCount(),
    };
    if (r.state === 'ready') {
      const eml = buildEml(
        {
          to: recipients.map((p) => p.email).filter(Boolean),
          subject,
          html,
          text,
          attachments: [{ filename: pdfName, content: pages, contentType: 'application/pdf' }],
        },
        inputs.boundaries,
      );
      const who = recipients.map((p) => p.name).join(' & ');
      writeFileSync(join(out, 'eml', `${safeFileName(`${r.routeCode} - ${who}`)}.eml`), eml);
      drafts++;
    }
  }
  writeFileSync(join(out, 'emails.json'), toJson(emails));
  writeFileSync(join(out, 'summary.html'), renderSummaryHtml(runLabel(run), dist));
  writeFileSync(join(out, 'summary.csv'), renderSummaryCsv(dist));
  writeFileSync(join(out, 'run.json'), toJson({ ...run, label: runLabel(run) }));
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
