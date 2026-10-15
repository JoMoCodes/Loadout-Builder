// `npm run help-shots -w @loadout/desktop`: takes the pictures the help uses, of the real app in
// demo mode, so they only ever show the made-up drivers and vans from packages/fixtures.
//
// It builds the app, starts it with a throwaway data folder, turns on demo mode, and saves one
// picture per place the help needs into src/renderer/help/ (1200 pixels wide, PNG): the first
// day's pages (with the Route Sheets page's two pictures, of the made-up route sheet day demo mode
// loads), then the Scorecards page (Performance, Imports, Reports) and the Dashboard with the
// made-up weekly data. Run
// `python3 scripts/shrink-help-shots.py` afterwards to keep each picture under 300 kB.
//
// In this container: ELECTRON_DISABLE_SANDBOX=1 xvfb-run -a npm run help-shots -w @loadout/desktop
// Options: --no-build   use what is already in dist/

/* global window -- runs inside the app page */

import { _electron as electron } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'src', 'renderer', 'help');
const WIDTH = 1200;
const HEIGHT = 760;

if (!process.argv.includes('--no-build')) {
  const build = spawnSync('npm run build', { cwd: root, stdio: 'inherit', shell: true });
  if (build.status !== 0) process.exit(1);
}

const dataDir = mkdtempSync(join(tmpdir(), 'loadout-shots-'));
const version = JSON.parse(
  spawnSync('node', ['-p', 'JSON.stringify(require("./package.json").version)'], {
    cwd: root,
    encoding: 'utf8',
  }).stdout,
);
writeFileSync(
  join(dataDir, 'settings.json'),
  JSON.stringify({ lastSeenVersion: version, autoTours: false, theme: 'dark' }),
);

const args = ['.'];
if (process.env.ELECTRON_DISABLE_SANDBOX) args.push('--no-sandbox');
const app = await electron.launch({
  args,
  cwd: root,
  env: { ...process.env, LOADOUT_USER_DATA_DIR: dataDir },
});

try {
  const page = await app.firstWindow();
  await page.waitForSelector('[data-shell][data-ready="true"]', { timeout: 30_000 });
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.unmaximize();
      win.setContentSize(size.width, size.height);
    },
    { width: WIDTH, height: HEIGHT },
  );
  await page.waitForTimeout(300);

  const goTo = async (id) => {
    await page.click(`[data-nav="${id}"]`);
    await page.waitForSelector(`[data-page="${id}"]`, { timeout: 5_000 });
    await page.waitForTimeout(400);
  };
  const shot = async (name, clip) => {
    await page.screenshot({ path: join(out, `shot-${name}.png`), clip });
    console.log(`took ${name}`);
  };

  // The first-day checklist as a new person sees it, at the top of How to use: nothing saved
  // yet, so nothing to hide. (The picture keeps its old name, "home-checklist".)
  await goTo('how-to-use');
  await page.waitForSelector('[data-testid="first-run-checklist"] [data-step]', {
    timeout: 10_000,
  });
  await shot('home-checklist');

  // Made-up data only, from here on. The switch is at the top of How to use.
  await page.getByLabel('Show made-up drivers and vans').check();
  await page.waitForSelector('[data-testid="demo-banner"]', { timeout: 10_000 });

  await goTo('associates');
  await shot('associates');

  await goTo('vehicle-data');
  await shot('vehicles');

  // Route Sheets, on the made-up day demo mode loads (the fixture Routes export and PDF). It is
  // taken before the Route Data picture below, which brings in a different Routes file.
  await goTo('route-sheets');
  await page.waitForSelector('[data-testid="route-sheets-count-total"]', { timeout: 60_000 });
  await page.waitForTimeout(600);
  await shot('route-sheets-distribute');
  await page.click('[data-testid="route-sheets-tab-sheets"]');
  await page.waitForSelector('[data-testid^="route-sheets-pick-"]', { timeout: 10_000 });
  await page.locator('[data-testid^="route-sheets-pick-"]').first().click();
  await page.waitForSelector('[data-testid="route-sheets-preview"]', { timeout: 10_000 });
  await page.waitForTimeout(1200);
  await shot('route-sheets-sheets');

  // A made-up Routes file from the fixtures, brought in the way a person would (the file window
  // is answered here). Any question it asks (which PAD each time goes to) is closed unanswered.
  const routesFile = join(
    root,
    '..',
    '..',
    'packages',
    'fixtures',
    'routes',
    'Routes_XXX1_2026-09-25_09_54 (CDT).xlsx',
  );
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, routesFile);
  await goTo('route-data');
  await page.click('[data-testid="import-routes"]');
  await page.waitForTimeout(1500);
  for (let i = 0; i < 3 && (await page.locator('dialog[open]').count()) > 0; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  await shot('route-data');

  await page.evaluate(() => window.localStorage.setItem('loadout.load-out-tab', 'roster'));
  await goTo('load-out');
  await page.waitForSelector('[data-page="load-out"] [data-testid="data-grid"]');
  await shot('load-out-roster');

  // Assign Vans, answering any question it asks first, then the window it shows at the end.
  await page.click('[data-page="load-out"] [data-action="assign-vans"]');
  for (let i = 0; i < 5; i++) {
    await page.waitForSelector('dialog[open]', { timeout: 10_000 });
    if (await page.locator('dialog[open][data-testid="assign-dialog"]').count()) break;
    const yes = page.locator('dialog[open] [data-testid="confirm-yes"]');
    if (await yes.count()) await yes.click();
    else await page.locator('dialog[open] [data-testid="inform-ok"]').click();
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(400);
  await shot('assign-result');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  await page.click('[data-tab-button="print"]');
  await page.waitForSelector('[data-testid="print-page"]', { timeout: 10_000 });
  await page.waitForTimeout(800);
  await shot('print');

  // The made-up weekly data. The main process loads it shortly after demo mode opens, so wait
  // for the Scorecards page's rows before each picture. (The picture keeps its old file name,
  // perf-drivers, so the help pages need no change.)
  await page.evaluate(() => window.localStorage.setItem('loadout.scorecards-tab', 'performance'));
  await goTo('scorecards');
  await page.waitForSelector('[data-page="scorecards"] [role="rowgroup"] [role="row"]', {
    timeout: 60_000,
  });
  await page.waitForTimeout(600);
  await shot('perf-drivers');

  await page.click('[data-testid="scorecards-tab-imports"]');
  await page.waitForSelector('[data-testid="perf-card-scorecards"]', { timeout: 10_000 });
  await page.waitForTimeout(600);
  await shot('perf-imports');

  await page.click('[data-testid="scorecards-tab-reports"]');
  await page.waitForSelector('[data-testid="perf-preview-name"]', { timeout: 20_000 });
  await page.waitForTimeout(1500);
  await shot('perf-reports');

  await goTo('dashboard');
  await page.waitForSelector('[data-testid="dashboard-body"]', { timeout: 30_000 });
  await page.waitForTimeout(1000);
  await shot('dashboard');
} finally {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
}
