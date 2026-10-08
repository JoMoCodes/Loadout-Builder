// The printed sheet, drawn as a list of marks: every piece of text and every box on every page,
// where it goes, in what font and colour.
//
// Ported from the old app's PDF writers (printing.py `_write_pdf`, `_draw_head`, `_draw_heading`,
// `_draw_box`, `_fit`; export.py `_write_pdf`, `_fit`). The old app drew through fpdf2, so the small
// `Canvas` below copies the parts of fpdf2 those writers used: where a cell's text sits (its inner
// margin, its baseline), how a box is stroked and filled, and that a cell moves the pen to its right.
//
// Pure: no Electron, no file system, no browser. The main process turns the marks into a PDF
// (`src/main/print/pdf.ts`) and the Print tab draws the same marks on screen as its preview, so the
// preview is the page the writer will write, not a second guess at it.

import { printing, sheetExport } from '@loadout/core';

type PrintSpec = printing.PrintSpec;
type PrintRow = printing.PrintRow;
type Geometry = printing.Geometry;
type Page = printing.Page;

export type Rgb = readonly [number, number, number];

/** One piece of text. `y` is the baseline, measured down from the top of the page. */
export interface TextMark {
  kind: 'text';
  x: number;
  y: number;
  text: string;
  bold: boolean;
  size: number;
  color: Rgb;
}

/** One box. `y` is its top edge, measured down from the top of the page. */
export interface RectMark {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  /** The line round it, or null for none. */
  stroke: Rgb | null;
  /** The colour inside it, or null for none. */
  fill: Rgb | null;
}

export type Mark = TextMark | RectMark;

export interface SheetPage {
  marks: Mark[];
}

/** A whole document: the paper size (points) and the pages, in order. */
export interface SheetDoc {
  width: number;
  height: number;
  /** The width of every line, in points (fpdf2's 0.2 mm). */
  lineWidth: number;
  pages: SheetPage[];
}

// fpdf2's defaults, in points: a cell keeps a tenth of a centimetre clear inside its left and right
// edges, and every line is 0.2 mm wide.
const CELL_MARGIN = 28.35 / 10;
const LINE_WIDTH = (0.2 * 72) / 25.4;
const BLACK: Rgb = [0, 0, 0];

/**
 * The parts of fpdf2 the old writers drew with. Coordinates are in points from the top left, as
 * fpdf2's are. Every rule here is fpdf2's: a cell's box is drawn first and its text on top of it;
 * left text sits one cell margin in, right text one cell margin short of the right edge, centred
 * text in the middle; the baseline is half the cell's height plus 0.3 of the font size down.
 */
export class Canvas {
  readonly pages: SheetPage[] = [];
  x = 0;
  y = 0;
  private lMargin = 0;
  private tMargin = 0;
  private rMargin = 0;
  private bold = false;
  private size = 12;
  private drawColor: Rgb = BLACK;
  private fillColor: Rgb = BLACK;
  private textColor: Rgb = BLACK;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {}

  setMargins(left: number, top: number, right: number): void {
    this.lMargin = left;
    this.tMargin = top;
    this.rMargin = right;
  }

  addPage(): void {
    this.pages.push({ marks: [] });
    this.x = this.lMargin;
    this.y = this.tMargin;
  }

  setFont(bold: boolean, size: number): void {
    this.bold = bold;
    this.size = size;
  }

  setDrawColor(color: Rgb): void {
    this.drawColor = color;
  }

  setFillColor(color: Rgb): void {
    this.fillColor = color;
  }

  setTextColor(color: Rgb): void {
    this.textColor = color;
  }

