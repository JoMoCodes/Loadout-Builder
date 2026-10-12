// Remembers where the window was and how big, so it opens the same way next time. The page-only
// windows ("Open in new window") are remembered too, one entry per page and tab.

import type { WindowTarget } from '../shared/windows';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState extends Rect {
  maximized: boolean;
}

export const DEFAULT_SIZE = { width: 1200, height: 800 } as const;
export const MIN_SIZE = { width: 800, height: 600 } as const;

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Reads a saved window state, or null if it is missing or does not make sense. */
export function parseWindowState(raw: unknown): WindowState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isNumber(r.x) || !isNumber(r.y) || !isNumber(r.width) || !isNumber(r.height)) return null;
  if (r.width < MIN_SIZE.width || r.height < MIN_SIZE.height) return null;
  return {
    x: Math.round(r.x),
    y: Math.round(r.y),
    width: Math.round(r.width),
    height: Math.round(r.height),
    maximized: r.maximized === true,
  };
}

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** The screen the rectangle overlaps most, else the first one (the main screen). */
function screenFor(rect: Rect, screens: readonly Rect[]): Rect | null {
  let best: Rect | null = null;
  let bestOverlap = 0;
  for (const screen of screens) {
    const area = overlap(rect, screen);
    if (area > bestOverlap) {
      best = screen;
      bestOverlap = area;
    }
  }
  return best ?? screens[0] ?? null;
}

/**
 * Picks the window rectangle to open with. If the saved spot is no longer on any screen (for
 * example a second monitor was unplugged), the position is dropped and only the size is kept.
 * The size is never bigger than the screen's usable area (a window saved on a big monitor and
 * opened on a small laptop screen would otherwise hang off the edges).
 */
export function pickBounds(
  saved: WindowState | null,
  screens: readonly Rect[],
): { bounds: Partial<Rect> & { width: number; height: number }; maximized: boolean } {
  const wanted = saved ?? { ...DEFAULT_SIZE, x: 0, y: 0, maximized: false };
  const visible = saved !== null && screens.some((screen) => overlap(saved, screen) >= 200 * 200);
  const area = screenFor(wanted, screens);

  let width = wanted.width;
  let height = wanted.height;
  if (area) {
    width = Math.min(width, area.width);
    height = Math.min(height, area.height);
  }
  if (!visible || !area) {
    return saved === null
      ? { bounds: { width, height }, maximized: false }
      : { bounds: { width, height }, maximized: saved.maximized };
  }
  // Keep the whole window on the screen it is on.
  const x = Math.max(area.x, Math.min(saved.x, area.x + area.width - width));
  const y = Math.max(area.y, Math.min(saved.y, area.y + area.height - height));
  return { bounds: { x, y, width, height }, maximized: saved.maximized };
}

/** The size a page-only window opens at, before it is kept on its screen. */
export const EXTRA_SIZE = { width: 1000, height: 700 } as const;

/** How far down and right of the main window a page-only window opens, in pixels. */
const EXTRA_OFFSET = 40;

/**
 * Where a page-only window opens: a step down and right of the main window, on the main
 * window's screen, and never bigger than that screen's usable area. With no main window (or no
 * screens) it is left to the computer to place.
 */
export function placeBeside(
  main: Rect | null,
  screens: readonly Rect[],
  size: { width: number; height: number } = EXTRA_SIZE,
): Partial<Rect> & { width: number; height: number } {
  const area = main ? screenFor(main, screens) : (screens[0] ?? null);
  if (!area) return { ...size };
  const width = Math.max(MIN_SIZE.width, Math.min(size.width, area.width));
  const height = Math.max(MIN_SIZE.height, Math.min(size.height, area.height));
  if (!main) return { width, height };
  const x = Math.max(area.x, Math.min(main.x + EXTRA_OFFSET, area.x + area.width - width));
  const y = Math.max(area.y, Math.min(main.y + EXTRA_OFFSET, area.y + area.height - height));
  return { x, y, width, height };
}

/** The name a page-only window is remembered under: "load-out/available-vans", or "settings". */
export function extraWindowKey(target: WindowTarget): string {
  return target.tab ? `${target.page}/${target.tab}` : target.page;
}

/** Reads the remembered page-only windows, keeping only the entries that make sense. */
export function parseExtraWindowStates(raw: unknown): Record<string, WindowState> {
  const states: Record<string, WindowState> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return states;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const state = parseWindowState(value);
    if (state && /^[a-z-]+(\/[a-z-]+)?$/.test(key)) states[key] = state;
  }
  return states;
}
