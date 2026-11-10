// The Dashboard's layouts: what a saved layout may hold, how one is changed, and its file.

import { describe, expect, it } from 'vitest';
import {
  CUSTOM_NUMBERS,
  DEFAULT_DASHBOARD,
  LAYOUT_PRESETS,
  MAX_CUSTOM,
  MAX_LAYOUTS,
  SECTION_KINDS,
  activeLayout,
  changeSection,
  cleanLayout,
  cleanSection,
  cleanWeeks,
  freshId,
  freshName,
  layoutFileName,
  layoutFromFile,
  layoutToFile,
  mergeDashboard,
  missingKinds,
  moveSection,
  narrowWidth,
  nearestWidth,
  newSection,
  removeSection,
  stepSection,
  usualLayout,
  usualSections,
} from './dashboardLayout';
import { DEFAULT_SETTINGS, mergeSettings } from './settings';

const ids = (sections: ReadonlyArray<{ id: string }>) => sections.map((section) => section.id);

describe('the usual layout', () => {
  it('is the four tiles, who needs a word, ID expiry, the movers and the trend', () => {
    expect(ids(usualSections())).toEqual([
      'tile-fleet',
      'tile-tiers',
      'tile-packages',
      'tile-safety',
      'coaching',
      'ids',
      'improved',
      'declined',
      'trend',
      'reasons',
    ]);
    // Each row fills the page's twelve columns.
    expect(usualSections().map((section) => section.width)).toEqual([3, 3, 3, 3, 8, 4, 6, 6, 8, 4]);
  });

  it('is what the app starts with, and what older saved settings get', () => {
    expect(DEFAULT_SETTINGS.dashboard).toEqual(DEFAULT_DASHBOARD);
    const older: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    delete older.dashboard;
    const merged = mergeSettings(older as never, { theme: 'light' });
    expect(merged.dashboard).toEqual(DEFAULT_DASHBOARD);
    expect(activeLayout(merged.dashboard).name).toBe('The usual');
  });

  it('every ready-made layout passes its own checks unchanged', () => {
    for (const preset of LAYOUT_PRESETS) {
      const layout = {
        id: 'layout-1',
        name: preset.name,
        sections: preset.sections(),
        weeks: preset.weeks,
      };
      expect(cleanLayout(layout), preset.id).toEqual(layout);
    }
  });

  it('a fresh section of every kind passes its own checks unchanged', () => {
    for (const kind of SECTION_KINDS) {
      const section = newSection(kind, kind === 'custom' ? 'custom-1' : kind);
      expect(cleanSection(section), kind).toEqual(section);
    }
  });
});

describe('checking a section', () => {
  it('refuses a kind it does not know, and anything that is not a section', () => {
    expect(cleanSection({ id: 'x', kind: 'weather', width: 3 })).toBeNull();
    expect(cleanSection(null)).toBeNull();
    expect(cleanSection('coaching')).toBeNull();
  });

  it('puts odd sizes and choices back to the usual ones', () => {
    const section = cleanSection({
      id: 'coaching',
      kind: 'coaching',
      width: 5,
      height: 'huge',
      showFirst: 999,
      reasons: ['bronze', 'nonsense', 'falling'],
      highOnly: 'yes',
    });
    expect(section).toEqual({
      ...newSection('coaching'),
      reasons: ['bronze', 'falling'],
      highOnly: false,
    });
  });

  it('drops choices that belong to another kind', () => {
    const section = cleanSection({
      id: 'trend',
      kind: 'trend',
      width: 12,
      height: 'tall',
      target: { dir: 'min', value: 90 },
      title: 'Mine',
    });
    expect(section).toEqual({ id: 'trend', kind: 'trend', width: 12, height: 'tall' });
  });

  it('keeps a target only when it is a real number one way or the other', () => {
    const tile = (target: unknown) => cleanSection({ ...newSection('tile-fleet'), target })!.target;
    expect(tile({ dir: 'min', value: 90 })).toEqual({ dir: 'min', value: 90 });
    expect(tile({ dir: 'max', value: 0 })).toEqual({ dir: 'max', value: 0 });
    expect(tile({ dir: 'up', value: 90 })).toBeNull();
    expect(tile({ dir: 'min', value: Number.NaN })).toBeNull();
    expect(tile({ dir: 'min', value: '90' })).toBeNull();
  });

  it("checks a person's own tile: its id, its number and its name", () => {
    expect(cleanSection({ ...newSection('custom', 'mine') })).toBeNull();
    const tile = cleanSection({
      ...newSection('custom', 'custom-3'),
      number: 'metric:Nothing',
      how: 'below',
      limit: 80,
      title: '  Low\u0007   scores  ',
      show: 'chart',
    })!;
    expect(tile.number).toBe('overall');
    expect(tile.how).toBe('below');
    expect(tile.limit).toBe(80);
    expect(tile.title).toBe('Low scores');
    expect(tile.show).toBe('chart');
    expect(CUSTOM_NUMBERS.map((one) => one.id)).toContain('metric:DCR');
    expect(CUSTOM_NUMBERS.map((one) => one.id)).toContain('fail:POD');
  });
});

