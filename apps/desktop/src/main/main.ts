import { app, BrowserWindow, dialog, ipcMain, screen, session, shell } from 'electron';
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
import { isOwnPage } from './senderCheck';
import * as updater from './updater';
import { MIN_SIZE, parseWindowState, pickBounds } from './windowState';
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
const windowStateFile = () => path.join(app.getPath('userData'), 'window-state.json');
const dataFolder = () => path.join(app.getPath('userData'), 'data');

function fixtureDb(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'fixtures', 'v1', 'loadout.db')
    : path.resolve(__dirname, '..', '..', '..', '..', 'packages', 'fixtures', 'v1', 'loadout.db');
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

async function pickOldDb(): Promise<string | null> {
  const options = {
    title: "Choose the old app's data file (loadout.db)",
    defaultPath: path.dirname(oldDbFile()),
    properties: ['openFile' as const],
    filters: [{ name: 'Old app data', extensions: ['db'] }],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled || result.filePaths.length === 0 ? null : (result.filePaths[0] ?? null);
}

const oldData = new OldData({
  usualFile: oldDbFile,
  store: () => (settings.demoMode ? null : (dataSource?.getStore() ?? null)),
  demo: () => settings.demoMode,
  pickFile: pickOldDb,
  rebuild: () => stateHost?.rebuild(),
});

/** The app's icon for the window (the installer and the .exe carry the .ico). */
function windowIcon(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.resolve(__dirname, '..', '..', 'build', 'icon.png');
}

function loadSettings(): AppSettings {
  // Demo mode is never remembered: the app always starts on the real saved data.
  return { ...mergeSettings(DEFAULT_SETTINGS, readJson(settingsFile())), demoMode: false };
}

function saveSettings(): void {
  if (!writeJson(settingsFile(), { ...settings, demoMode: false })) {
    log('could not save settings');
  }
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

function createWindow(): void {
  const screens = screen.getAllDisplays().map((display) => display.workArea);
  const { bounds, maximized } = pickBounds(loadWindowState(), screens);

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    title: APP_TITLE,
    icon: windowIcon(),
    backgroundColor: WINDOW_BACKGROUND,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const win = mainWindow;
  if (maximized) win.maximize();

  win.once('ready-to-show', () => win.show());

  // Remember size and position (a moment after the last change, and when the window closes).
  let timer: NodeJS.Timeout | undefined;
  const remember = () => {
    if (win.isDestroyed() || win.isMinimized()) return;
    const normal = win.getNormalBounds();
    writeJson(windowStateFile(), { ...normal, maximized: win.isMaximized() });
  };
  const rememberSoon = () => {
    clearTimeout(timer);
    timer = setTimeout(remember, 400);
  };
  win.on('resize', rememberSoon);
  win.on('move', rememberSoon);
  win.on('maximize', rememberSoon);
  win.on('unmaximize', rememberSoon);
  win.on('close', () => {
    clearTimeout(timer);
    remember();
  });
  win.on('closed', () => {
    mainWindow = null;
  });

  // The page may not open other windows or wander off to another address.
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

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
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

/** Sends a note to the page, typed by the channel registry. */
function sendEvent<N extends EventName>(name: N, payload: PayloadOf<Channels[N]>): void {
  const win = mainWindow;
  if (win && !win.isDestroyed()) win.webContents.send(name, payload);
}

/** Tells the page the day's data may have changed, so it reads it again. */
function announceChange(): void {
  sendEvent('state:changed', { revision: stateHost!.bump() });
}

async function pickFile(kind: keyof typeof PICKS): Promise<string | null> {
  const spec = PICKS[kind];
  const options = {
    title: spec.title,
    defaultPath: app.getPath('downloads'),
    properties: ['openFile' as const],
    filters: spec.filters,
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled || result.filePaths.length === 0 ? null : (result.filePaths[0] ?? null);
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

async function chooseSaveFile(spec: SaveFileOptions): Promise<string | null> {
  const options = {
    title: spec.title,
    defaultPath: path.join(saveFolder(spec.nearFile, spec.startIn), `${spec.defaultName}.pdf`),
    filters: [
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'Excel workbook', extensions: ['xlsx'] },
    ],
  };
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options);
  return result.canceled || !result.filePath ? null : result.filePath;
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
    return settings;
  },
  openDataFolder: () => openDataFolder(),
  openLink,
  dataSourceInfo: () => dataSource!.getInfo(),
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
};

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
  const pageOrigin = {
    devServerUrl,
    pageFile: path.join(__dirname, '..', 'renderer', 'index.html'),
  };
  const env: ChannelEnv<HandlerContext> = {
    isOwnPage: (url) => isOwnPage(url, pageOrigin),
    context: () => context,
    log,
    afterCommand: announceChange,
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
    stateHost = new StateHost(dataSource);
    openDataSource(false);

    registerMessages();
    lockDownPage();
    createWindow();
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
