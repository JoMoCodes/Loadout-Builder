// Reads a written sheet back into plain data, so two writers can be compared: the old app's
// (fpdf2, openpyxl) and this one's (pdf-lib, exceljs). Used by the print parity test and the
// scripts in scripts/parity/print/. Not used by the app itself.
//
// For a PDF: every page's size, and every piece of text and every box on it, with where it is, in
// what font, size and colour. It understands the operators both writers use (text placed with
// Td or Tm, shown with Tj or TJ; boxes as `re` then S, f or B; colours as rg and RG; q and Q).
// For a workbook: every cell's value and look, the column widths, frozen rows and page setup.

import ExcelJS from 'exceljs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { printing } from '@loadout/core';

export interface InkedText {
  x: number;
  /** Baseline, measured down from the top of the page. */
  y: number;
  text: string;
  font: string;
  size: number;
  color: number[];
}

export interface InkedBox {
  x: number;
  /** Top edge, measured down from the top of the page. */
  y: number;
  w: number;
  h: number;
  /** 'S' a line round it, 'f' filled, 'B' both. */
  paint: 'S' | 'f' | 'B';
  stroke: number[] | null;
  fill: number[] | null;
  lineWidth: number;
}

export interface InkedPage {
  width: number;
  height: number;
  texts: InkedText[];
  boxes: InkedBox[];
}

export interface InkedPdf {
  pages: InkedPage[];
}

type Token =
  | { t: 'num'; v: number }
  | { t: 'name'; v: string }
  | { t: 'str'; v: number[] }
  | { t: 'arr'; v: Token[] }
  | { t: 'op'; v: string };

const WHITE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set('()<>[]{}/%'.split('').map((c) => c.charCodeAt(0)));

/** Splits a content stream into operands and operators. */
function tokenize(bytes: Uint8Array): Token[] {
  let i = 0;
  const n = bytes.length;
  const read = (): Token | null | 'close' => {
    while (i < n) {
      const c = bytes[i] as number;
      if (WHITE.has(c)) {
        i += 1;
        continue;
      }
      if (c === 0x25) {
        while (i < n && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i += 1;
        continue;
      }
      break;
    }
    if (i >= n) return null;
    const c = bytes[i] as number;
    if (c === 0x5d) {
      i += 1;
      return 'close';
    }
    if (c === 0x5b) {
      i += 1;
      const items: Token[] = [];
      for (;;) {
        const next = read();
        if (next === null || next === 'close') break;
        items.push(next);
      }
      return { t: 'arr', v: items };
    }
    if (c === 0x2f) {
      i += 1;
      let name = '';
      while (i < n && !WHITE.has(bytes[i] as number) && !DELIM.has(bytes[i] as number)) {
        name += String.fromCharCode(bytes[i] as number);
        i += 1;
      }
      return { t: 'name', v: name };
    }
    if (c === 0x28) {
      i += 1;
      const out: number[] = [];
      let depth = 1;
      while (i < n) {
        const b = bytes[i] as number;
        i += 1;
        if (b === 0x5c) {
          const e = bytes[i] as number;
          i += 1;
          const simple: Record<number, number> = {
            0x6e: 0x0a,
            0x72: 0x0d,
            0x74: 0x09,
            0x62: 0x08,
            0x66: 0x0c,
            0x28: 0x28,
            0x29: 0x29,
            0x5c: 0x5c,
          };
          if (e in simple) out.push(simple[e] as number);
          else if (e >= 0x30 && e <= 0x37) {
            let octal = String.fromCharCode(e);
            while (
              octal.length < 3 &&
              (bytes[i] as number) >= 0x30 &&
              (bytes[i] as number) <= 0x37
            ) {
              octal += String.fromCharCode(bytes[i] as number);
              i += 1;
            }
            out.push(Number.parseInt(octal, 8) & 0xff);
          } else if (e === 0x0d || e === 0x0a) {
            if (e === 0x0d && bytes[i] === 0x0a) i += 1;
          } else out.push(e);
          continue;
        }
        if (b === 0x28) depth += 1;
        if (b === 0x29) {
          depth -= 1;
          if (depth === 0) break;
        }
        out.push(b);
      }
      return { t: 'str', v: out };
    }
    if (c === 0x3c && bytes[i + 1] !== 0x3c) {
      i += 1;
      let hex = '';
      while (i < n && bytes[i] !== 0x3e) {
        const ch = String.fromCharCode(bytes[i] as number);
        if (/[0-9a-fA-F]/.test(ch)) hex += ch;
        i += 1;
      }
      i += 1;
      if (hex.length % 2) hex += '0';
      const out: number[] = [];
      for (let k = 0; k < hex.length; k += 2) out.push(Number.parseInt(hex.slice(k, k + 2), 16));
      return { t: 'str', v: out };
    }
    let word = '';
    while (i < n && !WHITE.has(bytes[i] as number) && !DELIM.has(bytes[i] as number)) {
      word += String.fromCharCode(bytes[i] as number);
      i += 1;
    }
    if (word === '') {
      // "<<" or ">>" or a stray delimiter: skip it.
      i += 1;
      return read();
    }
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) return { t: 'num', v: Number(word) };
    return { t: 'op', v: word };
  };
  const out: Token[] = [];
  for (;;) {
    const token = read();
    if (token === null) break;
    if (token === 'close') continue;
    out.push(token);
  }
  return out;
}

