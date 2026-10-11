// Prints report HTML to PDF files with Chromium, in a hidden window that cannot run scripts,
// reach the network or open anything else. One print at a time across the whole app: a batch
// of 80 reports runs one after another in a single window.
//
// Logs and errors never name the driver: a file's path holds their name, so a failure is
// reported by its place in the batch and a reason code.

import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import type { BrowserWindow, PrintToPDFOptions } from 'electron';

type Electron = typeof import('electron');

/** Pages are US Letter; the page number sits in the bottom margin like the old report. */
export const PDF_OPTIONS: PrintToPDFOptions = {
  pageSize: 'Letter',
  printBackground: true,
  margins: { top: 0.55, bottom: 0.6, left: 0.55, right: 0.55 },
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate:
    '<div style="width:100%;text-align:center;font-size:9pt;font-family:Arial,Helvetica,sans-serif;color:#000">' +
    'Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
};

/** How long one report may take to load and print before it is given up on. */
const STEP_TIMEOUT_MS = 60_000;

export type PrintFailure = 'load-failed' | 'print-failed' | 'write-failed' | 'timed-out';

export class ReportPrintError extends Error {
  constructor(readonly reason: PrintFailure) {
    super(`The report could not be printed (${reason}).`);
    this.name = 'ReportPrintError';
  }
}

export interface PrintItem {
  html: string;
  outFile: string;
}

export interface PrintResult {
  outFile: string;
  ok: boolean;
  reason?: PrintFailure;
}

let queue: Promise<unknown> = Promise.resolve();

/** Runs jobs one at a time, in the order they were asked for. */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

async function loadElectron(): Promise<Electron> {
  return import('electron');
}

function withTimeout<T>(work: Promise<T>, reason: PrintFailure): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ReportPrintError('timed-out')), STEP_TIMEOUT_MS);
  });
  return Promise.race([
    work.catch((error: unknown) => {
      throw error instanceof ReportPrintError ? error : new ReportPrintError(reason);
    }),
    limit,
  ]).finally(() => clearTimeout(timer));
}

/** A hidden window in its own in-memory session: no scripts, no network, no new windows. */
function createPrintWindow(electron: Electron): BrowserWindow {
  const ses = electron.session.fromPartition(`report-print-${randomUUID()}`, { cache: false });
  // Only the report itself may load: no web addresses, no files from disk.
  ses.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !details.url.startsWith('data:') });
  });
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  const win = new electron.BrowserWindow({
    show: false,
    width: 816,
    height: 1056,
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

async function writeAtomically(outFile: string, bytes: Buffer): Promise<void> {
  const part = `${outFile}.${process.pid}.part`;
  try {
    await writeFile(part, bytes);
    await rename(part, outFile);
  } catch {
    await rm(part, { force: true }).catch(() => undefined);
    throw new ReportPrintError('write-failed');
  }
}

async function printOne(win: BrowserWindow, item: PrintItem): Promise<void> {
  await withTimeout(win.loadURL(dataUrl(item.html)), 'load-failed');
  const bytes = await withTimeout(win.webContents.printToPDF(PDF_OPTIONS), 'print-failed');
  await writeAtomically(item.outFile, bytes);
}

function destroy(win: BrowserWindow | null): void {
  if (win && !win.isDestroyed()) win.destroy();
}

/** Prints the HTML to a PDF file. Resolves when the file is written. */
export function printHtmlToPdf(html: string, outFile: string): Promise<void> {
  return enqueue(async () => {
    const electron = await loadElectron();
    const win = createPrintWindow(electron);
    try {
      await printOne(win, { html, outFile });
    } finally {
      destroy(win);
    }
  });
}

/**
 * Prints several reports one after another in one hidden window. A report that fails does not
 * stop the rest; each result says whether its file was written. `onProgress(done, total)` is
 * called after each one.
 */
export function printHtmlBatch(
  items: readonly PrintItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<PrintResult[]> {
  return enqueue(async () => {
    const results: PrintResult[] = [];
    if (items.length === 0) return results;
    const electron = await loadElectron();
    let win: BrowserWindow | null = null;
    try {
      for (const item of items) {
        if (win === null || win.isDestroyed()) win = createPrintWindow(electron);
        try {
          await printOne(win, item);
          results.push({ outFile: item.outFile, ok: true });
        } catch (error) {
          const reason = error instanceof ReportPrintError ? error.reason : 'print-failed';
          results.push({ outFile: item.outFile, ok: false, reason });
          // A window that timed out or broke may be stuck: start the next one fresh.
          destroy(win);
          win = null;
        }
        onProgress?.(results.length, items.length);
      }
    } finally {
      destroy(win);
    }
    return results;
  });
}
