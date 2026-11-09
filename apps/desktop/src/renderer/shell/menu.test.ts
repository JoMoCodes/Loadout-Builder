import { describe, expect, it } from 'vitest';
import { DEFAULT_MENU, menuAfter, menuView, parseMenuChoice } from './menu';

describe('the left menu', () => {
  it('starts open and locked, as it always was', () => {
    expect(DEFAULT_MENU).toEqual({ locked: true, wide: true });
    expect(menuView(DEFAULT_MENU, false)).toBe('wide');
    // Pointing at a locked menu changes nothing.
    expect(menuView(DEFAULT_MENU, true)).toBe('wide');
  });

  it('Hide shrinks it to icons and keeps it there, even when pointed at', () => {
    const hidden = menuAfter(DEFAULT_MENU, 'hide');
    expect(hidden).toEqual({ locked: true, wide: false });
    expect(menuView(hidden, false)).toBe('icons');
    expect(menuView(hidden, true)).toBe('icons');
  });

  it('Show opens it wide again', () => {
    expect(menuAfter({ locked: true, wide: false }, 'show')).toEqual(DEFAULT_MENU);
  });

  it('unlocked, it rests as icons and opens while pointed at', () => {
    const unlocked = menuAfter(DEFAULT_MENU, 'unlock');
    expect(unlocked.locked).toBe(false);
    expect(menuView(unlocked, false)).toBe('icons');
    expect(menuView(unlocked, true)).toBe('peek');
  });

  it('Lock pins it open', () => {
    expect(menuAfter({ locked: false, wide: true }, 'lock')).toEqual(DEFAULT_MENU);
    expect(menuAfter({ locked: false, wide: false }, 'lock')).toEqual(DEFAULT_MENU);
  });

  it('reads a saved choice, and falls back to the usual menu for anything odd', () => {
    expect(parseMenuChoice(JSON.stringify({ locked: false, wide: true }))).toEqual({
      locked: false,
      wide: true,
    });
    expect(parseMenuChoice(null)).toEqual(DEFAULT_MENU);
    expect(parseMenuChoice('not json')).toEqual(DEFAULT_MENU);
    expect(parseMenuChoice('"wide"')).toEqual(DEFAULT_MENU);
    expect(parseMenuChoice(JSON.stringify({ locked: 'yes' }))).toEqual(DEFAULT_MENU);
  });
});
