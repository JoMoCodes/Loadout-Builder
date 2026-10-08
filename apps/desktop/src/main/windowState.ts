// Remembers where the window was and how big, so it opens the same way next time.

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
