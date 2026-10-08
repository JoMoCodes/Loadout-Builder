// The app frame: version, readiness, the data folder, where the data came from, and help links.

import type { DataSourceInfo, OpenFolderResult } from '../shell';
import { nothing, text } from './check';
import { as, defineCommand, defineQuery, defineSignal } from './define';

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
] as const;
