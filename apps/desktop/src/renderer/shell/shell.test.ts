import { describe, expect, it } from 'vitest';
import { PAGES, pageIdFrom } from '../pages';
import { updatePillText } from './TopBar';

describe('pages', () => {
  it('are the nine pages, in menu order', () => {
    expect(PAGES.map((page) => page.id)).toEqual([
      'home',
      'load-out',
      'route-data',
      'vehicle-data',
      'associates',
      'previous-roster',
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
