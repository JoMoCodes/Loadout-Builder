// Runs the OLD Route Sheet Distributor core (vendored under core/) over the synthetic route sheet
// PDFs and writes what it says to expected/<layout>/. Those files are committed: they are made up,
// and they are the answer key the new package is checked against (diff.mjs).
//
//   node scripts/parity/rsd/dump.mjs
//
// Per layout (a fixture day in each of the two PDF layouts):
//   inputs.json                 routes, associates, decisions, wavePads (what both sides are given)
//   sheets.json                 the parsed PDF: sheets, pageErrors, pageCount
//   distribution-undecided.json distribute(...) before any decision, with no pads
//   distribution.json           distribute(...) with the decisions and pads
//   emails.json                 per route with a sheet: subject, html, text, pdfName, attachment page count
//   eml/<route>.eml             the email draft of every ready route, with fixed boundaries
//   export-files.json           what Export all writes: the folder name and every file's path
//   summary.html, summary.csv   the two summary files Export all writes
//   run.json                    the run's id and label
//
// It prints counts only.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import {
  DAYS,
  EXPECTED,
  buildDecisions,
  buildLists,
  buildWavePads,
  listFiles,
  old,
  readLayoutPdf,
  toJson,
} from './inputs.mjs';

/**
 * The old buildEml draws its boundaries from Date.now and Math.random; pin both while `fn` runs
 * (it may be async: the pins stay until it settles).
 */
async function withFixedBoundaries(fn) {
  const realNow = Date.now;
  const realRandom = Math.random;
  // mixed_<now base36>_<random base36 minus "0."> and alt_<random base36 minus "0.">
  Date.now = () => parseInt('parity', 36);
  Math.random = () => 0.5;
  try {
    return await fn();
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }
}

/** What the pinned boundaries come out as, so the new side can be told the same strings. */
export function pinnedBoundaries() {
  const realNow = Date.now;
  const realRandom = Math.random;
  Date.now = () => parseInt('parity', 36);
  Math.random = () => 0.5;
  try {
    return {
      mixed: `mixed_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`,
      alt: `alt_${Math.random().toString(36).slice(2)}`,
    };
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }
}

/** Enough of the old Store for Service.exportAll: the driver list and the run's PDF. */
function stubStore(associates, pdf) {
  return {
    getSettings: () => ({}),
    setSettings: () => ({}),
    getAssociates: () => ({ associates }),
    loadRun: () => null,
    hasRun: () => false,
    listRuns: () => [],
    saveRun: () => {},
    readRunPdf: () => pdf,
    runsDir: '',
    defaultRunsDir: '',
    outputDirProblem: null,
  };
}

async function dumpLayout(dayInfo, layout, lists) {
  const { pdfParser, matcher, exporter, service } = old;
  const out = join(EXPECTED, layout);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'eml'), { recursive: true });

  const pdf = readLayoutPdf(layout);
  const parsed = await pdfParser.parseRouteSheetPdf(pdf);
  const sheets = parsed.sheets;

  const first = matcher.distribute({ sheets, routes: lists.routes, associates: lists.associates });
  writeFileSync(join(out, 'distribution-undecided.json'), toJson(first));
  const decisions = buildDecisions(first, lists.associates);
  const wavePads = buildWavePads(sheets);
  writeFileSync(
    join(out, 'inputs.json'),
    toJson({
      routes: lists.routes,
      associates: lists.associates,
      decisions,
      wavePads,
      twists: lists.twists,
      boundaries: pinnedBoundaries(),
    }),
  );
  writeFileSync(join(out, 'sheets.json'), toJson(parsed));

  const dist = matcher.distribute({
    sheets,
    routes: lists.routes,
    associates: lists.associates,
    decisions,
    wavePads,
  });
  writeFileSync(join(out, 'distribution.json'), toJson(dist));

  const run = {
    id: service.runIdFor(sheets[0]),
    station: sheets[0].station,
    date: sheets[0].date,
    cycle: sheets[0].cycle,
    dateLabel: sheets[0].dateLabel,
  };

  // The emails, through the old buildRouteEmail (the email, its text, the subject and the draft).
  const emails = {};
  let drafts = 0;
  for (const r of dist.routes) {
    if (!r.hasSheet) continue;
    const sheet = sheets.find((s) => s.routeCode === r.routeCode);
    const withPad = { ...sheet, pad: wavePads[sheet.waveTime] || null };
    const recipients = r.state === 'ready' ? r.recipients : [];
    const e = await withFixedBoundaries(() => exporter.buildRouteEmail(withPad, recipients, pdf));
    emails[r.routeCode] = {
      subject: e.subject,
      html: e.html,
      text: e.text,
      pdfName: e.pdfName,
      attachmentPages: (await PDFDocument.load(e.pdf)).getPageCount(),
    };
    if (r.state === 'ready') {
      const who = recipients.map((p) => p.name).join(' & ');
      writeFileSync(
        join(out, 'eml', `${exporter.safeFileName(`${r.routeCode} - ${who}`)}.eml`),
        e.eml,
      );
      drafts++;
    }
  }
  writeFileSync(join(out, 'emails.json'), toJson(emails));

  // Export all, through the old Service, into a throwaway folder; keep the file list and the
  // two summary files.
  const sv = new service.Service(stubStore(lists.associates, pdf));
  sv.run = { ...run, sheets, routes: lists.routes, decisions, sent: {}, wavePads, pdf: {} };
  const tmp = mkdtempSync(join(tmpdir(), 'rsd-parity-'));
  try {
    const exported = await withFixedBoundaries(() => sv.exportAll(tmp));
    const folder = exported.folder.slice(tmp.length + 1);
    writeFileSync(
      join(out, 'export-files.json'),
      toJson({ folder, drafts: exported.drafts, files: listFiles(exported.folder) }),
    );
    writeFileSync(
      join(out, 'summary.html'),
      readFileSync(join(exported.folder, 'Distribution summary.html'), 'utf8'),
    );
    writeFileSync(
      join(out, 'summary.csv'),
      readFileSync(join(exported.folder, 'Distribution summary.csv'), 'utf8'),
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  writeFileSync(join(out, 'run.json'), toJson({ ...run, label: service.runLabel(run) }));

  console.log(
    `${layout}: ${parsed.pageCount} pages, ${sheets.length} sheets, ${parsed.pageErrors.length} skipped pages, ` +
      `${dist.routes.length} routes (${dist.counts.ready} ready), ${drafts} drafts`,
  );
}

async function main() {
  mkdirSync(EXPECTED, { recursive: true });
  for (const dayInfo of DAYS) {
    const lists = await buildLists(dayInfo);
    for (const layout of dayInfo.layouts) await dumpLayout(dayInfo, layout, lists);
  }
}

main().catch((err) => {
  console.error(`The dump failed: ${err?.code || err?.name || 'error'}`);
  process.exit(1);
});
