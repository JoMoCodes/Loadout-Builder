// What a page-only window is opened on travels in its address, and its title says what it shows.

import { describe, expect, it } from 'vitest';
import {
  PAGE_IDS,
  PAGE_TABS,
  currentTarget,
  isTabOf,
  isWindowTarget,
  parseWindowTarget,
  sameTarget,
  windowQuery,
  windowTitle,
} from './windows';

describe('the pages and their tabs', () => {
  it('lists the eleven pages in menu order', () => {
    expect(PAGE_IDS).toEqual([
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

  it('knows the tabs of the six tabbed pages, and that the others have none', () => {
    expect(PAGE_TABS['load-out'].map((tab) => tab.id)).toEqual([
      'roster',
      'print',
      'available-vans',
      'previous-roster',
    ]);
    expect(PAGE_TABS['route-sheets'].map((tab) => tab.id)).toEqual([
      'distribute',
      'sheets',
      'history',
    ]);
    expect(PAGE_TABS['route-data'].map((tab) => tab.id)).toEqual([
      'routes',
      'itineraries',
      'schedule',
      'dwp',
    ]);
    expect(PAGE_TABS['vehicle-data'].map((tab) => tab.id)).toEqual([
      'management',
      'affinity',
      'lmr',
    ]);
    expect(PAGE_TABS.associates.map((tab) => tab.id)).toEqual(['associates', 'lifetime-routes']);
    expect(PAGE_TABS.scorecards.map((tab) => tab.id)).toEqual([
      'performance',
      'reports',
      'imports',
    ]);
    for (const page of ['home', 'dashboard', 'settings'] as const) {
      expect(PAGE_TABS[page]).toEqual([]);
    }
  });

  it('tells a tab of a page from one of another page', () => {
    expect(isTabOf('load-out', 'roster')).toBe(true);
    expect(isTabOf('route-data', 'roster')).toBe(false);
    expect(isTabOf('settings', 'roster')).toBe(false);
    expect(isTabOf('load-out', null)).toBe(false);
  });
});

describe('a window target (what the page sends on app:open-window)', () => {
  it('is a page, with a tab only when it is one of that page’s tabs', () => {
    expect(isWindowTarget({ page: 'settings' })).toBe(true);
    expect(isWindowTarget({ page: 'load-out', tab: 'available-vans' })).toBe(true);
    expect(isWindowTarget({ page: 'load-out', tab: 'performance' })).toBe(false);
    expect(isWindowTarget({ page: 'settings', tab: 'roster' })).toBe(false);
    expect(isWindowTarget({ page: 'nowhere' })).toBe(false);
    expect(isWindowTarget({ tab: 'roster' })).toBe(false);
    expect(isWindowTarget('load-out')).toBe(false);
    expect(isWindowTarget(null)).toBe(false);
    expect(isWindowTarget(['load-out'])).toBe(false);
  });

  it('names the same window only for the same page and tab', () => {
    expect(
      sameTarget({ page: 'load-out', tab: 'roster' }, { page: 'load-out', tab: 'roster' }),
    ).toBe(true);
    expect(sameTarget({ page: 'settings' }, { page: 'settings' })).toBe(true);
    expect(sameTarget({ page: 'load-out', tab: 'roster' }, { page: 'load-out' })).toBe(false);
    expect(
      sameTarget({ page: 'load-out', tab: 'roster' }, { page: 'load-out', tab: 'print' }),
    ).toBe(false);
  });
});

describe('the window title', () => {
  it('is the page, then the tab', () => {
    expect(windowTitle({ page: 'load-out', tab: 'available-vans' })).toBe(
      'Load Out · Available Vans',
    );
    expect(windowTitle({ page: 'scorecards', tab: 'imports' })).toBe('Scorecards · Imports');
  });

  it('is the page alone when there is no tab', () => {
    expect(windowTitle({ page: 'settings' })).toBe('Settings');
    expect(windowTitle({ page: 'load-out' })).toBe('Load Out');
  });
});

describe('the address of a page-only window', () => {
  it('carries the page and the tab, and reads them back', () => {
    const target = { page: 'load-out', tab: 'available-vans' } as const;
    const query = windowQuery(target);
    expect(query).toEqual({ page: 'load-out', tab: 'available-vans' });
    expect(parseWindowTarget(`?${new URLSearchParams(query).toString()}`)).toEqual(target);
    expect(windowQuery({ page: 'settings' })).toEqual({ page: 'settings' });
    expect(parseWindowTarget('?page=settings')).toEqual({ page: 'settings' });
  });

  it('is nothing for the main window, which has no page in its address', () => {
    expect(parseWindowTarget('')).toBeNull();
    expect(parseWindowTarget('?other=1')).toBeNull();
  });

  it('ignores a page that is not one, and a tab that is not the page’s', () => {
    expect(parseWindowTarget('?page=nowhere')).toBeNull();
    expect(parseWindowTarget('?page=load-out&tab=nowhere')).toEqual({ page: 'load-out' });
    expect(parseWindowTarget('?page=settings&tab=roster')).toEqual({ page: 'settings' });
    expect(parseWindowTarget('?page=load-out&tab=')).toEqual({ page: 'load-out' });
  });

  it('opens the new place for an address from before a page or tab was renamed', () => {
    expect(parseWindowTarget('?page=performance')).toEqual({ page: 'scorecards' });
    expect(parseWindowTarget('?page=performance&tab=drivers')).toEqual({
      page: 'scorecards',
      tab: 'performance',
    });
    expect(parseWindowTarget('?page=performance&tab=imports')).toEqual({
      page: 'scorecards',
      tab: 'imports',
    });
    // The Directory tab is gone: the page opens as usual.
    expect(parseWindowTarget('?page=performance&tab=directory')).toEqual({ page: 'scorecards' });
    expect(parseWindowTarget('?page=previous-roster')).toEqual({
      page: 'load-out',
      tab: 'previous-roster',
    });
  });
});

describe('an old page or tab name', () => {
  it('leads to where that page or tab is now', () => {
    expect(currentTarget('performance')).toEqual({ page: 'scorecards' });
    expect(currentTarget('performance', 'drivers')).toEqual({
      page: 'scorecards',
      tab: 'performance',
    });
    expect(currentTarget('scorecards', 'drivers')).toEqual({
      page: 'scorecards',
      tab: 'performance',
    });
    expect(currentTarget('previous-roster')).toEqual({
      page: 'load-out',
      tab: 'previous-roster',
    });
  });

  it('leaves a current name alone, and drops a tab that is not the page’s', () => {
    expect(currentTarget('scorecards', 'reports')).toEqual({ page: 'scorecards', tab: 'reports' });
    expect(currentTarget('settings')).toEqual({ page: 'settings' });
    expect(currentTarget('settings', '')).toEqual({ page: 'settings' });
    expect(currentTarget('load-out', 'drivers')).toEqual({ page: 'load-out' });
  });

  it('is nothing for a name that was never a page', () => {
    expect(currentTarget('nowhere')).toBeNull();
    expect(currentTarget(null)).toBeNull();
    expect(currentTarget(undefined)).toBeNull();
    expect(currentTarget('toString')).toBeNull();
  });
});
