import { describe, expect, it } from 'vitest';
import { DEFAULT_SIZE, parseWindowState, pickBounds } from './windowState';

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
