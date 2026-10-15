import { describe, expect, it } from 'vitest';
import { PAGES, pageIdFrom, rememberedPlace } from '../pages';
import { updatePillText } from './TopBar';

describe('pages', () => {
  it('are the eleven pages, in menu order', () => {
    expect(PAGES.map((page) => page.id)).toEqual([
      'home',
      'dashboard',
      'load-out',
      'route-sheets',
      'route-data',
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
