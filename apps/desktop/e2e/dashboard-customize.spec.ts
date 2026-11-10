// Making the Dashboard your own, driven in a real browser on the stand-in bridge: Customize
// (move, resize, hide and add sections, with the mouse and with the keyboard alone), each
// section's own choices, a layout's own weeks, the saved layouts and their files, the watch
// list, and build-your-own tiles with targets. The numbers are made up (support/dashboardFake).

import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_DASHBOARD,
  newSection,
  usualLayout,
  type DashboardSettings,
} from '../src/shared/dashboardLayout';
import { contrastProblems } from './support/contrast';
import { lastRange, openDashboard, ready } from './support/dashboardFake';
import { callsTo } from './support/fakeBridge';

const ALL_WEEKS = { from: null, to: null };

/** The ids of the sections on screen, in order. */
const order = (page: Page) =>
  page
    .locator('[data-section]')
    .evaluateAll((all) => all.map((one) => one.getAttribute('data-section')));

/** The dashboard part of the settings as last saved. */
const saved = (page: Page) =>
  page.evaluate(() => window.__fake!.settings.dashboard as DashboardSettings);

const section = (page: Page, id: string) => page.locator(`[data-section="${id}"]`);

async function customize(page: Page) {
  await page.getByTestId('dashboard-customize').click();
  await expect(page.getByTestId('dashboard-customize-bar')).toBeVisible();
}

const USUAL = [
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
];

test('it opens on the usual layout, with nothing to move until Customize is pressed', async ({
  page,
}) => {
  await openDashboard(page);
  await ready(page);
  expect(await order(page)).toEqual(USUAL);
  await expect(page.getByTestId('dashboard-layout-menu')).toContainText('The usual');
  await expect(page.getByTestId('section-coaching-bar')).toHaveCount(0);
});

test('settings saved before layouts existed still show the usual layout', async ({ page }) => {
  await openDashboard(page, { dashboard: null });
  await ready(page);
  expect(await page.evaluate(() => window.__fake!.settings.dashboard)).toBeNull();
  expect(await order(page)).toEqual(USUAL);
});

test('the arrow buttons move a section, keep the keyboard on it, and save', async ({ page }) => {
  await openDashboard(page);
  await ready(page);
  await customize(page);
  await page.getByTestId('section-ids-earlier').click();
  expect((await order(page)).slice(3, 6)).toEqual(['tile-safety', 'ids', 'coaching']);
  await expect(page.getByTestId('section-ids-earlier')).toBeFocused();
  await expect(page.getByTestId('dashboard-said')).toHaveText('ID expiry moved to place 5 of 10.');
  // All the way to the front with the keyboard: the button that switches off hands on the focus.
  for (let i = 0; i < 4; i++) await page.keyboard.press('Enter');
  expect((await order(page))[0]).toBe('ids');
  await expect(page.getByTestId('section-ids-earlier')).toBeDisabled();
  await expect(page.getByTestId('section-ids-later')).toBeFocused();
  expect((await saved(page)).layouts[0]!.sections[0]!.id).toBe('ids');
});

test('dragging a section by its name drops it where it is let go', async ({ page }) => {
  await openDashboard(page);
  await ready(page);
  await customize(page);
  await page
    .getByTestId('section-tile-safety-handle')
    .dragTo(section(page, 'tile-fleet'), { targetPosition: { x: 10, y: 40 } });
  expect((await order(page)).slice(0, 4)).toEqual([
    'tile-safety',
    'tile-fleet',
    'tile-tiers',
    'tile-packages',
  ]);
  expect((await saved(page)).layouts[0]!.sections[0]!.id).toBe('tile-safety');
});

