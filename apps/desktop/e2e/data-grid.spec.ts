// The table, driven in a real browser on the Load Out page's Roster tab, with made-up rows from
// the fixtures handed to the page by the stand-in bridge.

import { expect, test, type Page } from '@playwright/test';
import { installFakeBridge } from './support/fakeBridge';
import { demoRosterSnapshot } from './support/rosterRows';

const grid = (page: Page) => page.getByRole('grid', { name: 'Roster' });
const headers = (page: Page) => page.locator('[role="columnheader"]');
const header = (page: Page, name: string) =>
  page.locator('[role="columnheader"]', {
    has: page.locator('span', { hasText: new RegExp(`^${name}$`) }),
  });

// The app's own page, opened on Load Out (the shell remembers the last page in the window's
// storage). Outside Electron there is no bridge to the main process, so a stand-in bridge hands
// the page a snapshot holding `rows` made-up drivers.
async function open(page: Page, rows = 240) {
  await installFakeBridge(page, {
    settings: { demoMode: true },
    snapshot: demoRosterSnapshot(rows),
  });
  // The table keeps its order and widths through `layout:get` and `layout:set`, as in the app.
  // The stand-in keeps them in the window's storage so they last through a reload.
  await page.addInitScript(() => {
    const key = (view: unknown) => `fake-layout.${String((view as { view: string }).view)}`;
    window.__fake!.hooks['layout:set'] = (input) => {
      const { order, widths } = input as { order: string[]; widths: Record<string, number> };
      localStorage.setItem(key(input), JSON.stringify({ order, widths }));
      return { ok: true, value: null };
    };
    window.__fake!.hooks['layout:get'] = (input) => ({
      ok: true,
      value: JSON.parse(localStorage.getItem(key(input)) ?? '{"order":[],"widths":{}}'),
    });
  });
  await page.addInitScript(() => window.localStorage.setItem('loadout.page', 'load-out'));
  await page.goto('/');
  await expect(page.locator('[data-page="load-out"]')).toBeVisible();
  await expect(grid(page)).toBeVisible();
  await expect(page.locator('[role="row"][aria-rowindex="2"]')).toBeVisible();
}

async function headerOrder(page: Page): Promise<string[]> {
  return (await headers(page).allInnerTexts()).map((text) => text.trim());
}

/** The text of one column in the rows currently drawn, top to bottom. */
async function columnTexts(page: Page, columnId: string): Promise<string[]> {
  return page.evaluate((id) => {
    const rows = [...document.querySelectorAll<HTMLElement>('[role="rowgroup"] [role="row"]')];
    rows.sort((a, b) => Number(a.dataset.rowIndex) - Number(b.dataset.rowIndex));
    return rows.map(
      (row) => row.querySelector<HTMLElement>(`[data-col-id="${id}"]`)?.innerText.trim() ?? '',
    );
  }, columnId);
}

function minutes(text: string): number {
  const match = /^(\d{1,2}):(\d{2})([ap])m$/.exec(text);
  if (!match) return Number.POSITIVE_INFINITY;
  let hour = Number(match[1]) % 12;
  if (match[3] === 'p') hour += 12;
  return hour * 60 + Number(match[2]);
}

