import { app, BrowserWindow, dialog, ipcMain, safeStorage, screen, session, shell } from 'electron';
import type { OpenDialogOptions, SaveDialogOptions, WebContents } from 'electron';
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { EventName } from '../shared/channels';
import type { PayloadOf } from '../shared/channels/define';
import type { Channels } from '../shared/channels';
import type { OpenFolderResult } from '../shared/shell';
import { isAllowedLink } from '../shared/links';
import { DEFAULT_SETTINGS, mergeSettings } from '../shared/settings';
import type { AppSettings } from '../shared/settings';
import { StateHost } from './appState';
import type { ChannelEnv } from './channels';
import { DataSource, totalRows } from './dataSource';
import type { DroppedFiles } from './fileDrop';
import { PICKS } from './filePicks';
import { OldData, usualOldDbPath } from './oldData';
import { registerAllChannels } from './handlers';
import type { HandlerContext, Services } from './handlers';
import type { SaveFileOptions } from './handlers/types';
import { readJson, writeJson } from './jsonFile';
import { EmailAccount } from './mail/emailAccount';
import { nodemailerTransport } from './mail/mailer';
import { OldWpaData, usualWpaDbPath } from './performance/oldWpaData';
import * as report from './performance/report';
import { PerfService } from './performance/service';
import { SettingsFile } from './settingsFile';
import { isOwnPage } from './senderCheck';
import * as updater from './updater';
import { ExtraWindows, watchBounds } from './windows';
import {
  MIN_SIZE,
  extraWindowKey,
  parseExtraWindowStates,
  parseWindowState,
  pickBounds,
} from './windowState';
import type { WindowState } from './windowState';

const APP_TITLE = 'Loadout Builder';
// The one page log line that is copied into the main log word for word.
const PAGE_READY_PREFIX = 'Loadout Builder page is ready';

// A test can point the app at a throwaway data folder so it never touches the real one. Only a
// build that is not installed honours this: in the installed app nothing can redirect where the
// saved data lives.
if (!app.isPackaged && process.env.LOADOUT_USER_DATA_DIR) {
  app.setPath('userData', path.resolve(process.env.LOADOUT_USER_DATA_DIR));
}

// Set by the dev launcher (npm start) so the window loads from the live Vite server.
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;
let settings: AppSettings = { ...DEFAULT_SETTINGS };
let dataSource: DataSource | null = null;
let stateHost: StateHost | null = null;
// The dark background token (--bg in tokens.css), so the window never flashes white while the
// page loads. The page paints its own colours as soon as it is up.
const WINDOW_BACKGROUND = '#0e1218';

// The last lines the main process logged, kept in memory so a test can read them even if it
// started watching after they were printed.
const recentLog: string[] = [];
(globalThis as { __loadoutLog?: string[] }).__loadoutLog = recentLog;

function log(message: string): void {
  // Row counts and reason codes only. Names and IDs never go in a log.
  const line = `[main] ${message}`;
  recentLog.push(line);
  if (recentLog.length > 200) recentLog.shift();
  console.log(line);
}

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
// Created once the app is ready (the data folder may be moved for a test before that).
let settingsStore: SettingsFile | null = null;
const windowStateFile = () => path.join(app.getPath('userData'), 'window-state.json');
// Where each page-only window was last left, by page and tab.
const extraWindowsFile = () => path.join(app.getPath('userData'), 'extra-windows.json');
const dataFolder = () => path.join(app.getPath('userData'), 'data');

/**
 * The window whose page made the call being handled right now, so a file or folder window opens
 * over it and not over the main window. Set by `inCall` for the whole of a handler's run.
 */
const asking = new AsyncLocalStorage<BrowserWindow>();

/** The window a file, folder or save window should open over: the one that asked, else the main one. */
function askingWindow(): BrowserWindow | null {
  const win = asking.getStore();
  if (win && !win.isDestroyed()) return win;
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

async function showOpenDialog(options: OpenDialogOptions): Promise<string | null> {
  const win = askingWindow();
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  return result.canceled || result.filePaths.length === 0 ? null : (result.filePaths[0] ?? null);
}

async function showSaveDialog(options: SaveDialogOptions): Promise<string | null> {
  const win = askingWindow();
  const result = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options);
  return result.canceled || !result.filePath ? null : result.filePath;
}

