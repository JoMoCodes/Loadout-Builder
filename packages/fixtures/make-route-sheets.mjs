// Draws made-up route sheet PDFs from the made-up Routes exports, for the tests and for demo mode.
// Nothing real is used: the page layout is the one the old Route Sheet Distributor's own test
// builder draws, and the route codes, service types and wave times come from the fixture
// Routes exports in ./routes.
//
//   node packages/fixtures/make-route-sheets.mjs     (from the repo root)
//
// It is also a small library: buildRouteSheetPdf draws a list of sheets, sheetsForDay makes the
// list for one fixture day, readRoutesRows reads a fixture Routes export.

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The two fixture days that have a Routes export. */
export const ROUTE_SHEET_DAYS = ['2026-09-01', '2026-09-25'];

const STATION = 'XXX1';
const DSP = 'XXXX';
const DEFAULT_DATE_LINE = 'THU, SEP 24, 2026';
// A fixed date, so the same input gives the same bytes on every run.
const FIXED_DATE = new Date('2026-09-01T00:00:00Z');

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const COLOURS = ['Green', 'Yellow', 'Navy', 'Orange', 'Black', 'Blue'];

/**
 * Draws a route sheet PDF, one page per sheet (two for a "continued" sheet), US Letter, laid out
 * like the real ones. `options.splitRuns` draws the layout from 2026-10-10 instead: the heading's
 * count and word, and the service line, are separate text runs, and the "fl" of "overflow" is lost.
 */
export async function buildRouteSheetPdf(sheets, options = {}) {
  const splitRuns = options.splitRuns === true;
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  doc.setProducer('route-sheet fixtures');
  doc.setCreator('route-sheet fixtures');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const s of sheets) {
    if (s.blank) {
      doc.addPage([612, 792]); // a blank trailing page, as some exports have
      continue;
    }
    let page = doc.addPage([612, 792]);
    let shift = 0; // a "continued" sheet draws its tables on a second page, starting near the top
    const top = (y) => 792 - (y - shift); // author in top-down coordinates like the real sheet
    const text = (str, x, y, size = 10.5, f = font) =>
      str && page.drawText(str, { x, y: top(y), size, font: f });
    const right = (str, rx, y, size = 10.5, f = font) =>
      str &&
      page.drawText(str, { x: rx - f.widthOfTextAtSize(str, size), y: top(y), size, font: f });

    if (s.notRouteSheet) {
      // An ordinary page of text: no route code, nothing big.
      text('Route sheets', 36, 80, 12, bold);
      text('This page is a note about the day. It is not a route sheet.', 36, 110, 12);
      continue;
    }

    const station = s.station ?? STATION;
    const dsp = s.dsp ?? DSP;
    const dateLine = s.dateLine ?? DEFAULT_DATE_LINE;
    text(s.staging, 36, 100, 57);
    text(s.routeCode, 36, 160, 36);
    if (splitRuns) {
      // The service line is two runs: "XXXX ·" and then the service type.
      right(s.service, 576, 140);
      const gap = font.widthOfTextAtSize(' ', 10.5);
      text(
        `${dsp} ·`,
        576 -
          font.widthOfTextAtSize(s.service, 10.5) -
          gap -
          font.widthOfTextAtSize(`${dsp} ·`, 10.5),
        140,
      );
    } else {
      right(`${dsp} · ${s.service}`, 576, 140);
    }
    right(`${station} · ${dateLine} · CYCLE_1 · ${s.wave}`, 576, 157);
    if (s.continued) {
      page = doc.addPage([612, 792]);
      shift = 220;
    }
    const ovTotal = s.overflow.reduce((a, r) => a + Number(r[2]), 0);
    if (splitRuns) {
      // The count and the word are separate runs, about 21.5 units apart; "fl" is lost.
      text(String(s.bags.length), 36, 235, 15, bold);
      text('bags', 57.5, 235, 15, bold);
      text(String(ovTotal), 322, 235, 15, bold);
      text('overow', 343.5, 235, 15, bold);
    } else {
      text(`${s.bags.length} bags`, 36, 235, 15, bold);
      text(`${ovTotal} overflow`, 322, 235, 15, bold);
    }
    text('Sort Zone', 67, 262);
    right('Bag', 230, 262);
    right('Pkgs', 266, 262);
    text('Sort Zone', 358, 262);
    right('Pkgs', 552, 262);
    s.bags.forEach((b, i) => {
      const y = 280 + i * 16.5;
      text(b[0], 36, y);
      text(b[1], 67, y);
      right(b[2], 230, y, 10.5, bold);
      right(b[3], 266, y);
    });
    s.overflow.forEach((o, i) => {
      const y = 280 + i * 16.5;
      text(o[0], 322, y);
      text(o[1], 358, y, 10.5, bold);
      right(o[2], 552, y);
    });
    const ty = 290 + Math.max(s.bags.length, s.overflow.length) * 16.5 + 20;
    text('Total Packages', 322, ty, 10.5, bold);
    right(String(s.total), 552, ty, 10.5, bold);
    text('Commercial Packages', 322, ty + 17, 10.5, bold);
    right(String(s.commercial), 552, ty + 17, 10.5, bold);
  }
  return doc.save();
}