test('a section is made wider with its size list or by dragging its right edge', async ({
  page,
}) => {
  await openDashboard(page);
  await ready(page);
  await customize(page);
  const tile = section(page, 'tile-fleet');
  const before = (await tile.boundingBox())!.width;
  await page.getByTestId('section-tile-fleet-width').selectOption('6');
  await expect(tile).toHaveAttribute('data-width', '6');
  expect((await tile.boundingBox())!.width).toBeGreaterThan(before * 1.8);

  // Dragging the right edge of ID expiry to the left snaps it to Small.
  const ids = section(page, 'ids');
  await page.getByTestId('section-ids-bar').scrollIntoViewIfNeeded();
  const box = (await ids.boundingBox())!;
  const handle = (await page.getByTestId('section-ids-resize').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.72, handle.y + 10, { steps: 5 });
  await expect(ids).toHaveAttribute('data-width', '3');
  await page.mouse.up();
  const sections = (await saved(page)).layouts[0]!.sections;
  expect(sections.find((one) => one.id === 'ids')!.width).toBe(3);
  expect(sections.find((one) => one.id === 'tile-fleet')!.width).toBe(6);
});

test('a set height makes a long list scroll inside its section', async ({ page }) => {
  await openDashboard(page);
  await ready(page);
  await customize(page);
  await page.getByTestId('section-coaching-height').selectOption('short');
  await page.getByTestId('dashboard-customize-done').click();
  const card = page.getByTestId('dashboard-coaching');
  const tall = await card.evaluate((element) => element.getBoundingClientRect().height);
  const rem = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).fontSize),
  );
  expect(Math.round(tall)).toBe(Math.round(12 * rem));
  const scrolls = await card
    .locator('[role="group"]')
    .evaluate((element) => element.scrollHeight > element.clientHeight);
  expect(scrolls).toBe(true);
});

test('a hidden section goes away and Add a section brings it back', async ({ page }) => {
  await openDashboard(page);
  await ready(page);
  await customize(page);
  await page.getByTestId('section-trend-hide').click();
  await expect(page.getByTestId('dashboard-trend')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-said')).toContainText('Fleet average by week hidden');
  await page.getByTestId('dashboard-add-section').click();
  // Only what is not on the layout is offered (the trend, and the watch list nobody added yet).
  await expect(page.getByTestId('dashboard-add-list').getByRole('menuitem')).toHaveText([
    'Your own tile...',
    'Fleet average by week',
    'Watch list',
  ]);
  await page.getByTestId('dashboard-add-trend').click();
  await expect(page.getByTestId('dashboard-trend')).toBeVisible();
  expect((await order(page)).at(-1)).toBe('trend');
});

test('while customizing, a section cannot be clicked into', async ({ page }) => {
  await openDashboard(page);
  await ready(page);
  await customize(page);
  // The section is switched off whole, so a click or a drag on it never opens a driver's menu.
  await expect(section(page, 'coaching').locator('> div[inert]')).toHaveCount(1);
  await page.getByTestId('dashboard-customize-done').click();
  await page.getByTestId('coaching-row').first().click();
  await expect(page.getByTestId('driver-menu')).toBeVisible();
});

test('who needs a word can leave reasons out, show only High, and show fewer lines', async ({
  page,
}) => {
  await openDashboard(page);
  await ready(page);
  await expect(page.getByTestId('coaching-row')).toHaveCount(5);
  await customize(page);
  await page.getByTestId('section-coaching-options').click();
  const dialog = page.locator('[data-dialog="section-options"]');
  await expect(dialog).toContainText('Choices for Who needs a word');
  // Without "the same problem week after week", the driver flagged only for that drops off.
  await dialog.getByTestId('reason-repeating').uncheck();
  await dialog.getByTestId('section-show-first').fill('2');
  await dialog.getByTestId('section-options-save').click();
  await page.getByTestId('dashboard-customize-done').click();
  await expect(page.getByTestId('dashboard-coaching-counts')).toHaveText('3 High, 1 Watch');
  await expect(page.getByTestId('coaching-row')).toHaveCount(2);
  await expect(page.getByTestId('dashboard-coaching-more')).toHaveText('Show all 4');
  await page.getByTestId('dashboard-coaching-more').click();
  await expect(page.getByTestId('coaching-reasons').nth(2)).not.toContainText('weeks in a row');
  // The explanation says what this layout leaves out.
  await page.getByTestId('dashboard-coaching-explain').click();
  await expect(page.locator('[data-dialog="explain"]')).toContainText(
    'This layout leaves out: repeated failure reasons.',
  );
  await page.locator('[data-dialog="explain"] [data-action="confirm"]').click();

  await customize(page);
  await page.getByTestId('section-coaching-options').click();
  await dialog.getByTestId('coaching-high-only').check();
  await dialog.getByTestId('section-options-save').click();
  await expect(page.getByTestId('dashboard-coaching-counts')).toHaveText('3 High');
});

test('an odd number of lines is refused in plain words', async ({ page }) => {
  await openDashboard(page);
  await ready(page);
  await customize(page);
  await page.getByTestId('section-ids-options').click();
  const dialog = page.locator('[data-dialog="section-options"]');
  await dialog.getByTestId('section-show-first').fill('0');
  await dialog.getByTestId('section-options-save').click();
  await expect(dialog.getByTestId('section-options-problem')).toHaveText(
    'For the number of lines, type a whole number from 1 to 50.',
  );
  await dialog.getByTestId('section-show-first').fill('3');
  await dialog.getByTestId('ids-expired-only').check();
  await dialog.getByTestId('section-options-save').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('dashboard-ids-counts')).toHaveText('2 expired');
  await expect(page.getByTestId('compliance-row')).toHaveCount(2);
});

