import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIZE,
  EXTRA_SIZE,
  MIN_SIZE,
  extraWindowKey,
  parseExtraWindowStates,
  parseWindowState,
  pickBounds,
  placeBeside,
} from './windowState';

const screen = { x: 0, y: 0, width: 1920, height: 1080 };

describe('window state', () => {
  it('opens at the usual size the first time', () => {
    expect(pickBounds(null, [screen])).toEqual({ bounds: { ...DEFAULT_SIZE }, maximized: false });
  });

  it('opens where it was left', () => {
    const saved = parseWindowState({ x: 100, y: 50, width: 1000, height: 700, maximized: true });
    expect(pickBounds(saved, [screen])).toEqual({
      bounds: { x: 100, y: 50, width: 1000, height: 700 },
      maximized: true,
    });
  });

  it('drops the position when that screen is gone, and keeps the size', () => {
    const saved = parseWindowState({ x: 2500, y: 100, width: 1000, height: 700 });
    expect(pickBounds(saved, [screen])).toEqual({
      bounds: { width: 1000, height: 700 },
      maximized: false,
    });
  });

  it('ignores a saved file that does not make sense', () => {
    expect(parseWindowState(null)).toBeNull();
    expect(parseWindowState({ x: 'a', y: 0, width: 1000, height: 700 })).toBeNull();
    expect(parseWindowState({ x: 0, y: 0, width: 10, height: 10 })).toBeNull();
  });
});

describe('window size on a small screen', () => {
  const laptop = { x: 0, y: 0, width: 1366, height: 728 };

  it('is never bigger than the usable part of the screen', () => {
    const saved = parseWindowState({ x: 0, y: 0, width: 2400, height: 1300, maximized: false });
    expect(pickBounds(saved, [laptop])).toEqual({
      bounds: { x: 0, y: 0, width: 1366, height: 728 },
      maximized: false,
    });
  });

  it('caps the usual size too', () => {
    expect(pickBounds(null, [laptop]).bounds).toEqual({ width: 1200, height: 728 });
  });

  it('pulls a window that hangs off the edge back onto the screen', () => {
    const saved = parseWindowState({ x: 900, y: 300, width: 1000, height: 700, maximized: false });
    expect(pickBounds(saved, [laptop]).bounds).toEqual({
      x: 366,
      y: 28,
      width: 1000,
      height: 700,
    });
  });

  it('caps a window whose old screen is gone to the screen that is left', () => {
    const saved = parseWindowState({ x: 5000, y: 0, width: 2400, height: 1300, maximized: true });
    expect(pickBounds(saved, [laptop])).toEqual({
      bounds: { width: 1366, height: 728 },
      maximized: true,
    });
  });
});

describe('placing a page-only window', () => {
  const screen = { x: 0, y: 0, width: 1920, height: 1040 };
  const main = { x: 100, y: 80, width: 1200, height: 800 };

  it('opens a step down and right of the main window, at the usual size', () => {
    expect(placeBeside(main, [screen])).toEqual({
      x: 140,
      y: 120,
      width: EXTRA_SIZE.width,
      height: EXTRA_SIZE.height,
    });
  });

  it('stays on the main window’s screen', () => {
    const second = { x: 1920, y: 0, width: 1920, height: 1040 };
    const onSecond = { ...main, x: 2800, y: 500 };
    const placed = placeBeside(onSecond, [screen, second]);
    expect(placed.x).toBe(second.x + second.width - EXTRA_SIZE.width);
    expect(placed.y).toBe(second.y + second.height - EXTRA_SIZE.height);
  });

  it('is never bigger than the screen, and never smaller than the smallest window', () => {
    const small = { x: 0, y: 0, width: 900, height: 650 };
    expect(placeBeside(main, [small])).toEqual({ x: 0, y: 0, width: 900, height: 650 });
    const tiny = { x: 0, y: 0, width: 400, height: 300 };
    const placed = placeBeside(main, [tiny]);
    expect(placed.width).toBe(MIN_SIZE.width);
    expect(placed.height).toBe(MIN_SIZE.height);
  });

  it('gives only a size when there is no main window to open beside', () => {
    expect(placeBeside(null, [screen])).toEqual({ ...EXTRA_SIZE });
    expect(placeBeside(null, [])).toEqual({ ...EXTRA_SIZE });
  });
});

describe('remembering page-only windows', () => {
  it('names each by its page and tab', () => {
    expect(extraWindowKey({ page: 'load-out', tab: 'available-vans' })).toBe(
      'load-out/available-vans',
    );
    expect(extraWindowKey({ page: 'settings' })).toBe('settings');
  });

  it('reads the entries that make sense and drops the rest', () => {
    const good = { x: 10, y: 20, width: 1000, height: 700, maximized: false };
    expect(
      parseExtraWindowStates({
        'load-out/roster': good,
        settings: { ...good, maximized: true },
        'too-small': { x: 0, y: 0, width: 100, height: 100 },
        'Bad Key!': good,
        nothing: null,
      }),
    ).toEqual({ 'load-out/roster': good, settings: { ...good, maximized: true } });
    expect(parseExtraWindowStates(null)).toEqual({});
    expect(parseExtraWindowStates([good])).toEqual({});
    expect(parseExtraWindowStates('x')).toEqual({});
  });
});
