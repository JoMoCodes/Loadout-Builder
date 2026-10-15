import { describe, expect, it } from 'vitest';
import { sanitizePatch } from '../../shared/settings';
import { TOURS, TOUR_NAMES, openScorecardsTab, tourNameFor, tourSeen } from './tours';

describe('the page tours', () => {
  it('cover Home, each Load Out and Scorecards tab, the data pages, Dashboard and Settings', () => {
    for (const name of [
      'home',
      'load-out-roster',
      'load-out-print',
      'load-out-available-vans',
      'load-out-previous-roster',
      'route-data',
      'route-sheets',
      'vehicle-data',
      'associates',
      'scorecards-performance',
      'scorecards-reports',
      'scorecards-imports',
      'dashboard',
      'settings',
    ]) {
      expect(TOURS[name], name).toBeDefined();
    }
  });

  it('have 3 to 6 short steps each', () => {
    for (const tour of Object.values(TOURS)) {
      expect(tour.steps.length, tour.name).toBeGreaterThanOrEqual(3);
      expect(tour.steps.length, tour.name).toBeLessThanOrEqual(6);
      for (const step of tour.steps) {
        expect(step.title.length, step.title).toBeLessThanOrEqual(40);
        // About three short sentences at most.
        expect(step.text.length, step.title).toBeLessThanOrEqual(170);
      }
    }
  });

  it('are stored under names the settings accept', () => {
    expect(sanitizePatch({ toursSeen: TOUR_NAMES })).toEqual({ toursSeen: TOUR_NAMES });
    for (const [key, tour] of Object.entries(TOURS)) expect(tour.name).toBe(key);
  });

  it('pick the tour for the page on screen, and the open tab on Load Out', () => {
    expect(tourNameFor('home', null)).toBe('home');
    expect(tourNameFor('settings', null)).toBe('settings');
    expect(tourNameFor('load-out', null)).toBe('load-out-roster');
    expect(tourNameFor('load-out', 'print')).toBe('load-out-print');
    expect(tourNameFor('scorecards', null)).toBe('scorecards-performance');
    expect(tourNameFor('scorecards', 'imports')).toBe('scorecards-imports');
    expect(tourNameFor('scorecards', 'nothing-like-this')).toBeNull();
    expect(tourNameFor('route-sheets', null)).toBe('route-sheets');
    expect(tourNameFor('dashboard', null)).toBe('dashboard');
    expect(tourNameFor('how-to-use', null)).toBeNull();
    expect(tourNameFor('features-log', null)).toBeNull();
  });

  it('point the weekly tours at the Scorecards page and the Dashboard', () => {
    for (const name of TOUR_NAMES.filter((one) => one.startsWith('scorecards-'))) {
      for (const step of TOURS[name]!.steps) {
        if (step.element) expect(step.element, name).toContain('[data-page="scorecards"]');
      }
    }
    for (const step of TOURS.dashboard!.steps) {
      expect(step.element).toContain('[data-page="dashboard"]');
    }
  });

  it('point the Route Sheets tour at the Route Sheets page, the same on every tab', () => {
    for (const step of TOURS['route-sheets']!.steps) {
      expect(step.element).toContain('[data-page="route-sheets"]');
    }
    // The Sheets and History tabs are pointed at by their tab buttons, which are on every tab (so the first tour never skips a step).
    const tabs = TOURS['route-sheets']!.steps.filter((step) => step.element?.includes('-tab-'));
    expect(new Set(tabs.map((step) => step.element)).size).toBe(3);
  });

  it('read the open Scorecards tab from the page', () => {
    const tab = {
      getAttribute: (name: string) => (name === 'id' ? 'scorecards-tab-reports' : null),
    };
    const root = { querySelector: () => tab } as unknown as ParentNode;
    expect(openScorecardsTab(root)).toBe('reports');
    const none = { querySelector: () => null } as unknown as ParentNode;
    expect(openScorecardsTab(none)).toBeNull();
  });

  it('count a Scorecards tour as seen when it ran under the page’s old name, Performance', () => {
    expect(tourSeen(['performance-drivers'], 'scorecards-performance')).toBe(true);
    expect(tourSeen(['performance-imports'], 'scorecards-imports')).toBe(true);
    expect(tourSeen(['scorecards-reports'], 'scorecards-reports')).toBe(true);
    expect(tourSeen(['performance-reports'], 'scorecards-imports')).toBe(false);
    expect(tourSeen(['home'], 'load-out-roster')).toBe(false);
    // The Directory tab is gone, and so is its tour.
    expect(TOURS['performance-directory']).toBeUndefined();
  });
});