/** "10:20am" becomes "10:20 AM"; "2:30pm" becomes "02:30 PM". Anything else is returned as it is. */
export function waveFromDeparture(value) {
  const m = String(value ?? '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*([ap])m$/i);
  if (!m) return String(value ?? '').trim();
  return `${m[1].padStart(2, '0')}:${m[2]} ${m[3].toUpperCase()}M`;
}

/** "2026-09-01" becomes "TUE, SEP 1, 2026". */
export function dateLineFor(day) {
  const [y, mo, d] = day.split('-').map(Number);
  const when = new Date(Date.UTC(y, mo - 1, d));
  return `${WEEKDAYS[when.getUTCDay()]}, ${MONTHS[mo - 1]} ${d}, ${y}`;
}

// A tiny generator, so the same position always gives the same numbers (no randomness).
function makeRandom(seed) {
  let state = (seed * 48271 + 12345) >>> 0;
  return (n) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) % n;
  };
}

function zone(rnd) {
  const letter = String.fromCharCode(65 + rnd(8));
  return `${letter}-${1 + rnd(14)}.${1 + rnd(9)}${String.fromCharCode(65 + rnd(8))}`;
}

function bagLabel(rnd) {
  return `${COLOURS[rnd(COLOURS.length)]} ${String(rnd(10000)).padStart(4, '0')}`;
}

function ordinarySheet(row, index, day, bagRows) {
  const rnd = makeRandom(index + 1);
  const nBags = bagRows ?? 3 + rnd(4);
  const nOverflow = rnd(4);
  const bags = [];
  for (let i = 0; i < nBags; i++) {
    bags.push([String(i + 1), zone(rnd), bagLabel(rnd), String(3 + rnd(23))]);
  }
  const overflow = [];
  for (let i = 0; i < nOverflow; i++) {
    overflow.push([String(i + 1), zone(rnd).replace(/\d+\.\d+/, '99.') + 'W', String(1 + rnd(3))]);
  }
  const total =
    bags.reduce((a, b) => a + Number(b[3]), 0) + overflow.reduce((a, o) => a + Number(o[2]), 0);
  return {
    routeCode: String(row['Route code']).trim(),
    staging: `STG.${String.fromCharCode(65 + (Math.floor(index / 6) % 8))}${(index % 6) + 1}.1`,
    service: String(row['Delivery Service Type'] ?? 'Standard Parcel').trim(),
    wave: waveFromDeparture(row['Planned Departure Time']),
    bags,
    overflow,
    total,
    commercial: rnd(6),
    dateLine: dateLineFor(day),
  };
}

