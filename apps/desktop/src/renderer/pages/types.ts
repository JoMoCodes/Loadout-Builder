import type { DataSourceInfo } from '../../shared/shell';
import type { AppSettings, SettingsPatch } from '../../shared/settings';

/** What the shell hands to every page. */
export interface PageProps {
  version: string;
  settings: AppSettings;
  changeSettings(patch: SettingsPatch): Promise<void>;
  dataSource: DataSourceInfo | null;
  /** Moves to another page by its id. */
  goTo(pageId: PageId): void;
  /** Something a shortcut key asked this page to do (Ctrl+O, Ctrl+I), or null. */
  request: PageRequest | null;
  /** The page has taken the request; it is not run again. */
  takeRequest(): void;
  /** Opens the "Bring over data from the old app" window. */
  openOldData(): void;
  /** The help layers: the first-day checklist, the page tours and the help links. */
  help: HelpApi;
}

/** What the shell offers the pages for help. */
export interface HelpApi {
  /** Runs the tour for what is on screen now (or the named one). */
  takeTour(name?: string): void;
  /** The next page opened was opened by the checklist: do not start its tour by itself. */
  skipNextAutoTour(): void;
  /** A roster was printed or saved (in demo mode, only for this run). */
  printed: boolean;
  /** The first-day checklist is shown on Home. */
  checklistShown: boolean;
  showChecklist(): void;
  hideChecklist(): void;
  /** Opens an allowed help page in the browser. Plain words when it did not open, else null. */
  openLink(url: string): Promise<string | null>;
}

/** What a shortcut key asks a page to do. `id` tells two presses of the same key apart. */
export interface PageRequest {
  id: number;
  action: 'import-sheet' | 'import-associates';
}

export type PageId =
  | 'home'
  | 'load-out'
  | 'route-data'
  | 'vehicle-data'
  | 'associates'
  | 'previous-roster'
  | 'how-to-use'
  | 'features-log'
  | 'settings';
