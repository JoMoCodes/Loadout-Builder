import type { ComponentType } from 'react';
import { AssociatesPage } from './AssociatesPage';
import { FeaturesLogPage } from './FeaturesLogPage';
import { HomePage } from './HomePage';
import { HowToUsePage } from './HowToUsePage';
import { LoadOutPage } from './LoadOutPage';
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
export const PAGES: readonly PageEntry[] = [
  { id: 'home', label: 'Home', component: HomePage },
  { id: 'load-out', label: 'Load Out', component: LoadOutPage },
  { id: 'route-data', label: 'Route Data', component: RouteDataPage },
  { id: 'vehicle-data', label: 'Vehicle Data', component: VehicleDataPage },
  { id: 'associates', label: 'Associates', component: AssociatesPage },
  { id: 'previous-roster', label: 'Previous Roster', component: PreviousRosterPage },
  { id: 'how-to-use', label: 'How to use', component: HowToUsePage },
  { id: 'features-log', label: 'Features log', component: FeaturesLogPage },
  { id: 'settings', label: 'Settings', component: SettingsPage },
];

export const DEFAULT_PAGE: PageId = 'home';

/** Turns a remembered text into a page id, or the home page if it is not one. */
export function pageIdFrom(value: string | null): PageId {
  return PAGES.find((page) => page.id === value)?.id ?? DEFAULT_PAGE;
}
