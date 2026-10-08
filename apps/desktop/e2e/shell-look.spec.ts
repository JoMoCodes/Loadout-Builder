// Every page of the app, in every theme and at a large text size: all readable text meets WCAG
// AA contrast against what is actually behind it, and nothing spills sideways off the window.
// Screenshots of each go to test-results/ (not kept in the repo) for a person to look over.

import { expect, test, type Page } from '@playwright/test';
import { contrastProblems } from './support/contrast';
import { installFakeBridge } from './support/fakeBridge';
import { demoRosterSnapshot } from './support/rosterRows';

const PAGES = [
  'home',
  'load-out',
  'route-data',
  'vehicle-data',
  'associates',
  'previous-roster',
  'how-to-use',
  'features-log',
  'settings',
];
const THEMES = ['dark', 'light', 'high-contrast'];

async function setLook(page: Page, theme: string, scale: number) {
  await page.evaluate(
    ([t, s]) => {
      document.documentElement.dataset.theme = String(t);
      document.documentElement.style.setProperty('--font-scale', String(s));
    },
    [theme, scale] as const,
  );
}

for (const theme of THEMES) {
  test(`every page is readable in the ${theme} theme`, async ({ page }, info) => {
    // Load Out has made-up drivers to draw in its table; the previous roster has rows to show.
    const roster = demoRosterSnapshot(40);
    await installFakeBridge(page, {
      settings: { demoMode: true },
      snapshot: {
        ...roster,
        previousRoster: {
          rows: roster.roster.rows.slice(0, 12).map((view) => view.row),
          loadOutDate: '2026-08-31',
          sourceFile: '',
          importedAt: null,
          routeSource: '',
        },
        counts: { ...roster.counts, previousRosterRows: 12 },
      },
    });
    await page.goto('/');
    await expect(page.locator('[data-shell]')).toBeVisible();
    // Colours fade between themes; measure the settled colours, not a frame of the fade.
    await page.addStyleTag({ content: '*, *::after { transition: none !important; }' });
    const problems: string[] = [];
    for (const id of PAGES) {
      await page.click(`[data-nav="${id}"]`);
      await expect(page.locator(`[data-page="${id}"]`)).toBeVisible();
      for (const scale of [1, 1.5]) {
        await setLook(page, theme, scale);
        await page.waitForTimeout(50);
        for (const problem of await contrastProblems(page))
          problems.push(`${id} at ${scale}: ${problem}`);
        const spill = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        if (spill) problems.push(`${id} at ${scale}: the page is wider than the window`);
        await page.screenshot({ path: info.outputPath(`${theme}-${id}-${scale}.png`) });
      }
    }
    expect(problems).toEqual([]);
  });
}
