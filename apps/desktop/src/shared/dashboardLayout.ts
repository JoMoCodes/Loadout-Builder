// How the Dashboard is laid out, and the rules for what a layout may hold. A layout is an ordered
// list of sections (the tiles, the lists, the charts, the watch list and the person's own tiles),
// each with a width, a height and its own choices. The app remembers several named layouts and
// which one is in use; they live in the app's one settings file, under `dashboard`.
//
// Everything here is plain data and plain functions, used by the page (which shows and changes a
// layout) and the main process (which checks it before saving). A layout holds no driver: the
// watch list's people are kept beside the layouts, so a layout saved to a file names nobody.

// ------------------------------------------------------------------------------ the pieces

/** Every kind of section. All but `custom` can be on a layout once. */
export const SECTION_KINDS = [
  'tile-fleet',
  'tile-tiers',
  'tile-packages',
  'tile-safety',
  'coaching',
  'ids',
  'improved',
  'declined',
  'trend',
  'reasons',
  'watch',
  'custom',
] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

/** The name each kind goes by on the page. */
export const SECTION_NAMES: Record<SectionKind, string> = {
  'tile-fleet': 'Fleet average score',
  'tile-tiers': 'Tiers',
  'tile-packages': 'Packages delivered',
  'tile-safety': 'Drivers with safety events',
  coaching: 'Who needs a word',
  ids: 'ID expiry',
  improved: 'Most improved',
  declined: 'Most declined',
  trend: 'Fleet average by week',
  reasons: 'Failure reasons',
  watch: 'Watch list',
  custom: 'Your own tile',
};

/** How wide a section is, in twelfths of the page. */
export const WIDTHS = [3, 4, 6, 8, 12] as const;
export type SectionWidth = (typeof WIDTHS)[number];
export const WIDTH_NAMES: Record<SectionWidth, string> = {
  3: 'Small',
  4: 'Medium',
  6: 'Half',
  8: 'Wide',
  12: 'Full',
};

/** How tall a section is. "fit" is as tall as what is in it. */
export const HEIGHTS = ['fit', 'short', 'medium', 'tall'] as const;
export type SectionHeight = (typeof HEIGHTS)[number];
export const HEIGHT_NAMES: Record<SectionHeight, string> = {
  fit: 'Fit',
  short: 'Short',
  medium: 'Medium',
  tall: 'Tall',
};
/** The fixed heights, in rem. */
export const HEIGHT_REM: Record<Exclude<SectionHeight, 'fit'>, number> = {
  short: 12,
  medium: 19,
  tall: 28,
};

/** Why a driver is on "Who needs a word". */
export const REASON_KINDS = ['bronze', 'dropped', 'falling', 'repeating'] as const;
export type ReasonKind = (typeof REASON_KINDS)[number];
export const REASON_NAMES: Record<ReasonKind, string> = {
  bronze: 'In Bronze',
  dropped: 'Dropped a tier',
  falling: 'Score falling week after week',
  repeating: 'The same problem week after week',
};

/** Where a failure reason comes from. */
export const FAILURE_SOURCES = ['POD', 'CDF', 'DSB', 'PSB'] as const;
export type FailureSource = (typeof FAILURE_SOURCES)[number];

/**
 * The twelve scorecard metrics, by the names they are saved under. The same list as the
 * performance package's METRIC_DEFINITIONS (a test keeps them equal; the pages must not load
 * that package).
 */
export const SCORECARD_METRICS = [
  'FICO',
  'Speeding Event Rate',
  'Seatbelt-Off Rate',
  'Distractions Rate',
  'Sign/Signal Violations Rate',
  'Following Distance Rate',
  'CDF DPMO',
  'CED',
  'DCR',
  'DSB',
  'POD',
  'PSB',
] as const;

/** A number a person can build a tile from: its id, its name, and how it is written. */
export interface CustomNumber {
  id: string;
  label: string;
  /** "each driver's ..." in an explanation. */
  each: string;
  /** Decimals when it is shown as an average. A total or a count is a whole number. */
  decimals: number;
  /** A score from 0 to 100 (drawn on the score axis). */
  isScore: boolean;
}