function fixtureDb(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'fixtures', 'v1', 'loadout.db')
    : path.resolve(__dirname, '..', '..', '..', '..', 'packages', 'fixtures', 'v1', 'loadout.db');
}

/** The made-up weekly performance exports demo mode brings in (packages/fixtures/performance). */
function fixturePerformanceFolder(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'fixtures', 'performance')
    : path.resolve(__dirname, '..', '..', '..', '..', 'packages', 'fixtures', 'performance');
}

/** The made-up fixtures demo mode brings the route sheet day in from (routes, associates, route-sheets). */
function fixturesFolder(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'fixtures')
    : path.resolve(__dirname, '..', '..', '..', '..', 'packages', 'fixtures');
}

/**
 * The old app's data file. A test build (never the installed app) can point at another file
 * with LOADOUT_OLD_DB, so a check can try the whole thing on made-up data.
 */
function oldDbFile(): string {
  if (!app.isPackaged && process.env.LOADOUT_OLD_DB) {
    return path.resolve(process.env.LOADOUT_OLD_DB);
  }
  return usualOldDbPath(app.getPath('home'));
}

function pickOldDb(): Promise<string | null> {
  return showOpenDialog({
    title: "Choose the old app's data file (loadout.db)",
    defaultPath: path.dirname(oldDbFile()),
    properties: ['openFile'],
    filters: [{ name: 'Old app data', extensions: ['db'] }],
  });
}

const oldData = new OldData({
  usualFile: oldDbFile,
  store: () => (settings.demoMode ? null : (dataSource?.getStore() ?? null)),
  demo: () => settings.demoMode,
  pickFile: pickOldDb,
  rebuild: () => stateHost?.rebuild(),
});

/**
 * The old Weekly Performance App's data file. A test build (never the installed app) can point at
 * another file with LOADOUT_OLD_WPA_DB.
 */
function oldWpaDbFile(): string {
  if (!app.isPackaged && process.env.LOADOUT_OLD_WPA_DB) {
    return path.resolve(process.env.LOADOUT_OLD_WPA_DB);
  }
  return usualWpaDbPath(app.getPath('home'), process.env.LOCALAPPDATA);
}

function pickOldWpaDb(): Promise<string | null> {
  return showOpenDialog({
    title: "Choose the Weekly Performance App's data file (app.db)",
    defaultPath: path.dirname(oldWpaDbFile()),
    properties: ['openFile'],
    filters: [{ name: 'Weekly Performance App data', extensions: ['db'] }],
  });
}

const oldWpaData = new OldWpaData({
  usualFile: oldWpaDbFile,
  store: () => (settings.demoMode ? null : (dataSource?.getStore() ?? null)),
  demo: () => settings.demoMode,
  pickFile: pickOldWpaDb,
  perfEmpty: () => stateHost?.perf.store.isPerfEmpty() ?? false,
  // Its drivers land on the associate list, so the day's data reads that list back too.
  reload: () => {
    stateHost?.perf.invalidate();
    stateHost?.state.reloadAssociates();
  },
});

/** The app's icon for the window (the installer and the .exe carry the .ico). */
function windowIcon(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.resolve(__dirname, '..', '..', 'build', 'icon.png');
}

function loadSettings(): AppSettings {
  // Demo mode is never remembered: the app always starts on the real saved data. The
  // main-only part of the file (export folders, the sealed email password) stays in the store.
  settingsStore = new SettingsFile(settingsFile());
  return settingsStore.load();
}

function saveSettings(): void {
  if (!settingsStore?.save(settings)) log('could not save settings');
}

function openDataSource(demo: boolean): void {
  const info = dataSource!.open(demo);
  // The day's data is built again on whatever just opened (or dropped, if it did not open).
  try {
    stateHost!.rebuild();
  } catch {
    log('could not read the saved data into the app');
  }
  if (info.ok) {
    log(
      `opened saved data (${info.mode}): ${Object.keys(info.counts).length} tables, ` +
        `${totalRows(info.counts)} rows`,
    );
  } else {
    log(`could not open saved data (${info.mode}): ${info.reason}`);
  }
}

function loadWindowState(): WindowState | null {
  return parseWindowState(readJson(windowStateFile()));
}

function loadExtraWindowStates(): Record<string, WindowState> {
  return parseExtraWindowStates(readJson(extraWindowsFile()));
}

const pageFile = () => path.join(__dirname, '..', 'renderer', 'index.html');