test('the failure reasons can be cut down to some kinds', async ({ page }) => {
  await openDashboard(page);
  await ready(page);
  await expect(page.getByTestId('category-row')).toHaveCount(4);
  await customize(page);
  await page.getByTestId('section-reasons-options').click();
  const dialog = page.locator('[data-dialog="section-options"]');
  await dialog.getByTestId('source-POD').uncheck();
  await dialog.getByTestId('section-options-save').click();
  await expect(page.getByTestId('category-row')).toHaveCount(1);
  await expect(page.getByTestId('category-row')).toContainText('CDF');
});

test('a target turns a tile red when it is missed, and says so', async ({ page }) => {
  await openDashboard(page);
  await ready(page);
  await customize(page);
  await page.getByTestId('section-tile-fleet-options').click();
  const dialog = page.locator('[data-dialog="section-options"]');
  await dialog.getByTestId('target-dir').selectOption('min');
  await dialog.getByTestId('section-options-save').click();
  await expect(dialog.getByTestId('section-options-problem')).toHaveText(
    'Type the target as a number, for example 90.',
  );
  await dialog.getByTestId('target-value').fill('92');
  await dialog.getByTestId('section-options-save').click();
  await page.getByTestId('dashboard-customize-done').click();
  // The fleet average is 90.3: under 92.
  await expect(page.getByTestId('tile-fleet')).toHaveAttribute('data-target', 'missed');
  await expect(page.getByTestId('tile-fleet-target')).toHaveText('Below your target of 92');
  await page.getByTestId('tile-fleet-explain').click();
  await expect(page.locator('[data-dialog="explain"]')).toContainText(
    'Your target: 92 or higher. The tile turns red when the number is lower.',
  );
  await page.locator('[data-dialog="explain"] [data-action="confirm"]').click();

  await customize(page);
  await page.getByTestId('section-tile-fleet-options').click();
  await dialog.getByTestId('target-value').fill('90');
  await dialog.getByTestId('section-options-save').click();
  await expect(page.getByTestId('tile-fleet')).toHaveAttribute('data-target', 'met');
  await expect(page.getByTestId('tile-fleet-target')).toHaveText('On target: 90 or higher');
});

