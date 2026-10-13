// Reading the text of one route sheet page: lines, headings, columns and table rows.
// A port of the old Route Sheet Distributor's page reader; the rules are the same.

import type { PdfTextItem } from '../types';

/** One visual line of text: its top edge and the runs on it, left to right. */
export interface TextLine {
  y: number;
  items: PdfTextItem[];
}

/** A heading such as "24 bags": the count, and where the heading's first run sits. */
export interface Heading {
  count: number;
  x: number;
  y: number;
  str: string;
}

/** Where each table column sits: its left edge and its right edge. */
export interface TableColumns {
  y: number;
  cols: Record<string, { left: number; right: number }>;
}

/** One table row as read: the "#" number and the named cells. */
export interface ReadRow {
  index: number;
  sortZone: string;
  bag: string;
  packages: number;
}

const INT_RE = /^\d+$/;

/** Groups positioned text items into visual lines (top-to-bottom, left-to-right). */
export function groupLines(items: PdfTextItem[], tolerance = 3): TextLine[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: TextLine[] = [];
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= tolerance);
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  return lines.sort((a, b) => a.y - b.y);
}

/**
 * Finds a heading such as "24 bags" / "37 overflow" that may be one run or several on a line.
 * Returns the count plus the position of the heading's first run, or null.
 */
export function findHeading(lines: TextLine[], re: RegExp): Heading | null {
  for (const l of lines) {
    for (let i = 0; i < l.items.length; i++) {
      // Try the run on its own, then joined with the runs that follow it on the same line.
      let text = '';
      for (let j = i; j < l.items.length && j < i + 3; j++) {
        const run = l.items[j];
        const first = l.items[i];
        if (!run || !first) continue;
        text = text ? `${text} ${run.str}` : run.str;
        const m = text.match(re);
        if (m) return { count: Number(m[1]), x: first.x, y: first.y, str: text };
      }
    }
  }
  return null;
}

/**
 * Finds the column heading line and returns each column's left edge / right edge.
 * Headings like "Bag" and "Pkgs" are right-aligned, "Sort Zone" is left-aligned.
 */
export function findColumns(lines: TextLine[], names: string[]): TableColumns | null {
  for (const l of lines) {
    const text = l.items.map((i) => i.str).join(' ');
    if (!names.every((n) => text.includes(n))) continue;
    const cols: Record<string, { left: number; right: number }> = {};
    for (const n of names) {
      // Headings may be one item ("Sort Zone") or split into words.
      const words = n.split(' ');
      const first = words[0] ?? '';
      const last = words[words.length - 1] ?? '';
      const a = l.items.find((i) => i.str === n || i.str.startsWith(first));
      const b = [...l.items].reverse().find((i) => i.str === n || i.str.endsWith(last));
      if (!a || !b) return null;
      cols[n] = { left: a.x, right: b.x + (b.width || 0) };
    }
    return { y: l.y, cols };
  }
  return null;
}

/**
 * Reads one table row: "#" then the named columns. Returns null if the line is not a data row.
 * `keys` name the cells in the same order as the table's columns.
 */
export function readRow(
  items: PdfTextItem[],
  header: TableColumns | null,
  keys: string[],
): ReadRow | null {
  const firstItem = items[0];
  if (!firstItem || !INT_RE.test(firstItem.str)) return null;
  if (header && firstItem.y <= header.y) return null;
  const index = Number(firstItem.str);
  const rest = items.slice(1);
  const cells: Record<string, string> = {};
  const names = header ? Object.keys(header.cols) : null;

  if (header && names && rest.every((i) => typeof i.width === 'number')) {
    const parts: Record<string, string[]> = {};
    for (const k of keys) parts[k] = [];
    for (const it of rest) {
      // Pick the column whose alignment edge is closest to this item.
      let best = -1;
      let bestDist = Infinity;
      names.forEach((n, ci) => {
        const c = header.cols[n];
        if (!c) return;
        const leftAligned = n === 'Sort Zone';
        const d = leftAligned
          ? Math.abs(it.x - c.left)
          : Math.abs(it.x + (it.width ?? 0) - c.right);
        if (d < bestDist) {
          bestDist = d;
          best = ci;
        }
      });
      const key = keys[best];
      if (key !== undefined) parts[key]?.push(it.str);
    }
    for (const k of keys) cells[k] = (parts[k] ?? []).join(' ');
  } else {
    // No positional info: fall back to reading left-to-right.
    if (rest.length < keys.length) return null;
    const last = rest[rest.length - 1];
    const lastKey = keys[keys.length - 1];
    if (!last || lastKey === undefined) return null;
    cells[lastKey] = last.str;
    if (keys.length === 3) {
      cells[keys[0] ?? ''] = rest[0]?.str ?? '';
      cells[keys[1] ?? ''] = rest
        .slice(1, -1)
        .map((i) => i.str)
        .join(' ');
    } else {
      cells[keys[0] ?? ''] = rest
        .slice(0, -1)
        .map((i) => i.str)
        .join(' ');
    }
  }
  const packages = cells['packages'] ?? '';
  if (!INT_RE.test(packages)) return null;
  return {
    index,
    sortZone: cells['sortZone'] ?? '',
    bag: cells['bag'] ?? '',
    packages: Number(packages),
  };
}