/** How every window of the app is made: the icon, the dark start colour, and the bridge. */
function windowOptions() {
  return {
    icon: windowIcon(),
    backgroundColor: WINDOW_BACKGROUND,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
}

/** Locks a window's page down and copies the few log lines it may say. The same for every window. */
function prepareWindow(win: BrowserWindow): void {
  // The page may not open other windows or wander off to another address. (A page-only window
  // is opened by the main process, on the page's request: see `app:open-window`.)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // In the installed app the page never navigates at all: it is one page, and a file dropped
  // on the window must not replace it. In dev, only the dev server's own address is allowed.
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = devServerUrl ? url.startsWith(devServerUrl) : false;
    if (!allowed) event.preventDefault();
  });

  // Lets a start-up check (and whoever is running the app in a terminal) see that the page is
  // up. Only the page's own "ready" line and error levels are copied, never the message text
  // of anything else: from phase 4 on, a page error could carry a driver's name.
  win.webContents.on('console-message', (event) => {
    if (event.message.startsWith(PAGE_READY_PREFIX)) {
      log(`page says: ${event.message}`);
    } else if (event.level === 'error' || event.level === 'warning') {
      log(`page logged a ${event.level} (${event.message.length} characters)`);
    }
  });

  win.webContents.on('did-finish-load', () => {
    log(`window title is "${win.getTitle()}"`);
  });
}

/** The page-only windows ("Open in new window"). They open beside the main window and close with it. */
const extraWindows = new ExtraWindows({
  main: () => mainWindow,
  options: windowOptions,
  prepare: prepareWindow,
  devServerUrl,
  pageFile: pageFile(),
  remembered: (target) => loadExtraWindowStates()[extraWindowKey(target)] ?? null,
  remember: (target, state) => {
    writeJson(extraWindowsFile(), {
      ...loadExtraWindowStates(),
      [extraWindowKey(target)]: state,
    });
  },
  log,
});

/** Every window that is open: the main one first, then the page-only ones. */
function allWindows(): BrowserWindow[] {
  const main = mainWindow && !mainWindow.isDestroyed() ? [mainWindow] : [];
  return [...main, ...extraWindows.all()];
}

function createWindow(): void {
  const screens = screen.getAllDisplays().map((display) => display.workArea);
  const { bounds, maximized } = pickBounds(loadWindowState(), screens);

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    title: APP_TITLE,
    show: false,
    ...windowOptions(),
  });
  const win = mainWindow;
  if (maximized) win.maximize();

  win.once('ready-to-show', () => win.show());

  // Remember size and position (a moment after the last change, and when the window closes).
  watchBounds(win, (state) => writeJson(windowStateFile(), state));
  win.on('closed', () => {
    mainWindow = null;
    // The main window is the app: the page-only windows go with it.
    extraWindows.closeAll();
  });

  prepareWindow(win);

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(pageFile());
  }
}

function lockDownPage(): void {
  // The page may only load its own files. The dev server also needs its own address, and
  // an inline script that its live-reload tool adds.
  const policy = devServerUrl
    ? `default-src 'self' ${devServerUrl} ws://${new URL(devServerUrl).host}; ` +
      `script-src 'self' 'unsafe-inline' ${devServerUrl}; style-src 'self' 'unsafe-inline'; img-src 'self' data:`
    : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:";
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [policy] },
    });
  });
}

async function openDataFolder(): Promise<OpenFolderResult> {
  try {
    mkdirSync(dataFolder(), { recursive: true });
    // openPath gives back an empty text when it worked, or a reason when it did not.
    const problem = await shell.openPath(dataFolder());
    if (problem) log('could not open the data folder');
    return { ok: !problem };
  } catch {
    log('could not open the data folder');
    return { ok: false };
  }
}

/** Sends a note to every window's page, typed by the channel registry. */
function sendEvent<N extends EventName>(name: N, payload: PayloadOf<Channels[N]>): void {
  for (const win of allWindows()) win.webContents.send(name, payload);
}

/** Sends a note to the main window's page only. */
function sendToMain<N extends EventName>(name: N, payload: PayloadOf<Channels[N]>): void {
  const win = mainWindow;
  if (win && !win.isDestroyed()) win.webContents.send(name, payload);
}

/** Tells the page the day's data may have changed, so it reads it again. */
function announceChange(): void {
  sendEvent('state:changed', { revision: stateHost!.bump() });
}

