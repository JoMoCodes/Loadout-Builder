// Print the roster to a layout the user chose, rather than a fixed one.
//
// Ported from the old app's printing.py, without the PDF and spreadsheet writers: this is the page
// math only. What goes on the page, in what order, at what size, on what paper, and who is on it at
// all, are held in a `PrintSpec`, which is saved so a layout built once is still there tomorrow.
//
// Nothing here reads the roster. A page builds one `PrintRow` per driver and hands them over, so
// what prints in a cell is by construction what the Roster tab shows in it.

import { NO_SHIFT } from '../models/constants';
import { compareKeys, sortKey } from '../models/clock';
import { pyStrip } from '../models/text';
import { HELVETICA_BOLD, HELVETICA_REGULAR } from './helvetica';

// ------------------------------------------------------------------ columns

/** What kinds of column can go on the page. */
export const FIELD = 'field'; // a value read off the driver's row
export const BLANK = 'blank'; // nothing, with a box round it: somewhere to write
export const CHECKBOX = 'checkbox'; // a box to tick

/**
 * (key, heading, weight, alignment). The weights are relative and are taken from what the data
 * measures at 10pt, the size the sheet prints at unscaled. The keys are the names saved layouts use.
 */
export const PRINT_FIELDS: ReadonlyArray<readonly [string, string, number, string]> = [
  ['driver', 'Driver', 113, 'L'],
  ['shift_type', 'Shift Type', 90, 'L'],
  ['transporter_id', 'Transporter ID', 88, 'L'],
  ['tenure', 'Lifetime Routes', 44, 'C'],
  ['vans', 'Vans', 72, 'L'],
  ['check', 'Check', 118, 'L'],
  ['routes', 'Routes', 46, 'L'],
  ['wave_time', 'Wave Time', 74, 'L'],
  ['pad', 'PAD', 32, 'C'],
  ['service_type', 'Service Type', 130, 'L'],
  ['vehicle', 'Vehicle', 78, 'L'],
  ['vin', 'VIN', 112, 'L'],
  ['assign_method', 'Matched On', 92, 'L'],
  ['device', 'Device', 60, 'L'],
  ['staging_location', 'Staging', 55, 'L'],
  ['bags', 'Bags', 36, 'C'],
  ['ovs', 'OVS', 36, 'C'],
  ['bag', 'Bag', 36, 'C'],
];

export const FIELD_HEADINGS: ReadonlyMap<string, string> = new Map(
  PRINT_FIELDS.map(([key, heading]) => [key, heading]),
);
const FIELD_WEIGHTS: ReadonlyMap<string, number> = new Map(
  PRINT_FIELDS.map(([key, , weight]) => [key, weight]),
);
const FIELD_ALIGN: ReadonlyMap<string, string> = new Map(
  PRINT_FIELDS.map(([key, , , align]) => [key, align]),
);

// What a blank or a tick-box column is worth when nobody has said.
const BLANK_WEIGHT = 61;
const CHECKBOX_WEIGHT = 44;

// Helvetica-Bold at 10pt runs about six points a character across mixed case. Only a floor.
const HEADING_PER_CHAR = 6.0;
const HEADING_PADDING = 12;
const HEADING_MAX = 170;

/** Python's len(): code points, not UTF-16 units. */
function pyLen(text: string): number {
  return Array.from(text).length;
}

/**
 * The narrowest this heading can print at, guessed from its length. The rough one, for the Width
 * box and a layout with no roster behind it yet. Everything that prints is measured instead.
 */
export function headingRoom(heading: string): number {
  return Math.trunc(Math.min(HEADING_MAX, pyLen(heading) * HEADING_PER_CHAR + HEADING_PADDING));
}