export const CUSTOM_NUMBERS: readonly CustomNumber[] = [
  { id: 'overall', label: 'Overall Score', each: 'Overall Score', decimals: 1, isScore: true },
  {
    id: 'packages',
    label: 'Packages delivered',
    each: 'packages delivered',
    decimals: 0,
    isScore: false,
  },
  ...SCORECARD_METRICS.map((metric) => ({
    id: `metric:${metric}`,
    label: `${metric} score`,
    each: `${metric} score`,
    decimals: 1,
    isScore: true,
  })),
  ...FAILURE_SOURCES.map((source) => ({
    id: `fail:${source}`,
    label: `${source} failures`,
    each: `${source} failures`,
    decimals: 1,
    isScore: false,
  })),
];

export function customNumber(id: string | undefined): CustomNumber {
  return CUSTOM_NUMBERS.find((one) => one.id === id) ?? CUSTOM_NUMBERS[0]!;
}

/** What a person's own tile does with the number. */
export const CUSTOM_HOWS = ['average', 'total', 'below', 'above'] as const;
export type CustomHow = (typeof CUSTOM_HOWS)[number];
export const CUSTOM_HOW_NAMES: Record<CustomHow, string> = {
  average: 'The average across the drivers',
  total: 'The total for all drivers',
  below: 'How many drivers are below a number',
  above: 'How many drivers are above a number',
};

/** A target: the number should be at least (`min`) or at most (`max`) this. */
export interface Target {
  dir: 'min' | 'max';
  value: number;
}

/** The kinds whose one big number can have a target. */
export const TARGET_KINDS: readonly SectionKind[] = [
  'tile-fleet',
  'tile-packages',
  'tile-safety',
  'custom',
];

/** One section on a layout. The choices that do not belong to its kind are left out. */
export interface DashboardSection {
  /** Its own name on the layout: the kind for a built-in, "custom-..." for a person's tile. */
  id: string;
  kind: SectionKind;
  width: SectionWidth;
  height: SectionHeight;
  /** Lists: how many lines show before "Show all". */
  showFirst?: number;
  /** Who needs a word: the reasons that put a driver on the list. */
  reasons?: ReasonKind[];
  /** Who needs a word: only the High ones. */
  highOnly?: boolean;
  /** ID expiry: only the expired ones. */
  expiredOnly?: boolean;
  /** Failure reasons: the sources drawn. */
  sources?: FailureSource[];
  /** Tiles with one big number: the target, or null for none. */
  target?: Target | null;
  /** A person's own tile: its name ("" uses the number's own name). */
  title?: string;
  /** A person's own tile: which number (CUSTOM_NUMBERS). */
  number?: string;
  how?: CustomHow;
  /** A person's own tile: the number drivers are counted below or above. */
  limit?: number;
  /** A person's own tile: a big number with a small line, or a chart by week. */
  show?: 'number' | 'chart';
}

/** The quick picks a layout can remember (the same ids as the week bar's). */
export const WEEK_PICKS = ['last-1', 'last-4', 'last-8', 'last-13', 'all'] as const;
export type WeekPick = (typeof WEEK_PICKS)[number];

/**
 * A layout's weeks. Not `own`: the weeks the Scorecards page shows too. `own`: this layout's
 * weeks, either a quick pick (which moves along as new weeks come in) or two weeks by hand.
 */
export interface LayoutWeeks {
  own: boolean;
  pick: WeekPick | null;
  from: string | null;
  to: string | null;
}

export interface DashboardLayout {
  id: string;
  name: string;
  sections: DashboardSection[];
  weeks: LayoutWeeks;
}

export interface DashboardSettings {
  layouts: DashboardLayout[];
  /** The id of the layout in use. */
  active: string;
  /** The watch list's drivers, by Transporter ID. Shared by every layout. */
  watch: string[];
}