test('a tile of your own asks for its number, shows it, and explains itself', async ({ page }) => {
  await openDashboard(page, { weekRange: ALL_WEEKS });
  await ready(page);
  await customize(page);
  await page.getByTestId('dashboard-add-section').click();
  await page.getByTestId('dashboard-add-custom').click();
  const dialog = page.locator('[data-dialog="section-options"]');
  await expect(dialog).toContainText('Your own tile');
  await dialog.getByTestId('custom-number').selectOption('metric:DCR');
  await dialog.getByTestId('custom-how').selectOption('below');
  await dialog.getByTestId('custom-limit').fill('80');
  await dialog.getByTestId('target-dir').selectOption('max');
  await dialog.getByTestId('target-value').fill('5');
  await dialog.getByTestId('section-options-save').click();
  await page.getByTestId('dashboard-customize-done').click();

  // The main process was asked for it, by the same id the tile has on the layout.
  const calls = (await callsTo(page, 'performance:dashboard')) as Array<{ custom?: unknown[] }>;
  expect(calls.at(-1)!.custom).toEqual([
    { id: 'custom-1', number: 'metric:DCR', how: 'below', limit: 80 },
  ]);
  const tile = page.getByTestId('tile-custom-1');
  await expect(tile).toContainText('Drivers below 80: DCR score');
  // The stand-in answers limit / 10 = 8 drivers, 4 the week before: over the limit of 5.
  await expect(page.getByTestId('tile-custom-1-value')).toHaveText('8');
  await expect(page.getByTestId('tile-custom-1-change')).toContainText('+4');
  await expect(tile).toHaveAttribute('data-target', 'missed');
  await expect(page.getByTestId('custom-1-target')).toHaveText('Above your limit of 5');
  await expect(page.getByTestId('tile-custom-1-spark')).toHaveAttribute(
    'aria-label',
    /Drivers below 80: DCR score by week: 2026-W31/,
  );
  await page.getByTestId('tile-custom-1-explain').click();
  const explain = page.locator('[data-dialog="explain"]');
  await expect(explain).toContainText(
    'How many drivers had DCR score below 80 in 2026-W40. A driver right on 80 is not counted.',
  );
  await expect(explain).toContainText('Your target: 5 or lower.');
  await explain.locator('[data-action="confirm"]').click();

  // As a chart, with its own name; then deleted.
  await customize(page);
  await page.getByTestId('section-custom-1-options').click();
  await dialog.getByTestId('custom-show').selectOption('chart');
  await dialog.getByTestId('custom-title').fill('Low DCR');
  await dialog.getByTestId('section-options-save').click();
  await expect(tile).toContainText('Low DCR');
  await expect(page.getByTestId('tile-custom-1-chart')).toBeVisible();
  await page.getByTestId('section-custom-1-hide').click();
  await expect(tile).toHaveCount(0);
  expect((await saved(page)).layouts[0]!.sections.some((one) => one.kind === 'custom')).toBe(false);
});

test('a driver is put on the watch list from their menu, and taken off again', async ({ page }) => {
  await openDashboard(page);
  await ready(page);
  await expect(page.getByTestId('dashboard-watch')).toHaveCount(0);
  await page.getByTestId('coaching-row').first().click();
  await expect(page.getByTestId('driver-menu-watch')).toHaveText('Add to the watch list');
  await page.getByTestId('driver-menu-watch').click();
  // The watch list comes onto the layout by itself, with the driver on it.
  await expect(page.getByTestId('dashboard-watch')).toBeVisible();
  await expect(page.getByTestId('watch-row')).toHaveCount(1);
  await expect(page.getByTestId('watch-row')).toContainText('Archer Gresham');
  await expect(page.getByTestId('watch-score')).toHaveText('88.0');
  await expect(page.getByTestId('watch-change')).toContainText('−2.5');
  expect((await saved(page)).watch).toEqual(['A02V4L9HIELIDL']);

  await page.getByTestId('watch-row').click();
  await expect(page.getByTestId('driver-menu-watch')).toHaveText('Take off the watch list');
  await page.getByTestId('driver-menu-watch').click();
  await expect(page.getByTestId('dashboard-watch-none')).toBeVisible();
  expect((await saved(page)).watch).toEqual([]);
});

test('Choose drivers ticks the watch list from everyone on file', async ({ page }) => {
  const dashboard: DashboardSettings = {
    ...DEFAULT_DASHBOARD,
    layouts: [{ ...usualLayout(), sections: [newSection('watch')] }],
  };
  await openDashboard(page, { dashboard });
  await page.evaluate(() => {
    window.__fake!.hooks['performance:drivers'] = () => ({
      ok: true,
      value: {
        range: null,
        changes: {},
        rows: [
          { transporterId: 'A7BE7C3Y1TNPJS', name: 'Luther Flora Vance' },
          { transporterId: 'A8M3J46P8HG6FK', name: 'Emmett Ines Huxley' },
          { transporterId: 'A02V4L9HIELIDL', name: 'Archer Gresham' },
        ],
      },
    });
  });
  await ready(page);
  await page.getByTestId('dashboard-watch-add').click();
  const dialog = page.locator('[data-dialog="watch-picker"]');
  await expect(dialog.getByTestId('watch-pick')).toHaveCount(3);
  await dialog.getByTestId('watch-find').fill('hux');
  await expect(dialog.getByTestId('watch-pick')).toHaveCount(1);
  await dialog.getByTestId('watch-pick').check();
  await expect(dialog.getByTestId('watch-picked-count')).toContainText(
    '1 driver on the watch list',
  );
  await dialog.getByTestId('watch-picker-save').click();
  await expect(page.getByTestId('watch-row')).toContainText('Emmett Ines Huxley');
  expect((await saved(page)).watch).toEqual(['A8M3J46P8HG6FK']);
});

