// The app frame: version, readiness, the data folder, where the data came from, help links, and
// the page-only windows.

import type { DataSourceInfo, OpenFolderResult } from '../shell';
import { PAGE_IDS, isWindowTarget, type PageId, type WindowTarget } from '../windows';
import { nothing, oneOf, shape, text } from './check';
import { as, defineCommand, defineEvent, defineQuery, defineSignal } from './define';

export interface GoToPage {
  page: PageId;
}

export const appChannels = [
  defineQuery('app:get-version', { input: nothing, result: as<string>() }),
  /** The page has drawn itself (the start-up check waits for this). */
  defineSignal('app:renderer-ready', { input: text(40) }),
  defineQuery('data:get-source-info', { input: nothing, result: as<DataSourceInfo>() }),
  defineCommand('data:open-folder', {
    input: nothing,
    result: as<OpenFolderResult>(),
    quiet: true,
  }),
  /**
   * Opens a help page in the computer's browser: the help forum or one of the app's release
   * pages, and nothing else (see `shared/links.ts`). Refuses any other link.
   */
  defineCommand('app:open-link', { input: text(200), result: as<null>(), quiet: true }),
  /**
   * Opens a page (and, for a page with tabs, a tab) in a window of its own, beside the main
   * window. A window already open on the same page and tab is brought to the front instead.
   */
  defineCommand('app:open-window', {
    input: isWindowTarget as (value: unknown) => value is WindowTarget,
    result: as<null>(),
    quiet: true,
  }),
  /** From a page-only window: show this page in the main window and bring it to the front. */
  defineCommand('app:show-page', {
    input: shape({ page: oneOf(PAGE_IDS) }),
    result: as<null>(),
    quiet: true,
  }),
  /** Main process to the main window: a page-only window asked for this page. */
  defineEvent('app:go-to', { payload: as<GoToPage>() }),
] as const;
