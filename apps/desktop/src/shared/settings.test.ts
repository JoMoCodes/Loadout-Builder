import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  clampFontScale,
  mergeSettings,
  sanitizePatch,
  stepFontScale,
} from './settings';

describe('text size', () => {
  it('moves one step at a time without drifting', () => {
    let scale = 1;
    for (let i = 0; i < 3; i++) scale = stepFontScale(scale, 1);
    expect(scale).toBe(1.3);
    for (let i = 0; i < 3; i++) scale = stepFontScale(scale, -1);
    expect(scale).toBe(1);
  });

  it('stops at the smallest and biggest sizes', () => {
    expect(stepFontScale(FONT_SCALE_MIN, -1)).toBe(FONT_SCALE_MIN);
    expect(stepFontScale(FONT_SCALE_MAX, 1)).toBe(FONT_SCALE_MAX);
    expect(clampFontScale(99)).toBe(FONT_SCALE_MAX);
    expect(clampFontScale(0)).toBe(FONT_SCALE_MIN);
  });

  it('goes back to normal when the number makes no sense', () => {
    expect(clampFontScale(Number.NaN)).toBe(1);
  });
});

describe('saved choices', () => {
  it('keeps only valid fields', () => {
    expect(
      sanitizePatch({ theme: 'dark', fontScale: 1.2, demoMode: true, lastSeenVersion: '2.0.0' }),
    ).toEqual({ theme: 'dark', fontScale: 1.2, demoMode: true, lastSeenVersion: '2.0.0' });
    expect(sanitizePatch({ theme: 'purple', fontScale: 'big', demoMode: 'yes' })).toEqual({});
    expect(sanitizePatch({ lastSeenVersion: '../../etc' })).toEqual({});
    expect(sanitizePatch(null)).toEqual({});
    expect(sanitizePatch('dark')).toEqual({});
  });

  it('accepts the three themes', () => {
    for (const theme of ['light', 'dark', 'high-contrast']) {
      expect(sanitizePatch({ theme })).toEqual({ theme });
    }
  });

  it('leaves unchanged fields alone when merging', () => {
    const merged = mergeSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { fontScale: 1.4 });
    expect(merged).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark', fontScale: 1.4 });
  });
});

describe('old data question', () => {
  it('starts as not asked, and keeps only a true or false', () => {
    expect(DEFAULT_SETTINGS.oldDataAsked).toBe(false);
    expect(sanitizePatch({ oldDataAsked: true })).toEqual({ oldDataAsked: true });
    expect(sanitizePatch({ oldDataAsked: 'yes' })).toEqual({});
  });
});

describe('help settings', () => {
  it('start with the checklist showing and the tours on', () => {
    expect(DEFAULT_SETTINGS.checklistHidden).toBe(false);
    expect(DEFAULT_SETTINGS.printedOnce).toBe(false);
    expect(DEFAULT_SETTINGS.autoTours).toBe(true);
    expect(DEFAULT_SETTINGS.toursSeen).toEqual([]);
  });

  it('keeps the checklist, printing and tour switches when they are true or false', () => {
    expect(sanitizePatch({ checklistHidden: true, printedOnce: true, autoTours: false })).toEqual({
      checklistHidden: true,
      printedOnce: true,
      autoTours: false,
    });
    expect(sanitizePatch({ checklistHidden: 'yes', printedOnce: 1, autoTours: null })).toEqual({});
  });

  it('keeps a list of tour names, once each', () => {
    expect(sanitizePatch({ toursSeen: ['home', 'load-out-print', 'home'] })).toEqual({
      toursSeen: ['home', 'load-out-print'],
    });
    expect(sanitizePatch({ toursSeen: [] })).toEqual({ toursSeen: [] });
  });

  it('refuses a tour list with anything odd in it', () => {
    expect(sanitizePatch({ toursSeen: ['home', '../x'] })).toEqual({});
    expect(sanitizePatch({ toursSeen: ['home', 3] })).toEqual({});
    expect(sanitizePatch({ toursSeen: 'home' })).toEqual({});
    expect(sanitizePatch({ toursSeen: Array.from({ length: 61 }, () => 'home') })).toEqual({});
  });

  it('fills in the help settings for a settings file saved before they existed', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { theme: 'light', lastSeenVersion: '2.0.0' });
    expect(merged.checklistHidden).toBe(false);
    expect(merged.autoTours).toBe(true);
    expect(merged.toursSeen).toEqual([]);
  });
});