describe('checking a layout', () => {
  it('needs a name and an id', () => {
    expect(cleanLayout({ id: 'usual', name: '   ', sections: [] })).toBeNull();
    expect(cleanLayout({ id: 'Not An Id', name: 'Mine', sections: [] })).toBeNull();
    expect(cleanLayout({ id: 'usual', name: 'Mine' })).toEqual({
      id: 'usual',
      name: 'Mine',
      sections: [],
      weeks: { own: false, pick: null, from: null, to: null },
    });
  });

  it('keeps one of each built-in section, and only so many own tiles', () => {
    const many = Array.from({ length: MAX_CUSTOM + 5 }, (_, i) =>
      newSection('custom', `custom-${i}`),
    );
    const layout = cleanLayout({
      id: 'usual',
      name: 'Mine',
      sections: [newSection('ids'), { kind: 'nonsense' }, newSection('ids'), ...many],
    })!;
    expect(layout.sections.filter((section) => section.kind === 'ids')).toHaveLength(1);
    expect(layout.sections.filter((section) => section.kind === 'custom')).toHaveLength(MAX_CUSTOM);
  });

  it("reads a layout's own weeks: a quick pick, two weeks, or every week", () => {
    const shared = { own: false, pick: null, from: null, to: null };
    expect(cleanWeeks(undefined)).toEqual(shared);
    expect(cleanWeeks({ own: false, pick: 'last-4' })).toEqual(shared);
    expect(cleanWeeks({ own: true, pick: 'last-4', from: '2026-W01' })).toEqual({
      own: true,
      pick: 'last-4',
      from: null,
      to: null,
    });
    expect(cleanWeeks({ own: true, from: '2026-W31', to: '2026-W40' })).toEqual({
      own: true,
      pick: null,
      from: '2026-W31',
      to: '2026-W40',
    });
    expect(cleanWeeks({ own: true, from: 'last tuesday' })).toEqual({
      own: true,
      pick: 'all',
      from: null,
      to: null,
    });
  });
});

describe('saving the dashboard part of the settings', () => {
  const second = { ...usualLayout(), id: 'layout-1', name: 'Second' };

  it('replaces the layouts whole, and keeps the rest', () => {
    const next = mergeDashboard(DEFAULT_DASHBOARD, { layouts: [usualLayout(), second] });
    expect(next.layouts.map((layout) => layout.name)).toEqual(['The usual', 'Second']);
    expect(next.active).toBe('usual');
    expect(mergeDashboard(next, { active: 'layout-1' }).active).toBe('layout-1');
    expect(mergeDashboard(next, { watch: ['A02V4L9HIELIDL'] }).layouts).toHaveLength(2);
  });

  it('refuses a list with a layout it cannot read, an empty list, and too many', () => {
    const keep = (layouts: unknown) => mergeDashboard(DEFAULT_DASHBOARD, { layouts }).layouts;
    expect(keep([usualLayout(), { id: 'x', name: '' }])).toBe(DEFAULT_DASHBOARD.layouts);
    expect(keep([usualLayout(), usualLayout()])).toBe(DEFAULT_DASHBOARD.layouts);
    expect(keep([])).toBe(DEFAULT_DASHBOARD.layouts);
    expect(
      keep(
        Array.from({ length: MAX_LAYOUTS + 1 }, (_, i) => ({
          ...usualLayout(),
          id: `layout-${i}`,
        })),
      ),
    ).toBe(DEFAULT_DASHBOARD.layouts);
    expect(mergeDashboard(DEFAULT_DASHBOARD, 'nonsense')).toEqual(DEFAULT_DASHBOARD);
  });

  it('always has one of the layouts in use', () => {
    expect(mergeDashboard(DEFAULT_DASHBOARD, { active: 'gone' }).active).toBe('usual');
    const both = mergeDashboard(DEFAULT_DASHBOARD, {
      layouts: [usualLayout(), second],
      active: 'layout-1',
    });
    // The layout in use is deleted: the first one left is used.
    expect(mergeDashboard(both, { layouts: [usualLayout()] }).active).toBe('usual');
  });

  it('keeps the watch list only when every entry looks like an ID, once each', () => {
    const watch = (list: unknown) => mergeDashboard(DEFAULT_DASHBOARD, { watch: list }).watch;
    expect(watch(['A02V4L9HIELIDL', 'A1E3ZUFIX1EXA5', 'A02V4L9HIELIDL'])).toEqual([
      'A02V4L9HIELIDL',
      'A1E3ZUFIX1EXA5',
    ]);
    expect(watch(['A02V4L9HIELIDL', 'not an id!'])).toEqual([]);
    expect(watch('A02V4L9HIELIDL')).toEqual([]);
  });

  it('goes through the settings merge, leaving the other settings alone', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, {
      dashboard: { layouts: [usualLayout(), second], active: 'layout-1' },
    });
    expect(merged.dashboard.active).toBe('layout-1');
    expect(merged.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(mergeSettings(merged, { dashboard: [] as never }).dashboard).toEqual(merged.dashboard);
  });
});

