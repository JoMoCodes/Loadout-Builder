import type { ComponentType } from 'react';
import { PAGE_IDS, PAGE_LABELS, currentTarget } from '../../shared/windows';
import type { WindowTarget } from '../../shared/windows';
import { AssociatesPage } from './AssociatesPage';
import { DashboardPage } from './DashboardPage';
import { FeaturesLogPage } from './FeaturesLogPage';
import { HomePage } from './HomePage';
import { HowToUsePage } from './HowToUsePage';
import { LoadOutPage } from './LoadOutPage';
import { RouteSheetsPage } from './RouteSheetsPage';
import { ScorecardsPage } from './ScorecardsPage';
import { SettingsPage } from './SettingsPage';
import { VehicleDataPage } from './VehicleDataPage';
import type { PageId, PageProps } from './types';

export interface PageEntry {
  id: PageId;
  /** The words in the left menu. */
  label: string;
  component: ComponentType<PageProps>;
}

/** The pages, in the order the left menu shows them. */
const COMPONENTS: Record<PageId, ComponentType<PageProps>> = {
  home: HomePage,
  dashboard: DashboardPage,
  'load-out': LoadOutPage,
  'route-sheets': RouteSheetsPage,
  'vehicle-data': VehicleDataPage,
  associates: AssociatesPage,
  scorecards: ScorecardsPage,
  'how-to-use': HowToUsePage,
  'features-log': FeaturesLogPage,
  settings: SettingsPage,
};

export const PAGES: readonly PageEntry[] = PAGE_IDS.map((id) => ({
  id,
  label: PAGE_LABELS[id],
  component: COMPONENTS[id],
}));

export const DEFAULT_PAGE: PageId = 'home';

/**
 * Where a remembered page name leads: the page itself, the new place when the name is from
 * before a page was renamed or folded into another page's tab (Previous Roster is now a tab on
 * Load Out), or the home page if it is not one.
 */
export function rememberedPlace(value: string | null): WindowTarget {
  return currentTarget(value) ?? { page: DEFAULT_PAGE };
}

/** Turns a remembered text into a page id, or the home page if it is not one. */
export function pageIdFrom(value: string | null): PageId {
  return rememberedPlace(value).page;
}
