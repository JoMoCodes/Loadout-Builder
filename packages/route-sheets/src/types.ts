// The shapes shared by the parser, the matcher and the email and export renderers. They mirror
// the objects the old Route Sheet Distributor passed around (scripts/parity/rsd/core), field for
// field, so the parity harness can compare the two sides as JSON.

/** One piece of positioned text on a PDF page. `y` is measured from the top of the page. */
export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  /** Width in page units. Missing when the items were built by hand (the fallback path). */
  width?: number;
  size: number;
}

/** One PDF page as positioned text, before any reading. */
export interface PdfItemsPage {
  pageNumber: number;
  items: PdfTextItem[];
  width: number;
  height: number;
}

export interface BagRow {
  index: number;
  sortZone: string;
  bag: string;
  packages: number;
}

export interface OverflowRow {
  index: number;
  sortZone: string;
  packages: number;
}

/** The number check: the counts printed on the sheet, checked against each other. */
export interface SheetCheck {
  ok: boolean;
  problems: string[];
  /** Blank cells printed that way on the sheet: not read errors, but the driver needs to know. */
  notes: string[];
  bagPackages: number;
  overflowPackages: number;
}

/** One route sheet, exactly as printed. Nothing is rounded or renamed. */
export interface RouteSheet {
  pageNumber: number;
  /** Every PDF page this sheet spans (a long route spills onto a second page). */
  pageNumbers: number[];
  routeCode: string | null;
  staging: string | null;
  dsp: string | null;
  serviceType: string | null;
  station: string | null;
  weekday: string | null;
  /** ISO yyyy-mm-dd. */
  date: string | null;
  /** Exactly as printed, e.g. "THU, SEP 24, 2026". */
  dateLabel: string | null;
  cycle: string | null;
  waveTime: string | null;
  bagCount: number | null;
  overflowCount: number | null;
  bags: BagRow[];
  overflow: OverflowRow[];
  totalPackages: number | null;
  commercialPackages: number | null;
  check: SheetCheck;
}

/** A page that was skipped, and why (plain words for the dispatcher). */
export interface PageError {
  pageNumber: number;
  message: string;
}

/** What reading a whole route sheet PDF gives. */
export interface ParsedRouteSheetPdf {
  sheets: RouteSheet[];
  pageErrors: PageError[];
  pageCount: number;
}

/** A sheet with the pad for its wave, as the email renderers take it. */
export type SheetWithPad = RouteSheet & { pad?: string | null };