async function dragBy(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + (to.x - from.x) / 3, from.y + (to.y - from.y) / 3, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

test('draws 200 rows, only the ones on screen at a time', async ({ page }) => {
  await open(page, 200);
  await expect(grid(page)).toHaveAttribute('aria-rowcount', '201');
  await expect(page.getByText('Showing 200 of 200')).toBeVisible();
  const drawn = await page.locator('[role="rowgroup"] [role="row"]').count();
  expect(drawn).toBeGreaterThan(10);
  expect(drawn).toBeLessThan(80);
  // The last row is there once you get to it.
  await page.locator('[role="gridcell"]').first().click();
  await page.keyboard.press('Control+End');
  await expect(page.locator('[role="row"][aria-rowindex="201"]')).toBeVisible();
});

test('sorts the way the old app did: clock times in order, van numbers as numbers, blanks last', async ({
  page,
}) => {
  await open(page, 240);
  const firstDrivers = (await columnTexts(page, 'driver')).slice(0, 5);
  await header(page, 'Wave Time').click();
  await expect(header(page, 'Wave Time')).toHaveAttribute('aria-sort', 'ascending');
  const times = (await columnTexts(page, 'wave_time')).filter((t) => t !== '-');
  expect(times.length).toBeGreaterThan(10);
  const asMinutes = times.map(minutes);
  expect(asMinutes.every((m) => Number.isFinite(m))).toBe(true);
  expect([...asMinutes].sort((a, b) => a - b)).toEqual(asMinutes);
  // Blank wave times sink to the bottom.
  await page.locator('[role="gridcell"]').first().click();
  await page.keyboard.press('Control+End');
  await expect(
    page.locator('[role="row"][aria-rowindex="241"] [data-col-id="wave_time"]'),
  ).toHaveText('-');

  // Vans: numbers as numbers.
  await header(page, 'Vehicle').click();
  await expect(header(page, 'Vehicle')).toHaveAttribute('aria-sort', 'ascending');
  const vans = (await columnTexts(page, 'vehicle')).filter((t) => /^\d/.test(t));
  const numbers = vans.map((v) => Number(/^\d+/.exec(v)?.[0]));
  expect(numbers.length).toBeGreaterThan(5);
  expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);

  // A second click reverses.
  await header(page, 'Vehicle').click();
  await expect(header(page, 'Vehicle')).toHaveAttribute('aria-sort', 'descending');

  // Reset puts the table back in the page's own order.
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(header(page, 'Vehicle')).toHaveAttribute('aria-sort', 'none');
  expect((await columnTexts(page, 'driver')).slice(0, 5)).toEqual(firstDrivers);
});

test('a dragged and resized column stays put after a reload', async ({ page }) => {
  await open(page);
  expect((await headerOrder(page))[0]).toBe('Driver');

  // Drag "Shift Type" onto "Driver": dragged left, it lands before it.
  const shift = await header(page, 'Shift Type').boundingBox();
  const driver = await header(page, 'Driver').boundingBox();
  if (!shift || !driver) throw new Error('headings not drawn');
  await dragBy(
    page,
    { x: shift.x + 20, y: shift.y + shift.height / 2 },
    { x: driver.x + 10, y: driver.y + driver.height / 2 },
  );
  await expect
    .poll(() => headerOrder(page))
    .toEqual(expect.arrayContaining(['Shift Type', 'Driver']));
  expect((await headerOrder(page)).slice(0, 2)).toEqual(['Shift Type', 'Driver']);
  // A drag does not sort.
  await expect(header(page, 'Shift Type')).toHaveAttribute('aria-sort', 'none');

  // Resize "Routes" by dragging the edge of its heading 90px to the right.
  const handle = page.locator('[data-resize-handle="routes"]');
  await handle.scrollIntoViewIfNeeded();
  const before = (await header(page, 'Routes').boundingBox())?.width ?? 0;
  const edge = await handle.boundingBox();
  if (!edge) throw new Error('resize handle not drawn');
  await dragBy(
    page,
    { x: edge.x + edge.width / 2, y: edge.y + edge.height / 2 },
    { x: edge.x + edge.width / 2 + 90, y: edge.y + edge.height / 2 },
  );
  const after = (await header(page, 'Routes').boundingBox())?.width ?? 0;
  expect(after).toBeGreaterThan(before + 80);

  await page.reload();
  await expect(grid(page)).toBeVisible();
  await expect
    .poll(async () => (await headerOrder(page)).slice(0, 2))
    .toEqual(['Shift Type', 'Driver']);
  const reloaded = (await header(page, 'Routes').boundingBox())?.width ?? 0;
  expect(Math.abs(reloaded - after)).toBeLessThanOrEqual(1);
  // They went to the saved data's own layout table, under the old app's name for it.
  const saved = await page.evaluate(() => localStorage.getItem('fake-layout.roster'));
  expect(JSON.parse(saved ?? '{}').order?.slice(0, 2)).toEqual(['shift_type', 'driver']);
});

