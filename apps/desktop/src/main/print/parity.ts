// Comparing two written sheets: the old app's and this one's, read back by `inspect.ts`.
//
// A sheet is written down compactly (so the old app's reference sheets can sit in the repo as text)
// and two of them are compared item by item, in the order they were drawn: same number of pages,
// same paper, the same text in the same font, size and colour at the same place, the same boxes.
// Places are allowed a small tolerance, in points (fpdf2 writes positions to a hundredth of a point
// and rounds the halves its own way).

import type { InkedPdf, InkedSheet } from './inspect';

/** [x, y (baseline, from the top), text, font, size, colour as 0-255 "r,g,b"] */
export type TextRow = [number, number, string, string, number, string];
/** [x, y (top), w, h, paint 'S' | 'f' | 'B', line colour, fill colour, line width] */
export type BoxRow = [number, number, number, number, string, string, string, number];

export interface PdfRecord {
  pages: Array<{ size: [number, number]; texts: TextRow[]; boxes: BoxRow[] }>;
}

/** [address, value, style index] */
export type CellRow = [string, string | number | null, number];

export interface SheetRecord {
  name: string;
  widths: number[];
  styles: string[];
  cells: CellRow[];
  frozen: string;
  printTitlesRow: string;
  pageSetup: string;
}

const round = (value: number, places = 3) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const rgb255 = (color: number[] | null) =>
  color ? color.map((part) => Math.round(part * 255)).join(',') : '';

export function encodePdf(pdf: InkedPdf): PdfRecord {
  return {
    pages: pdf.pages.map((page) => ({
      size: [round(page.width), round(page.height)],
      texts: page.texts.map((t): TextRow => [
        round(t.x),
        round(t.y),
        t.text,
        t.font,
        round(t.size),
        rgb255(t.color),
      ]),
      boxes: page.boxes.map((b): BoxRow => [
        round(b.x),
        round(b.y),
        round(b.w),
        round(b.h),
        b.paint,
        rgb255(b.stroke),
        rgb255(b.fill),
        round(b.lineWidth),
      ]),
    })),
  };
}

export function encodeWorkbook(sheets: InkedSheet[]): SheetRecord[] {
  return sheets.map((sheet) => {
    const styles: string[] = [];
    const styleIndex = new Map<string, number>();
    const cells = sheet.cells.map((cell): CellRow => {
      const style = [
        cell.bold ? 'bold' : 'plain',
        `size ${cell.size}`,
        cell.fontName,
        `ink ${cell.fontColor || '-'}`,
        `fill ${cell.fill || '-'}`,
        `border ${cell.border}`,
        `align ${cell.horizontal || '-'}/${cell.vertical || '-'}`,
      ].join('; ');
      let index = styleIndex.get(style);
      if (index === undefined) {
        index = styles.length;
        styles.push(style);
        styleIndex.set(style, index);
      }
      return [cell.address, cell.value, index];
    });
    const setup = sheet.pageSetup;
    return {
      name: sheet.name,
      widths: sheet.widths.map((width) => round(width, 6)),
      styles,
      cells,
      frozen: sheet.frozen
        ? `rows ${sheet.frozen.ySplit}, columns ${sheet.frozen.xSplit}, from ${sheet.frozen.topLeftCell}`
        : '',
      printTitlesRow: sheet.printTitlesRow,
      pageSetup: [
        setup.orientation,
        `paper ${setup.paperSize}`,
        setup.fitToPage ? `fit ${setup.fitToWidth} wide, ${setup.fitToHeight} tall` : 'no fit',
        `scale ${setup.fitToPage ? '-' : setup.scale}`,
        setup.horizontalCentered ? 'centred across' : 'not centred across',
        setup.verticalCentered ? 'centred down' : 'not centred down',
      ].join('; '),
    };
  });
}

export interface PdfDiff {
  problems: string[];
  /** The largest difference in place seen on any text or box, in points. */
  maxShift: number;
  texts: number;
  boxes: number;
}