// WinAnsi bytes 0x80 to 0x9f; everything else in a standard font's string is Latin-1.
const WIN_ANSI: Record<number, string> = {
  0x80: '€',
  0x82: '‚',
  0x83: 'ƒ',
  0x84: '„',
  0x85: '…',
  0x86: '†',
  0x87: '‡',
  0x88: 'ˆ',
  0x89: '‰',
  0x8a: 'Š',
  0x8b: '‹',
  0x8c: 'Œ',
  0x8e: 'Ž',
  0x91: '‘',
  0x92: '’',
  0x93: '“',
  0x94: '”',
  0x95: '•',
  0x96: '–',
  0x97: '—',
  0x98: '˜',
  0x99: '™',
  0x9a: 'š',
  0x9b: '›',
  0x9c: 'œ',
  0x9e: 'ž',
  0x9f: 'Ÿ',
};

function decodeText(bytes: number[]): string {
  return bytes.map((b) => WIN_ANSI[b] ?? String.fromCharCode(b)).join('');
}

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

interface GState {
  ctm: Matrix;
  fill: number[];
  stroke: number[];
  lineWidth: number;
}

function streamBytes(doc: PDFDocument, contents: unknown): Uint8Array[] {
  const out: Uint8Array[] = [];
  const add = (item: unknown) => {
    const resolved = item instanceof Object ? doc.context.lookup(item as never) : item;
    if (resolved instanceof PDFRawStream) out.push(decodePDFRawStream(resolved).decode());
    else if (resolved instanceof PDFArray) for (const part of resolved.asArray()) add(part);
  };
  add(contents);
  return out;
}

function fontNames(doc: PDFDocument, resources: PDFDict | undefined): Map<string, string> {
  const names = new Map<string, string>();
  const fonts = resources?.lookupMaybe(PDFName.of('Font'), PDFDict);
  if (!fonts) return names;
  for (const [key, ref] of fonts.entries()) {
    const dict = doc.context.lookup(ref, PDFDict);
    const base = dict.lookupMaybe(PDFName.of('BaseFont'), PDFName);
    names.set(key.decodeText(), base ? base.decodeText() : key.decodeText());
  }
  return names;
}

