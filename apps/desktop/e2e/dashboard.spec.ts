// The Dashboard, driven in a real browser on the stand-in bridge: the week bar and its quick
// picks, the four tiles and their explanations, who needs a word, the ID-expiry list, the driver
// menu, the movers, the charts, the empty and failed states, the keyboard, and the themes.
// The numbers are worked out by the main process; here they are made up. Every name and ID
// comes from the made-up people in scripts/parity/wpa/expected (packages/fixtures).

import { expect, test } from '@playwright/test';
import { contrastProblems } from './support/contrast';
import { BASE, NEWEST_WEEK, lastRange, openDashboard, ready } from './support/dashboardFake';
import { callsTo, emit, onCall } from './support/fakeBridge';

test('the menu has Dashboard right after Home', async ({ page }) => {
  await openDashboard(page);
  const items = await page
    .locator('[data-nav]')
    .evaluateAll((all) => all.map((one) => one.getAttribute('data-nav')));
  expect(items.slice(0, 2)).toEqual(['home', 'dashboard']);
  await expect(page.locator('[data-nav="dashboard"]')).toHaveText('Dashboard');
  await expect(page.locator('[data-nav="dashboard"]')).toHaveAttribute('aria-current', 'page');
});

test('with nothing chosen it shows every week, like the Scorecards page, and All is lit', async ({
  page,
}) => {
  await openDashboard(page, { weekRange: { from: null, to: null } });
  await ready(page);
  expect(await lastRange(page)).toEqual({ from: '2026-W31', to: '2026-W40' });
  await expect(page.getByTestId('dashboard-pick-all')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-testid^="dashboard-pick-"][aria-pressed="true"]')).toHaveCount(
    1,
  );
  await expect(page.getByTestId('dashboard-range-words')).toHaveText(
    '2026-W31 to 2026-W40 · 10 weeks · 61 drivers',
  );

  // Last week picks the newest week; All goes back to no ends at all.
  await page.getByTestId('dashboard-pick-last-1').click();
  await expect.poll(() => lastRange(page)).toEqual(NEWEST_WEEK);
  await expect(page.getByTestId('dashboard-pick-last-1')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('dashboard-pick-all').click();
  await expect.poll(() => lastRange(page)).toEqual({ from: '2026-W31', to: '2026-W40' });
  await expect(page.getByTestId('dashboard-pick-all')).toHaveAttribute('aria-pressed', 'true');
  expect(await callsTo(page, 'settings:set')).toContainEqual({
    performance: { weekRange: { from: null, to: null } },
  });
});