test('a layout can keep its own weeks, apart from the Scorecards page', async ({ page }) => {
  await openDashboard(page, { weekRange: ALL_WEEKS });
  await ready(page);
  await customize(page);
  await page.getByTestId('dashboard-own-weeks').check();
  await page.getByTestId('dashboard-customize-done').click();
  await page.getByTestId('dashboard-pick-last-4').click();
  await expect(page.getByTestId('dashboard-pick-last-4')).toHaveAttribute('aria-pressed', 'true');
  expect(await lastRange(page)).toEqual({ from: '2026-W37', to: '2026-W40' });
  // The layout remembers the pick itself; the weeks the Scorecards page shows are untouched.
  const settings = await page.evaluate(() => window.__fake!.settings);
  expect((settings.dashboard as DashboardSettings).layouts[0]!.weeks).toEqual({
    own: true,
    pick: 'last-4',
    from: null,
    to: null,
  });
  expect((settings.performance as { weekRange: unknown }).weekRange).toEqual(ALL_WEEKS);
  // Two weeks by hand are remembered as those two weeks.
  await page.getByTestId('dashboard-from').selectOption('2026-W33');
  expect((await saved(page)).layouts[0]!.weeks).toEqual({
    own: true,
    pick: null,
    from: '2026-W33',
    to: '2026-W40',
  });
});

test('layouts are made, switched, renamed and deleted from the Layout menu', async ({ page }) => {
  await openDashboard(page, { weekRange: ALL_WEEKS });
  await ready(page);
  await page.getByTestId('dashboard-layout-menu').click();
  await expect(page.getByTestId('dashboard-layout-delete')).toHaveAttribute('data-disabled', '');
  await page.getByTestId('dashboard-layout-new').click();
  const making = page.locator('[data-dialog="new-layout"]');
  await expect(making.getByTestId('new-layout-create')).toBeDisabled();
  await making.getByTestId('new-layout-name').fill('Monday');
  await making.getByTestId('new-layout-from').selectOption('monday');
  await expect(making.getByTestId('new-layout-about')).toContainText('Last week only');
  await making.getByTestId('new-layout-create').click();

  // The new layout is in use: its four sections, and its own weeks (last week).
  await expect(page.getByTestId('dashboard-layout-menu')).toContainText('Layout: Monday');
  expect(await order(page)).toEqual(['tile-fleet', 'tile-tiers', 'coaching', 'ids']);
  await expect(page.getByTestId('dashboard-pick-last-1')).toHaveAttribute('aria-pressed', 'true');
  expect(await lastRange(page)).toEqual({ from: '2026-W40', to: '2026-W40' });
  await expect(page.getByTestId('dashboard-coaching-counts')).toHaveText('3 High');

  // Back to the usual one: everything is as it was.
  await page.getByTestId('dashboard-layout-menu').click();
  await page.getByTestId('dashboard-layout-item').filter({ hasText: 'The usual' }).click();
  expect(await order(page)).toEqual(USUAL);
  await expect(page.getByTestId('dashboard-pick-all')).toHaveAttribute('aria-pressed', 'true');

  // Rename the usual one to a name that is taken: it gets a number.
  await page.getByTestId('dashboard-layout-menu').click();
  await page.getByTestId('dashboard-layout-rename').click();
  await page.getByTestId('rename-layout-name').fill('Monday');
  await page.getByTestId('rename-layout-save').click();
  await expect(page.getByTestId('dashboard-layout-menu')).toContainText('Layout: Monday 2');

  // Delete it (asked first): the other one is used.
  await page.getByTestId('dashboard-layout-menu').click();
  await page.getByTestId('dashboard-layout-delete').click();
  const asking = page.locator('[data-dialog="confirm"]');
  await expect(asking).toContainText('Delete the layout "Monday 2"?');
  await asking.locator('[data-action="confirm"]').click();
  await expect(page.getByTestId('dashboard-layout-menu')).toContainText('Layout: Monday');
  const now = await saved(page);
  expect(now.layouts.map((one) => one.name)).toEqual(['Monday']);
  expect(now.active).toBe(now.layouts[0]!.id);
});