/** Every page of a PDF, as text and boxes. */
export async function inkPdf(bytes: Uint8Array): Promise<InkedPdf> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const pages: InkedPage[] = [];
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const fonts = fontNames(doc, page.node.Resources());
    const texts: InkedText[] = [];
    const boxes: InkedBox[] = [];
    let gs: GState = { ctm: IDENTITY, fill: [0, 0, 0], stroke: [0, 0, 0], lineWidth: 1 };
    const stack: GState[] = [];
    let tm: Matrix = IDENTITY;
    let tlm: Matrix = IDENTITY;
    let font = '';
    let size = 0;
    let leading = 0;
    let pendingRects: Array<[number, number, number, number]> = [];
    const operands: Token[] = [];
    const num = (k: number) => {
      const token = operands[operands.length - k];
      return token && token.t === 'num' ? token.v : 0;
    };
    const show = (strings: number[][]) => {
      const text = strings.map(decodeText).join('');
      const [x, y] = apply(multiply(tm, gs.ctm), 0, 0);
      const scale = Math.hypot(tm[0], tm[1]) * Math.hypot(gs.ctm[0], gs.ctm[1]);
      texts.push({
        x,
        y: height - y,
        text,
        font,
        size: size * scale,
        color: [...gs.fill],
      });
      const advance = printing.measure(text, size, /bold/i.test(font));
      tm = multiply([1, 0, 0, 1, advance, 0], tm);
    };
    const paint = (kind: 'S' | 'f' | 'B') => {
      for (const [x, y, w, h] of pendingRects) {
        const [x1, y1] = apply(gs.ctm, x, y);
        const [x2, y2] = apply(gs.ctm, x + w, y + h);
        boxes.push({
          x: Math.min(x1, x2),
          y: height - Math.max(y1, y2),
          w: Math.abs(x2 - x1),
          h: Math.abs(y2 - y1),
          paint: kind,
          stroke: kind === 'f' ? null : [...gs.stroke],
          fill: kind === 'S' ? null : [...gs.fill],
          lineWidth: gs.lineWidth,
        });
      }
      pendingRects = [];
    };
    for (const chunk of streamBytes(doc, page.node.Contents())) {
      for (const token of tokenize(chunk)) {
        if (token.t !== 'op') {
          operands.push(token);
          continue;
        }
        switch (token.v) {
          case 'q':
            stack.push({ ...gs, fill: [...gs.fill], stroke: [...gs.stroke] });
            break;
          case 'Q':
            gs = stack.pop() ?? gs;
            break;
          case 'cm':
            gs.ctm = multiply([num(6), num(5), num(4), num(3), num(2), num(1)], gs.ctm);
            break;
          case 'w':
            gs.lineWidth = num(1);
            break;
          case 'rg':
            gs.fill = [num(3), num(2), num(1)];
            break;
          case 'RG':
            gs.stroke = [num(3), num(2), num(1)];
            break;
          case 'g':
            gs.fill = [num(1), num(1), num(1)];
            break;
          case 'G':
            gs.stroke = [num(1), num(1), num(1)];
            break;
          case 're':
            pendingRects.push([num(4), num(3), num(2), num(1)]);
            break;
          case 'S':
          case 's':
            paint('S');
            break;
          case 'f':
          case 'F':
          case 'f*':
            paint('f');
            break;
          case 'B':
          case 'B*':
          case 'b':
          case 'b*':
            paint('B');
            break;
          case 'n':
            pendingRects = [];
            break;
          case 'BT':
            tm = IDENTITY;
            tlm = IDENTITY;
            break;
          case 'Tf': {
            const name = operands[operands.length - 2];
            font = name && name.t === 'name' ? (fonts.get(name.v) ?? name.v) : '';
            size = num(1);
            break;
          }
          case 'TL':
            leading = num(1);
            break;
          case 'Td':
          case 'TD':
            if (token.v === 'TD') leading = -num(1);
            tlm = multiply([1, 0, 0, 1, num(2), num(1)], tlm);
            tm = tlm;
            break;
          case 'Tm':
            tlm = [num(6), num(5), num(4), num(3), num(2), num(1)];
            tm = tlm;
            break;
          case 'T*':
            tlm = multiply([1, 0, 0, 1, 0, -leading], tlm);
            tm = tlm;
            break;
          case 'Tj': {
            const s = operands[operands.length - 1];
            if (s && s.t === 'str') show([s.v]);
            break;
          }
          case "'": {
            tlm = multiply([1, 0, 0, 1, 0, -leading], tlm);
            tm = tlm;
            const s = operands[operands.length - 1];
            if (s && s.t === 'str') show([s.v]);
            break;
          }
          case 'TJ': {
            const arr = operands[operands.length - 1];
            if (arr && arr.t === 'arr') {
              show(arr.v.flatMap((part) => (part.t === 'str' ? [part.v] : [])));
            }
            break;
          }
          default:
            break;
        }
        operands.length = 0;
      }
    }
    pages.push({ width, height, texts, boxes });
  }
  return { pages };
}