/** Everything that differs between two PDFs, with places allowed `tolerance` points. */
export function diffPdf(expected: PdfRecord, actual: PdfRecord, tolerance = 0.02): PdfDiff {
  const problems: string[] = [];
  let maxShift = 0;
  let texts = 0;
  let boxes = 0;
  const near = (where: string, a: number, b: number, tol = tolerance) => {
    const shift = Math.abs(a - b);
    maxShift = Math.max(maxShift, shift);
    if (shift > tol) problems.push(`${where}: expected ${a}, got ${b}`);
  };
  const same = (where: string, a: unknown, b: unknown) => {
    if (a !== b) problems.push(`${where}: expected ${JSON.stringify(a)}, got ${JSON.stringify(b)}`);
  };
  if (expected.pages.length !== actual.pages.length) {
    problems.push(`pages: expected ${expected.pages.length}, got ${actual.pages.length}`);
  }
  const pageCount = Math.min(expected.pages.length, actual.pages.length);
  for (let p = 0; p < pageCount; p += 1) {
    const e = expected.pages[p] as PdfRecord['pages'][number];
    const a = actual.pages[p] as PdfRecord['pages'][number];
    const at = `page ${p + 1}`;
    near(`${at} width`, e.size[0], a.size[0]);
    near(`${at} height`, e.size[1], a.size[1]);
    same(`${at} text count`, e.texts.length, a.texts.length);
    same(`${at} box count`, e.boxes.length, a.boxes.length);
    e.texts.forEach((t, i) => {
      const u = a.texts[i];
      if (!u) return;
      texts += 1;
      const where = `${at} text ${i + 1}`;
      same(`${where} words`, t[2], u[2]);
      near(`${where} x`, t[0], u[0]);
      near(`${where} y`, t[1], u[1]);
      same(`${where} font`, t[3], u[3]);
      near(`${where} size`, t[4], u[4], 0.01);
      same(`${where} colour`, t[5], u[5]);
    });
    e.boxes.forEach((b, i) => {
      const c = a.boxes[i];
      if (!c) return;
      boxes += 1;
      const where = `${at} box ${i + 1}`;
      near(`${where} x`, b[0], c[0]);
      near(`${where} y`, b[1], c[1]);
      near(`${where} w`, b[2], c[2]);
      near(`${where} h`, b[3], c[3]);
      same(`${where} paint`, b[4], c[4]);
      same(`${where} line colour`, b[5], c[5]);
      same(`${where} fill colour`, b[6], c[6]);
      near(`${where} line width`, b[7], c[7], 0.001);
    });
  }
  return { problems, maxShift: round(maxShift, 4), texts, boxes };
}

/** The text of every page, top to bottom and left to right, as a person reads it. */
export function readingOrder(record: PdfRecord): string[][] {
  return record.pages.map((page) =>
    [...page.texts]
      .sort((a, b) => Math.round(a[1] * 10) - Math.round(b[1] * 10) || a[0] - b[0])
      .map((t) => t[2]),
  );
}

/** Everything that differs between two workbooks, cell by cell. */
export function diffWorkbook(expected: SheetRecord[], actual: SheetRecord[]): string[] {
  const problems: string[] = [];
  if (expected.length !== actual.length) {
    problems.push(`sheets: expected ${expected.length}, got ${actual.length}`);
  }
  expected.forEach((e, s) => {
    const a = actual[s];
    if (!a) return;
    const at = `sheet ${s + 1}`;
    if (e.name !== a.name) problems.push(`${at} name: expected ${e.name}, got ${a.name}`);
    if (e.widths.length !== a.widths.length) {
      problems.push(`${at} columns: expected ${e.widths.length}, got ${a.widths.length}`);
    }
    e.widths.forEach((width, i) => {
      const other = a.widths[i] ?? Number.NaN;
      if (!(Math.abs(width - other) <= 1e-6)) {
        problems.push(`${at} column ${i + 1} width: expected ${width}, got ${other}`);
      }
    });
    for (const key of ['frozen', 'printTitlesRow', 'pageSetup'] as const) {
      if (e[key] !== a[key]) problems.push(`${at} ${key}: expected ${e[key]}, got ${a[key]}`);
    }
    const theirs = new Map(a.cells.map((cell) => [cell[0], cell]));
    const ours = new Set(e.cells.map((cell) => cell[0]));
    for (const [address, value, style] of e.cells) {
      const other = theirs.get(address);
      if (!other) {
        problems.push(`${at} ${address}: missing`);
        continue;
      }
      if (value !== other[1]) {
        problems.push(
          `${at} ${address} value: expected ${JSON.stringify(value)}, got ${JSON.stringify(other[1])}`,
        );
      }
      if (e.styles[style] !== a.styles[other[2]]) {
        problems.push(
          `${at} ${address} look: expected ${e.styles[style]}, got ${a.styles[other[2]]}`,
        );
      }
    }
    for (const cell of a.cells) {
      if (!ours.has(cell[0])) problems.push(`${at} ${cell[0]}: not expected`);
    }
  });
  return problems;
}
