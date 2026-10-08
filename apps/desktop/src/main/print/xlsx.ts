// The two kinds of sheet as Excel workbooks, cell for cell as the old app wrote them with openpyxl
// (printing.py `_write_xlsx`, export.py `_write_xlsx`).
//
// The workbook is the sheet to open when a line has to change before it goes up, so it carries the
// same columns, headings, boxes and page setup as the PDF. Two things do not survive the trip, as
// in the old app: Excel breaks wide sheets onto pages its own way, and a tick box is the character
// `☐` in a cell rather than a drawn square.

import ExcelJS from 'exceljs';
import { printing, sheetExport } from '@loadout/core';

type PrintSpec = printing.PrintSpec;
type PrintRow = printing.PrintRow;

// Roughly a character per five points of width, which lands the columns at the same proportions
// the PDF gives them.
const CHARS_PER_POINT = 0.2;

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: '00E8EAED' },
};
const STRIPE_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: '00F3F5F8' },
};
const SIDE: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: '009AA1AD' } };
const GRID: Partial<ExcelJS.Borders> = { left: SIDE, right: SIDE, top: SIDE, bottom: SIDE };

// Drawn as a real square in the PDF. Excel has no such thing in a cell, so it gets the character.
const TICK_BOX = '☐';
const ALIGN: Record<string, ExcelJS.Alignment['horizontal']> = {
  L: 'left',
  C: 'center',
  R: 'right',
};

function newSheet(): { book: ExcelJS.Workbook; sheet: ExcelJS.Worksheet } {
  const book = new ExcelJS.Workbook();
  book.creator = 'Loadout Builder';
  const sheet = book.addWorksheet('Load Out');
  return { book, sheet };
}

/**
 * `printing._write_xlsx`: a Print tab sheet. `rows` are the drivers who print, in order. The
 * title and note sit above the headings, as in the old app.
 */
export function printWorkbook(
  rows: readonly PrintRow[],
  spec: PrintSpec,
  title: string,
): ExcelJS.Workbook {
  const { book, sheet } = newSheet();

  let offset = 0;
  if (spec.showTitle) {
    const heading = sheet.getCell(1, 1);
    heading.value = title;
    heading.font = { bold: true, size: 13 };
    offset = 2;
    if (spec.note) {
      const note = sheet.getCell(2, 1);
      note.value = spec.note;
      note.font = { size: 9, color: { argb: '006B7280' } };
      offset = 3;
    }
  }

  const headerRow = offset + 1;
  // Measured at full size, not at the page's scale: Excel prints at its own font size and shrinks
  // the finished sheet at print time instead (the page setup's scale carries that).
  const flat = { ...spec, scale: 100 };
  const widths = printing.columnWidths(flat, printing.geometry(flat), rows);
  spec.columns.forEach((column, index) => {
    const cell = sheet.getCell(headerRow, index + 1);
    cell.value = printing.columnLabel(column) || null;
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    if (spec.grid) cell.border = GRID;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getColumn(index + 1).width = Math.max(3.0, (widths[index] as number) * CHARS_PER_POINT);
  });

  rows.forEach((row, line) => {
    const excelRow = headerRow + 1 + line;
    const striped = spec.stripes && line % 2 === 1;
    spec.columns.forEach((column, index) => {
      const checkbox = column.kind === printing.CHECKBOX;
      const cell = sheet.getCell(excelRow, index + 1);
      cell.value = checkbox ? TICK_BOX : sheetExport.cell(printing.columnRead(column, row));
      if (spec.grid) cell.border = GRID;
      if (striped) cell.fill = STRIPE_FILL;
      if (checkbox) cell.font = { name: 'Segoe UI Symbol', size: 12 };
      cell.alignment = {
        horizontal: ALIGN[printing.columnAlign(column)] ?? 'left',
        vertical: 'middle',
      };
    });
  });

  sheet.views = [
    { state: 'frozen', xSplit: 0, ySplit: headerRow, topLeftCell: `A${headerRow + 1}` },
  ];
  if (spec.repeatHeader) sheet.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
  sheet.pageSetup.orientation = spec.orientation === printing.LANDSCAPE ? 'landscape' : 'portrait';
  sheet.pageSetup.paperSize = (printing.XLSX_PAPER.get(spec.paper) ??
    1) as ExcelJS.PageSetup['paperSize'];
  if (spec.fitOnePage) {
    sheet.pageSetup.fitToPage = true;
    sheet.pageSetup.fitToWidth = 1;
    sheet.pageSetup.fitToHeight = 0;
  } else {
    sheet.pageSetup.fitToPage = false;
    sheet.pageSetup.scale = Math.max(printing.SCALE_MIN, Math.min(printing.SCALE_MAX, spec.scale));
  }
  sheet.pageSetup.horizontalCentered = spec.centerH;
  sheet.pageSetup.verticalCentered = spec.centerV;
  return book;
}

// Roughly a character per five units of weight, as the PDF gives them.
const CHARS_PER_WEIGHT = 0.2;

/** `export._write_xlsx`: the fixed sheet. `rows` are `rowsFor(roster)`. */
export function exportWorkbook(
  rows: readonly string[][],
  columns: readonly sheetExport.ExportColumn[],
): ExcelJS.Workbook {
  const { book, sheet } = newSheet();

  columns.forEach((column, index) => {
    const cell = sheet.getCell(1, index + 1);
    cell.value = column.heading || null;
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = GRID;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getColumn(index + 1).width = column.weight * CHARS_PER_WEIGHT;
  });

  rows.forEach((values, offset) => {
    values.forEach((value, index) => {
      const cell = sheet.getCell(offset + 2, index + 1);
      cell.value = sheetExport.cell(value);
      cell.border = GRID;
      // Left, numbers included: the PDF sets every cell left and the two are meant to match.
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
    });
  });

  // Printing the workbook gives the same page the PDF does.
  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, topLeftCell: 'A2' }];
  sheet.pageSetup.printTitlesRow = '1:1';
  sheet.pageSetup.fitToPage = true;
  sheet.pageSetup.fitToWidth = 1;
  sheet.pageSetup.fitToHeight = 0;
  return book;
}

export async function workbookBytes(book: ExcelJS.Workbook): Promise<Uint8Array> {
  const buffer = await book.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
