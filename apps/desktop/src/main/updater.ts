// Checks GitHub Releases for a newer version, downloads it in the background, and lets the
// user restart to install. Works for the installed (NSIS) build only; the portable .exe and
// dev runs can't update themselves, so they just report that.

import { app } from 'electron';
import type { AppUpdater } from 'electron-updater';
import type { UpdateStatus } from '../shared/api';

export type { UpdateState, UpdateStatus } from '../shared/api';

type StatusListener = (status: UpdateStatus) => void;

let autoUpdater: AppUpdater | null = null;
let status: UpdateStatus = { state: 'idle', version: null, percent: null, message: null };
let notify: StatusListener = () => {};

function set(next: Partial<UpdateStatus>): void {
  status = { ...status, ...next };
  notify(status);
}

function canUpdate(): string | null {
  if (!app.isPackaged) return 'Updates are only available in the installed app.';
  if (process.platform !== 'win32') return 'Updates are only available on Windows.';
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return "The portable version can't update itself. Download the new version from GitHub, or use the installer.";
  }
  return null;
}

function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/404|Cannot find latest|No published versions/i.test(raw)) {
    return 'No release has been published on GitHub yet.';
  }
  if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|net::/i.test(raw)) {
    return 'Could not reach GitHub. Check the internet connection.';
  }
  // Anything else is code words, often with a folder path in it, so it is never shown.
  return 'Something went wrong while checking for updates. Try again later.';
}

export function check(): UpdateStatus {
  if (!autoUpdater) return status;
  autoUpdater.checkForUpdates().catch((err: unknown) => {
    set({ state: 'error', message: friendlyError(err) });
  });
  return status;
}

export function init(onStatus: StatusListener): void {
  notify = onStatus;
  const reason = canUpdate();
  if (reason) {
    set({ state: 'unsupported', message: reason });
    return;
  }
  // Loaded only now, so dev runs and the portable build never touch it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ({ autoUpdater } = require('electron-updater') as typeof import('electron-updater'));
  const updater = autoUpdater;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('checking-for-update', () => set({ state: 'checking', message: null }));
  updater.on('update-not-available', () => set({ state: 'current', message: null }));
  updater.on('update-available', (info) =>
    set({ state: 'downloading', version: info.version, percent: 0 }),
  );
  updater.on('download-progress', (p) =>
    set({ state: 'downloading', percent: Math.round(p.percent) }),
  );
  updater.on('update-downloaded', (info) =>
    set({ state: 'ready', version: info.version, percent: 100 }),
  );
  updater.on('error', (err) => set({ state: 'error', message: friendlyError(err) }));

  check();
  // Check again every 4 hours while the app stays open.
  setInterval(check, 4 * 60 * 60 * 1000).unref();
}

export function install(): void {
  // Silent: the update installs in the background into the same place (same "all users" or
  // "only me" choice, same shortcuts) with no setup wizard, then the app reopens.
  if (autoUpdater && status.state === 'ready') autoUpdater.quitAndInstall(true, true);
}

export function getStatus(): UpdateStatus {
  return status;
}