test('dragging a heading down into the rows and letting go changes nothing', async ({ page }) => {
  await open(page);
  const order = await headerOrder(page);
  const vin = await header(page, 'Transporter ID').boundingBox();
  if (!vin) throw new Error('heading not drawn');
  await dragBy(
    page,
    { x: vin.x + 20, y: vin.y + vin.height / 2 },
    { x: vin.x - 200, y: vin.y + 300 },
  );
  expect(await headerOrder(page)).toEqual(order);
  await expect(header(page, 'Transporter ID')).toHaveAttribute('aria-sort', 'none');
});

test('right-click menus: a cell offers only its own actions, a heading offers the reset', async ({
  page,
}) => {
  await open(page);
  await page.locator('[role="gridcell"][data-col-id="driver"]').first().click({ button: 'right' });
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Remove from the roster...' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /van/i })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.locator('[role="gridcell"][data-col-id="pad"]').first().click({ button: 'right' });
  await expect(page.getByRole('menu').getByText(/Nothing to do on that column/)).toBeVisible();
  await page.keyboard.press('Escape');

  // Move a column, then put it back from the heading's menu.
  await header(page, 'Shift Type').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move column left' }).click();
  expect((await headerOrder(page))[0]).toBe('Shift Type');
  await header(page, 'Driver').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Reset column order and widths' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Reset column order and widths' }).click();
  expect((await headerOrder(page)).slice(0, 2)).toEqual(['Driver', 'Shift Type']);
});

test('the search box narrows the table', async ({ page }) => {
  await open(page);
  const widths = () =>
    headers(page).evaluateAll((all) => all.map((h) => Math.round(h.getBoundingClientRect().width)));
  const before = await widths();
  await page.getByRole('searchbox', { name: 'Search this table' }).fill('abernathy');
  await expect(page.getByText(/Showing \d+ of 240/)).not.toHaveText('Showing 240 of 240');
  const drivers = await columnTexts(page, 'driver');
  expect(drivers.length).toBeGreaterThan(0);
  for (const name of drivers) expect(name.toLowerCase()).toContain('abernathy');
  // Columns are measured against the whole table, so they hold still while the search narrows it.
  expect(await widths()).toEqual(before);

  await page.getByRole('searchbox', { name: 'Search this table' }).fill('zzzz-nobody');
  await expect(page.getByText('No rows match.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search and filters' }).click();
  await expect(page.getByText('Showing 240 of 240')).toBeVisible();
});

test('"Needs attention" shows only flagged rows, and chips show colour with words', async ({
  page,
}) => {
  await open(page);
  const toggle = page.getByRole('button', { name: /Needs attention/ });
  const count = Number((await toggle.innerText()).match(/\d+/)?.[0]);
  expect(count).toBeGreaterThan(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(`Showing ${count} of 240`)).toBeVisible();
  const tones = await page
    .locator('[role="rowgroup"] [role="row"]')
    .evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.tone ?? ''));
  expect(tones.length).toBe(Math.min(count, tones.length));
  for (const tone of tones) expect(['bad', 'warn']).toContain(tone);

  // Every chip on screen carries words, not just a colour.
  const chips = await page
    .locator('[data-slot="chip"]')
    .evaluateAll((all) => all.map((chip) => (chip as HTMLElement).innerText.trim()));
  expect(chips.length).toBeGreaterThan(0);
  for (const text of chips) expect(text.length).toBeGreaterThan(1);

  // Switching it off brings everyone back.
  await toggle.click();
  await expect(page.getByText('Showing 240 of 240')).toBeVisible();
});

