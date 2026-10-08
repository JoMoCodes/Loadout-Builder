// Lifetime route counts out of the Tenured Workforce export.

/**
 * One driver's lifetime route count, stamped with the week it was read in. The
 * stamp is what lets an import land safely in any order: a count only ever
 * replaces one from an older week.
 */
export interface TenureRecord {
  routes: number;
  year: number;
  week: number;
}

/** (year, week, routes) - newer weeks win, higher counts on a tie. */
export function tenureStamp(record: TenureRecord): [number, number, number] {
  return [record.year, record.week, record.routes];
}

/** Is stamp `a` strictly newer than stamp `b`? (Tuples compared the way Python compares them.) */
export function isNewerStamp(a: TenureRecord, b: TenureRecord): boolean {
  const left = tenureStamp(a);
  const right = tenureStamp(b);
  for (let index = 0; index < left.length; index += 1) {
    const x = left[index] as number;
    const y = right[index] as number;
    if (x !== y) return x > y;
  }
  return false;
}

/** Keyed by Transporter ID, each count taken from the most recent week its file reached for that driver. */
export interface TenureBook {
  records: Map<string, TenureRecord>;
  sourceFile: string;
  importedAt: Date | null;
}

export function createTenureBook(values: Partial<TenureBook> = {}): TenureBook {
  return { records: new Map(), sourceFile: '', importedAt: null, ...values };
}

/** The driver's lifetime routes, or null where no import has said. */
export function tenureCountFor(
  book: Pick<TenureBook, 'records'>,
  transporterId: string,
): number | null {
  const record = book.records.get(transporterId);
  return record ? record.routes : null;
}

/** The latest [year, week] any of these counts was read in. */
export function newestWeek(book: Pick<TenureBook, 'records'>): [number, number] | null {
  let newest: [number, number] | null = null;
  for (const record of book.records.values()) {
    if (
      newest === null ||
      record.year > newest[0] ||
      (record.year === newest[0] && record.week > newest[1])
    ) {
      newest = [record.year, record.week];
    }
  }
  return newest;
}

/** 'Week 34, 2026', or '' where no import has landed yet. */
export function weekLabel(book: Pick<TenureBook, 'records'>): string {
  const newest = newestWeek(book);
  return newest ? `Week ${newest[1]}, ${newest[0]}` : '';
}