// What the typographers' characters become on the page. The PDF core fonts are Latin-1.
const TYPOGRAPHIC: ReadonlyMap<string, string> = new Map([
  ['\u2018', "'"],
  ['\u2019', "'"],
  ['\u201a', "'"],
  ['\u201b', "'"],
  ['\u2032', "'"],
  ['\u00b4', "'"],
  ['`', "'"],
  ['\u201c', '"'],
  ['\u201d', '"'],
  ['\u201e', '"'],
  ['\u2033', '"'],
  ['\u2010', '-'],
  ['\u2011', '-'],
  ['\u2012', '-'],
  ['\u2013', '-'],
  ['\u2014', '-'],
  ['\u2015', '-'],
  ['\u2212', '-'],
  ['\u2026', '...'],
  ['\u00a0', ' '],
  ['\u2022', '-'],
  ['\u2027', '-'],
  ['\u200b', ''],
  ['\ufeff', ''],
]);

function isAscii(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) > 0x7f) return false;
  }
  return true;
}

/** Every character fits in Latin-1. */
export function isLatin1(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) > 0xff) return false;
  }
  return true;
}

// Python's unicodedata.combining(c) != 0. JavaScript has no combining-class lookup; the nonspacing
// marks are the same set for every accent a name can carry.
const COMBINING = /\p{Mn}/u;

/**
 * The nearest thing to this text that a PDF core font can draw. Typographers' quotes and dashes
 * become the plain ones, an accent is dropped only where Latin-1 has no room for it, and only what
 * survives neither becomes a '?'.
 */
export function printable(text: string): string {
  // Deliberate, as in the old app: pure ASCII is returned untouched, so a backtick only becomes a
  // quote when the text also holds something outside ASCII.
  if (isAscii(text)) return text;
  let translated = '';
  for (const char of text) translated += TYPOGRAPHIC.get(char) ?? char;
  let out = '';
  for (const char of translated) {
    if (isLatin1(char)) {
      out += char;
      continue;
    }
    const plain = Array.from(char.normalize('NFKD'))
      .filter((part) => !COMBINING.test(part))
      .join('');
    out += plain && isLatin1(plain) ? plain : '?';
  }
  return out;
}

/**
 * How wide this text prints, in points, in Helvetica (bold for headings), the way fpdf2 measured
 * it: the sum of the character widths, times the size, times a thousandth.
 */
export function measure(text: string, size: number, bold = false): number {
  if (!text) return 0.0;
  const table = bold ? HELVETICA_BOLD : HELVETICA_REGULAR;
  let total = 0;
  for (const char of printable(text)) total += table[char.codePointAt(0) as number] ?? 0;
  return total * size * 0.001;
}

/** The columns a sheet can be ordered by, and what to call that in a menu. */
export const SORT_CHOICES: ReadonlyArray<readonly [string, string]> = [
  ['driver', 'Driver name'],
  ['wave_time', 'Wave time'],
  ['pad', 'PAD'],
  ['routes', 'Route'],
  ['vehicle', 'Van'],
  ['shift_type', 'Shift type'],
  ['service_type', 'Service type'],
  ['staging_location', 'Staging'],
];

/** What a page can be broken on. */
export const GROUP_CHOICES: ReadonlyArray<readonly [string, string]> = [
  ['', "Don't break - one run of pages"],
  ['pad', 'New page for each PAD'],
  ['wave_time', 'New page for each wave time'],
  ['shift_type', 'New page for each shift type'],
  ['staging_location', 'New page for each staging location'],
];

export const PAPERS: ReadonlyArray<readonly [string, string]> = [
  ['letter', 'Letter  8.5 x 11'],
  ['legal', 'Legal  8.5 x 14'],
  ['a4', 'A4'],
  ['tabloid', 'Tabloid  11 x 17'],
];

/** Points, portrait. Turned on their side for landscape. */
export const PAPER_SIZES: ReadonlyMap<string, readonly [number, number]> = new Map([
  ['letter', [612.0, 792.0]],
  ['legal', [612.0, 1008.0]],
  ['a4', [595.28, 841.89]],
  ['tabloid', [792.0, 1224.0]],
]);

/** Excel's own numbering for the same four papers. */
export const XLSX_PAPER: ReadonlyMap<string, number> = new Map([
  ['letter', 1],
  ['legal', 5],
  ['a4', 9],
  ['tabloid', 3],
]);

export const PORTRAIT = 'portrait';
export const LANDSCAPE = 'landscape';

