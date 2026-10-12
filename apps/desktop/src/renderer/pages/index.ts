import type { ComponentType } from 'react';
import { PAGE_IDS, PAGE_LABELS } from '../../shared/windows';
import { AssociatesPage } from './AssociatesPage';
import { DashboardPage } from './DashboardPage';
import { FeaturesLogPage } from './FeaturesLogPage';
import { HomePage } from './HomePage';
import { HowToUsePage } from './HowToUsePage';
import { LoadOutPage } from './LoadOutPage';
import { PerformancePage } from './PerformancePage';
import { PreviousRosterPage } from './PreviousRosterPage';
import { RouteDataPage } from './RouteDataPage';
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
  'route-data': RouteDataPage,
  'vehicle-data': VehicleDataPage,
  associates: AssociatesPage,
  performance: PerformancePage,
  'previous-roster': PreviousRosterPage,
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

/** Turns a remembered text into a page id, or the home page if it is not one. */
export function pageIdFrom(value: string | null): PageId {
  return PAGES.find((page) => page.id === value)?.id ?? DEFAULT_PAGE;
}
