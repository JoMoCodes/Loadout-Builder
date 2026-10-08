// Is a message from the app's own page? Every channel handler asks, because Electron will pass
// a message from any page a window happens to hold (a link that got through, a dropped file).

import { pathToFileURL } from 'node:url';

export interface PageOrigin {
  /** The dev server's address, when the app was started with `npm start`. */
  devServerUrl?: string | null;
  /** The installed app's page file (dist/renderer/index.html). */
  pageFile?: string | null;
}

function withoutQuery(url: URL): string {
  const copy = new URL(url.href);
  copy.search = '';
  copy.hash = '';
  return copy.href;
}

/**
 * True for the app's own page only: in the installed app, that one file; under `npm start`, the
 * dev server's own address. Anything else, including an empty or odd address, is false.
 */
export function isOwnPage(rawUrl: unknown, origin: PageOrigin): boolean {
  if (typeof rawUrl !== 'string' || rawUrl === '') return false;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (origin.devServerUrl) {
    try {
      const dev = new URL(origin.devServerUrl);
      return url.origin !== 'null' && url.origin === dev.origin;
    } catch {
      return false;
    }
  }
  if (origin.pageFile && url.protocol === 'file:') {
    return withoutQuery(url) === pathToFileURL(origin.pageFile).href;
  }
  return false;
}
