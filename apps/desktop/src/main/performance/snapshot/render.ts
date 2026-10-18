// Turns snapshot pages (HTML) into pictures for the email, with Chromium in a hidden window
// that cannot run scripts, reach the network or open anything else (the same kind of window the
// PDF printer uses). Each page is drawn 360 CSS pixels wide and captured at twice that, so it
// stays sharp on a phone. A page that comes out too big as a PNG is captured again as a JPEG.
//
// One capture at a time across the whole app, and nothing about the driver reaches the log: a
// failure is reported by its place in the batch and a reason code.

import { randomUUID } from 'node:crypto';
import type { BrowserWindow } from 'electron';
import { SNAPSHOT_WIDTH } from './html';

type Electron = typeof import('electron');

/** Pictures above this many bytes are captured again as JPEG. */
export const IMAGE_MAX_BYTES = 400 * 1024;
export const JPEG_QUALITY = 85;
/** How much sharper than the 360 px layout the picture is. */
export const IMAGE_SCALE = 2;
/** The tallest page the capture will take (CSS pixels); anything longer is cut there. */
const MAX_PAGE_HEIGHT = 4000;
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
    width: SNAPSHOT_WIDTH,
    height: 800,
    useContentSize: true,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      session: ses,
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

async function captureOne(win: BrowserWindow, html: string): Promise<SnapshotImage> {
  await withTimeout(win.loadURL(dataUrl(html)), 'load-failed');
  const dbg = win.webContents.debugger;
  const capture = async (): Promise<SnapshotImage> => {
    if (!dbg.isAttached()) dbg.attach('1.3');
    const metrics = (await dbg.sendCommand('Page.getLayoutMetrics')) as LayoutMetrics;
    const size = metrics.cssContentSize ?? metrics.contentSize;
    const height = Math.min(MAX_PAGE_HEIGHT, Math.max(1, Math.ceil(size?.height ?? 800)));
    const clip = { x: 0, y: 0, width: SNAPSHOT_WIDTH, height, scale: IMAGE_SCALE };
    const shot = async (format: 'png' | 'jpeg') =>
      (await dbg.sendCommand('Page.captureScreenshot', {
        format,
        ...(format === 'jpeg' ? { quality: JPEG_QUALITY } : {}),
        clip,
        captureBeyondViewport: true,
        fromSurface: true,
      })) as { data: string };
    let bytes = Buffer.from((await shot('png')).data, 'base64');
    let contentType: SnapshotImage['contentType'] = 'image/png';
    if (pickFormat(bytes.length) === 'jpeg') {
      bytes = Buffer.from((await shot('jpeg')).data, 'base64');
      contentType = 'image/jpeg';
    }
    return { bytes, contentType, width: SNAPSHOT_WIDTH, height };
  };
  try {
    return await withTimeout(capture(), 'capture-failed');
  } finally {
    if (dbg.isAttached()) dbg.detach();
  }
}

function destroy(win: BrowserWindow | null): void {
  if (win && !win.isDestroyed()) win.destroy();
}

/**
 * Draws every page of several snapshots in one hidden window, one after another. The result has
 * one entry per snapshot: its pictures, or null when one of its pages could not be drawn (the
 * email then goes out without the snapshot). `onProgress(done, total)` after each snapshot.
 */
export function renderSnapshotBatch(
  snapshots: ReadonlyArray<readonly string[]>,
  onProgress?: (done: number, total: number) => void,
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
        } catch {
          results.push(null);
          destroy(win);
          win = null;
        }
        onProgress?.(results.length, snapshots.length);
      }
    } finally {
      destroy(win);
    }
    return results;
  });
}

/** Draws one snapshot's pages. Throws a SnapshotRenderError when a page cannot be drawn. */
export async function renderSnapshotPages(pages: readonly string[]): Promise<SnapshotImage[]> {
  const [images] = await renderSnapshotBatch([pages]);
  if (!images) throw new SnapshotRenderError('capture-failed');
  return images;
}