export const MAX_LAYOUTS = 12;
export const MAX_SECTIONS = 40;
export const MAX_CUSTOM = 16;
export const MAX_WATCH = 60;
export const NAME_MAX = 40;
export const SHOW_FIRST_MIN = 1;
export const SHOW_FIRST_MAX = 50;
export const SHOW_FIRST_DEFAULT = 8;

// ------------------------------------------------------------------------------ defaults

/** A fresh section of a kind, with that kind's usual size and choices. */
export function newSection(kind: SectionKind, id: string = kind): DashboardSection {
  const base = { id, kind, height: 'fit' as SectionHeight };
  switch (kind) {
    case 'tile-fleet':
    case 'tile-packages':
    case 'tile-safety':
      return { ...base, width: 3, target: null };
    case 'tile-tiers':
      return { ...base, width: 3 };
    case 'coaching':
      return {
        ...base,
        width: 8,
        showFirst: SHOW_FIRST_DEFAULT,
        reasons: [...REASON_KINDS],
        highOnly: false,
      };
    case 'ids':
      return { ...base, width: 4, showFirst: SHOW_FIRST_DEFAULT, expiredOnly: false };
    case 'improved':
    case 'declined':
      return { ...base, width: 6 };
    case 'trend':
      return { ...base, width: 8 };
    case 'reasons':
      return { ...base, width: 4, showFirst: SHOW_FIRST_DEFAULT, sources: [...FAILURE_SOURCES] };
    case 'watch':
      return { ...base, width: 4, showFirst: SHOW_FIRST_DEFAULT };
    case 'custom':
      return {
        ...base,
        width: 3,
        title: '',
        number: 'overall',
        how: 'average',
        limit: 0,
        show: 'number',
        target: null,
      };
  }
}

const SHARED_WEEKS: LayoutWeeks = { own: false, pick: null, from: null, to: null };

/** The usual sections: four tiles, who needs a word beside ID expiry, the movers, the trend. */
export function usualSections(): DashboardSection[] {
  return (
    [
      'tile-fleet',
      'tile-tiers',
      'tile-packages',
      'tile-safety',
      'coaching',
      'ids',
      'improved',
      'declined',
      'trend',
      'reasons',
    ] as const
  ).map((kind) => newSection(kind));
}

export const USUAL_ID = 'usual';

export function usualLayout(): DashboardLayout {
  return {
    id: USUAL_ID,
    name: 'The usual',
    sections: usualSections(),
    weeks: { ...SHARED_WEEKS },
  };
}

/** A ready-made layout to start a new one from. */
export interface LayoutPreset {
  id: string;
  name: string;
  about: string;
  sections(): DashboardSection[];
  weeks: LayoutWeeks;
}

function sized(
  kind: SectionKind,
  width: SectionWidth,
  more: Partial<DashboardSection> = {},
): DashboardSection {
  return { ...newSection(kind), width, ...more };
}

export const LAYOUT_PRESETS: readonly LayoutPreset[] = [
  {
    id: 'usual',
    name: 'The usual',
    about: 'The tiles, who needs a word, ID expiry, the movers and the trend.',
    sections: usualSections,
    weeks: { ...SHARED_WEEKS },
  },
  {
    id: 'people',
    name: 'People first',
    about: 'Who needs a word and the watch list at the top. The numbers come after.',
    sections: () => [
      sized('coaching', 8),
      sized('watch', 4),
      sized('ids', 4),
      sized('improved', 4),
      sized('declined', 4),
      sized('tile-fleet', 3),
      sized('tile-tiers', 3),
      sized('tile-packages', 3),
      sized('tile-safety', 3),
    ],
    weeks: { ...SHARED_WEEKS },
  },
  {
    id: 'numbers',
    name: 'Numbers and charts',
    about: 'The tiles, the trend and the failure reasons. No lists of drivers.',
    sections: () => [
      sized('tile-fleet', 3),
      sized('tile-tiers', 3),
      sized('tile-packages', 3),
      sized('tile-safety', 3),
      sized('trend', 12),
      sized('reasons', 12),
    ],
    weeks: { own: true, pick: 'last-13', from: null, to: null },
  },
  {
    id: 'monday',
    name: 'Monday morning',
    about: 'Last week only: the average, the tiers, the High drivers and the expired IDs.',
    sections: () => [
      sized('tile-fleet', 6),
      sized('tile-tiers', 6),
      sized('coaching', 8, { highOnly: true }),
      sized('ids', 4, { expiredOnly: true }),
    ],
    weeks: { own: true, pick: 'last-1', from: null, to: null },
  },
];

