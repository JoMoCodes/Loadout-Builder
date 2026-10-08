// Bringing over the old app's saved data: the shapes shared by the main process and the page,
// and the plain words for what was brought over.

/** What the app knows about the old app's data right now. */
export interface OldDataFind {
  /** The old app's file is in its usual place on this computer. */
  found: boolean;
  /** This app has no saved data yet, so nothing can be overwritten. */
  empty: boolean;
  /** Demo mode is on, so the real saved data is not in use. */
  demo: boolean;
}

export interface OldDataCount {
  /** The name of the table in the saved data. Only used to find the words for it. */
  table: string;
  /** How many rows ended up in this app. */
  imported: number;
}

export interface OldDataResult {
  /** "skipped" means this app already had saved data, so nothing was brought over. */
  status: 'imported' | 'skipped';
  counts: OldDataCount[];
}

/** Where the data comes from: the old app's usual place, or a file the person chose. */
export const OLD_DATA_SOURCES = ['usual', 'chosen'] as const;
export type OldDataSource = (typeof OLD_DATA_SOURCES)[number];

// How each kind of saved row is named to a person. Tables that only hold bookkeeping (when a
// file was read, the order of columns) are left out on purpose: they are not "things".
const WORDS: Record<string, readonly [one: string, many: string]> = {
  associates: ['driver', 'drivers'],
  vehicles: ['van', 'vans'],
  driver_links: ['link', 'links'],
  driver_rows: ['roster line', 'roster lines'],
  previous_driver_rows: ['line from the previous roster', 'lines from the previous roster'],
  route_entries: ['route line', 'route lines'],
  dwp_rows: ['DWP line', 'DWP lines'],
  pad_assignments: ['PAD assignment', 'PAD assignments'],
  vehicle_priorities: ['van priority', 'van priorities'],
  vehicle_overrides: ['van override', 'van overrides'],
  lmr_approved: ['approved LMR van', 'approved LMR vans'],
  lifetime_routes: ['lifetime route count', 'lifetime route counts'],
  associate_tenure: ['tenure count', 'tenure counts'],
  van_affinity: ['favourite van', 'favourite vans'],
  print_layouts: ['saved print layout', 'saved print layouts'],
};

/** "76 drivers", "1 van": one phrase per kind of thing that came over, none for zero. */
export function describeCounts(counts: readonly OldDataCount[]): string[] {
  const byTable = new Map(counts.map((count) => [count.table, count.imported]));
  const phrases: string[] = [];
  // In the order of WORDS, so the drivers and vans come first.
  for (const [table, words] of Object.entries(WORDS)) {
    const imported = byTable.get(table) ?? 0;
    if (imported > 0) phrases.push(`${imported} ${imported === 1 ? words[0] : words[1]}`);
  }
  return phrases;
}

/** "a, b and c". */
export function joinWords(phrases: readonly string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? '';
  return `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;
}