test('the keyboard moves around the table', async ({ page }) => {
  await open(page);
  const focused = () =>
    page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.cell ?? '');
  await page.locator('[role="gridcell"]').first().click();
  expect(await focused()).toBe('0:0');
  await page.keyboard.press('ArrowDown');
  expect(await focused()).toBe('1:0');
  await page.keyboard.press('ArrowRight');
  expect(await focused()).toBe('1:1');
  await page.keyboard.press('End');
  expect(await focused()).toBe('1:17');
  await page.keyboard.press('Home');
  expect(await focused()).toBe('1:0');
  await page.keyboard.press('PageDown');
  const paged = Number((await focused()).split(':')[0]);
  expect(paged).toBeGreaterThan(8);
  await page.keyboard.press('PageUp');
  expect(await focused()).toBe('1:0');
  await page.keyboard.press('Control+End');
  await expect.poll(focused).toBe('239:17');
  await page.keyboard.press('Control+Home');
  await expect.poll(focused).toBe('0:0');

  // Up from the first row reaches the headings; Enter there sorts.
  await page.keyboard.press('ArrowUp');
  expect(await focused()).toBe('-1:0');
  await page.keyboard.press('Enter');
  await expect(header(page, 'Driver')).toHaveAttribute('aria-sort', 'ascending');

  // Enter on a Routes cell does what its menu would: asks before handing the route over, or
  // says there is no route to hand over.
  await page.keyboard.press('ArrowDown');
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowRight');
  expect(await focused()).toBe('0:6');
  // The focused cell shows a ring.
  const outline = await page.evaluate(
    () => getComputedStyle(document.activeElement as Element).outlineStyle,
  );
  expect(outline).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(
    page
      .getByTestId('confirm-dialog')
      .or(page.getByTestId('load-out-status').filter({ hasText: 'has no route' })),
  ).toBeVisible();
});

test('500 rows scroll smoothly', async ({ page }) => {
  await open(page, 500);
  await expect(grid(page)).toHaveAttribute('aria-rowcount', '501');
  const result = await page.evaluate(async () => {
    const scroller = document.querySelector<HTMLElement>('[role="grid"]');
    if (!scroller) throw new Error('no grid');
    const frames: number[] = [];
    const end = scroller.scrollHeight - scroller.clientHeight;
    const step = 60; // about two rows a frame, a brisk scroll-wheel pace
    let last = performance.now();
    const started = last;
    await new Promise<void>((resolve) => {
      const tick = () => {
        const now = performance.now();
        frames.push(now - last);
        last = now;
        if (scroller.scrollTop >= end) {
          resolve();
          return;
        }
        scroller.scrollTop = Math.min(end, scroller.scrollTop + step);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    frames.shift(); // the first gap is waiting for the first frame, not drawing
    const sorted = [...frames].sort((a, b) => a - b);
    const lastRow = document.querySelector('[role="row"][aria-rowindex="501"]') !== null;
    return {
      frames: frames.length,
      total: performance.now() - started,
      average: frames.reduce((a, b) => a + b, 0) / frames.length,
      p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      worst: sorted[sorted.length - 1] ?? 0,
      lastRow,
    };
  });
  console.log(
    `Scrolled 500 rows in ${result.frames} frames: average ${result.average.toFixed(1)}ms, ` +
      `95th percentile ${result.p95.toFixed(1)}ms, worst ${result.worst.toFixed(1)}ms.`,
  );
  expect(result.lastRow).toBe(true);
  expect(result.frames).toBeGreaterThan(100);
  expect(result.average).toBeLessThan(25);
  expect(result.p95).toBeLessThan(50);
});

test('follows the theme and the A+ / A- text size the app sets on the page', async ({ page }) => {
  await open(page);
  const rowHeight = () =>
    page
      .locator('[role="row"][aria-rowindex="2"]')
      .evaluate((row) => row.getBoundingClientRect().height);
  const background = () =>
    page
      .locator('[role="row"][aria-rowindex="1"]')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  // What Settings and the A+ button do in the app: set the theme and the scale on <html>.
  const look = (theme: string, scale: number) =>
    page.evaluate(
      ([t, s]) => {
        document.documentElement.dataset.theme = String(t);
        document.documentElement.style.setProperty('--font-scale', String(s));
      },
      [theme, scale] as const,
    );

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const dark = await background();
  const normal = await rowHeight();
  await look('high-contrast', 1);
  expect(await background()).not.toBe(dark);
  await look('light', 1);
  expect(await background()).not.toBe(dark);

  await look('light', 1.2);
  await expect.poll(rowHeight).toBeGreaterThan(normal + 4);
});