export const DEFAULT_DASHBOARD: DashboardSettings = {
  layouts: [usualLayout()],
  active: USUAL_ID,
  watch: [],
};

// ------------------------------------------------------------------------------ checking

const ID_SHAPE = /^[a-z0-9-]{1,40}$/;
const WEEK = /^\d{4}-W\d{2}$/;
const TRANSPORTER_ID = /^[A-Za-z0-9]{1,20}$/;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function oneOf<const T extends readonly (string | number)[]>(
  options: T,
  value: unknown,
): T[number] | undefined {
  return (options as readonly unknown[]).includes(value) ? (value as T[number]) : undefined;
}

/** The members of `options` that are in `value`, in the usual order, or undefined if not a list. */
function someOf<const T extends readonly string[]>(
  options: T,
  value: unknown,
): T[number][] | undefined {
  if (!Array.isArray(value)) return undefined;
  return options.filter((option) => value.includes(option));
}

/** A name with the odd characters and the spare spaces taken out, or "" when nothing is left. */
export function cleanName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

function cleanTarget(value: unknown): Target | null {
  const input = record(value);
  if (!input) return null;
  const dir = oneOf(['min', 'max'] as const, input.dir);
  const n = input.value;
  if (!dir || typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1e9) return null;
  return { dir, value: n };
}

/** One section, checked: a full section with its kind's choices, or null when it makes no sense. */
export function cleanSection(raw: unknown): DashboardSection | null {
  const input = record(raw);
  if (!input) return null;
  const kind = oneOf(SECTION_KINDS, input.kind);
  if (!kind) return null;
  const id = kind === 'custom' ? input.id : kind;
  if (typeof id !== 'string' || !ID_SHAPE.test(id)) return null;
  if (kind === 'custom' && !id.startsWith('custom-')) return null;
  const section = newSection(kind, id);
  section.width = oneOf(WIDTHS, input.width) ?? section.width;
  section.height = oneOf(HEIGHTS, input.height) ?? section.height;
  if (section.showFirst !== undefined) {
    const n = input.showFirst;
    if (
      typeof n === 'number' &&
      Number.isInteger(n) &&
      n >= SHOW_FIRST_MIN &&
      n <= SHOW_FIRST_MAX
    ) {
      section.showFirst = n;
    }
  }
  if (kind === 'coaching') {
    section.reasons = someOf(REASON_KINDS, input.reasons) ?? section.reasons;
    section.highOnly = input.highOnly === true;
  }
  if (kind === 'ids') section.expiredOnly = input.expiredOnly === true;
  if (kind === 'reasons') {
    section.sources = someOf(FAILURE_SOURCES, input.sources) ?? section.sources;
  }
  if (TARGET_KINDS.includes(kind)) section.target = cleanTarget(input.target);
  if (kind === 'custom') {
    section.title = cleanName(input.title);
    if (CUSTOM_NUMBERS.some((one) => one.id === input.number)) {
      section.number = input.number as string;
    }
    section.how = oneOf(CUSTOM_HOWS, input.how) ?? section.how;
    const limit = input.limit;
    if (typeof limit === 'number' && Number.isFinite(limit) && Math.abs(limit) <= 1e9) {
      section.limit = limit;
    }
    section.show = oneOf(['number', 'chart'] as const, input.show) ?? section.show;
  }
  return section;
}

