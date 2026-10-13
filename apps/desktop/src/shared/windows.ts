// The pages and tabs a window can open on. The main window shows every page behind its left
// menu; a page-only window (right-click a page or a tab, then "Open in new window") shows one
// page, with its tabs, and nothing else. Both sides read this file: the main process to make
// and title the window, the page to know what it was opened on.
//
// A page-only window is told what to show through its address: `?page=load-out&tab=roster`.

import { ROUTE_KINDS } from './channels/routeData';

export const PAGE_IDS = [
  'home',
  'dashboard',
  'load-out',
  'route-sheets',
  'route-data',
  'vehicle-data',
  'associates',
  'performance',
  'previous-roster',
  'how-to-use',
  'features-log',
  'settings',
] as const;

export type PageId = (typeof PAGE_IDS)[number];

/** The words in the left menu, and in a page-only window's title. */
export const PAGE_LABELS: Record<PageId, string> = {
  home: 'Home',
  dashboard: 'Dashboard',
  'load-out': 'Load Out',
  'route-sheets': 'Route Sheets',
  'route-data': 'Route Data',
  'vehicle-data': 'Vehicle Data',
  associates: 'Associates',
  performance: 'Performance',
  'previous-roster': 'Previous Roster',
  'how-to-use': 'How to use',
  'features-log': 'Features log',
  settings: 'Settings',
};

export interface TabItem {
  id: string;
  label: string;
}

const ROUTE_LABELS: Record<(typeof ROUTE_KINDS)[number], string> = {
  routes: 'Routes',
  itineraries: 'Itineraries',
  schedule: 'Weekly Schedule',
};

export const LOAD_OUT_TABS = [
  { id: 'roster', label: 'Roster' },
  { id: 'print', label: 'Print' },
  { id: 'available-vans', label: 'Available Vans' },
  { id: 'previous-roster', label: 'Previous Roster' },
] as const satisfies readonly TabItem[];

export type LoadOutTab = (typeof LOAD_OUT_TABS)[number]['id'];

/** The tabs of each page, in the order the page shows them. A page with no tabs has none. */
export const PAGE_TABS: Record<PageId, readonly TabItem[]> = {
  home: [],
  dashboard: [],
  'load-out': LOAD_OUT_TABS,
  'route-sheets': [
    { id: 'distribute', label: 'Distribute' },
    { id: 'sheets', label: 'Sheets' },
    { id: 'history', label: 'History' },
  ],
  'route-data': [
    ...ROUTE_KINDS.map((kind) => ({ id: kind, label: ROUTE_LABELS[kind] })),
    { id: 'dwp', label: 'DWP' },
  ],
  'vehicle-data': [
    { id: 'management', label: 'Vehicle Management' },
    { id: 'affinity', label: 'Van Affinity' },
    { id: 'lmr', label: 'LMR Approved Drivers' },
  ],
  associates: [
    { id: 'associates', label: 'Associates' },
    { id: 'lifetime-routes', label: 'Lifetime Routes' },
  ],
  performance: [
    { id: 'drivers', label: 'Drivers' },
    { id: 'reports', label: 'Reports' },
    { id: 'directory', label: 'Directory' },
    { id: 'imports', label: 'Imports' },
  ],
  'previous-roster': [],
  'how-to-use': [],
  'features-log': [],
  settings: [],
};

/** What a window opens on: a page, and (for a page with tabs) the tab. */
export interface WindowTarget {
  page: PageId;
  tab?: string;
}

export function isPageId(value: unknown): value is PageId {
  return typeof value === 'string' && (PAGE_IDS as readonly string[]).includes(value);
}

/** Is this one of the page's tabs? */
export function isTabOf(page: PageId, tab: unknown): tab is string {
  return typeof tab === 'string' && PAGE_TABS[page].some((item) => item.id === tab);
}

/** A page with a tab that is not one of its tabs is not a place a window can open on. */
export function isWindowTarget(value: unknown): value is WindowTarget {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { page, tab } = value as { page?: unknown; tab?: unknown };
  if (!isPageId(page)) return false;
  return tab === undefined || isTabOf(page, tab);
}

/** The window's title: "Load Out · Available Vans", or just "Settings" for a page with no tabs. */
export function windowTitle(target: WindowTarget): string {
  const page = PAGE_LABELS[target.page];
  const tab = PAGE_TABS[target.page].find((item) => item.id === target.tab);
  return tab ? `${page} · ${tab.label}` : page;
}

/** The address part that tells a page-only window what to show: `{ page, tab }` for the query. */
export function windowQuery(target: WindowTarget): Record<string, string> {
  return target.tab ? { page: target.page, tab: target.tab } : { page: target.page };
}

/**
 * Reads what a window was opened on from its address (`?page=load-out&tab=roster`). Null for the
 * main window, which has no page in its address, and for anything that is not a page or a tab.
 */
export function parseWindowTarget(search: string): WindowTarget | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  const page = params.get('page');
  if (!isPageId(page)) return null;
  const tab = params.get('tab');
  if (tab === null || tab === '') return { page };
  return isTabOf(page, tab) ? { page, tab } : { page };
}

/** Two targets name the same window when they are the same page and the same tab. */
export function sameTarget(a: WindowTarget, b: WindowTarget): boolean {
  return a.page === b.page && (a.tab ?? null) === (b.tab ?? null);
}