export const ALIGN_CHOICES: ReadonlyArray<readonly [string, string]> = [
  ['', 'Default'],
  ['L', 'Left'],
  ['C', 'Centre'],
  ['R', 'Right'],
];
const ALIGNMENTS = new Set(ALIGN_CHOICES.map(([key]) => key));

export const SCALE_MIN = 40;
export const SCALE_MAX = 200;

/**
 * One column on the printed page (Python `PrintColumn`). A `field` column carries `field`; the other
 * two carry nothing and are there for the pen. `heading` empty means "whatever this field is called",
 * `weight` zero means "whatever this kind of column is usually worth".
 */
export interface PrintColumn {
  kind: string;
  field: string;
  heading: string;
  weight: number;
  /** Python `align_override`. Empty is whatever the field is normally set in. */
  alignOverride: string;
}

export function createPrintColumn(values: Partial<PrintColumn> = {}): PrintColumn {
  return { kind: FIELD, field: '', heading: '', weight: 0, alignOverride: '', ...values };
}

/** `PrintColumn.label`. */
export function columnLabel(column: PrintColumn): string {
  if (column.heading) return column.heading;
  if (column.kind === FIELD) return FIELD_HEADINGS.get(column.field) ?? column.field;
  return '';
}

/** `PrintColumn.kind_label`. */
export function columnKindLabel(column: PrintColumn): string {
  const labels: Record<string, string> = {
    [FIELD]: 'Column',
    [BLANK]: 'Write-in',
    [CHECKBOX]: 'Tick box',
  };
  return Object.hasOwn(labels, column.kind) ? (labels[column.kind] as string) : column.kind;
}

/** `PrintColumn.width`: what this column is worth before the page shares itself out. */
export function columnWidth(column: PrintColumn): number {
  if (column.weight) return column.weight;
  let base: number;
  if (column.kind === FIELD) base = FIELD_WEIGHTS.get(column.field) ?? 80;
  else base = column.kind === BLANK ? BLANK_WEIGHT : CHECKBOX_WEIGHT;
  return column.heading ? Math.max(base, headingRoom(column.heading)) : base;
}

/** `PrintColumn.align`. */
export function columnAlign(column: PrintColumn): string {
  if (column.alignOverride) return column.alignOverride;
  if (column.kind === FIELD) return FIELD_ALIGN.get(column.field) ?? 'L';
  return 'C';
}

/** `PrintColumn.read`: what goes in this cell. Empty for the two that are there to write on. */
export function columnRead(column: PrintColumn, row: PrintRow): string {
  if (column.kind !== FIELD) return '';
  return printRowValue(row, column.field);
}

/**
 * One driver, as the printed sheet needs them (Python `PrintRow`). `key` is the stable driver key
 * the page files exclusions under; `values` is every field this driver could print, as text.
 */
export interface PrintRow {
  key: string;
  values: Record<string, string>;
}

export function printRowValue(row: PrintRow, fieldName: string): string {
  return Object.hasOwn(row.values, fieldName) ? (row.values[fieldName] as string) : '';
}

/** A whole printed sheet, as something that can be saved and named (Python `PrintSpec`). */
export interface PrintSpec {
  columns: PrintColumn[];
  // ---- the page itself
  paper: string;
  orientation: string;
  scale: number;
  /** Python `fit_one_page`. */
  fitOnePage: boolean;
  stretch: boolean;
  /** Python `center_h`. */
  centerH: boolean;
  /** Python `center_v`. */
  centerV: boolean;
  // ---- what is on the page besides the table
  /** Python `show_title`. */
  showTitle: boolean;
  title: string;
  note: string;
  /** Python `show_page_numbers`. */
  showPageNumbers: boolean;
  grid: boolean;
  stripes: boolean;
  /** Python `repeat_header`. */
  repeatHeader: boolean;
  // ---- which rows, and in what order
  /** Python `sort_by`. */
  sortBy: string;
  /** Python `sort_reverse`. */
  sortReverse: boolean;
  /** Python `group_break`. */
  groupBreak: string;
  /** Python `excluded_shifts`: what to leave off, not what to put on. */
  excludedShifts: string[];
  /** Python `excluded_drivers`. */
  excludedDrivers: string[];
  /** Python `vans_only`. */
  vansOnly: boolean;
}