export function cleanWeeks(raw: unknown): LayoutWeeks {
  const input = record(raw);
  if (!input || input.own !== true) return { ...SHARED_WEEKS };
  const pick = oneOf(WEEK_PICKS, input.pick) ?? null;
  const week = (value: unknown) => (typeof value === 'string' && WEEK.test(value) ? value : null);
  const from = pick ? null : week(input.from);
  const to = pick ? null : week(input.to);
  // Its own weeks with nothing said is every week.
  return { own: true, pick: pick ?? (from === null && to === null ? 'all' : null), from, to };
}

/**
 * One layout, checked. Sections that make no sense are dropped, as is a second copy of a
 * built-in; a layout with no name or no usable id is refused (null).
 */
export function cleanLayout(raw: unknown): DashboardLayout | null {
  const input = record(raw);
  if (!input) return null;
  const name = cleanName(input.name);
  if (typeof input.id !== 'string' || !ID_SHAPE.test(input.id) || name === '') return null;
  const sections: DashboardSection[] = [];
  let custom = 0;
  if (Array.isArray(input.sections)) {
    for (const one of input.sections.slice(0, 200)) {
      const section = cleanSection(one);
      if (!section || sections.some((had) => had.id === section.id)) continue;
      if (section.kind === 'custom' && ++custom > MAX_CUSTOM) continue;
      if (sections.length < MAX_SECTIONS) sections.push(section);
    }
  }
  return { id: input.id, name, sections, weeks: cleanWeeks(input.weeks) };
}

/** Keeps only the valid parts of a dashboard patch, merged onto `current`. */
export function mergeDashboard(
  current: DashboardSettings | undefined,
  raw: unknown,
): DashboardSettings {
  const base = current ?? DEFAULT_DASHBOARD;
  const next: DashboardSettings = {
    layouts: base.layouts,
    active: base.active,
    watch: base.watch,
  };
  const input = record(raw);
  if (input) {
    if (Array.isArray(input.layouts) && input.layouts.length <= MAX_LAYOUTS) {
      const layouts: DashboardLayout[] = [];
      for (const one of input.layouts) {
        const layout = cleanLayout(one);
        if (layout && !layouts.some((had) => had.id === layout.id)) layouts.push(layout);
      }
      // A list with a layout that could not be read is refused whole, rather than losing one.
      if (layouts.length === input.layouts.length && layouts.length > 0) next.layouts = layouts;
    }
    if (typeof input.active === 'string') next.active = input.active;
    if (Array.isArray(input.watch) && input.watch.length <= MAX_WATCH) {
      const ids = input.watch.filter(
        (id): id is string => typeof id === 'string' && TRANSPORTER_ID.test(id),
      );
      if (ids.length === input.watch.length) next.watch = [...new Set(ids)];
    }
  }
  // The layout in use is always one of the layouts.
  if (!next.layouts.some((layout) => layout.id === next.active)) {
    next.active = next.layouts[0]!.id;
  }
  return next;
}

// ------------------------------------------------------------------------------ changing

/** The layout in use (the first one if the remembered one is gone). */
export function activeLayout(dashboard: DashboardSettings): DashboardLayout {
  return (
    dashboard.layouts.find((layout) => layout.id === dashboard.active) ?? dashboard.layouts[0]!
  );
}

/** The layouts with one of them swapped for a changed copy. */
export function withLayout(layouts: readonly DashboardLayout[], changed: DashboardLayout) {
  return layouts.map((layout) => (layout.id === changed.id ? changed : layout));
}

export function withSections(
  layout: DashboardLayout,
  sections: DashboardSection[],
): DashboardLayout {
  return { ...layout, sections };
}

/** The section moved to just before (or after) another. Unknown ids change nothing. */
export function moveSection(
  sections: readonly DashboardSection[],
  id: string,
  targetId: string,
  after: boolean,
): DashboardSection[] {
  const moving = sections.find((section) => section.id === id);
  if (!moving || id === targetId || !sections.some((section) => section.id === targetId)) {
    return [...sections];
  }
  const rest = sections.filter((section) => section.id !== id);
  const at = rest.findIndex((section) => section.id === targetId) + (after ? 1 : 0);
  return [...rest.slice(0, at), moving, ...rest.slice(at)];
}