function pickFile(kind: keyof typeof PICKS): Promise<string | null> {
  const spec = PICKS[kind];
  return showOpenDialog({
    title: spec.title,
    defaultPath: app.getPath('downloads'),
    properties: ['openFile'],
    filters: spec.filters,
  });
}

/**
 * The folder the save window starts in: the load-out sheet's, else the old app's data folder
 * (its Schedule Data folder for the two fixed exports, as the old Roster tab had it).
 */
function saveFolder(nearFile: string, startIn: SaveFileOptions['startIn']): string {
  const near = nearFile ? path.dirname(nearFile) : '';
  if (near && near !== '.' && existsSync(near)) return near;
  const data = path.join(app.getPath('home'), 'OneDrive', 'Loadout Builder', 'Data');
  const fallback = startIn === 'schedule-data' ? path.join(data, 'Schedule Data') : data;
  return existsSync(fallback) ? fallback : app.getPath('home');
}

function chooseSaveFile(spec: SaveFileOptions): Promise<string | null> {
  return showSaveDialog({
    title: spec.title,
    defaultPath: path.join(saveFolder(spec.nearFile, spec.startIn), `${spec.defaultName}.pdf`),
    filters: [
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'Excel workbook', extensions: ['xlsx'] },
    ],
  });
}

async function openLink(url: string): Promise<boolean> {
  // Checked again here, so nothing but the allowed pages can ever reach the browser.
  if (!isAllowedLink(url)) return false;
  try {
    await shell.openExternal(url);
    log('opened a help page in the browser');
    return true;
  } catch {
    log('could not open a help page in the browser');
    return false;
  }
}

async function openFile(file: string): Promise<boolean> {
  // openPath gives back an empty text when it worked, or a reason (never logged) when it did not.
  const problem = await shell.openPath(file);
  if (problem) log('could not open a written sheet');
  return !problem;
}

const services: Services = {
  version: () => app.getVersion(),
  rendererReady: (version) => {
    // Only a version-shaped value is echoed; anything else is reported as a shape, not quoted.
    const shown = /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version);
    log(`window is ready, version ${shown ? version : '(not a version)'}`);
  },
  getSettings: () => settings,
  setSettings: (patch) => {
    const before = settings;
    settings = mergeSettings(settings, patch);
    if (settings.demoMode !== before.demoMode) {
      openDataSource(settings.demoMode);
      announceChange();
    }
    saveSettings();
    // Every window shows the new look and choices, not only the one that made the change.
    sendEvent('settings:changed', settings);
    return settings;
  },
  openDataFolder: () => openDataFolder(),
  openLink,
  dataSourceInfo: () => dataSource!.getInfo(),
  openWindow: (target) => extraWindows.show(target),
  showPage: (page) => {
    const win = mainWindow;
    if (!win || win.isDestroyed()) return;
    sendToMain('app:go-to', { page });
    if (win.isMinimized()) win.restore();
    win.focus();
  },
  updates: {
    status: () => updater.getStatus(),
    check: () => updater.check(),
    install: () => updater.install(),
  },
  pickFile,
  chooseSaveFile,
  openFile,
  tempFolder: () => app.getPath('temp'),
  oldData,
  performance: null as unknown as PerfService,
  oldWpaData,
  emailAccount: null as unknown as EmailAccount,
  // Export all's folder window, which may make a new folder (as the old app's did).
  chooseFolder: (title, startIn) =>
    showOpenDialog({
      title,
      defaultPath: startIn ?? app.getPath('documents'),
      properties: ['openDirectory', 'createDirectory'],
    }),
  openMailApp,
  oldRouteSheetsFolderExists: () => {
    try {
      return existsSync(path.join(app.getPath('appData'), 'Route Sheet Distributor'));
    } catch {
      return false;
    }
  },
};

/** Asks for a folder, over the window that asked. */
function chooseFolder(title: string, startIn: string | null): Promise<string | null> {
  return showOpenDialog({
    title,
    defaultPath: startIn ?? app.getPath('downloads'),
    properties: ['openDirectory'],
  });
}

/** Opens the computer's mail app on a new email. Only a mailto: link is ever opened here. */
async function openMailApp(mailto: string): Promise<boolean> {
  if (!/^mailto:/i.test(mailto)) return false;
  try {
    await shell.openExternal(mailto);
    log('opened the mail app');
    return true;
  } catch {
    log('could not open the mail app');
    return false;
  }
}

