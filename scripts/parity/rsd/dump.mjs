// Runs the OLD Route Sheet Distributor core (vendored under core/) over the synthetic route sheet
// PDFs and writes what it says to expected/<layout>/. Those files are committed: they are made up,
// and they are the answer key the new package is checked against (diff.mjs).
//
//   node scripts/parity/rsd/dump.mjs
//
// Per layout (a fixture day in each of the two PDF layouts):
//   inputs.json        routes, associates, decisions, wavePads (what both sides are given)
//   sheets.json        the parsed PDF: sheets, pageErrors, pageCount
//   distribution.json  distribute(...) with those decisions and pads
//   emails.json        per route with a sheet: subject, html, text, pdfName, attachment page count
//   eml/<route>.eml    the email draft of every ready route, with fixed boundaries
//   summary.html       the Export all summary page
//   summary.csv        the Export all summary table
//
// It prints counts only.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import {
  DAYS,
  EXPECTED,
  buildDecisions,
  buildLists,
  buildWavePads,
  old,
  readLayoutPdf,
  toJson,
} from './inputs.mjs';

/** The old buildEml draws its boundaries from Date.now and Math.random; pin both while it runs. */
function withFixedBoundaries(fn) {
  const realNow = Date.now;
  const realRandom = Math.random;
  // mixed_<now base36>_<random base36 minus "0."> and alt_<random base36 minus "0.">
  Date.now = () => parseInt('parity', 36);
  Math.random = () => 0.5;
  try {
    return fn();
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }
}

/** What the pinned boundaries come out as, so the new side can be told the same strings. */
export function pinnedBoundaries() {
  return withFixedBoundaries(() => ({
    mixed: `mixed_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`,
    alt: `alt_${Math.random().toString(36).slice(2)}`,
  }));
}

async function dumpLayout(dayInfo, layout, lists) {
  const { pdfParser, matcher, emailRender, exporter, service } = old;
  const out = join(EXPECTED, layout);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'eml'), { recursive: true });

  const pdf = readLayoutPdf(layout);
  const parsed = await pdfParser.parseRouteSheetPdf(pdf);
  const sheets = parsed.sheets;

  const first = matcher.distribute({ sheets, routes: lists.routes, associates: lists.associates });
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
  const emails = {};
  let drafts = 0;
  for (const r of dist.routes) {
    if (!r.hasSheet) continue;
    const sheet = sheets.find((s) => s.routeCode === r.routeCode);
    const withPad = { ...sheet, pad: wavePads[sheet.waveTime] || null };
    const recipients = r.state === 'ready' ? r.recipients : [];
    const primary = recipients[0];
    const html = emailRender.renderEmailHtml(withPad, primary);
    const text = emailRender.renderEmailText(withPad, primary);
    const subject = emailRender.subjectFor(withPad);
    const pages = await exporter.extractPages(pdf, sheet.pageNumbers || [sheet.pageNumber]);
    const pdfName = exporter.safeFileName(
      `${sheet.routeCode} ${sheet.staging || ''} route sheet.pdf`,
    );
    emails[r.routeCode] = {
      subject,
      html,
      text,
      pdfName,
      attachmentPages: (await PDFDocument.load(pages)).getPageCount(),
    };
    if (r.state === 'ready') {
      const eml = withFixedBoundaries(() =>
        exporter.buildEml({
          to: recipients.map((p) => p.email).filter(Boolean),
          subject,
          html,
          text,
          attachments: [{ filename: pdfName, content: pages, contentType: 'application/pdf' }],
        }),
      );
      const who = recipients.map((p) => p.name).join(' & ');
      writeFileSync(
        join(out, 'eml', `${exporter.safeFileName(`${r.routeCode} - ${who}`)}.eml`),
        eml,
      );
      drafts++;
    }
  }
  writeFileSync(join(out, 'emails.json'), toJson(emails));
  writeFileSync(join(out, 'summary.html'), service.renderSummaryHtml(run, dist));
  // renderSummaryCsv is not exported by the old service; it is reached through exportAll, which
  // writes to disk. The same lines are rebuilt here from the old module's own text.
  writeFileSync(join(out, 'summary.csv'), oldSummaryCsv(dist));
  writeFileSync(join(out, 'run.json'), toJson({ ...run, label: service.runLabel(run) }));

  console.log(
    `${layout}: ${parsed.pageCount} pages, ${sheets.length} sheets, ${parsed.pageErrors.length} skipped pages, ` +
      `${dist.routes.length} routes (${dist.counts.ready} ready), ${drafts} drafts`,
  );
}

/** The old renderSummaryCsv, line for line (service.js does not export it). */
function oldSummaryCsv(dist) {
  const STATE_LABEL = old.service.STATE_LABEL;
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    [
      'Route',
      'Staging',
      'Wave',
      'Pad',
      'Total Packages',
      'Listed Transporter IDs',
      'Recipient',
      'Recipient Transporter ID',
      'Recipient Email',
      'Status',
      'Reason',
    ]
      .map(q)
      .join(','),
  ];
  for (const r of dist.routes) {
    lines.push(
      [
        r.routeCode,
        r.sheet?.staging,
        r.sheet?.waveTime,
        r.sheet?.pad,
        r.sheet?.totalPackages,
        r.listed.map((c) => c.transporterId).join(' | '),
        r.recipients.map((p) => p.name).join(' | '),
        r.recipients.map((p) => p.transporterId).join(' | '),
        r.recipients.map((p) => p.email).join(' | '),
        STATE_LABEL[r.state],
        r.headline,
      ]
        .map(q)
        .join(','),
    );
  }
  return lines.join('\r\n');
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