describe('changing a layout', () => {
  const sections = usualSections();

  it('moves a section before or after another', () => {
    expect(ids(moveSection(sections, 'ids', 'tile-fleet', false)).slice(0, 3)).toEqual([
      'ids',
      'tile-fleet',
      'tile-tiers',
    ]);
    expect(ids(moveSection(sections, 'tile-fleet', 'reasons', true)).at(-1)).toBe('tile-fleet');
    expect(ids(moveSection(sections, 'ids', 'ids', true))).toEqual(ids(sections));
    expect(ids(moveSection(sections, 'ids', 'gone', true))).toEqual(ids(sections));
  });

  it('steps a section one place, and stops at the ends', () => {
    expect(ids(stepSection(sections, 'tile-tiers', -1)).slice(0, 2)).toEqual([
      'tile-tiers',
      'tile-fleet',
    ]);
    expect(ids(stepSection(sections, 'tile-fleet', -1))).toEqual(ids(sections));
    expect(ids(stepSection(sections, 'reasons', 1))).toEqual(ids(sections));
  });

  it('changes and removes one section without touching the others', () => {
    const wider = changeSection(sections, 'ids', { width: 12 });
    expect(wider.find((section) => section.id === 'ids')!.width).toBe(12);
    expect(sections.find((section) => section.id === 'ids')!.width).toBe(4);
    const fewer = removeSection(sections, 'trend');
    expect(ids(fewer)).not.toContain('trend');
    expect(missingKinds(fewer)).toEqual(['trend', 'watch']);
    expect(missingKinds(sections)).toEqual(['watch']);
  });

  it('snaps a dragged width to the nearest named size', () => {
    expect([1, 3.4, 3.6, 5, 5.1, 7.1, 10.1, 30].map(nearestWidth)).toEqual([
      3, 3, 4, 4, 6, 8, 12, 12,
    ]);
    expect([3, 4, 6, 8, 12].map((width) => narrowWidth(width as never))).toEqual([
      6, 6, 12, 12, 12,
    ]);
  });

  it('finds an id and a name nothing else has', () => {
    expect(freshId('custom', ['custom-1', 'custom-3'])).toBe('custom-2');
    const layouts = [usualLayout(), { ...usualLayout(), id: 'layout-1', name: 'the USUAL 2' }];
    expect(freshName('The usual', layouts)).toBe('The usual 3');
    expect(freshName('Monday', layouts)).toBe('Monday');
    expect(freshName('   ', layouts)).toBe('My layout');
  });
});

describe('a layout as a file', () => {
  it('comes back the same, with a new id and a name of its own', () => {
    const layout = {
      ...usualLayout(),
      sections: [
        { ...newSection('tile-fleet'), target: { dir: 'min' as const, value: 90 } },
        {
          ...newSection('custom', 'custom-1'),
          number: 'metric:DCR',
          how: 'below' as const,
          limit: 80,
        },
        { ...newSection('coaching'), highOnly: true, height: 'tall' as const },
      ],
      weeks: { own: true, pick: 'last-4' as const, from: null, to: null },
    };
    const text = layoutToFile(layout);
    const back = layoutFromFile(text, [layout])!;
    expect(back.id).toBe('layout-1');
    expect(back.name).toBe('The usual 2');
    expect(back.sections).toEqual(layout.sections);
    expect(back.weeks).toEqual(layout.weeks);
  });

  it('names no driver: the watch list is not part of a layout', () => {
    const text = layoutToFile({ ...usualLayout(), sections: [newSection('watch')] });
    expect(Object.keys(JSON.parse(text).layout)).toEqual(['name', 'sections', 'weeks']);
  });

  it('refuses anything that is not one of its own files', () => {
    const layouts = [usualLayout()];
    expect(layoutFromFile('not a file at all', layouts)).toBeNull();
    expect(layoutFromFile('{"hello":"there"}', layouts)).toBeNull();
    expect(
      layoutFromFile(JSON.stringify({ app: 'loadout-builder', kind: 'other' }), layouts),
    ).toBeNull();
    // A layout file with nothing usable on it.
    const empty = JSON.stringify({
      app: 'loadout-builder',
      kind: 'dashboard-layout',
      version: 1,
      layout: { name: 'Empty', sections: [{ kind: 'nonsense' }] },
    });
    expect(layoutFromFile(empty, layouts)).toBeNull();
    expect(layoutFromFile('x'.repeat(300_000), layouts)).toBeNull();
  });

  it('gets a plain file name', () => {
    expect(layoutFileName('Monday morning')).toBe('dashboard-monday-morning.json');
    expect(layoutFileName('  ../..\\ ?? ')).toBe('dashboard-layout.json');
  });
});