function chooseOneFile(
  title: string,
  filters: Array<{ name: string; extensions: string[] }>,
  startIn: string | null,
): Promise<string | null> {
  return showOpenDialog({
    title,
    defaultPath: startIn ?? app.getPath('downloads'),
    properties: ['openFile'],
    filters,
  });
}

function chooseSaveAs(
  title: string,
  defaultName: string,
  filters: Array<{ name: string; extensions: string[] }>,
): Promise<string | null> {
  return showSaveDialog({
    title,
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters,
  });
}

function updateMainOnly(change: Parameters<SettingsFile['updateMainOnly']>[0]): void {
  if (!settingsStore?.updateMainOnly(change)) log('could not save settings');
}

/** The app's one email account (Settings > Email): the weekly reports and the route sheets. */
const emailAccount = new EmailAccount({
  settings: () => settings.email,
  mainOnly: () => settingsStore!.getMainOnly(),
  updateMainOnly,
  sealer: safeStorage,
  transport: nodemailerTransport,
  log,
});
services.emailAccount = emailAccount;

const perfService = new PerfService({
  host: () => stateHost!.perf,
  performance: () => settings.performance,
  demo: () => settings.demoMode,
  mainOnly: () => settingsStore!.getMainOnly(),
  updateMainOnly,
  dialogs: { chooseFolder, chooseFile: chooseOneFile, chooseSaveFile: chooseSaveAs },
  account: emailAccount,
  report,
  openFile,
  folders: {
    showFile: (file) => {
      shell.showItemInFolder(file);
      return true;
    },
    // openPath gives back an empty text when it worked, or a reason (never logged) when not.
    openFolder: async (folder) => !(await shell.openPath(folder)),
  },
  progress: (progress) => sendEvent('performance:progress', progress),
  tempFolder: () => app.getPath('temp'),
  today: () => stateHost!.today(),
  log,
});
services.performance = perfService;

/** Auto-import on startup: when it is on and folders are remembered, after the window is up. */
async function autoImportOnStartup(): Promise<void> {
  if (!perfService.shouldAutoImport(settings.performance)) return;
  try {
    await perfService.syncNow();
  } catch {
    log('auto-import did not run');
  }
  announceChange();
}

const picked = new Set<string>();
const dropped: DroppedFiles = new Map();

function registerMessages(): void {
  const host = stateHost!;
  const context: HandlerContext = {
    get state() {
      return host.state;
    },
    host,
    services,
    picked,
    dropped,
    today: host.today,
  };
  const pageOrigin = { devServerUrl, pageFile: pageFile() };
  const env: ChannelEnv<HandlerContext> = {
    isOwnPage: (url) => isOwnPage(url, pageOrigin),
    context: () => context,
    log,
    afterCommand: announceChange,
    // The handler runs knowing which window asked, so its file windows open over that one.
    inCall: (event, work) => {
      const sender = event.sender as WebContents | undefined;
      const win = sender ? BrowserWindow.fromWebContents(sender) : null;
      return win ? asking.run(win, work) : work();
    },
  };
  registerAllChannels(ipcMain, env);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  process.on('uncaughtException', (error) => {
    // The kind of error only. The text of an error can quote data.
    log(`error: uncaught ${error.name}`);
  });

  app.whenReady().then(() => {
    settings = loadSettings();
    dataSource = new DataSource({
      dataFolder: dataFolder(),
      fixtureDb: fixtureDb(),
      tempFolder: app.getPath('temp'),
    });
    stateHost = new StateHost(dataSource, undefined, {
      demoPerformanceFolder: fixturePerformanceFolder(),
      demoFixturesFolder: fixturesFolder(),
      onAsyncChange: () => {
        if (stateHost) announceChange();
      },
      log,
      lastRouteSheetRun: {
        get: () => settingsStore?.getMainOnly().lastRunId ?? null,
        set: (id) => updateMainOnly((kept) => ({ ...kept, lastRunId: id })),
      },
    });
    stateHost.perfStatus = () => perfService.status();
    openDataSource(false);

    registerMessages();
    lockDownPage();
    createWindow();
    mainWindow?.webContents.once('did-finish-load', () => void autoImportOnStartup());
    updater.init((status) => {
      log(`updates: ${status.state}`);
      sendEvent('updates:status-changed', status);
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', () => dataSource?.close());

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