export function createPrintSpec(values: Partial<PrintSpec> = {}): PrintSpec {
  return {
    columns: [],
    paper: 'letter',
    orientation: PORTRAIT,
    scale: 100,
    fitOnePage: true,
    stretch: false,
    centerH: true,
    centerV: false,
    showTitle: true,
    title: '',
    note: '',
    showPageNumbers: true,
    grid: true,
    stripes: false,
    repeatHeader: true,
    sortBy: 'driver',
    sortReverse: false,
    groupBreak: '',
    excludedShifts: [],
    excludedDrivers: [],
    vansOnly: false,
    ...values,
  };
}

/** `PrintSpec.with_columns`: the same page setup and the same people, different columns. */
export function withColumns(spec: PrintSpec, columns: PrintColumn[]): PrintSpec {
  return { ...spec, columns: [...columns] };
}

/** `PrintSpec.prints`: is this driver on the sheet? */
export function specPrints(spec: PrintSpec, row: PrintRow): boolean {
  if (spec.excludedDrivers.includes(row.key)) return false;
  if (spec.excludedShifts.includes(printRowValue(row, 'shift_type') || NO_SHIFT)) return false;
  if (spec.vansOnly && !printRowValue(row, 'vehicle')) return false;
  return true;
}

function compareText(a: string, b: string): number {
  return compareKeys(a, b);
}

/**
 * `PrintSpec.rows_for`: the drivers who print, in the order they print. Sorted by the chosen
 * column and by name inside it; a break column sorts first of all.
 */
export function specRowsFor(spec: PrintSpec, rows: readonly PrintRow[]): PrintRow[] {
  const wanted = rows.filter((row) => specPrints(spec, row));
  const keyed = wanted.map((row) => ({
    row,
    key: sortKey(printRowValue(row, spec.sortBy)),
    name: printRowValue(row, 'driver').toLowerCase(),
  }));
  // Python's reverse=True keeps equal rows in their original order, which is what negating a
  // stable comparison does too.
  const direction = spec.sortReverse ? -1 : 1;
  keyed.sort((a, b) => {
    const result = compareKeys(a.key, b.key) || compareText(a.name, b.name);
    return result * direction;
  });
  let ordered = keyed.map((item) => item.row);
  if (spec.groupBreak) {
    const group = spec.groupBreak;
    const grouped = ordered.map((row) => ({ row, key: sortKey(printRowValue(row, group)) }));
    grouped.sort((a, b) => compareKeys(a.key, b.key));
    ordered = grouped.map((item) => item.row);
  }
  return ordered;
}

/** The spec as Python's `dataclasses.asdict` writes it: every field, snake_case, in order. */
export function specToDict(spec: PrintSpec): Record<string, unknown> {
  return {
    columns: spec.columns.map((column) => ({
      kind: column.kind,
      field: column.field,
      heading: column.heading,
      weight: column.weight,
      align_override: column.alignOverride,
    })),
    paper: spec.paper,
    orientation: spec.orientation,
    scale: spec.scale,
    fit_one_page: spec.fitOnePage,
    stretch: spec.stretch,
    center_h: spec.centerH,
    center_v: spec.centerV,
    show_title: spec.showTitle,
    title: spec.title,
    note: spec.note,
    show_page_numbers: spec.showPageNumbers,
    grid: spec.grid,
    stripes: spec.stripes,
    repeat_header: spec.repeatHeader,
    sort_by: spec.sortBy,
    sort_reverse: spec.sortReverse,
    group_break: spec.groupBreak,
    excluded_shifts: [...spec.excludedShifts],
    excluded_drivers: [...spec.excludedDrivers],
    vans_only: spec.vansOnly,
  };
}

/**
 * `PrintSpec.to_json`: what is saved. Python's `json.dumps(..., separators=(",", ":"))`, which
 * writes anything outside ASCII as a \u escape.
 */