test('with the newest week picked, the tiles show its numbers', async ({ page }) => {
  await openDashboard(page);
  await ready(page);
  expect(await lastRange(page)).toEqual({ from: '2026-W40', to: '2026-W40' });
  await expect(page.getByTestId('dashboard-pick-last-1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('dashboard-range-words')).toHaveText(
    '2026-W40 · 1 week · 61 drivers',
  );

  await expect(page.getByTestId('tile-fleet-value')).toHaveText('90.3');
  const change = page.getByTestId('tile-fleet-change');
  await expect(change).toHaveText('−1.1 vs 2026-W39');
  await expect(change).toHaveAttribute('data-tone', 'bad');
  await expect(change).toHaveAttribute('data-direction', 'down');
  // One week has no line to draw.
  await expect(page.getByTestId('tile-fleet')).toContainText('Pick more weeks to see the line.');

  for (const [tier, count] of [
    ['Platinum', '28'],
    ['Gold', '14'],
    ['Silver', '11'],
    ['Bronze', '8'],
  ]) {
    await expect(page.getByTestId(`tier-${tier}-count`)).toHaveText(count!);
  }
  await expect(page.getByTestId('tier-Platinum-moves')).toHaveText('1 in, 4 out');
  await expect(page.getByTestId('tier-Gold-moves')).toHaveText('3 in, 2 out');

  await expect(page.getByTestId('tile-packages-value')).toHaveText('12,480');
  await expect(page.getByTestId('tile-packages-change')).toHaveText('+312 vs 2026-W39');
  // More or fewer packages is neither good nor bad.
  await expect(page.getByTestId('tile-packages-change')).toHaveAttribute('data-tone', 'neutral');

  await expect(page.getByTestId('tile-safety-value')).toHaveText('7');
  await expect(page.getByTestId('tile-safety')).toContainText('Of 61 drivers, in 2026-W40');
});

test('each "How is this worked out?" button explains in plain words, and closes', async ({
  page,
}) => {
  await openDashboard(page);
  await ready(page);
  const dialog = page.locator('dialog[data-dialog="explain"]');

  await page.getByTestId('tile-fleet-explain').click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("The average of every driver's Overall Score in 2026-W40.");
  await expect(dialog).toContainText('2026-W39, the week before');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByTestId('tile-tiers-explain').click();
  await expect(dialog).toContainText('Platinum, Gold, Silver and Bronze');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await page.getByTestId('tile-packages-explain').click();
  await expect(dialog).toContainText("Every driver's packages delivered in 2026-W40");
  await page.keyboard.press('Escape');

  await page.getByTestId('tile-safety-explain').click();
  await expect(dialog).toContainText('counts against the program');
  await page.keyboard.press('Escape');

  // The coaching rules use the numbers from Settings.
  await page.getByTestId('dashboard-coaching-explain').click();
  await expect(dialog).toContainText('Their score fell 3 weeks running.');
  await expect(dialog).toContainText('The same failure reason showed up 3 weeks in a row.');
  await page.keyboard.press('Escape');

  await page.getByTestId('dashboard-ids-explain').click();
  await expect(dialog).toContainText('expires within 30 days');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('the quick picks and the week lists ask for those weeks and remember them', async ({
  page,
}) => {
  await openDashboard(page);
  await ready(page);

  await page.getByTestId('dashboard-pick-last-4').click();
  await expect(page.getByTestId('dashboard-pick-last-4')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => lastRange(page)).toEqual({ from: '2026-W37', to: '2026-W40' });
  expect(await callsTo(page, 'settings:set')).toContainEqual({
    performance: { weekRange: { from: '2026-W37', to: '2026-W40' } },
  });
  await expect(page.getByTestId('dashboard-range-words')).toContainText(
    '2026-W37 to 2026-W40 · 4 weeks',
  );

  await page.getByTestId('dashboard-pick-last-8').click();
  await expect.poll(() => lastRange(page)).toEqual({ from: '2026-W33', to: '2026-W40' });

  // Only 10 weeks are in, so Last 13 is all of them.
  await page.getByTestId('dashboard-pick-last-13').click();
  await expect.poll(() => lastRange(page)).toEqual({ from: '2026-W31', to: '2026-W40' });
  await expect(page.getByTestId('dashboard-pick-last-13')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('dashboard-to').selectOption('2026-W38');
  await expect.poll(() => lastRange(page)).toEqual({ from: '2026-W31', to: '2026-W38' });
  // A range chosen by hand is none of the quick picks.
  await expect(page.locator('[data-testid^="dashboard-pick-"][aria-pressed="true"]')).toHaveCount(
    0,
  );
  expect(await callsTo(page, 'settings:set')).toContainEqual({
    performance: { weekRange: { from: '2026-W31', to: '2026-W38' } },
  });

  await page.getByTestId('dashboard-from').selectOption('2026-W35');
  await expect.poll(() => lastRange(page)).toEqual({ from: '2026-W35', to: '2026-W38' });
});

test('a remembered range is used when the page opens', async ({ page }) => {
  await openDashboard(page, { weekRange: { from: '2026-W33', to: '2026-W40' } });
  await ready(page);
  expect(await lastRange(page)).toEqual({ from: '2026-W33', to: '2026-W40' });
  await expect(page.getByTestId('dashboard-pick-last-8')).toHaveAttribute('aria-pressed', 'true');
});

test('who needs a word lists High first, with the reasons and the costliest metric', async ({
  page,
}) => {
  await openDashboard(page);
  await ready(page);
  const rows = page.getByTestId('coaching-row');
  await expect(rows).toHaveCount(5);
  expect(
    await rows.evaluateAll((all) => all.map((one) => one.getAttribute('data-severity'))),
  ).toEqual(['High', 'High', 'High', 'Watch', 'Watch']);
  expect(await page.getByTestId('coaching-name').allInnerTexts()).toEqual([
    'Archer Gresham',
    'Desmond Marisol Penrose',
    'Amelia Aaron Blackwell',
    'Carmen Josie Rutherford',
    'Cleo Silas Jessup',
  ]);
  await expect(page.getByTestId('dashboard-coaching-counts')).toHaveText('3 High, 2 Watch');

  const archer = rows.first();
  await expect(archer).toContainText('Gold');
  await expect(archer).toContainText('93.6');
  await expect(archer.getByTestId('coaching-reasons')).toHaveText(
    'Dropped from Platinum to Gold · Score fell 3 weeks running (100.0 → 93.6)',
  );
  await expect(archer.getByTestId('coaching-drag')).toHaveText(
    'DCR is costing the most points (score 39, weight 10.5)',
  );
  await expect(rows.nth(1).getByTestId('coaching-reasons')).toContainText('In Bronze in 2026-W40');
  await expect(rows.nth(4).getByTestId('coaching-reasons')).toHaveText(
    'Blurry Photo (POD) 3 weeks in a row',
  );
});

test('the ID expiry list shows expired first, then expiring soon', async ({ page }) => {
  await openDashboard(page);
  await ready(page);
  const rows = page.getByTestId('compliance-row');
  await expect(rows).toHaveCount(3);
  expect(await page.getByTestId('compliance-words').allInnerTexts()).toEqual([
    'Expired 49 days ago',
    'Expired 21 days ago',
    'Expires in 9 days',
  ]);
  await expect(rows.first()).toContainText('Cecil Julian Radcliffe');
  await expect(rows.last()).toContainText('Tabitha Luther Chesterfield');
  await expect(page.getByTestId('dashboard-ids-counts')).toHaveText(
    '2 expired, 1 expiring within 30 days',
  );
  // A driver whose ID is fine is not listed.
  await expect(page.getByTestId('dashboard-compliance')).not.toContainText('Felicia');
});

test("a driver's menu previews their report or opens them on the Scorecards page", async ({
  page,
}) => {
  await openDashboard(page);
  await ready(page);
  await onCall(page, 'performance:preview-pdf', `() => ({ ok: true, value: { opened: true } })`);

  await page.getByTestId('coaching-row').first().click();
  const menu = page.getByTestId('driver-menu');
  await expect(menu).toBeVisible();
  await expect(menu).toContainText('Archer Gresham');
  await menu.getByTestId('driver-menu-preview').click();
  await expect
    .poll(() => callsTo(page, 'performance:preview-pdf'))
    .toEqual([{ transporterId: 'A02V4L9HIELIDL', range: { from: '2026-W40', to: '2026-W40' } }]);
  await expect(menu).toHaveCount(0);

  // A report that will not open says so in plain words.
  await onCall(page, 'performance:preview-pdf', `() => ({ ok: false, reason: 'failed' })`);
  await page.getByTestId('compliance-row').first().click();
  await page.getByTestId('driver-menu-preview').click();
  await expect(page.getByTestId('dashboard-action-problem')).toContainText('Something went wrong');

  // Opening them on the Scorecards page hands the driver over; that page reads it and lands on
  // their row (performance-explain.spec.ts follows it there).
  await page.evaluate(() => {
    const store = window.sessionStorage;
    const set = store.setItem.bind(store);
    (window as unknown as { __handed: string[] }).__handed = [];
    store.setItem = (key: string, value: string) => {
      (window as unknown as { __handed: string[] }).__handed.push(`${key}=${value}`);
      set(key, value);
    };
  });
  await page.getByTestId('coaching-row').nth(1).click();
  await page.getByTestId('driver-menu-open').click();
  await expect(page.locator('[data-nav="scorecards"]')).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => (window as unknown as { __handed: string[] }).__handed)).toEqual(
    ['loadout.performance.driver=A05QUB9XOW4NT1', 'loadout.performance.tab=performance'],
  );
  await expect(page.getByTestId('scorecards-tab-performance')).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('the movers show before and after with a green or red chip', async ({ page }) => {
  await openDashboard(page, { weekRange: { from: '2026-W31', to: '2026-W40' } });
  await ready(page);
  const improved = page.getByTestId('dashboard-improved');
  const declined = page.getByTestId('dashboard-declined');
  await expect(improved.getByTestId('mover-row')).toHaveCount(2);
  await expect(improved.getByTestId('mover-row').first()).toContainText('Luther Flora Vance');
  await expect(improved.getByTestId('mover-move').first()).toHaveText('67.4 → 88.0');
  await expect(improved.getByTestId('mover-change').first()).toHaveText('+20.6');
  await expect(improved.getByTestId('mover-change').first()).toHaveAttribute('data-tone', 'ok');
  await expect(declined.getByTestId('mover-move').nth(1)).toHaveText('79.0 → 32.7');
  await expect(declined.getByTestId('mover-change').first()).toHaveText('−47.7');
  await expect(declined.getByTestId('mover-change').first()).toHaveAttribute('data-tone', 'bad');
});

test('with one week picked the movers and the trend say why, and offer more weeks', async ({
  page,
}) => {
  await openDashboard(page);
  await ready(page);
  await expect(page.getByTestId('dashboard-improved')).toContainText(
    'With one week picked nobody can move.',
  );
  await expect(page.getByTestId('dashboard-trend-one-week')).toContainText(
    '90.3 in 2026-W40. A line needs more than one week.',
  );
  await expect(page.getByTestId('dashboard-trend-chart')).toHaveCount(0);
  await page.getByTestId('dashboard-trend-widen').click();
  await expect.poll(() => lastRange(page)).toEqual({ from: '2026-W31', to: '2026-W40' });
  await expect(page.getByTestId('dashboard-trend-chart')).toBeVisible();
});

test('the charts read out their numbers', async ({ page }) => {
  await openDashboard(page, { weekRange: { from: '2026-W31', to: '2026-W40' } });
  await ready(page);
  const trend = page.getByTestId('dashboard-trend-chart');
  await expect(trend).toHaveAttribute('role', 'img');
  await expect(trend).toHaveAttribute(
    'aria-label',
    /2026-W31 95\.2, 2026-W32 95\.2, .*2026-W40 90\.3$/,
  );
  // The axes are labelled: scores up the side and weeks along the bottom.
  await expect(trend.locator('text', { hasText: '2026-W40' })).toHaveCount(1);
  expect(await trend.locator('text').count()).toBeGreaterThan(4);
  await expect(page.getByTestId('tile-fleet-spark')).toHaveAttribute(
    'aria-label',
    /^Fleet average score by week: 2026-W31 95\.2/,
  );
  await expect(page.getByTestId('dashboard-tier-bar')).toHaveAttribute(
    'aria-label',
    'Drivers by tier in 2026-W40: Platinum 28, Gold 14, Silver 11, Bronze 8',
  );
  const reasons = page.getByTestId('dashboard-categories');
  await expect(reasons).toHaveAttribute(
    'aria-label',
    /CDF Delivered to Wrong Address 298 growing, POD No Package Detected 270 shrinking/,
  );
  // A reason with no failures is left out; growing and shrinking are said in words.
  await expect(page.getByTestId('category-row')).toHaveCount(4);
  await expect(page.locator('[data-testid="category-row"][data-trend="growing"]')).toHaveCount(2);
  await expect(page.getByTestId('category-row').first()).toContainText('growing');
  await expect(page.getByTestId('category-row').nth(1)).toContainText('shrinking');

  // Pointing at the line shows that week's number.
  await trend.scrollIntoViewIfNeeded();
  const box = (await trend.boundingBox())!;
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
  await expect(page.getByTestId('dashboard-trend-tip')).toContainText('2026-W40 90.3');
});

test('with no weekly data it says so and offers the Imports tab', async ({ page }) => {
  await openDashboard(page, { hasData: false });
  const empty = page.getByTestId('dashboard-empty');
  await expect(empty).toContainText('No weekly scorecards yet.');
  await expect(page.getByTestId('tile-fleet')).toHaveCount(0);
  await page.getByTestId('dashboard-go-imports').click();
  await expect(page.locator('[data-nav="scorecards"]')).toHaveAttribute('aria-current', 'page');
  // The Scorecards page opens on the Imports tab and uses up the hand-over.
  await expect(page.getByTestId('scorecards-tab-imports')).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => sessionStorage.getItem('loadout.performance.tab'))).toBeNull();
});

test('an answer with no data shows the same empty line', async ({ page }) => {
  await openDashboard(page);
  await onCall(
    page,
    'performance:dashboard',
    `() => ({ ok: true, value: ${JSON.stringify({ ...BASE, hasData: false })} })`,
  );
  await page.evaluate(() => {
    window.__fake!.snapshot.revision = 2;
  });
  await emit(page, 'state:changed', { revision: 2 });
  await expect(page.getByTestId('dashboard-empty')).toBeVisible();
});

test('a failed answer is said in plain words, and Try again asks again', async ({ page }) => {
  await openDashboard(page);
  await ready(page);
  await onCall(page, 'performance:dashboard', `() => ({ ok: false, reason: 'failed' })`);
  await page.getByTestId('dashboard-pick-last-4').click();
  const problem = page.getByTestId('dashboard-problem');
  await expect(problem).toContainText('The dashboard could not be worked out.');
  await expect(problem).toContainText('Something went wrong. Try again.');
  await expect(problem).not.toContainText('failed');
  const before = (await callsTo(page, 'performance:dashboard')).length;
  await onCall(
    page,
    'performance:dashboard',
    `() => ({ ok: true, value: ${JSON.stringify(BASE)} })`,
  );
  await page.getByTestId('dashboard-retry').click();
  await ready(page);
  expect((await callsTo(page, 'performance:dashboard')).length).toBe(before + 1);
});

test('it asks again when the data changes', async ({ page }) => {
  await openDashboard(page);
  await ready(page);
  const before = (await callsTo(page, 'performance:dashboard')).length;
  await page.evaluate(() => {
    window.__fake!.snapshot.revision = 5;
  });
  await emit(page, 'state:changed', { revision: 5 });
  await expect
    .poll(async () => (await callsTo(page, 'performance:dashboard')).length)
    .toBe(before + 1);
});

test('the keyboard reaches the quick picks and a driver, and Enter opens the menu', async ({
  page,
}) => {
  await openDashboard(page);
  await ready(page);
  await page.locator('[data-nav="dashboard"]').focus();

  const reach = async (testId: string) => {
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const now = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
      if (now === testId) return true;
    }
    return false;
  };
  expect(await reach('dashboard-pick-last-1')).toBe(true);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect.poll(() => lastRange(page)).toEqual({ from: '2026-W37', to: '2026-W40' });
  await ready(page);

  expect(await reach('coaching-row')).toBe(true);
  await page.keyboard.press('Enter');
  const menu = page.getByTestId('driver-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByTestId('driver-menu-open')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(page.getByTestId('coaching-row').first()).toBeFocused();
  // Space opens it too.
  await page.keyboard.press(' ');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
});

for (const theme of ['dark', 'light', 'high-contrast']) {
  test(`it is drawn in the theme's own colours and is readable (${theme})`, async ({
    page,
  }, info) => {
    await openDashboard(page, { theme, weekRange: { from: '2026-W31', to: '2026-W40' } });
    await page.addStyleTag({ content: '*, *::after { transition: none !important; }' });
    await ready(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    // Every chart colour comes from the theme: the lines are the accent, the tiers the tones.
    const colours = await page.evaluate(() => {
      const probe = document.createElement('div');
      document.body.append(probe);
      const resolve = (token: string) => {
        probe.style.color = `var(${token})`;
        return getComputedStyle(probe).color;
      };
      const stroke = (selector: string) =>
        getComputedStyle(document.querySelector(selector) as Element).stroke;
      const fill = (selector: string) =>
        getComputedStyle(document.querySelector(selector) as Element).fill;
      const out = {
        spark: [stroke('[data-testid="tile-fleet-spark"] polyline'), resolve('--accent')],
        trend: [stroke('[data-testid="dashboard-trend-chart"] polyline'), resolve('--accent')],
        platinum: [fill('[data-testid="dashboard-tier-bar"] rect'), resolve('--info')],
        tile: [
          getComputedStyle(document.querySelector('[data-testid="tile-fleet"]')!).backgroundColor,
          resolve('--surface'),
        ],
      };
      probe.remove();
      return out;
    });
    for (const [what, [drawn, token]] of Object.entries(colours)) {
      expect(drawn, what).toBe(token);
    }
    expect(await contrastProblems(page, '[data-page="dashboard"]')).toEqual([]);
    const spill = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(spill).toBe(false);
    // A tall window, so the whole page is in the picture for a person to look over.
    await page.setViewportSize({ width: 1400, height: 1600 });
    await page.screenshot({ path: info.outputPath(`dashboard-${theme}.png`) });
  });
}

test('the bigger text size makes the page bigger, not wider than the window', async ({ page }) => {
  await openDashboard(page, { weekRange: { from: '2026-W31', to: '2026-W40' } });
  await ready(page);
  const height = async () =>
    (await page.getByTestId('dashboard-trend-chart').boundingBox())!.height;
  const normal = await height();
  await page.evaluate(() => document.documentElement.style.setProperty('--font-scale', '1.5'));
  await expect.poll(height).toBeGreaterThan(normal * 1.3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

for (const scale of [1, 1.5]) {
  test(`the tier names are never cut off in a 1200 wide window (text size ${scale * 100}%)`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await openDashboard(page, { weekRange: { from: '2026-W31', to: '2026-W40' } });
    await page.evaluate(
      (s) => document.documentElement.style.setProperty('--font-scale', String(s)),
      scale,
    );
    const tile = page.getByTestId('tile-tiers');
    await expect(tile.getByTestId('tier-Platinum-count')).toBeVisible();
    const cut = await tile
      .locator('li span')
      .evaluateAll((spans) =>
        spans.filter((s) => s.scrollWidth > s.clientWidth + 1).map((s) => s.textContent),
      );
    expect(cut).toEqual([]);
    await tile.screenshot({ path: info.outputPath(`tiers-${scale}.png`) });
  });
}

test('Dashboard settings holds the rule numbers; they save as they change, odd ones refused', async ({
  page,
}) => {
  await openDashboard(page);
  await ready(page);
  const patches = async () =>
    (await callsTo(page, 'settings:set')) as Array<Record<string, unknown>>;
  const dialog = page.locator('dialog[data-dialog="dashboard-settings"]');

  // The gear sits next to the title, before the week bar.
  const header = page.locator('[data-page="dashboard"] header');
  await expect(header.getByTestId('dashboard-settings')).toHaveText('Dashboard settings');
  const order = await header
    .locator('[data-testid="dashboard-settings"], [data-testid="dashboard-pick-last-1"]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-testid')));
  expect(order).toEqual(['dashboard-settings', 'dashboard-pick-last-1']);

  await header.getByTestId('dashboard-settings').click();
  await expect(dialog.getByRole('heading')).toHaveText('Dashboard settings');

  const window = page.getByTestId('perf-rule-complianceWindowDays');
  await expect(window).toHaveValue('30');
  await window.fill('45');
  await window.press('Enter');
  expect(await patches()).toContainEqual({ performance: { complianceWindowDays: 45 } });
  // Enter saves the number; the window stays open.
  await expect(dialog).toBeVisible();

  const weeks = page.getByTestId('perf-rule-atRiskDecliningWeeks');
  await weeks.fill('1');
  await weeks.blur();
  await expect(dialog.getByRole('alert')).toHaveText('Type a whole number from 2 to 26.');
  expect(await patches()).not.toContainEqual({ performance: { atRiskDecliningWeeks: 1 } });

  await page.getByTestId('perf-rule-topN').fill('8');
  await page.getByTestId('perf-rule-topN').blur();
  await page.getByTestId('perf-rule-recurringCategoryWeeks').fill('4');
  await page.getByTestId('perf-rule-recurringCategoryWeeks').blur();
  expect(await patches()).toContainEqual({ performance: { topN: 8 } });
  expect(await patches()).toContainEqual({ performance: { recurringCategoryWeeks: 4 } });

  // Close puts it away; so does Esc.
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
  await header.getByTestId('dashboard-settings').click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