test('a layout is saved to a file and brought back in, naming no driver', async ({ page }) => {
  const dashboard: DashboardSettings = { ...DEFAULT_DASHBOARD, watch: ['A02V4L9HIELIDL'] };
  await openDashboard(page, { dashboard });
  await ready(page);
  await customize(page);
  await page.getByTestId('section-tile-tiers-hide').click();
  await page.getByTestId('dashboard-customize-done').click();

  await page.getByTestId('dashboard-layout-menu').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('dashboard-layout-save-file').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('dashboard-the-usual.json');
  const text = readFileSync(await file.path(), 'utf8');
  expect(text).not.toContain('A02V4L9HIELIDL');
  expect(JSON.parse(text).layout.sections).toHaveLength(9);

  await page.getByTestId('dashboard-layout-file').setInputFiles({
    name: 'dashboard-the-usual.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  // It comes in as a new layout with a name of its own, and is put in use.
  await expect(page.getByTestId('dashboard-layout-menu')).toContainText('Layout: The usual 2');
  expect(await order(page)).not.toContain('tile-tiers');
  expect((await saved(page)).layouts).toHaveLength(2);

  // A file that is not a layout is refused in plain words, and nothing changes.
  await page.getByTestId('dashboard-layout-file').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":"there"}'),
  });
  await expect(page.getByTestId('dashboard-action-problem')).toContainText(
    'That file is not a Dashboard layout from this app.',
  );
  expect((await saved(page)).layouts).toHaveLength(2);
});

test('Reset to the usual layout asks first, then puts everything back', async ({ page }) => {
  await openDashboard(page);
  await ready(page);
  await customize(page);
  await page.getByTestId('section-coaching-hide').click();
  await page.getByTestId('section-ids-width').selectOption('12');
  await page.getByTestId('dashboard-reset').click();
  const asking = page.locator('[data-dialog="confirm"]');
  await expect(asking).toContainText('Reset "The usual" to the usual layout?');
  await asking.locator('[data-action="cancel"]').click();
  expect(await order(page)).not.toContain('coaching');
  await page.getByTestId('dashboard-reset').click();
  await asking.locator('[data-action="confirm"]').click();
  expect(await order(page)).toEqual(USUAL);
  await expect(section(page, 'ids')).toHaveAttribute('data-width', '4');
});

test('a layout with every section hidden says so and offers Customize', async ({ page }) => {
  const dashboard: DashboardSettings = {
    ...DEFAULT_DASHBOARD,
    layouts: [{ ...usualLayout(), sections: [] }],
  };
  await openDashboard(page, { dashboard });
  await expect(page.getByTestId('dashboard-no-sections')).toContainText(
    'This layout has no sections.',
  );
  await page.getByTestId('dashboard-no-sections').getByRole('button').click();
  await expect(page.getByTestId('dashboard-customize-bar')).toBeVisible();
});

test('in a narrow window every section is as wide as the page', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 900 });
  await openDashboard(page);
  await ready(page);
  const widths = await page
    .locator('[data-section]')
    .evaluateAll((all) => all.map((one) => Math.round(one.getBoundingClientRect().width)));
  expect(new Set(widths).size).toBe(1);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

for (const theme of ['dark', 'light', 'high-contrast']) {
  test(`the Customize controls are readable (${theme})`, async ({ page }) => {
    await openDashboard(page, { theme });
    await ready(page);
    await customize(page);
    expect(await contrastProblems(page, '[data-testid="dashboard-customize-bar"]')).toEqual([]);
    expect(await contrastProblems(page, '[data-testid="section-coaching-bar"]')).toEqual([]);
  });
}