export function specToJson(spec: PrintSpec): string {
  return JSON.stringify(specToDict(spec)).replace(
    /[\u0080-\uffff]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

/** Python's truthiness, for a value read out of JSON. */
function pyTruthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (value === 0 || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

/** Python's `str()` of a value read out of JSON. */
function pyStr(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

/** `_as_int`: Python's `int(value)`, or the fallback where that raises. */
export function asInt(value: unknown, fallback: number): number {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : fallback;
  if (typeof value === 'string') {
    const text = value.trim();
    if (/^[+-]?\d+(_\d+)*$/.test(text)) return Number.parseInt(text.replace(/_/g, ''), 10);
    return fallback;
  }
  return fallback;
}

function getKey(raw: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(raw, key) ? raw[key] : undefined;
}

/**
 * `PrintSpec.from_json`: rebuild a saved layout, dropping anything this version can't honour. A
 * field that no longer exists is left off, an unknown paper falls back to Letter, and a layout with
 * nothing usable left in it comes back as the default.
 */
export function specFromJson(text: string): PrintSpec {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return defaultSpec();
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return defaultSpec();
  const data = raw as Record<string, unknown>;

  const spec = defaultSpec();
  const columns: PrintColumn[] = [];
  const items = getKey(data, 'columns');
  for (const item of Array.isArray(items) ? items : []) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    const kind = Object.hasOwn(entry, 'kind') ? entry.kind : FIELD;
    if (kind !== FIELD && kind !== BLANK && kind !== CHECKBOX) continue;
    const field = getKey(entry, 'field');
    if (kind === FIELD && !(typeof field === 'string' && FIELD_HEADINGS.has(field))) continue;
    const align = getKey(entry, 'align_override');
    columns.push(
      createPrintColumn({
        kind,
        // Deliberate, as in the old app: a field saved as null reads back as the text 'None'.
        field: pyStr(Object.hasOwn(entry, 'field') ? entry.field : ''),
        heading: pyStr(Object.hasOwn(entry, 'heading') ? entry.heading : ''),
        weight: Math.max(0, asInt(getKey(entry, 'weight'), 0)),
        alignOverride: typeof align === 'string' && ALIGNMENTS.has(align) ? align : '',
      }),
    );
  }
  if (columns.length > 0) spec.columns = columns;

  const paper = getKey(data, 'paper');
  if (typeof paper === 'string' && PAPER_SIZES.has(paper)) spec.paper = paper;
  spec.orientation = getKey(data, 'orientation') === LANDSCAPE ? LANDSCAPE : PORTRAIT;
  spec.scale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, asInt(getKey(data, 'scale'), 100)));
  const flags: ReadonlyArray<readonly [string, keyof PrintSpec]> = [
    ['fit_one_page', 'fitOnePage'],
    ['stretch', 'stretch'],
    ['center_h', 'centerH'],
    ['center_v', 'centerV'],
    ['show_title', 'showTitle'],
    ['show_page_numbers', 'showPageNumbers'],
    ['grid', 'grid'],
    ['stripes', 'stripes'],
    ['repeat_header', 'repeatHeader'],
    ['sort_reverse', 'sortReverse'],
    ['vans_only', 'vansOnly'],
  ];
  for (const [flag, name] of flags) {
    if (Object.hasOwn(data, flag))
      (spec as unknown as Record<string, boolean>)[name] = pyTruthy(data[flag]);
  }
  const title = getKey(data, 'title');
  spec.title = pyTruthy(title) ? pyStr(title) : '';
  const note = getKey(data, 'note');
  spec.note = pyTruthy(note) ? pyStr(note) : '';
  const sortBy = getKey(data, 'sort_by');
  if (typeof sortBy === 'string' && FIELD_HEADINGS.has(sortBy)) spec.sortBy = sortBy;
  const groupBreak = getKey(data, 'group_break');
  if (typeof groupBreak === 'string' && FIELD_HEADINGS.has(groupBreak))
    spec.groupBreak = groupBreak;
  spec.excludedShifts = textList(getKey(data, 'excluded_shifts'));
  spec.excludedDrivers = textList(getKey(data, 'excluded_drivers'));
  return spec;
}

function textList(value: unknown): string[] {
  if (!pyTruthy(value)) return [];
  if (Array.isArray(value)) return value.map(pyStr);
  if (typeof value === 'string') return Array.from(value);
  if (typeof value === 'object') return Object.keys(value as object);
  return [];
}

/**
 * The sheet the Export Roster button writes, as a starting point to change: the same five columns
 * with the same blank either side.
 */
export function defaultSpec(): PrintSpec {
  return createPrintSpec({
    columns: [
      createPrintColumn({ kind: BLANK }),
      createPrintColumn({ field: 'driver' }),
      createPrintColumn({ field: 'vehicle' }),
      createPrintColumn({ field: 'shift_type' }),
      createPrintColumn({ field: 'routes' }),
      createPrintColumn({ field: 'pad' }),
      createPrintColumn({ kind: BLANK }),
    ],
  });
}

/** Who, and which van. What Print Vans puts on the page. */
export function vansColumns(): PrintColumn[] {
  return [
    createPrintColumn({ field: 'driver' }),
    // Centred: a van number is a thing to find in a list rather than a sentence to read.
    createPrintColumn({ field: 'vehicle', alignOverride: 'C' }),
  ];
}

// ---------------------------------------------------------------- geometry

const MARGIN = 36.0; // half an inch
const BASE_FONT = 10.0;
const BASE_ROW = 20.0;
const BASE_HEADER = 22.0;
export const CELL_PADDING = 4.0;

/** The page, worked out once from the spec, in points. */
export interface Geometry {
  pageW: number;
  pageH: number;
  margin: number;
  fontSize: number;
  rowH: number;
  headerH: number;
  titleH: number;
  scale: number;
}

export function usableW(geo: Geometry): number {
  return geo.pageW - geo.margin * 2;
}

export function usableH(geo: Geometry): number {
  return geo.pageH - geo.margin * 2;
}

export function geometry(spec: PrintSpec): Geometry {
  const scale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, spec.scale)) / 100;
  let [width, height] =
    PAPER_SIZES.get(spec.paper) ?? (PAPER_SIZES.get('letter') as [number, number]);
  if (spec.orientation === LANDSCAPE) [width, height] = [height, width];
  const fontSize = Math.max(4.5, BASE_FONT * scale);
  // The title and the page numbers share a line; the note has a line of its own under them.
  const headLine = spec.showTitle || spec.showPageNumbers;
  let titleH = 0.0;
  if (headLine || spec.note) {
    titleH = (headLine ? fontSize * 1.9 : 0) + (spec.note ? fontSize * 1.5 : 0) + 8;
  }
  return {
    pageW: width,
    pageH: height,
    margin: MARGIN,
    fontSize,
    rowH: Math.max(9.0, BASE_ROW * scale),
    headerH: Math.max(11.0, BASE_HEADER * scale),
    titleH,
    scale,
  };
}