/**
 * The sheets for one fixture day, from that day's Routes export rows, with no randomness.
 * One page per route in file order, except:
 *  - the last route in the file is left out (on the Routes file but not in the PDF);
 *  - CX900 is added (in the PDF but not on the Routes file);
 *  - the 2nd route is long (30 bag rows, spills onto a second page);
 *  - the 3rd route's total is 50 too high (the numbers do not add up);
 *  - the 1st route has a blank Sort Zone (row 2) and a blank Bag label (row 3);
 *  - a page that is not a route sheet comes first (a cover note), and a blank page comes last.
 *    The cover note sits first because a page with no route code that follows a sheet would be
 *    read as that sheet's second page.
 */
export function sheetsForDay(routesRows, day) {
  const seen = new Set();
  const rows = [];
  for (const row of routesRows) {
    const code = String(row['Route code'] ?? '').trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    rows.push(row);
  }
  const sheets = rows.slice(0, -1).map((row, i) => {
    const sheet = ordinarySheet(row, i, day, i === 1 ? 30 : undefined);
    if (i === 1) sheet.continued = true;
    if (i === 2) sheet.total += 50;
    if (i === 0) {
      if (sheet.bags[1]) sheet.bags[1][1] = '';
      if (sheet.bags[2]) sheet.bags[2][2] = '';
    }
    return sheet;
  });
  const first = rows[0];
  const extra = ordinarySheet({ ...first, 'Route code': 'CX900' }, rows.length, day);
  sheets.push(extra);
  return [{ notRouteSheet: true }, ...sheets, { blank: true }];
}

/** Reads a fixture Routes export (header in row 1) into one object per route, keyed by header. */
export async function readRoutesRows(day) {
  const { default: ExcelJS } = await import('exceljs');
  const dir = join(HERE, 'routes');
  const file = (await readdir(dir)).find(
    (f) => f.startsWith(`Routes_${STATION}_${day}_`) && f.endsWith('.xlsx'),
  );
  if (!file) throw new Error(`No fixture Routes export for ${day}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(join(dir, file));
  const ws = wb.worksheets[0];
  const names = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    names[col] = String(cell.value ?? '').trim();
  });
  const rows = [];
  ws.eachRow((r, i) => {
    if (i === 1) return;
    const obj = {};
    r.eachCell({ includeEmpty: false }, (cell, col) => {
      const name = names[col];
      if (!name) return;
      const v = cell.value;
      obj[name] = v !== null && typeof v === 'object' && 'text' in v ? v.text : v;
    });
    if (obj['Route code']) rows.push(obj);
  });
  return rows;
}

async function addToManifest(paths) {
  const file = join(HERE, 'manifest.json');
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  const have = new Set(manifest.files.map((f) => f.path));
  let added = 0;
  for (const path of paths) {
    if (have.has(path)) continue;
    manifest.files.push({
      path,
      kind: 'route-sheets',
      how: 'drawn from scratch from the fixture Routes export; no real PDF was used',
    });
    added++;
  }
  if (added) await writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
  return added;
}

/** Writes the four fixture PDFs and lists them in the manifest. Prints counts only. */
export async function writeRouteSheetFixtures() {
  const outDir = join(HERE, 'route-sheets');
  await mkdir(outDir, { recursive: true });
  const paths = [];
  for (const day of ROUTE_SHEET_DAYS) {
    const sheets = sheetsForDay(await readRoutesRows(day), day);
    for (const splitRuns of [false, true]) {
      const name = `${day}${splitRuns ? '-split-runs' : ''}.pdf`;
      const bytes = await buildRouteSheetPdf(sheets, { splitRuns });
      await writeFile(join(outDir, name), bytes);
      paths.push(`route-sheets/${name}`);
      const pages = sheets.length + sheets.filter((s) => s.continued).length;
      console.log(`${name}: ${pages} pages, ${sheets.length} sheets drawn`);
    }
  }
  const added = await addToManifest(paths);
  console.log(`manifest: ${added} entries added`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeRouteSheetFixtures();
}