/** The section moved one place earlier (-1) or later (1). */
export function stepSection(
  sections: readonly DashboardSection[],
  id: string,
  direction: 1 | -1,
): DashboardSection[] {
  const from = sections.findIndex((section) => section.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= sections.length) return [...sections];
  const next = [...sections];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

export function changeSection(
  sections: readonly DashboardSection[],
  id: string,
  change: Partial<DashboardSection>,
): DashboardSection[] {
  return sections.map((section) => (section.id === id ? { ...section, ...change } : section));
}

export function removeSection(
  sections: readonly DashboardSection[],
  id: string,
): DashboardSection[] {
  return sections.filter((section) => section.id !== id);
}

/** The built-in kinds that are not on the layout (so they can be added). */
export function missingKinds(sections: readonly DashboardSection[]): SectionKind[] {
  return SECTION_KINDS.filter(
    (kind) => kind !== 'custom' && !sections.some((section) => section.kind === kind),
  );
}

export function customCount(sections: readonly DashboardSection[]): number {
  return sections.filter((section) => section.kind === 'custom').length;
}

/** An id nothing in `taken` has: "custom-1", "layout-2", ... */
export function freshId(prefix: string, taken: readonly string[]): string {
  for (let n = 1; ; n++) {
    const id = `${prefix}-${n}`;
    if (!taken.includes(id)) return id;
  }
}

/** A name no layout has yet: "Monday", then "Monday 2", "Monday 3". */
export function freshName(wanted: string, layouts: readonly DashboardLayout[]): string {
  const base = cleanName(wanted) || 'My layout';
  const taken = new Set(layouts.map((layout) => layout.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const tail = ` ${n}`;
    const name = base.slice(0, NAME_MAX - tail.length) + tail;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

/** The widest named width that is no wider than `columns` twelfths (at least Small). */
export function nearestWidth(columns: number): SectionWidth {
  let best: SectionWidth = WIDTHS[0];
  for (const width of WIDTHS) {
    if (Math.abs(width - columns) < Math.abs(best - columns)) best = width;
  }
  return best;
}

/** The width a section takes when the page is too narrow for twelve columns: half or all of it. */
export function narrowWidth(width: SectionWidth): 6 | 12 {
  return width <= 4 ? 6 : 12;
}

// ------------------------------------------------------------------------------ files

const FILE_APP = 'loadout-builder';
const FILE_KIND = 'dashboard-layout';

/** A layout as the text of a file. It names no driver and no place on the computer. */
export function layoutToFile(layout: DashboardLayout): string {
  return JSON.stringify(
    {
      app: FILE_APP,
      kind: FILE_KIND,
      version: 1,
      layout: { name: layout.name, sections: layout.sections, weeks: layout.weeks },
    },
    null,
    2,
  );
}

/** The longest layout file the app reads (a real one is a few thousand characters). */
export const LAYOUT_FILE_MAX = 200_000;

/**
 * Reads a layout file's text. The layout comes back checked, with a new id and a name no other
 * layout has. Null when the text is not one of this app's layout files.
 */
export function layoutFromFile(
  text: string,
  layouts: readonly DashboardLayout[],
): DashboardLayout | null {
  if (text.length > LAYOUT_FILE_MAX) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const file = record(parsed);
  if (!file || file.app !== FILE_APP || file.kind !== FILE_KIND) return null;
  const inner = record(file.layout);
  if (!inner) return null;
  const id = freshId(
    'layout',
    layouts.map((layout) => layout.id),
  );
  const layout = cleanLayout({ ...inner, id, name: cleanName(inner.name) || 'My layout' });
  if (!layout || layout.sections.length === 0) return null;
  return { ...layout, name: freshName(layout.name, layouts) };
}

/** A safe file name for a layout: "Monday morning" -> "dashboard-monday-morning.json". */
export function layoutFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `dashboard-${slug || 'layout'}.json`;
}