// A column narrower than this is a line, not a column.
const MIN_COLUMN = 22.0;

// Breathing room, in points, given to a column measured off its own contents.
const CELL_AIR = 3.0;

// No measured column may take more than this share of a page it is having to share.
const MAX_SHARE = 0.4;

function sum(values: readonly number[]): number {
  // Left to right, as Python's sum() adds.
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/**
 * How wide each column prints, in points. Every column starts at the width its own contents want,
 * measured in the font it prints in; a width set by hand replaces that. `stretch` pulls a narrow
 * table out to the page, `fitOnePage` squeezes a wide one onto it.
 */
export function columnWidths(
  spec: PrintSpec,
  geo: Geometry,
  rows: readonly PrintRow[] = [],
): number[] {
  let natural = spec.columns.map((column) => naturalWidth(column, geo, rows));
  if (natural.length === 0) return [];
  const room = usableW(geo);
  if (sum(natural) > room) {
    natural = spec.columns.map((column, index) =>
      capped(column, natural[index] as number, geo, room),
    );
  }
  const total = sum(natural);
  if (total > room && spec.fitOnePage) {
    const floors = spec.columns.map((column) => headingFloor(column, geo));
    return squeeze(natural, floors, room);
  }
  if (total < room && spec.stretch) return natural.map((width) => (width / total) * room);
  // A single column wider than the page has nowhere to go but the page.
  return natural.map((width) => Math.min(width, room));
}

/** `_capped`: hold one measured column to its share of a page it has to share. */
export function capped(column: PrintColumn, width: number, geo: Geometry, room: number): number {
  if (column.weight) return width;
  const floor = Math.min(headingFloor(column, geo), room);
  return Math.max(Math.min(width, room * MAX_SHARE), floor);
}

/** `_natural_width`: the width this one column asks for, before the page has its say. */
export function naturalWidth(
  column: PrintColumn,
  geo: Geometry,
  rows: readonly PrintRow[],
): number {
  if (column.weight) return Math.max(MIN_COLUMN, column.weight) * geo.scale;
  let room = headingFloor(column, geo);
  if (column.kind === FIELD) {
    // Nothing to measure against: fall back to the designed width.
    if (rows.length === 0) room = Math.max(room, columnWidth(column) * geo.scale);
    for (const row of rows) room = Math.max(room, cellRoom(columnRead(column, row), geo));
  } else if (column.kind === BLANK) {
    room = Math.max(room, BLANK_WEIGHT * geo.scale);
  } else {
    room = Math.max(room, CHECKBOX_WEIGHT * geo.scale);
  }
  return Math.max(room, MIN_COLUMN * geo.scale);
}

/** `_cell_room`. */
export function cellRoom(text: string, geo: Geometry): number {
  if (!text) return 0.0;
  return measure(text, geo.fontSize) + CELL_PADDING * 2 + CELL_AIR * 2;
}

/** `_heading_floor`: the narrowest this column can print at without cutting its own heading. */
export function headingFloor(column: PrintColumn, geo: Geometry): number {
  const label = columnLabel(column);
  if (!label) return 0.0;
  const room = measure(label, geo.fontSize, true) + CELL_PADDING * 2;
  return room + CELL_AIR * 2;
}

/**
 * `_squeeze`: share the page width out without squeezing a heading off its own column. Straight
 * proportion first; any column under its heading's floor is pushed back up, and the difference is
 * taken off the columns with room to spare, in proportion to how much they had.
 */
export function squeeze(
  widths: readonly number[],
  floors: readonly number[],
  target: number,
): number[] {
  const total = sum(widths);
  const out = total ? widths.map((w) => (w / total) * target) : [...widths];
  if (sum(floors) >= target) return out;
  const short = new Set<number>();
  out.forEach((width, index) => {
    if (width < (floors[index] as number)) short.add(index);
  });
  if (short.size === 0) return out;
  // Python adds over a set of indices; small sets of small ints iterate in ascending order.
  const shortIndices = [...short].sort((a, b) => a - b);
  const need = sum(shortIndices.map((i) => (floors[i] as number) - (out[i] as number)));
  const slack = sum(
    out.flatMap((width, i) => (short.has(i) ? [] : [width - (floors[i] as number)])),
  );
  if (slack <= 0) return out;
  const take = need / slack;
  return out.map((width, i) =>
    short.has(i) ? (floors[i] as number) : width - (width - (floors[i] as number)) * take,
  );
}

/**
 * The columns split into page-widths, left to right. One band when they all fit. Otherwise the
 * overflow goes onto pages of its own, with the first field column repeated at the left of each.
 */
export function bands(spec: PrintSpec, widths: readonly number[], geo: Geometry): number[][] {
  if (widths.length === 0) return [];
  const room = usableW(geo);
  if (sum(widths) <= room + 0.5) return [widths.map((_, index) => index)];
  const found = spec.columns.findIndex((column) => column.kind === FIELD);
  const anchor = found === -1 ? null : found;
  const out: number[][] = [];
  let current: number[] = [];
  let used = 0.0;
  widths.forEach((width, index) => {
    if (current.length > 0 && used + width > room) {
      out.push(current);
      current = [];
      used = 0.0;
    }
    if (
      current.length === 0 &&
      out.length > 0 &&
      anchor !== null &&
      // Strictly past it: a band starting left of the anchor reaches it on its own.
      anchor < index &&
      // Only where the name and the column it identifies both still fit.
      (widths[anchor] as number) + width <= room
    ) {
      current = [anchor];
      used = widths[anchor] as number;
    }
    current.push(index);
    used += width;
  });
  if (current.length > 0) out.push(current);
  return out;
}

/** One sheet of paper: which columns, which rows, and what it is called. */
export interface Page {
  columns: number[];
  rows: PrintRow[];
  group: string;
  band: number;
  /** The first page of a band always carries its headings, repeated or not. */
  firstOfBand: boolean;
}

/** Python's float floor division `a // b`, which is not always `Math.floor(a / b)`. */
export function pyFloorDiv(a: number, b: number): number {
  // CPython's float_floor_div: only the quotient is wanted here, not the remainder.
  const mod = a % b;
  let div = (a - mod) / b;
  if (mod && b < 0 !== mod < 0) div -= 1.0;
  if (div) {
    let floordiv = Math.floor(div);
    if (div - floordiv > 0.5) floordiv += 1.0;
    return floordiv;
  }
  return 0;
}

/**
 * Work out every page before drawing any of them. Columns are the outer loop: all the drivers under
 * the first band of columns, then all of them again under the next.
 */
export function paginate(rows: readonly PrintRow[], spec: PrintSpec, geo: Geometry): Page[] {
  const widths = columnWidths(spec, geo, rows);
  const groups = bands(spec, widths, geo);
  if (groups.length === 0 || rows.length === 0) return [];
  const room = usableH(geo) - geo.titleH - geo.headerH;
  const perPage = Math.max(1, Math.trunc(pyFloorDiv(room, geo.rowH)));
  const pages: Page[] = [];
  groups.forEach((columns, bandIndex) => {
    let first = true;
    for (const [label, chunk] of groupRows(rows, spec.groupBreak)) {
      for (let start = 0; start < chunk.length; start += perPage) {
        pages.push({
          columns,
          rows: chunk.slice(start, start + perPage),
          group: label,
          band: bandIndex,
          firstOfBand: first,
        });
        first = false;
      }
    }
  });
  return pages;
}

/** `_group_rows`: split the rows where the break column changes value. One run if it's off. */
export function groupRows(
  rows: readonly PrintRow[],
  fieldName: string,
): Array<[string, PrintRow[]]> {
  if (!fieldName) return [['', [...rows]]];
  const out: Array<[string, PrintRow[]]> = [];
  for (const row of rows) {
    const label = printRowValue(row, fieldName);
    const last = out[out.length - 1];
    if (last && last[0] === label) last[1].push(row);
    else out.push([label, [row]]);
  }
  return out;
}

/** How many sheets of paper this comes to. Takes every row and filters them itself. */
export function pageCount(rows: readonly PrintRow[], spec: PrintSpec): number {
  return paginate(specRowsFor(spec, rows), spec, geometry(spec)).length;
}

/** How many page-widths the columns need. */
export function bandCount(spec: PrintSpec, rows: readonly PrintRow[] = []): number {
  const geo = geometry(spec);
  return bands(spec, columnWidths(spec, geo, rows), geo).length;
}

// ------------------------------------------------------------------ naming

// Characters Windows will not have in a filename.
const ILLEGAL = /[<>:"/\\|?*]/g;

/** The sheet could not be written where it was asked to go. */
export class PrintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrintError';
  }
}

/** `_stem`. */
export function stem(spec: PrintSpec): string {
  return pyStrip(spec.title) || 'Load Out';
}

/** What the save dialog offers, without an extension. */
export function defaultFilename(spec: PrintSpec, dateLabel: string): string {
  return `${stem(spec)} - ${dateLabel}`.replace(ILLEGAL, '-');
}

/** The line across the top: the sheet's name, then the day. */
export function titleFor(spec: PrintSpec, dateLabel: string): string {
  return dateLabel ? `${stem(spec)}  -  ${dateLabel}` : stem(spec);
}
