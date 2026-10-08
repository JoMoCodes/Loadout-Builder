import type { AppState, IsoDate } from '@loadout/core';
import type { AppSettings, SettingsPatch } from '../../shared/settings';
import type {
  AnyDef,
  CommandDef,
  EventDef,
  QueryDef,
  SignalDef,
} from '../../shared/channels/define';
import type { FileKind } from '../../shared/channels/files';
import type { DataSourceInfo, OpenFolderResult, UpdateStatus } from '../../shared/shell';
import type { StateHost } from '../appState';
import type { DroppedFiles } from '../fileDrop';
import type { OldData } from '../oldData';
import type { CallHandler, SignalHandler } from '../channels';

/** The parts of the app that need Electron or the computer. `main.ts` builds the real one. */
export interface Services {
  version(): string;
  rendererReady(version: string): void;
  getSettings(): AppSettings;
  /** Merges the valid fields, saves, and swaps the data if demo mode changed. */
  setSettings(patch: SettingsPatch): AppSettings;
  openDataFolder(): Promise<OpenFolderResult>;
  /** Opens an allowed web page in the computer's browser. Whether it opened. */
  openLink(url: string): Promise<boolean>;
  dataSourceInfo(): DataSourceInfo;
  updates: {
    status(): UpdateStatus;
    check(): UpdateStatus | Promise<UpdateStatus>;
    install(): void;
  };
  /** Shows the file window for this kind of file. The chosen path, or null if none. */
  pickFile(kind: FileKind): Promise<string | null>;
  /** Shows the save window for a printed sheet. The chosen path, or null if they closed it. */
  chooseSaveFile(options: SaveFileOptions): Promise<string | null>;
  /** Opens a file the app has just written, in whatever the computer opens it with. */
  openFile(path: string): Promise<boolean>;
  /** A folder for throwaway files (the print preview). */
  tempFolder(): string;
  /** Finding and bringing over the old app's saved data. */
  oldData: Pick<OldData, 'find' | 'pick' | 'run'>;
}

export interface SaveFileOptions {
  /** The window's title ("Print page", "Export roster"). */
  title: string;
  /** The file name offered, without an extension (.pdf is added). */
  defaultName: string;
  /** A file whose folder to start in, if it is still there (the imported load-out sheet). */
  nearFile: string;
  /**
   * Where to start when that folder is gone: the old app's data folder ('data', the Print tab)
   * or its Schedule Data folder ('schedule-data', the two fixed exports).
   */
  startIn: 'data' | 'schedule-data';
}

/** What every handler is given besides its input. */
export interface HandlerContext {
  /** The day's data. Refuses with "no-data" if the saved data could not be opened. */
  readonly state: AppState;
  readonly host: StateHost;
  readonly services: Services;
  /** Files the person chose in the file window this run. `files:import` reads only these. */
  readonly picked: Set<string>;
  /** Files dropped on a page this run that passed the check, by token. Read once each. */
  readonly dropped: DroppedFiles;
  today(): IsoDate;
}

/** The handlers one area must provide: one per query, command and signal it declares. */
export type HandlersFor<Defs extends readonly AnyDef[]> = {
  [D in Defs[number] as D extends EventDef ? never : D['name']]: D extends QueryDef | CommandDef
    ? CallHandler<D, HandlerContext>
    : D extends SignalDef
      ? SignalHandler<D, HandlerContext>
      : never;
};
