// How the app looks: the colour theme, the text size, and the last page. The page's <html>
// element carries the choices so the style files can key off them:
//   <html data-theme="light" | "dark" | "high-contrast" style="--font-scale: 1">
//
// The main process is where choices are saved for good. A copy is also kept in the browser's
// own storage so the right look is on screen from the first moment, with no flash. Storage can
// be missing or blocked, so every read and write is guarded and the app works without it.

import { DEFAULT_SETTINGS, mergeSettings } from '../../shared/settings';
import type { AppSettings, ThemeName } from '../../shared/settings';

const LOOK_KEY = 'loadout.look';
const PAGE_KEY = 'loadout.page';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage is blocked or full. The choice still applies for this run.
  }
}

export function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
}

export function applyFontScale(scale: number): void {
  document.documentElement.style.setProperty('--font-scale', String(scale));
}

export function applyLook(settings: Pick<AppSettings, 'theme' | 'fontScale'>): void {
  applyTheme(settings.theme);
  applyFontScale(settings.fontScale);
}

/** The look from the last run, read straight away. Falls back to the usual look. */
export function readCachedLook(): Pick<AppSettings, 'theme' | 'fontScale'> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(read(LOOK_KEY) ?? 'null');
  } catch {
    parsed = null;
  }
  const { theme, fontScale } = mergeSettings(DEFAULT_SETTINGS, parsed);
  return { theme, fontScale };
}

export function cacheLook(settings: Pick<AppSettings, 'theme' | 'fontScale'>): void {
  write(LOOK_KEY, JSON.stringify({ theme: settings.theme, fontScale: settings.fontScale }));
}

export function readLastPage(): string | null {
  return read(PAGE_KEY);
}

export function writeLastPage(pageId: string): void {
  write(PAGE_KEY, pageId);
}
