import { describe, expect, it } from 'vitest';
import { PAGES, pageIdFrom, rememberedPlace } from '../pages';
import { updatePillText } from './controls';
import { SAVED_COUNTS, UTILITY_PAGES } from './Nav';

describe('pages', () => {
  it('are the ten pages, in menu order', () => {
    expect(PAGES.map((page) => page.id)).toEqual([
      'home',
      'dashboard',
      'load-out',
      'route-sheets',
      'vehicle-data',
      'associates',
      'scorecards',
      'how-to-use',
      'features-log',
      'settings',
    ]);
  });

  it('use a remembered page, or home when it is not a page', () => {
    expect(pageIdFrom('settings')).toBe('settings');
    expect(pageIdFrom('gone')).toBe('home');
    expect(pageIdFrom(null)).toBe('home');
  });

  it('open the new place for a remembered page that was renamed or became a tab', () => {
    expect(rememberedPlace('performance')).toEqual({ page: 'scorecards' });
    expect(pageIdFrom('performance')).toBe('scorecards');
    expect(rememberedPlace('previous-roster')).toEqual({
      page: 'load-out',
      tab: 'previous-roster',
    });
    expect(pageIdFrom('previous-roster')).toBe('load-out');
    expect(rememberedPlace('settings')).toEqual({ page: 'settings' });
    expect(rememberedPlace('gone')).toEqual({ page: 'home' });
  });
});

describe('the left menu', () => {
  it('keeps the pages about the app last, so the menu still reads in page order', () => {
    // The menu shows the everyday pages at the top and these at the bottom. Were one of them
    // not at the end of the list, the menu's order would no longer be the pages' order.
    const ids = PAGES.map((page) => page.id);
    expect(ids.slice(-UTILITY_PAGES.length)).toEqual([...UTILITY_PAGES]);
    expect(UTILITY_PAGES).toEqual(['how-to-use', 'features-log', 'settings']);
  });

  it('counts the same three things Home does, in plain words', () => {
    expect(SAVED_COUNTS.map((one) => one.label)).toEqual([
      'Drivers on the roster',
      'Drivers in your list',
      'Vans in your list',
    ]);
    expect(SAVED_COUNTS.map((one) => one.table)).toEqual(['driver_rows', 'associates', 'vehicles']);
  });
});

describe('update pill', () => {
  const base = { version: null, percent: null, message: null };

  it('says nothing when there is nothing to check (a development run)', () => {
    expect(updatePillText({ ...base, state: 'unsupported' })).toBeNull();
    expect(updatePillText({ ...base, state: 'idle' })).toBeNull();
  });

  it('says what is happening in plain words', () => {
    expect(updatePillText({ ...base, state: 'checking' })).toBe('Checking for updates');
    expect(updatePillText({ ...base, state: 'ready' })).toBe('Update ready');
    expect(updatePillText({ ...base, state: 'downloading', percent: 40 })).toBe(
      'Getting the new version (40%)',
    );
    expect(updatePillText({ ...base, state: 'error' })).toBe('Could not check for updates');
  });
});