// ------------------------------------------------------------------------- workbooks

export interface InkedCell {
  address: string;
  value: string | number | null;
  bold: boolean;
  size: number;
  fontName: string;
  fontColor: string;
  fill: string;
  border: string;
  horizontal: string;
  vertical: string;
}

export interface InkedSheet {
  name: string;
  widths: number[];
  cells: InkedCell[];
  frozen: { ySplit: number; xSplit: number; topLeftCell: string } | null;
  printTitlesRow: string;
  pageSetup: {
    orientation: string;
    paperSize: number;
    fitToPage: boolean;
    fitToWidth: number;
    fitToHeight: number;
    scale: number;
    horizontalCentered: boolean;
    verticalCentered: boolean;
  };
}

function rgb(color: Partial<ExcelJS.Color> | undefined): string {
  const argb = color?.argb;
  return argb ? argb.slice(-6).toUpperCase() : '';
}

function sideText(side: Partial<ExcelJS.Border> | undefined): string {
  if (!side || !side.style) return '-';
  return `${side.style}:${rgb(side.color)}`;
}

/** Every sheet of a workbook: what each cell says and how it looks, and how it prints. */
export async function inkWorkbook(bytes: Uint8Array): Promise<InkedSheet[]> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes as unknown as ArrayBuffer);
  const out: InkedSheet[] = [];
  book.eachSheet((sheet) => {
    const widths: number[] = [];
    for (let index = 1; index <= sheet.columnCount; index += 1) {
      widths.push(sheet.getColumn(index).width ?? 0);
    }
    const cells: InkedCell[] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        const font = cell.font ?? {};
        const fill = cell.fill as ExcelJS.FillPattern | undefined;
        const border = cell.border ?? {};
        const value = cell.value;
        cells.push({
          address: cell.address,
          value: value === undefined ? null : (value as string | number | null),
          bold: font.bold === true,
          size: font.size ?? 11,
          fontName: font.name ?? 'Calibri',
          fontColor: rgb(font.color),
          fill:
            fill && fill.type === 'pattern' && fill.pattern === 'solid' ? rgb(fill.fgColor) : '',
          border: [border.left, border.right, border.top, border.bottom].map(sideText).join(' '),
          horizontal: cell.alignment?.horizontal ?? '',
          vertical: cell.alignment?.vertical ?? '',
        });
      });
    });
    const view = sheet.views.find((v) => v.state === 'frozen') as
      (ExcelJS.WorksheetViewFrozen & { topLeftCell?: string }) | undefined;
    const setup = sheet.pageSetup;
    out.push({
      name: sheet.name,
      widths,
      cells,
      frozen: view
        ? {
            ySplit: view.ySplit ?? 0,
            xSplit: view.xSplit ?? 0,
            topLeftCell: view.topLeftCell ?? '',
          }
        : null,
      printTitlesRow: (setup.printTitlesRow ?? '').replace(/\$/g, ''),
      pageSetup: {
        orientation: setup.orientation ?? 'portrait',
        paperSize: setup.paperSize ?? 1,
        fitToPage: setup.fitToPage === true,
        fitToWidth: setup.fitToWidth ?? 1,
        fitToHeight: setup.fitToHeight ?? 1,
        scale: setup.scale ?? 100,
        horizontalCentered: setup.horizontalCentered === true,
        verticalCentered: setup.verticalCentered === true,
      },
    });
  });
  return out;
}
