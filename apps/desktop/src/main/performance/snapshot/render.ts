// Turns snapshot pages (HTML) into pictures for the email, with Chromium in an offscreen window
// that cannot run scripts, reach the network or open anything else. Each page is drawn 360 CSS
// pixels wide at twice the size (the window is zoomed to 200%), so it stays sharp on a phone. A
// page that comes out too big as a PNG is saved as a JPEG instead.
//
// Offscreen, not hidden: a hidden window on Windows never paints a frame for the screenshot
// command, which then waits forever (the email went out without the pictures). An offscreen
// window paints into memory whether or not it is shown, and `capturePage()` reads that.
//
// One capture at a time across the whole app, and nothing about the driver reaches the log: a
// failure is reported by its place in the batch and a reason code.

import { randomUUID } from 'node:crypto';
import type { BrowserWindow, NativeImage } from 'electron';
import { SNAPSHOT_WIDTH } from './html';

type Electron = typeof import('electron');

/** Pictures above this many bytes are saved as JPEG. */
export const IMAGE_MAX_BYTES = 400 * 1024;
export const JPEG_QUALITY = 85;
/** How much sharper than the 360 px layout the picture is. */
export const IMAGE_SCALE = 2;
/** The tallest page the capture will take (CSS pixels); anything longer is cut there. */
const MAX_PAGE_HEIGHT = 4000;
/**
 * The window's height while a page loads (CSS pixels). It is shorter than any page, so the
 * scrollable size Chromium reports is the page's own height and not the window's.
 */
const MEASURE_HEIGHT = 100;
/** After the resize, the paints must stay quiet this long before the last frame is kept. */
const PAINT_SETTLE_MS = 150;
const STEP_TIMEOUT_MS = 30_000;

export interface SnapshotImage {
  bytes: Buffer;
  contentType: 'image/png' | 'image/jpeg';
  /** The size the email shows it at (CSS pixels). */
  width: number;
  height: number;
}

export type SnapshotRenderFailure = 'load-failed' | 'capture-failed' | 'timed-out';

export class SnapshotRenderError extends Error {
  constructor(readonly reason: SnapshotRenderFailure) {
    super(`The snapshot could not be drawn (${reason}).`);
    this.name = 'SnapshotRenderError';
  }
}

/** PNG unless it is too big, then JPEG: the choice a capture makes from the PNG's size. */
export function pickFormat(pngBytes: number): 'png' | 'jpeg' {
  return pngBytes > IMAGE_MAX_BYTES ? 'jpeg' : 'png';
}

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

function withTimeout<T>(work: Promise<T>, reason: SnapshotRenderFailure): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SnapshotRenderError('timed-out')), STEP_TIMEOUT_MS);
  });
  return Promise.race([
    work.catch((error: unknown) => {
      throw error instanceof SnapshotRenderError ? error : new SnapshotRenderError(reason);
    }),
    limit,
  ]).finally(() => clearTimeout(timer));
}