  setXY(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /** `ln(h)`: back to the left margin, down by h. */
  ln(h: number): void {
    this.x = this.lMargin;
    this.y += h;
  }

  /** How wide this text is in the current font, in points (fpdf2 `get_string_width`). */
  stringWidth(text: string): number {
    return printing.measure(text, this.size, this.bold);
  }

  private get page(): SheetPage {
    const page = this.pages[this.pages.length - 1];
    if (!page) throw new Error('No page to draw on.');
    return page;
  }

  /**
   * fpdf2 `cell(w, h, text, border, align, fill)`. A width of 0 runs to the right margin. The pen
   * ends up at the cell's right edge, on the same line.
   */
  cell(w: number, h: number, text = '', border = false, align = 'L', fill = false): void {
    const width = w === 0 ? this.w - this.rMargin - this.x : w;
    if (fill || border) {
      this.page.marks.push({
        kind: 'rect',
        x: this.x,
        y: this.y,
        w: width,
        h,
        stroke: border ? this.drawColor : null,
        fill: fill ? this.fillColor : null,
      });
    }
    if (text) {
      let dx: number;
      if (align === 'R') dx = width - CELL_MARGIN - this.stringWidth(text);
      else if (align === 'C') dx = (width - this.stringWidth(text)) / 2;
      else dx = CELL_MARGIN;
      this.page.marks.push({
        kind: 'text',
        x: this.x + dx,
        y: this.y + 0.5 * h + 0.3 * this.size,
        text,
        bold: this.bold,
        size: this.size,
        color: this.textColor,
      });
    }
    this.x += width;
  }

  /** fpdf2 `rect(x, y, w, h)`: a box with a line round it and nothing inside. */
  rect(x: number, y: number, w: number, h: number): void {
    this.page.marks.push({ kind: 'rect', x, y, w, h, stroke: this.drawColor, fill: null });
  }

  finish(): SheetDoc {
    return { width: this.w, height: this.h, lineWidth: LINE_WIDTH, pages: this.pages };
  }
}

function pyChars(text: string): string[] {
  return Array.from(text);
}

function total(values: readonly number[]): number {
  let sum = 0;
  for (const value of values) sum += value;
  return sum;
}

// ------------------------------------------------------------- the Print tab's sheets

const STRIPE: Rgb = [243, 245, 248];
const HEADING_GREY: Rgb = [232, 234, 237];
const RULE: Rgb = [120, 126, 138];
const INK: Rgb = [20, 25, 35];
const MUTED_INK: Rgb = [107, 114, 128];

// The least of the title line the heading keeps, whatever the page number comes to.
const TITLE_MIN_SHARE = 0.5;

// A hair of slack on the width a cell is allowed, so a column sized to its own widest cell does not
// trim that cell over the last bit of a float.
const HAIR = 0.05;

const CELL_PADDING = printing.CELL_PADDING;

/**
 * `printing._fit`: trim a cell's text to its column, as the page can draw it. It never trims to
 * nothing: a column too narrow for one character and an ellipsis keeps the one character.
 */
export function fitPrint(canvas: Canvas, raw: string, width: number): string {
  const text = printing.printable(raw);
  const room = width - CELL_PADDING * 2 + HAIR;
  if (!text || canvas.stringWidth(text) <= room) return text;
  let trimmed = pyChars(text);
  while (trimmed.length > 0 && canvas.stringWidth(`${trimmed.join('')}...`) > room) {
    trimmed = trimmed.slice(0, -1);
  }
  if (trimmed.length > 0) return `${trimmed.join('')}...`;
  trimmed = pyChars(text);
  while (trimmed.length > 1 && canvas.stringWidth(trimmed.join('')) > room) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed.join('');
}

/**
 * `printing._write_pdf`: every page of a Print tab sheet. `rows` are the drivers who print, in the
 * order they print; `pages` is `paginate` of them.
 */
export function drawPrintSheet(
  rows: readonly PrintRow[],
  spec: PrintSpec,
  geo: Geometry,
  pages: readonly Page[],
  title: string,
): SheetDoc {
  const pdf = new Canvas(geo.pageW, geo.pageH);
  pdf.setMargins(geo.margin, geo.margin, geo.margin);
  pdf.setDrawColor(RULE);

  const widths = printing.columnWidths(spec, geo, rows);
  const border = spec.grid;
  const usableW = printing.usableW(geo);
  const usableH = printing.usableH(geo);

  pages.forEach((page, pageIndex) => {
    const number = pageIndex + 1;
    pdf.addPage();
    const bandWidths = page.columns.map((index) => widths[index] as number);
    const tableW = total(bandWidths);
    const left = spec.centerH ? geo.margin + Math.max(0.0, (usableW - tableW) / 2) : geo.margin;

    let top = geo.margin;
    if (geo.titleH) top = drawHead(pdf, spec, geo, title, page, number, pages.length);
    if (spec.centerV) {
      const block = geo.headerH + page.rows.length * geo.rowH;
      top += Math.max(0.0, (usableH - geo.titleH - block) / 2);
    }

    let y = top;
    if (spec.repeatHeader || page.firstOfBand) {
      drawHeading(pdf, spec, geo, page, bandWidths, left, y, border);
      y += geo.headerH;
    }

    pdf.setFont(false, geo.fontSize);
    pdf.setTextColor(INK);
    page.rows.forEach((row, index) => {
      let x = left;
      const striped = spec.stripes && index % 2 === 1;
      if (striped) pdf.setFillColor(STRIPE);
      page.columns.forEach((columnIndex, offset) => {
        const column = spec.columns[columnIndex] as printing.PrintColumn;
        const width = bandWidths[offset] as number;
        pdf.setXY(x, y);
        pdf.cell(
          width,
          geo.rowH,
          fitPrint(pdf, printing.columnRead(column, row), width),
          border,
          printing.columnAlign(column),
          striped,
        );
        if (column.kind === printing.CHECKBOX) drawBox(pdf, x, y, width, geo.rowH);
        x += width;
      });
      y += geo.rowH;
    });
  });
  return pdf.finish();
}

/**
 * `printing._draw_head`: the lines above the table (the title and day, the group where pages break
 * by one, which page of how many, and the note). Returns the y the table starts at.
 */
function drawHead(
  pdf: Canvas,
  spec: PrintSpec,
  geo: Geometry,
  title: string,
  page: Page,
  number: number,
  totalPages: number,
): number {
  const lineH = geo.fontSize * 1.6;
  const usableW = printing.usableW(geo);
  let y = geo.margin;

  if (spec.showTitle || spec.showPageNumbers) {
    let tail = '';
    if (spec.showPageNumbers) {
      tail = `Page ${number} of ${totalPages}`;
      if (page.band) tail = `columns continued  -  ${tail}`;
    }
    pdf.setFont(false, geo.fontSize * 0.95);
    const tailW = tail
      ? Math.min(
          pdf.stringWidth(printing.printable(tail)) + CELL_PADDING * 2,
          usableW * (1 - TITLE_MIN_SHARE),
        )
      : 0.0;
    const headingW = usableW - tailW;

    if (spec.showTitle) {
      let label = '';
      if (spec.groupBreak && page.group) {
        label = `   -   ${printing.FIELD_HEADINGS.get(spec.groupBreak) ?? ''} ${page.group}`;
      }
      pdf.setFont(true, geo.fontSize * 1.25);
      pdf.setTextColor(INK);
      const labelW = label
        ? Math.min(pdf.stringWidth(printing.printable(label)) + CELL_PADDING, headingW)
        : 0.0;
      pdf.setXY(geo.margin, y);
      pdf.cell(headingW - labelW, lineH, fitPrint(pdf, title, headingW - labelW));
      if (labelW) pdf.cell(labelW, lineH, fitPrint(pdf, label, labelW + CELL_PADDING));
    }

    if (tail) {
      pdf.setFont(false, geo.fontSize * 0.95);
      pdf.setTextColor(MUTED_INK);
      pdf.setXY(geo.margin + headingW, y);
      pdf.cell(tailW, lineH, fitPrint(pdf, tail, tailW + CELL_PADDING), false, 'R');
    }
    y = geo.margin + geo.fontSize * 1.9;
  }

  if (spec.note) {
    pdf.setFont(false, geo.fontSize * 0.95);
    pdf.setTextColor(MUTED_INK);
    pdf.setXY(geo.margin, y);
    pdf.cell(usableW, geo.fontSize * 1.4, fitPrint(pdf, spec.note, usableW));
    y += geo.fontSize * 1.5;
  }
  return y + 8;
}

/** `printing._draw_heading`: the grey heading row of one page. */
function drawHeading(
  pdf: Canvas,
  spec: PrintSpec,
  geo: Geometry,
  page: Page,
  bandWidths: readonly number[],
  left: number,
  y: number,
  border: boolean,
): void {
  pdf.setFont(true, geo.fontSize);
  pdf.setTextColor(INK);
  pdf.setFillColor(HEADING_GREY);
  let x = left;
  page.columns.forEach((columnIndex, offset) => {
    const column = spec.columns[columnIndex] as printing.PrintColumn;
    const width = bandWidths[offset] as number;
    pdf.setXY(x, y);
    pdf.cell(
      width,
      geo.headerH,
      fitPrint(pdf, printing.columnLabel(column), width),
      border,
      'C',
      true,
    );
    x += width;
  });
}

/** `printing._draw_box`: the square in a tick-box cell, centred in it. */
function drawBox(pdf: Canvas, x: number, y: number, width: number, height: number): void {
  const side = Math.max(5.0, Math.min(height - 6, width - 8, 13.0));
  pdf.rect(x + (width - side) / 2, y + (height - side) / 2, side, side);
}

// ------------------------------------------------------------- the two fixed exports

const EXPORT_MARGIN = 36;
const EXPORT_HEADER_HEIGHT = 22;
const EXPORT_ROW_HEIGHT = 20;
const EXPORT_CELL_PADDING = 4;
const LETTER: readonly [number, number] = [612, 792];

/**
 * `export._fit`: trim a cell's text to its column. Unlike the Print tab's, this one trims to nothing
 * when nothing fits, as the old export did.
 */
export function fitExport(canvas: Canvas, text: string, width: number): string {
  const room = width - EXPORT_CELL_PADDING * 2;
  if (!text || canvas.stringWidth(text) <= room) return text;
  let trimmed = pyChars(text);
  while (trimmed.length > 0 && canvas.stringWidth(`${trimmed.join('')}...`) > room) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed.length > 0 ? `${trimmed.join('')}...` : '';
}

/**
 * `export._write_pdf`: the fixed sheet (Export Roster, Export with DWP). Letter, portrait, every
 * cell boxed, the headings again at the top of every page. `rows` are `rowsFor(roster)`.
 *
 * One deliberate difference: the old export handed the text to fpdf2 as it was, so a name with a
 * character outside Latin-1 (a curly apostrophe, say) stopped the export with an error. Here the
 * text goes through the same `printable` the Print tab's sheets use, so the name prints instead.
 * Every name the old export could print comes out the same.
 */
export function drawExportSheet(
  rows: readonly string[][],
  columns: readonly sheetExport.ExportColumn[],
): SheetDoc {
  const [pageW, pageH] = LETTER;
  const pdf = new Canvas(pageW, pageH);
  pdf.setMargins(EXPORT_MARGIN, EXPORT_MARGIN, EXPORT_MARGIN);
  pdf.setDrawColor(RULE);

  const usable = pageW - EXPORT_MARGIN * 2;
  const sum = total(columns.map((column) => column.weight));
  const widths = columns.map((column) => (column.weight / sum) * usable);
  const floor = pageH - EXPORT_MARGIN;

  const headings = () => {
    pdf.addPage();
    pdf.setFont(true, 10);
    pdf.setFillColor(HEADING_GREY);
    columns.forEach((column, index) => {
      const width = widths[index] as number;
      pdf.cell(width, EXPORT_HEADER_HEIGHT, fitExport(pdf, column.heading, width), true, 'C', true);
    });
    pdf.ln(EXPORT_HEADER_HEIGHT);
    pdf.setFont(false, 10);
  };

  headings();
  for (const values of rows) {
    if (pdf.y + EXPORT_ROW_HEIGHT > floor) headings();
    values.forEach((value, index) => {
      const width = widths[index] as number;
      pdf.cell(
        width,
        EXPORT_ROW_HEIGHT,
        fitExport(pdf, printing.printable(value), width),
        true,
        'L',
      );
    });
    pdf.ln(EXPORT_ROW_HEIGHT);
  }
  return pdf.finish();
}

// ------------------------------------------------------------- the whole Print tab sheet

export interface PrintPlan {
  /** The drivers who print, in the order they print. */
  printing: PrintRow[];
  geo: Geometry;
  pages: Page[];
  /** Each column's printed width, in points. */
  widths: number[];
  title: string;
}

/** Everything `printing.write` works out before it draws: who, the page, the pages, the title. */
export function planPrint(
  rows: readonly PrintRow[],
  spec: PrintSpec,
  dateLabel: string,
): PrintPlan {
  const chosen = printing.specRowsFor(spec, rows);
  const geo = printing.geometry(spec);
  return {
    printing: chosen,
    geo,
    pages: printing.paginate(chosen, spec, geo),
    widths: printing.columnWidths(spec, geo, chosen),
    title: printing.titleFor(spec, dateLabel),
  };
}

/** What Print Vans prints, off the tab's own layout: two columns, van order, drivers with a van. */
export function vansSpec(spec: PrintSpec): PrintSpec {
  const out = printing.withColumns(spec, printing.vansColumns());
  if (!out.title) out.title = 'Vans';
  out.sortBy = 'vehicle';
  out.sortReverse = false;
  out.vansOnly = true;
  return out;
}
