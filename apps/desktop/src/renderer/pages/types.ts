import type { DataSourceInfo } from '../../shared/shell';
import type { AppSettings, SettingsPatch } from '../../shared/settings';
import type { PageId } from '../../shared/windows';

export type { PageId };

/** What the shell hands to every page. */
export interface PageProps {
  version: string;
  settings: AppSettings;
  changeSettings(patch: SettingsPatch): Promise<void>;
  dataSource: DataSourceInfo | null;
  /** Moves to another page by its id. From a page-only window, the main window moves instead. */
  goTo(pageId: PageId): void;
  /**
   * This is a page-only window ("Open in new window"): one page, no left menu. It does not
   * remember the last page or tab for next time (the main window does that).
   */
  ownWindow: boolean;
  /** The tab this page-only window was opened on, or null (the page picks as usual). */
  startTab: string | null;
  /** Something a shortcut key asked this page to do (Ctrl+O, Ctrl+I), or null. */
  request: PageRequest | null;
  /** The page has taken the request; it is not run again. */
  takeRequest(): void;
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
  /** The first-day checklist is shown on How to use. */
  checklistShown: boolean;
  showChecklist(): void;
  hideChecklist(): void;
  /** The weekly checklist is shown on Home (in demo mode, only for this run). */
  weeklyShown: boolean;
  /** The Dashboard has been opened (a weekly checklist step). */
  dashboardSeen: boolean;
  showWeekly(): void;
  hideWeekly(): void;
  /** Opens an allowed help page in the browser. Plain words when it did not open, else null. */
  openLink(url: string): Promise<string | null>;
}

/** What a shortcut key asks a page to do. `id` tells two presses of the same key apart. */
export interface PageRequest {
  id: number;
  action: 'import-sheet' | 'import-associates';
}