function createCaptureWindow(electron: Electron): BrowserWindow {
  const ses = electron.session.fromPartition(`snapshot-${randomUUID()}`, { cache: false });
  ses.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !details.url.startsWith('data:') });
  });
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  const win = new electron.BrowserWindow({
    show: false,
    width: SNAPSHOT_WIDTH * IMAGE_SCALE,
    height: MEASURE_HEIGHT * IMAGE_SCALE,
    useContentSize: true,
    webPreferences: {
      session: ses,
      offscreen: true,
      // 200% zoom: the window is 720 device pixels wide but lays the page out 360 CSS pixels
      // wide, so the picture is the 360 px design drawn at twice the detail.
      zoomFactor: IMAGE_SCALE,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false,
      webgl: false,
      spellcheck: false,
      devTools: false,
      backgroundThrottling: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  return win;
}

function dataUrl(html: string): string {
  return `data:text/html;charset=utf-8;base64,${Buffer.from(html, 'utf8').toString('base64')}`;
}

interface LayoutMetrics {
  cssContentSize?: { width: number; height: number };
  contentSize?: { width: number; height: number };
}

/** The page's height in CSS pixels, read from Chromium's layout (the window is shorter). */
async function pageHeight(win: BrowserWindow): Promise<number> {
  const dbg = win.webContents.debugger;
  if (!dbg.isAttached()) dbg.attach('1.3');
  try {
    const metrics = (await dbg.sendCommand('Page.getLayoutMetrics')) as LayoutMetrics;
    const size = metrics.cssContentSize ?? metrics.contentSize;
    return Math.min(MAX_PAGE_HEIGHT, Math.max(1, Math.ceil(size?.height ?? MEASURE_HEIGHT)));
  } finally {
    if (dbg.isAttached()) dbg.detach();
  }
}

/**
 * Resizes the window to the whole page and gives back the last frame painted at that size once
 * the painting has stopped. (Reading the page right after the resize races the repaint: the
 * picture can come back stale, short, or not at all. And the first frame at the new size can
 * still show the old, shorter layout, scrollbars and all, before the page is laid out again.)
 */
function paintedAt(win: BrowserWindow, width: number, height: number): Promise<NativeImage> {
  const contents = win.webContents;
  return new Promise<NativeImage>((resolve) => {
    let latest: NativeImage | null = null;
    let quiet: NodeJS.Timeout | undefined;
    const onPaint = (_event: unknown, _dirty: unknown, image: NativeImage) => {
      const size = image.getSize();
      if (size.width !== width || size.height !== height) return;
      latest = image;
      if (quiet) clearTimeout(quiet);
      quiet = setTimeout(() => {
        contents.off('paint', onPaint);
        resolve(latest as NativeImage);
      }, PAINT_SETTLE_MS);
    };
    contents.on('paint', onPaint);
    win.setContentSize(width, height);
  });
}

async function captureOne(win: BrowserWindow, html: string): Promise<SnapshotImage> {
  win.setContentSize(SNAPSHOT_WIDTH * IMAGE_SCALE, MEASURE_HEIGHT * IMAGE_SCALE);
  await withTimeout(win.loadURL(dataUrl(html)), 'load-failed');
  const capture = async (): Promise<SnapshotImage> => {
    const height = await pageHeight(win);
    const image = await paintedAt(win, SNAPSHOT_WIDTH * IMAGE_SCALE, height * IMAGE_SCALE);
    if (image.isEmpty()) throw new SnapshotRenderError('capture-failed');
    let bytes = image.toPNG();
    let contentType: SnapshotImage['contentType'] = 'image/png';
    if (pickFormat(bytes.length) === 'jpeg') {
      bytes = image.toJPEG(JPEG_QUALITY);
      contentType = 'image/jpeg';
    }
    return { bytes, contentType, width: SNAPSHOT_WIDTH, height };
  };
  return withTimeout(capture(), 'capture-failed');
}

/**
 * Lets the window go. Closed, not destroyed: after `destroy()` the next capture window made in
 * the same app run cannot load its page at all (ERR_FAILED), so only the first batch of emails
 * would get pictures.
 */
function discard(win: BrowserWindow | null): void {
  if (win && !win.isDestroyed()) win.close();
}

/**
 * Draws every page of several snapshots in one offscreen window, one after another. The result
 * has one entry per snapshot: its pictures, or null when one of its pages could not be drawn (the
 * email then goes out without the snapshot). `onProgress(done, total)` after each snapshot;
 * `onFailure(reason)` for each snapshot that could not be drawn.
 */
export function renderSnapshotBatch(
  snapshots: ReadonlyArray<readonly string[]>,
  onProgress?: (done: number, total: number) => void,
  onFailure?: (reason: SnapshotRenderFailure) => void,
): Promise<Array<SnapshotImage[] | null>> {
  return enqueue(async () => {
    const results: Array<SnapshotImage[] | null> = [];
    if (snapshots.length === 0) return results;
    const electron = await import('electron');
    let win: BrowserWindow | null = null;
    try {
      for (const pages of snapshots) {
        if (win === null || win.isDestroyed()) win = createCaptureWindow(electron);
        try {
          const images: SnapshotImage[] = [];
          for (const page of pages) images.push(await captureOne(win, page));
          results.push(images);
        } catch (error) {
          results.push(null);
          onFailure?.(error instanceof SnapshotRenderError ? error.reason : 'capture-failed');
          discard(win);
          win = null;
        }
        onProgress?.(results.length, snapshots.length);
      }
    } finally {
      discard(win);
    }
    return results;
  });
}

/** Draws one snapshot's pages. Throws a SnapshotRenderError when a page cannot be drawn. */
export async function renderSnapshotPages(pages: readonly string[]): Promise<SnapshotImage[]> {
  let reason: SnapshotRenderFailure = 'capture-failed';
  const [images] = await renderSnapshotBatch([pages], undefined, (why) => {
    reason = why;
  });
  if (!images) throw new SnapshotRenderError(reason);
  return images;
}
