// The inputs both sides of the route sheet parity check read: the synthetic route sheet PDFs,
// the fixture Routes export and the fixture driver list, plus a fixed set of decisions and pads.
//
// Everything here is made up (packages/fixtures). The old app's own table readers (vendored under
// core/) turn the exports into the `routes` and `associates` lists, because those readers are not
// ported: in the app the lists come from the Route Data and Associates pages. The lists are saved
// in expected/<day>/inputs.json so the new side reads exactly the same objects.
//
// Two twists the fixture files cannot give on their own (every ID on the exports is ACTIVE and on
// the driver list): the driver of one single-driver route is marked INACTIVE, and the driver of
// another is taken off the list. Both are picked by position, so they are the same every run.

import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
export const REPO = join(here, '..', '..', '..');
export const FIXTURES = join(REPO, 'packages', 'fixtures');
export const EXPECTED = join(here, 'expected');
export const ACTUAL = join(here, 'actual');

/** The old app's core, as it was. */
export const old = {
  pdfParser: require('./core/pdfParser.js'),
  tableParsers: require('./core/tableParsers.js'),
  matcher: require('./core/matcher.js'),
  emailRender: require('./core/emailRender.js'),
  exporter: require('./core/exporter.js'),
  service: require('./core/service.js'),
};

/** The fixture days and, for each, the Routes export and the two PDF layouts. */
export const DAYS = [
  {
    day: '2026-09-01',
    routesFile: 'routes/Routes_XXX1_2026-09-01_12_20 (CDT).xlsx',
    layouts: ['2026-09-01', '2026-09-01-split-runs'],
  },
  {
    day: '2026-09-25',
    routesFile: 'routes/Routes_XXX1_2026-09-25_09_54 (CDT).xlsx',
    layouts: ['2026-09-25', '2026-09-25-split-runs'],
  },
];

/** Reads a workbook's first sheet as rows of text, the way the old app's readTable did. */
export async function readXlsxRows(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values.slice(1);
    rows.push(
      values.map((c) => {
        if (c == null) return '';
        if (c instanceof Date) return c.toLocaleDateString('en-US');
        if (typeof c === 'object' && 'richText' in c) return c.richText.map((r) => r.text).join('');
        if (typeof c === 'object' && 'result' in c) return String(c.result ?? '');
        return String(c);
      }),
    );
  });
  return rows;
}

/**
 * The routes and the driver list for one fixture day, with five twists the fixture files cannot
 * give on their own, each picked by position among the single-driver routes so they are the same
 * every run: one driver marked INACTIVE, one taken off the driver list, one route with no
 * Transporter ID, one route whose printed name is another person's (the name check), and one
 * driver with no email address.
 */
export async function buildLists(dayInfo) {
  const { tableParsers } = old;
  const routeRows = await readXlsxRows(join(FIXTURES, dayInfo.routesFile));
  const { routes } = tableParsers.parseRoutes(routeRows);
  const csv = readFileSync(join(FIXTURES, 'associates', 'AssociateData.csv'), 'utf8');
  const { associates: all } = tableParsers.parseAssociates(tableParsers.parseCsvRows(csv));

  const single = routes.filter((r) => r.drivers.length === 1 && r.drivers[0].transporterId);
  const idOf = (i) => single[i]?.drivers[0].transporterId ?? null;
  const twists = {
    inactiveId: idOf(4),
    missingId: idOf(5),
    noIdRoute: single[6]?.routeCode ?? null,
    wrongNameRoute: single[7]?.routeCode ?? null,
    noEmailId: idOf(8),
  };
  const otherName = all.find((a) => a.transporterId !== idOf(7))?.name ?? '';
  const twistedRoutes = routes.map((r) => {
    if (r.routeCode === twists.noIdRoute) {
      return { ...r, drivers: r.drivers.map((d) => ({ ...d, transporterId: '' })) };
    }
    if (r.routeCode === twists.wrongNameRoute) {
      return { ...r, drivers: r.drivers.map((d) => ({ ...d, driverName: otherName })) };
    }
    return r;
  });
  const associates = all
    .filter((a) => a.transporterId !== twists.missingId)
    .map((a) => (a.transporterId === twists.inactiveId ? { ...a, status: 'INACTIVE' } : a))
    .map((a) => (a.transporterId === twists.noEmailId ? { ...a, email: '' } : a));
  return { routes: twistedRoutes, associates, twists };
}

/**
 * The decisions for a day, worked out from what the old app said with no decisions: every shared
 * route with a suggestion is accepted except the first; the route that is in the PDF but not on
 * the Routes file is assigned by hand to the first driver on the list; the first ready route is
 * skipped. Dates are fixed so the files are the same every run.
 */
export function buildDecisions(distribution, associates) {
  const at = '2026-01-01T12:00:00.000Z';
  const decisions = {};
  const sorted = [...distribution.routes].sort((a, b) => a.routeCode.localeCompare(b.routeCode));
  let firstSuggested = true;
  for (const r of sorted) {
    if (r.state === 'needs-decision' && r.suggestion) {
      if (firstSuggested) {
        firstSuggested = false;
        continue;
      }
      decisions[r.routeCode] = { recipients: [r.suggestion], viaSuggestion: true, at };
    }
  }
  const notOnFile = sorted.find((r) => r.state === 'exception' && r.hasSheet && !r.onRoutesFile);
  if (notOnFile && associates[0]) {
    decisions[notOnFile.routeCode] = {
      recipients: [associates[0].transporterId],
      manual: true,
      at,
    };
  }
  const firstReady = sorted.find((r) => r.state === 'ready');
  if (firstReady) decisions[firstReady.routeCode] = { skipped: true, at };
  return decisions;
}

/** A pad for every wave time but the last, in clock order: "1", "2"... (the last has no pad). */
export function buildWavePads(sheets) {
  const { waveSortKey } = old.matcher;
  const waves = [...new Set(sheets.map((s) => s.waveTime).filter(Boolean))].sort((a, b) =>
    waveSortKey(a).localeCompare(waveSortKey(b)),
  );
  return Object.fromEntries(waves.slice(0, -1).map((w, i) => [w, String(i + 1)]));
}

/** The relative paths of every file under a folder, sorted, with forward slashes. */
export function listFiles(root, dir = root, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) listFiles(root, full, out);
    else out.push(relative(root, full).split(sep).join('/'));
  }
  return out.sort();
}

/** The pdf bytes of one layout. */
export function readLayoutPdf(layout) {
  return readFileSync(join(FIXTURES, 'route-sheets', `${layout}.pdf`));
}

/** JSON the way the parity files are written: two-space indent, one newline at the end. */
export function toJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
