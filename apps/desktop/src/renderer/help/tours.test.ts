import { describe, expect, it } from 'vitest';
import { sanitizePatch } from '../../shared/settings';
import { TOURS, TOUR_NAMES, tourNameFor } from './tours';

describe('the page tours', () => {
  it('cover Home, each Load Out tab, the data pages and Settings', () => {
    for (const name of [
      'home',
      'load-out-roster',
      'load-out-print',
      'load-out-available-vans',
      'load-out-previous-roster',
      'route-data',
      'vehicle-data',
      'associates',
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
    expect(tourNameFor('how-to-use', null)).toBeNull();
    expect(tourNameFor('features-log', null)).toBeNull();
  });
});
