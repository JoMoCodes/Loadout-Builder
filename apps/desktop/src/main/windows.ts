// The page-only windows: one page (and tab) each, opened from the main window by right-clicking
// a page in the left menu or a tab, then "Open in new window". They show the same saved data as
// the main window, and every window hears every change (see `sendEvent` in main.ts).
//
// What a window is opened on travels in its address: `?page=load-out&tab=available-vans`. The
// main process makes the window, so the page itself never opens one (it is not allowed to).
// Each remembers its size and place, by page and tab, so it opens the same way next time.

import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { sameTarget, windowQuery, windowTitle, type WindowTarget } from '../shared/windows';
import { MIN_SIZE, pickBounds, placeBeside, type WindowState } from './windowState';

/**
 * Remembers a window's size and place: a moment after the last change, and when it closes.
 * `save` is given the normal (not maximized, not minimized) rectangle and whether it is maximized.
 */
export function watchBounds(win: BrowserWindow, save: (state: WindowState) => void): void {
  let timer: NodeJS.Timeout | undefined;
  const remember = () => {
    if (win.isDestroyed() || win.isMinimized()) return;
    save({ ...win.getNormalBounds(), maximized: win.isMaximized() });
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
}

export interface ExtraWindowSetup {
  /** The main window, which the new one opens beside (and closes with). */
  main(): BrowserWindow | null;
  /** How every window of the app is made (icon, colours, the bridge). */
  options(): Pick<
    Electron.BrowserWindowConstructorOptions,
    'icon' | 'backgroundColor' | 'webPreferences'
  >;
  /** Locks the page down and watches its log, the same as for the main window. */
  prepare(win: BrowserWindow): void;
  /** The dev server's address under `npm start`, else undefined. */
  devServerUrl: string | undefined;
  /** The installed app's page file. */
  pageFile: string;
  /** Where this window was last left, or null for a window never opened before. */
  remembered(target: WindowTarget): WindowState | null;
  /** Keeps where the window is now, for next time. */
  remember(target: WindowTarget, state: WindowState): void;
  /** Counts only. */
  log(message: string): void;
}

export class ExtraWindows {
  private readonly open = new Map<BrowserWindow, WindowTarget>();

  constructor(private readonly setup: ExtraWindowSetup) {}

  /** Every page-only window that is still open. */
  all(): BrowserWindow[] {
    return [...this.open.keys()].filter((win) => !win.isDestroyed());
  }

  /** Opens a window on this page and tab, or brings the one already open on it to the front. */
  show(target: WindowTarget): void {
    for (const [win, opened] of this.open) {
      if (win.isDestroyed()) continue;
      if (sameTarget(opened, target)) {
        if (win.isMinimized()) win.restore();
        win.focus();
        return;
      }
    }
    this.create(target);
  }

  /** Closes every page-only window (when the main window closes). */
  closeAll(): void {
    for (const win of this.all()) win.close();
    this.open.clear();
  }

  private create(target: WindowTarget): void {
    const main = this.setup.main();
    const mainBounds = main && !main.isDestroyed() ? main.getBounds() : null;
    const screens = screen.getAllDisplays().map((display) => display.workArea);
    // Where it was last left, if it is still on a screen; else beside the main window.
    const saved = this.setup.remembered(target);
    const { bounds, maximized } = saved
      ? pickBounds(saved, screens)
      : { bounds: placeBeside(mainBounds, screens), maximized: false };
    const win = new BrowserWindow({
      ...bounds,
      minWidth: MIN_SIZE.width,
      minHeight: MIN_SIZE.height,
      title: windowTitle(target),
      show: false,
      ...this.setup.options(),
    });
    this.open.set(win, target);
    if (maximized) win.maximize();
    win.once('ready-to-show', () => win.show());
    watchBounds(win, (state) => this.setup.remember(target, state));
    win.on('closed', () => {
      this.open.delete(win);
    });
    this.setup.prepare(win);

    const query = windowQuery(target);
    if (this.setup.devServerUrl) {
      const url = new URL(this.setup.devServerUrl);
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
      void win.loadURL(url.href);
    } else {
      void win.loadFile(path.normalize(this.setup.pageFile), { query });
    }
    this.setup.log(`opened a page-only window (${this.open.size} open)`);
  }
}
