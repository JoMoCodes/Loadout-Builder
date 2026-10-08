// `npm run smoke -w @loadout/desktop`: proves the app really opens and every page works.
//
// It builds the app, then starts it the way the installed app runs (from the finished files, no
// dev server) and drives it with Playwright's Electron support. It uses a throwaway data folder
// (LOADOUT_USER_DATA_DIR), so it never touches anyone's real saved data.
//
// What it checks:
//   - the main process opened the saved data and printed how many tables it holds
//   - the page says it is ready
//   - "What's new" shows once after an update, and not again on the next start
//   - every page in the left menu opens, with the menu reachable by Tab and Enter
//   - Load Out says how to start when nothing is loaded, and shows the demo roster in demo mode
//   - a whole fixture day done on the Load Out page (import, bring over, assign vans) ends with
//     the roster the old app made that day (the parity harness's vans.json and rows.json)
//   - the bridge offers exactly the declared channels, and refuses input of the wrong shape
//   - in demo mode the snapshot holds the demo roster's row count, with dates and maps intact
//   - picking and bringing in a file works end to end, and the page is told the data changed
//   - a real load-out sheet dropped on the Roster tab comes in (through the bridge, which alone
//     knows where the file is), and a file of the wrong kind is refused in plain words
//   - Ctrl+O and Ctrl+I work from another page
//   - in demo mode Print Page, Print Vans, Preview and Export Roster write real PDF and Excel
//     files where the save window says, with the right page and row counts
//   - a column layout is kept in the saved data and comes back after a restart
//   - the Features log lists the note for this version
//   - the theme (light, dark, high contrast) and the text size (A-, A+, reset) change and stick
//   - Settings: version, "Open data folder", and Demo mode (made-up data loads, then goes away)
//   - the window comes back at the size it was left at
//   - nothing printed an error: not the page, not the main process
//
// In this container (Linux, no screen, running as root) it needs two things:
//   ELECTRON_DISABLE_SANDBOX=1 xvfb-run -a npm run smoke -w @loadout/desktop
// On Windows (CI) it needs neither: `npm run smoke -w @loadout/desktop`.
//
// Options: --no-build   skip the build step (use what is already in dist/)
// Logs stay free of names and IDs: only counts and reason codes are printed.

/* global document, window, HTMLElement, getComputedStyle, DataTransfer, DragEvent -- these run inside the app's page */

// Playwright's Electron driver comes with the browser-test package, so there is one copy of it.
import { _electron as electron } from '@playwright/test';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { otherPagesChecks } from './smokeOtherPages.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WAIT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 120_000);

// Stop everything if the run hangs.
setTimeout(() => {
  console.log('Smoke check FAILED: it took too long.');
  process.exit(1);
}, WAIT_MS).unref();

const EXPECTED_PAGES = [
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

const results = [];
const problems = [];

function pass(name, detail = '') {
  results.push({ ok: true, name, detail });
}

async function check(name, work) {
  try {
    const detail = await work();
    pass(name, detail ?? '');
  } catch (error) {
    results.push({ ok: false, name, detail: String(error.message ?? error).split('\n')[0] });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function until(test, message, ms = 10_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await test();
    if (value) return value;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(message);
}

if (!process.argv.includes('--no-build')) {
  const build = spawnSync('npm run build', { cwd: root, stdio: 'inherit', shell: true });
  if (build.status !== 0) {
    console.log('Smoke check FAILED: the app did not build.');
    process.exit(1);
  }
}

const dataDir = mkdtempSync(join(tmpdir(), 'loadout-smoke-'));
const settingsPath = join(dataDir, 'settings.json');
const windowStatePath = join(dataDir, 'window-state.json');
// Pretend the last run was an older version, so "What's new" has something to show. The page
// tours are off, so a tooltip does not cover what the checks click (the browser tests prove the
// tours; here one is run by hand, below).
writeFileSync(settingsPath, JSON.stringify({ lastSeenVersion: '1.9.0', autoTours: false }));

const args = ['.'];
if (process.env.ELECTRON_DISABLE_SANDBOX) args.push('--no-sandbox');

/** Starts the app and keeps a record of everything it prints. */
async function launch(folder = dataDir, extraEnv = {}) {
  const app = await electron.launch({
    args,
    cwd: root,
    env: { ...process.env, LOADOUT_USER_DATA_DIR: folder, ...extraEnv },
  });
  // What the main process logged, read from its own memory (it may have logged before we
  // started listening to its output).
  const mainLog = () => app.evaluate(() => globalThis.__loadoutLog.slice());
  const take = (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (/\[main\] error:/.test(line)) problems.push(`main process: ${line.trim()}`);
    }
  };
  app.process().stdout?.on('data', take);
  app.process().stderr?.on('data', (chunk) => {
    // Linux prints harmless graphics and message-bus notes on stderr. Only real errors count.
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (/Uncaught|TypeError|ReferenceError|SqliteError|Cannot find module/.test(line)) {
        problems.push(`main process: ${line.trim().slice(0, 160)}`);
      }
    }
  });
  const page = await app.firstWindow();
  page.on('console', (message) => {
    if (message.type() === 'error')
      problems.push(`page console error: ${message.text().slice(0, 160)}`);
  });
  page.on('pageerror', (error) => problems.push(`page error: ${error.name}`));
  await page.waitForSelector('[data-shell][data-ready="true"]', { timeout: 30_000 });
  return { app, page, mainLog };
}

const settingsOnDisk = () => JSON.parse(readFileSync(settingsPath, 'utf8'));
const htmlTheme = (page) => page.evaluate(() => document.documentElement.dataset.theme);
const fontScale = (page) =>
  page.evaluate(() => document.documentElement.style.getPropertyValue('--font-scale'));
const goTo = async (page, id) => {
  await page.click(`[data-nav="${id}"]`);
  await page.waitForSelector(`[data-page="${id}"]`, { timeout: 5_000 });
};

let first;
let second;
let third;
let oldDir = '';
let version = '';

try {
  // ------------------------------------------------------------------ first run
  first = await launch();
  const { app, page, mainLog } = first;
  version = await app.evaluate(({ app: electronApp }) => electronApp.getVersion());

  await check('the page says it is ready', async () => {
    await until(
      async () =>
        (await mainLog()).some((l) =>
          /page says: Loadout Builder page is ready, version \S+/.test(l),
        ),
      'the page never said it was ready',
    );
  });

  await check('the main process opened the saved data and counted its tables', async () => {
    const line = (await mainLog()).find((l) =>
      /opened saved data \(real\): \d+ tables, \d+ rows/.test(l),
    );
    assert(line, 'no "opened saved data" line from the main process');
    const tables = Number(/(\d+) tables/.exec(line)[1]);
    assert(tables >= 20, `only ${tables} tables`);
    return `${tables} tables`;
  });

  await check("What's new shows after an update, once", async () => {
    const dialog = page.locator('dialog[data-dialog="whats-new"]');
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });
    assert((await dialog.innerText()).includes(version), `the dialog does not mention ${version}`);
    await page.click('[data-action="close-whats-new"]');
    await dialog.waitFor({ state: 'hidden', timeout: 5_000 });
    await until(
      () => settingsOnDisk().lastSeenVersion === version,
      'the seen version was not saved',
    );
  });

  await check('the first-day checklist shows on a fresh start, with nothing ticked', async () => {
    await goTo(page, 'home');
    const list = page.locator('[data-testid="first-run-checklist"]');
    await list.waitFor({ state: 'visible', timeout: 5_000 });
    await until(
      async () =>
        (await page.locator('[data-testid="checklist-count"]').innerText()).trim() ===
        '0 of 5 done',
      'the checklist does not say 0 of 5 done',
    );
    const current = await list.locator('[data-step-current="true"]').getAttribute('data-step');
    assert(current === 'drivers', `the first step to do is ${current}`);
  });

  await check('Help > Take the tour runs the page tour, and Esc skips it', async () => {
    await page.click('[data-testid="help-menu"]');
    await page.click('[data-testid="take-tour"]');
    const tour = page.locator('[data-testid="tour"]');
    await tour.waitFor({ state: 'visible', timeout: 5_000 });
    assert((await tour.innerText()).includes('Step 1 of'), 'the tour has no step counter');
    await page.keyboard.press('Escape');
    await tour.waitFor({ state: 'detached', timeout: 5_000 });
    await until(
      () => (settingsOnDisk().toursSeen ?? []).includes('home'),
      'the tour was not saved as seen',
    );
  });

  await check('Ask a question opens the help forum, and only allowed links open', async () => {
    // Stand in for the browser, so nothing really opens.
    await app.evaluate(({ shell }) => {
      globalThis.__opened = [];
      shell.openExternal = async (url) => {
        globalThis.__opened.push(url);
      };
    });
    await goTo(page, 'how-to-use');
    await page.click('[data-testid="ask-a-question"]');
    const opened = await until(async () => {
      const list = await app.evaluate(() => globalThis.__opened.slice());
      return list.length > 0 ? list : null;
    }, 'nothing was opened');
    assert(
      JSON.stringify(opened) ===
        JSON.stringify(['https://github.com/JoMoCodes/Loadout-Builder/discussions']),
      'something other than the help forum was opened',
    );
    const refused = await page.evaluate(() =>
      window.loadout.calls['app:open-link']('https://example.com/'),
    );
    assert(refused.ok === false && refused.reason === 'not-allowed', 'another site was allowed');
    const after = await app.evaluate(() => globalThis.__opened.length);
    assert(after === 1, 'another site reached the browser');
  });

  await check('the left menu lists every page, in order', async () => {
    const ids = await page.$$eval('nav [data-nav]', (items) => items.map((i) => i.dataset.nav));
    assert(JSON.stringify(ids) === JSON.stringify(EXPECTED_PAGES), `menu was: ${ids.join(', ')}`);
  });

  for (const id of EXPECTED_PAGES) {
    await check(`page opens: ${id}`, async () => {
      await goTo(page, id);
      const current = await page.getAttribute(`[data-nav="${id}"]`, 'aria-current');
      assert(current === 'page', 'the menu does not mark this page as the current one');
      const heading = (await page.locator(`[data-page="${id}"] h1`).innerText()).trim();
      assert(heading.length > 0, 'the page has no heading');
    });
  }

  await check('Load Out with nothing loaded says how to start', async () => {
    await goTo(page, 'load-out');
    await page.click('[data-tab-button="roster"]');
    await page.waitForSelector('[data-testid="roster-title"]', { timeout: 5_000 });
    const title = await page.locator('[data-testid="roster-title"]').innerText();
    assert(title === 'No roster loaded', 'the title does not say no roster is loaded');
    const text = await page.locator('[data-page="load-out"]').innerText();
    assert(/No roster yet\./.test(text), 'the empty table does not say how to start');
  });

  await check('the menu works with Tab and Enter', async () => {
    await goTo(page, 'home');
    await page.evaluate(
      () => document.activeElement instanceof HTMLElement && document.activeElement.blur(),
    );
    let reached = false;
    for (let i = 0; i < 30 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(
        () =>
          document.activeElement instanceof HTMLElement &&
          document.activeElement.dataset.nav === 'features-log',
      );
    }
    assert(reached, 'Tab never reached the Features log item');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-page="features-log"]', { timeout: 5_000 });
  });

  await check('the Features log lists the note for this version', async () => {
    await goTo(page, 'features-log');
    const count = await page.locator('[data-release]').count();
    assert(count >= 1, 'no notes listed');
    assert(
      (await page.locator(`[data-release="${version}"]`).count()) === 1,
      `no note for version ${version}`,
    );
    return `${count} note(s)`;
  });

  await goTo(page, 'settings');

  await check('Settings shows the app version', async () => {
    assert(
      (await page.locator('[data-testid="app-version"]').innerText()) === version,
      'wrong version',
    );
    assert(
      (await page.locator('[data-testid="app-about"]').innerText()).startsWith('Builds the daily'),
      'no About line',
    );
  });

  await check('theme: light, dark and high contrast change the page', async () => {
    for (const [label, name] of [
      ['Light', 'light'],
      ['High contrast', 'high-contrast'],
      ['Dark', 'dark'],
    ]) {
      await page.getByLabel(label, { exact: true }).check();
      await until(async () => (await htmlTheme(page)) === name, `theme did not become ${name}`);
      await until(() => settingsOnDisk().theme === name, `theme ${name} was not saved`);
    }
  });

  await check('text size: A+, A- and reset change the size', async () => {
    const bigger = '[data-action="font-bigger"]';
    const smaller = '[data-action="font-smaller"]';
    const reset = '[data-action="font-reset"]';
    const pixels = () => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    const base = await pixels();
    await page.click(bigger);
    await until(async () => (await fontScale(page)) === '1.1', 'A+ did not raise the size');
    assert((await pixels()) !== base, 'the text did not get bigger');
    await page.click(reset);
    await until(async () => (await fontScale(page)) === '1', 'reset did not restore the size');
    await page.click(smaller);
    await until(async () => (await fontScale(page)) === '0.9', 'A- did not lower the size');
    await page.click(reset);
    await page.click(bigger); // leave it at 1.1 to prove it is remembered
    await until(() => settingsOnDisk().fontScale === 1.1, 'the size was not saved');
  });

  await check('Open data folder opens the data folder', async () => {
    await app.evaluate(({ shell }) => {
      // Do not really open a file manager during a test. Record what was asked instead.
      globalThis.__opened = [];
      shell.openPath = async (target) => {
        globalThis.__opened.push(target);
        return '';
      };
    });
    await page.click('text=Open data folder');
    const opened = await until(
      () => app.evaluate(() => globalThis.__opened.slice()).then((x) => (x.length ? x : null)),
      'the folder was not opened',
    );
    assert(opened[0].startsWith(dataDir), 'it opened a folder outside the app data');
    assert(existsSync(opened[0]), 'the folder does not exist');
  });

  // Asks the main process for something through the bridge, from inside the page.
  const ask = (name, input) => page.evaluate(([n, i]) => window.loadout.calls[n](i), [name, input]);

  let demoRows = 0;

  await check('Demo mode loads made-up data', async () => {
    await page.getByLabel('Show made-up drivers and vans').check();
    await page.waitForSelector('[data-testid="demo-banner"]', { timeout: 5_000 });
    const line = await until(
      async () =>
        (await mainLog()).find((l) => /opened saved data \(demo\): \d+ tables, \d+ rows/.test(l)),
      'the main process did not open the demo data',
    );
    const rows = Number(/(\d+) rows/.exec(line)[1]);
    assert(rows > 0, 'the demo data is empty');
    await goTo(page, 'home');
    const summary = await page.locator('[data-testid="data-summary"]').innerText();
    assert(/Drivers in your list: [1-9]/.test(summary), 'Home shows no demo drivers');
    return `${rows} rows`;
  });

  await check('demo mode ticks the first two steps of the checklist', async () => {
    await goTo(page, 'home');
    const step = (id) => page.locator(`[data-testid="first-run-checklist"] [data-step="${id}"]`);
    for (const id of ['drivers', 'vans']) {
      await until(
        async () => (await step(id).getAttribute('data-step-done')) === 'true',
        `the ${id} step is not ticked`,
      );
    }
    return (await page.locator('[data-testid="checklist-count"]').innerText()).trim();
  });

  await check('Load Out shows the demo roster in demo mode', async () => {
    await goTo(page, 'load-out');
    await page.waitForSelector(
      '[data-page="load-out"] [role="grid"] [role="rowgroup"] [role="row"]',
      {
        timeout: 10_000,
      },
    );
    const rows = await page
      .locator('[data-page="load-out"] [role="rowgroup"] [role="row"]')
      .count();
    assert(rows > 5, 'the table drew no rows');
    const title = await page.locator('[data-testid="roster-title"]').innerText();
    assert(/^Load Out - /.test(title), 'the roster title does not name the day');
    return `${rows} rows drawn`;
  });

  await check('the bridge offers exactly the declared channels', async () => {
    const shape = await page.evaluate(() => ({
      top: Object.keys(window.loadout).sort(),
      calls: Object.keys(window.loadout.calls).sort(),
      signals: Object.keys(window.loadout.signals).sort(),
      events: Object.keys(window.loadout.events).sort(),
    }));
    assert(shape.top.join() === 'calls,events,signals', `bridge has: ${shape.top.join()}`);
    for (const must of ['state:snapshot', 'files:pick', 'files:import', 'layout:get']) {
      assert(shape.calls.includes(must), `no call named ${must}`);
    }
    assert(shape.events.includes('state:changed'), 'no state:changed event');
    assert(
      !shape.calls.includes('invoke') && !shape.signals.includes('send'),
      'a free-for-all door',
    );
    return `${shape.calls.length} calls, ${shape.signals.length} signals, ${shape.events.length} events`;
  });

  await check('a message of the wrong shape is refused', async () => {
    const reply = await ask('layout:get', { view: 5 });
    assert(reply.ok === false && reply.reason === 'bad-input', `got ${JSON.stringify(reply)}`);
    const extra = await ask('state:snapshot', { sneaky: true });
    assert(extra.ok === false && extra.reason === 'bad-input', 'extra input was accepted');
  });

  await check("the snapshot holds the demo roster's row count", async () => {
    const info = await ask('data:get-source-info');
    assert(info.ok && info.value.mode === 'demo', 'not in demo mode');
    const expected = info.value.counts.driver_rows;
    assert(expected > 0, 'the demo roster is empty');
    const reply = await ask('state:snapshot');
    assert(reply.ok, `snapshot failed: ${reply.reason}`);
    const snap = reply.value;
    assert(
      snap.roster.rows.length === expected,
      `${snap.roster.rows.length} rows, not ${expected}`,
    );
    assert(snap.counts.rosterRows === expected, 'the count does not match the rows');
    assert(snap.counts.vehicles > 0 && snap.counts.associates > 0, 'no vans or associates');
    // What cannot cross by clone would be missing or flattened here.
    const kinds = await page.evaluate(() =>
      window.loadout.calls['state:snapshot']().then((r) => {
        const tag = (v) => Object.prototype.toString.call(v);
        return {
          links: tag(r.value.links),
          summary: tag(r.value.matchSummary),
          pads: tag(r.value.routeSets[0].pads),
          when: r.value.roster.importedAt === null ? 'null' : tag(r.value.roster.importedAt),
          method: typeof r.value.roster.rows[0].match.method,
        };
      }),
    );
    assert(kinds.links === '[object Map]', `links arrived as ${kinds.links}`);
    assert(kinds.summary === '[object Map]', `match summary arrived as ${kinds.summary}`);
    assert(kinds.pads === '[object Map]', `pads arrived as ${kinds.pads}`);
    assert(['null', '[object Date]'].includes(kinds.when), `import time arrived as ${kinds.when}`);
    demoRows = expected;
    return `${expected} rows`;
  });

  await check('picking and bringing in a file works, and the page is told', async () => {
    const vehicleFile = join(
      root,
      '..',
      '..',
      'packages',
      'fixtures',
      'vehicles',
      'VehiclesData.xlsx',
    );
    assert(existsSync(vehicleFile), 'the made-up vehicle file is missing');
    await app.evaluate(({ dialog }, file) => {
      // Do not open a real file window during a test. Answer as if the person chose this file.
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, vehicleFile);
    await page.evaluate(() => {
      window.__changes = [];
      window.loadout.events['state:changed']((payload) => window.__changes.push(payload.revision));
    });

    // A file nobody picked is refused, even though it exists.
    const sneaked = await ask('files:import', { kind: 'vehicles', path: vehicleFile });
    assert(sneaked.ok === false && sneaked.reason === 'not-allowed', 'an unpicked file was read');

    const picked = await ask('files:pick', { kind: 'vehicles' });
    assert(picked.ok && picked.value.path === vehicleFile, 'the chosen file did not come back');
    const done = await ask('files:import', { kind: 'vehicles', path: picked.value.path });
    assert(done.ok && done.value.rows > 0, `import failed: ${JSON.stringify(done)}`);
    await until(
      () => page.evaluate(() => window.__changes.length > 0),
      'the page was never told the data changed',
    );
    const after = await ask('state:snapshot');
    assert(after.value.counts.vehicles === done.value.rows, 'the snapshot does not show the vans');

    // The wrong kind of file is refused in plain words and changes nothing.
    const refused = await ask('files:import', { kind: 'dwp', path: picked.value.path });
    assert(
      refused.ok === false && refused.reason === 'refused',
      'a vehicle list was read as a DWP',
    );
    assert(refused.message && refused.message.length > 10, 'the refusal has no plain words');
    return `${done.value.rows} vans`;
  });

  await check(
    'in demo mode the sheets are written as PDF and Excel files where chosen',
    async () => {
      const outDir = mkdtempSync(join(tmpdir(), 'loadout-smoke-print-'));
      const files = ['page.pdf', 'vans.xlsx', 'export.xlsx', 'export.pdf'].map((n) =>
        join(outDir, n),
      );
      await app.evaluate(({ dialog, shell }, chosen) => {
        // Do not open a real save window or a PDF viewer during a test. Answer as the person would.
        const queue = [...chosen];
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: queue.shift() });
        shell.openPath = async () => '';
      }, files);
      const pageCount = async (file) =>
        (await PDFDocument.load(readFileSync(file), { updateMetadata: false })).getPageCount();
      const sheetRows = async (file) => {
        const book = new ExcelJS.Workbook();
        await book.xlsx.readFile(file);
        return book.worksheets[0].actualRowCount;
      };
      const layout = {
        columns: [
          { kind: 'blank' },
          ...['driver', 'vehicle', 'shift_type', 'routes', 'pad'].map((field) => ({ field })),
          { kind: 'blank' },
        ],
      };
      try {
        const printed = await ask('print:print', { spec: layout, vans: false, openAfter: true });
        assert(
          printed.ok && printed.value.status === 'written',
          `Print Page: ${JSON.stringify(printed.reason ?? '')}`,
        );
        assert(printed.value.drivers === demoRows, 'Print Page left drivers off');
        assert(
          (await pageCount(files[0])) === printed.value.pages,
          'the PDF has the wrong page count',
        );

        const vans = await ask('print:print', { spec: layout, vans: true, openAfter: false });
        assert(vans.ok && vans.value.status === 'written', 'Print Vans wrote nothing');
        // The title, a blank line, then the headings, then one row per driver holding a van.
        assert(
          (await sheetRows(files[1])) === vans.value.drivers + 2,
          'the van workbook has the wrong rows',
        );

        const exported = await ask('print:export', { withDwp: false });
        assert(
          exported.ok && exported.value.drivers === demoRows,
          'Export Roster left drivers off',
        );
        assert(
          (await sheetRows(files[2])) === demoRows + 1,
          'the export workbook has the wrong rows',
        );
        const exportedPdf = await ask('print:export', { withDwp: false });
        assert(exportedPdf.ok && (await pageCount(files[3])) >= 1, 'the export PDF is empty');

        const preview = await ask('print:preview', { spec: layout });
        assert(preview.ok && preview.value.pages === printed.value.pages, 'Preview did not match');
        return `${printed.value.pages} pages, ${vans.value.drivers} vans, ${exported.value.drivers} exported`;
      } finally {
        rmSync(outDir, { recursive: true, force: true });
      }
    },
  );

  await check(
    'a load-out sheet dropped on the Roster tab comes in; a wrong file is refused',
    async () => {
      const fixtureDir = join(root, '..', '..', 'packages', 'fixtures');
      const sheet = join(fixtureDir, 'loadout-sheets', '2026_09_14_12_15_loadout_sheet.xlsx');
      const wrong = join(fixtureDir, 'associates', 'AssociateData.csv');
      assert(existsSync(sheet) && existsSync(wrong), 'the made-up files are missing');
      await goTo(page, 'load-out');
      await page.click('[data-tab-button="roster"]');
      const zone = page.locator('[data-drop-kind="loadout"]');
      await zone.waitFor({ state: 'visible', timeout: 5_000 });
      // A real file from the disk, the way the window hands one over: Playwright puts it in a
      // file box, and the drop carries that same file. Only the bridge can find its place.
      await page.evaluate(() => {
        const box = document.createElement('input');
        box.type = 'file';
        box.id = 'smoke-drop-file';
        box.style.display = 'none';
        document.body.append(box);
      });
      const dropIt = async (file) => {
        await page.setInputFiles('#smoke-drop-file', file);
        await page.evaluate(() => {
          const box = document.getElementById('smoke-drop-file');
          const transfer = new DataTransfer();
          transfer.items.add(box.files[0]);
          const target = document.querySelector('[data-drop-kind="loadout"]');
          for (const type of ['dragenter', 'dragover', 'drop']) {
            target.dispatchEvent(
              new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }),
            );
          }
        });
      };
      const status = () => page.locator('[data-testid="load-out-status"]').innerText();

      // The wrong kind: plain words, and the roster is as it was.
      const before = (await ask('state:snapshot')).value.roster.rows.length;
      await dropIt(wrong);
      const note = page.locator('[data-testid="inform-dialog"]');
      await note.waitFor({ state: 'visible', timeout: 5_000 });
      assert(
        (await note.innerText()).includes(
          "That file doesn't look like a load-out sheet. It should end in .xlsx.",
        ),
        'the wrong file was not refused in plain words',
      );
      await page.click('[data-testid="inform-ok"]');
      assert(
        (await ask('state:snapshot')).value.roster.rows.length === before,
        'the roster changed',
      );

      // The right kind: the demo roster is there, so it asks first, then brings the sheet in.
      await dropIt(sheet);
      const question = page.locator('[data-testid="confirm-dialog"]');
      await question.waitFor({ state: 'visible', timeout: 5_000 });
      assert(
        (await question.innerText()).includes('2026_09_14_12_15_loadout_sheet.xlsx'),
        'the question does not name the dropped file',
      );
      await page.click('[data-testid="confirm-yes"]');
      await until(
        async () =>
          /^Imported \d+ drivers from 2026_09_14_12_15_loadout_sheet\.xlsx/.test(await status()),
        'the dropped sheet did not come in',
      );
      const rows = (await ask('state:snapshot')).value.roster.rows.length;
      assert(rows > 0, 'the roster is empty');
      await page.evaluate(() => document.getElementById('smoke-drop-file')?.remove());
      // The main log names neither the file nor where it was.
      const logged = (await mainLog()).join('\n');
      assert(
        !logged.includes('loadout_sheet') && !logged.includes(fixtureDir),
        'the log names the file',
      );
      return `${rows} drivers from a dropped sheet`;
    },
  );

  // ---- a whole fixture day on the Load Out page, against the old app (scripts/parity)
  const fixtures = join(root, '..', '..', 'packages', 'fixtures');
  const expectedDir = join(root, '..', '..', 'scripts', 'parity', 'expected');
  const PARITY_DAY = '2026-09-01';
  const answerFileWindow = (file) =>
    app.evaluate(({ dialog }, chosen) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] });
    }, file);
  const bringIn = async (kind, file) => {
    await answerFileWindow(file);
    const picked = await ask('files:pick', { kind });
    assert(picked.ok && picked.value.path === file, `the ${kind} file was not picked`);
    const done = await ask('files:import', { kind, path: file });
    assert(done.ok, `the ${kind} file was not brought in: ${done.reason}`);
  };
  const status = () => page.locator('[data-testid="load-out-status"]').innerText();
  /** Says yes to every question and OK to every note, until `finished` is true. */
  const answerUntil = async (finished, message) =>
    until(async () => {
      if (await finished()) return true;
      for (const id of ['confirm-yes', 'inform-ok']) {
        const button = page.locator(`[data-testid="${id}"]`);
        if (await button.isVisible().catch(() => false)) await button.click();
      }
      return false;
    }, message);

  await check(
    `a fixture day on the Load Out page ends as the old app did (${PARITY_DAY})`,
    async () => {
      const days = JSON.parse(readFileSync(join(expectedDir, 'days.json'), 'utf8')).days;
      const day = days.find((d) => d.day === PARITY_DAY);
      const vans = JSON.parse(readFileSync(join(expectedDir, PARITY_DAY, 'vans.json'), 'utf8'));
      const dwpRows = JSON.parse(readFileSync(join(expectedDir, PARITY_DAY, 'dwp.json'), 'utf8'))
        .after_route_bring_over.rows_after;
      const rowsWanted = JSON.parse(
        readFileSync(join(expectedDir, PARITY_DAY, 'rows.json'), 'utf8'),
      ).rows;

      // A normal morning (scripts/parity/CONTRACT.md, section 3).
      await bringIn('associates', join(fixtures, 'associates', day.files.associates));
      for (const name of day.files.tenure) await bringIn('tenure', join(fixtures, 'tenure', name));
      await bringIn('vehicles', join(fixtures, 'vehicles', day.files.vehicles));

      // Import Sheet on the Roster tab. The demo roster is there, so it asks first.
      await goTo(page, 'load-out');
      await page.click('[data-tab-button="roster"]');
      await answerFileWindow(join(fixtures, 'loadout-sheets', day.files.loadout));
      await page.click('[data-action="import-sheet"]');
      await answerUntil(
        async () => /^Imported \d+ drivers/.test(await status()),
        'the sheet did not come in',
      );

      await bringIn('routes', join(fixtures, 'routes', day.routes.file));
      // The harness pins each export's dispatch times to PADs 1, 2, 3 in clock order; the same
      // pins are set below, the way the Route Data page sets them.
      const routesByTime = JSON.parse(
        readFileSync(join(expectedDir, PARITY_DAY, 'routes.json'), 'utf8'),
      ).scenarios['routes/by_time'];
      await bringIn('itineraries', join(fixtures, 'itineraries', day.itineraries.file));
      await bringIn('schedule', join(fixtures, 'schedules', day.schedule.file));
      const sources = JSON.parse(
        readFileSync(join(expectedDir, PARITY_DAY, 'inputs.json'), 'utf8'),
      ).route_sources;
      for (const kind of ['routes', 'itineraries', 'schedule']) {
        const pinned = await ask('routeData:set-pads', { kind, pads: sources[kind].pads });
        assert(pinned.ok, `the ${kind} PADs were not set`);
      }
      await bringIn('dwp', join(fixtures, 'dwp', day.dwp.file));

      // Bring Over Route Data: three exports are in, so it asks which. The harness takes Routes.
      await page.click('[data-action="bring-over-route-data"]');
      const source = page.locator('[data-testid="source-dialog"]');
      await source.waitFor({ state: 'visible', timeout: 5_000 });
      assert(
        (await source.locator('input[type="radio"]').count()) === 3,
        'not three exports offered',
      );
      await source.locator('input[value="routes"]').check();
      await source.getByRole('button', { name: 'Bring Over' }).click();
      // Notes come first (who route data added, and needs a look). Then the DWP: this day's
      // sheet is named like "XXXX DWP 9.2", with no year, so the app cannot tell its day and
      // must ask before bringing it over.
      const question = page.locator('[data-testid="confirm-dialog"]');
      await until(async () => {
        if (await question.isVisible().catch(() => false)) return true;
        const ok = page.locator('[data-testid="inform-ok"]');
        if (await ok.isVisible().catch(() => false)) await ok.click();
        return false;
      }, 'the DWP day question never came');
      const asked = (await question.locator('h2').innerText()).trim();
      assert(asked === "Is this the right day's DWP sheet?", 'a different question came');
      assert(
        /Can't tell which day/.test(await question.innerText()),
        'the question does not say the day is unknown',
      );
      await page.click('[data-testid="confirm-yes"]');
      await until(async () => /DWP: \d+ staging/.test(await status()), 'the DWP did not come over');

      // Assign Vans, and its read-out.
      await page.click('[data-action="assign-vans"]');
      const readout = page.locator('[data-testid="assign-dialog"]');
      await readout.waitFor({ state: 'visible', timeout: 10_000 });
      const heading = await readout.locator('h2').innerText();
      const want = `${vans.result.assigned} of ${vans.result.considered} drivers have a van`;
      assert(heading === want, 'the read-out does not give the old counts');
      const firstLine = await readout.locator('tbody tr').first().getAttribute('data-tone');
      assert(
        vans.result.unassigned === 0 || firstLine === 'bad',
        'drivers not placed are not first',
      );
      await readout.getByRole('button', { name: 'Close' }).click();

      // The roster, row by row, against the old app's.
      const snap = (await ask('state:snapshot')).value;
      assert(snap.roster.rows.length === vans.roster_after.length, 'not the same number of rows');
      const differences = [];
      snap.roster.rows.forEach((view, index) => {
        const old = vans.roster_after[index];
        const row = rowsWanted[index];
        if (view.row.vehicle !== old.vehicle || view.row.vin !== old.vin) differences.push(index);
        else if (view.row.assignMethod !== old.assign_method) differences.push(index);
        else if (view.assignMethodLabel !== row.assign_method_label) differences.push(index);
        else if (view.vanBadges !== row.van_badges) differences.push(index);
        else if (view.match.method !== (row.match_method ?? 'none')) differences.push(index);
        else {
          // What route data and the DWP put on the row.
          const route = routesByTime.rows_after[index] ?? {};
          const dwp = dwpRows[index] ?? {};
          const same =
            view.row.routes === route.routes &&
            view.row.pad === route.pad &&
            view.row.waveTime === route.wave_time &&
            view.row.serviceType === route.service_type &&
            view.row.stagingLocation === dwp.staging_location &&
            view.row.bags === dwp.bags &&
            view.row.ovs === dwp.ovs;
          if (!same) differences.push(index);
        }
      });
      assert(
        differences.length === 0,
        `${differences.length} rows differ, first at row ${differences[0]}`,
      );
      const shownVans = await page.locator('[data-testid="roster-breakdown"]').innerText();
      assert(
        shownVans.includes(`vans assigned: ${vans.result.assigned}/`),
        'the header does not count the vans',
      );

      // One hand move: give a free van to a driver without one, then take it back.
      const free = snap.vehicles.find((v) => v.available);
      const empty = snap.roster.rows.find((v) => !v.row.vehicle && !v.row.vin);
      assert(free && empty, 'no free van, or nobody without one');
      const given = await ask('loadOut:give-van', {
        revision: snap.revision,
        rowIndex: empty.index,
        vin: free.vehicle.vin,
      });
      assert(given.ok, `the van was not given: ${given.reason}`);
      const afterGive = (await ask('state:snapshot')).value;
      const holder = afterGive.roster.rows[empty.index];
      assert(holder.row.vin === free.vehicle.vin, 'the van is not on the row');
      assert(holder.assignMethodLabel === 'given by hand', 'Matched On does not say given by hand');
      const taken = await ask('loadOut:take-van', {
        revision: afterGive.revision,
        rowIndex: empty.index,
      });
      assert(taken.ok, 'the van was not taken back');
      const afterTake = (await ask('state:snapshot')).value.roster.rows[empty.index];
      assert(
        !afterTake.row.vin && afterTake.assignMethodLabel === '',
        'Matched On was not emptied',
      );
      return `${snap.roster.rows.length} rows, ${vans.result.assigned} vans, all as before, one hand move`;
    },
  );

  await check('Move Data to Previous Roster copies the day across', async () => {
    const before = (await ask('state:snapshot')).value;
    await page.click('[data-action="move-to-previous"]');
    await answerUntil(async () => /^Copied \d+ drivers/.test(await status()), 'nothing was copied');
    const after = (await ask('state:snapshot')).value;
    assert(
      after.previousRoster.rows.length === before.roster.rows.length,
      'the previous roster does not hold today',
    );
    assert(after.roster.rows.length === before.roster.rows.length, 'today changed');
    await page.click('[data-tab-button="previous-roster"]');
    const count = await page.locator('[data-testid="previous-roster-count"]').innerText();
    assert(count.startsWith(`${before.roster.rows.length} drivers`), 'the tab does not show it');
    return `${after.previousRoster.rows.length} rows`;
  });

  await check('Clear Previous Roster asks, clears it, and the page follows', async () => {
    await goTo(page, 'previous-roster');
    const count = page.locator('[data-testid="previous-roster-count"]');
    await until(
      async () => /^[1-9]\d* drivers/.test(await count.innerText()),
      'no previous roster showed',
    );
    await page.click('[data-testid="clear-previous-roster"]');
    await page.click('[data-testid="confirm-yes"]');
    await until(
      async () => /No previous roster/.test(await count.innerText()),
      'the page did not follow the change',
    );
    const snap = await ask('state:snapshot');
    assert(snap.value.counts.previousRosterRows === 0, 'the snapshot still has a previous roster');
  });

  await check('Ctrl+O and Ctrl+I work from another page', async () => {
    await app.evaluate(({ dialog }) => {
      // Record which file window was asked for, and close it as if nothing was chosen.
      globalThis.__smokeWindows = [];
      dialog.showOpenDialog = async (...args) => {
        const options = args.length > 1 ? args[1] : args[0];
        globalThis.__smokeWindows.push(options.title);
        return { canceled: true, filePaths: [] };
      };
    });
    const windows = () => app.evaluate(() => globalThis.__smokeWindows.slice());
    await goTo(page, 'home');
    await page.keyboard.press('Control+o');
    await page.waitForSelector('[data-page="load-out"]', { timeout: 5_000 });
    await until(
      async () => (await windows()).includes('Choose the load-out sheet'),
      'Ctrl+O did not open the file window for the load-out sheet',
    );
    await goTo(page, 'home');
    await page.keyboard.press('Control+i');
    await page.waitForSelector('[data-page="associates"]', { timeout: 5_000 });
    // The list is there, so it asks before replacing it.
    const ask = page.locator('dialog[data-dialog="confirm"]');
    await ask.waitFor({ state: 'visible', timeout: 5_000 });
    assert(
      (await ask.innerText()).includes('Replace the associate list?'),
      'Ctrl+I did not ask before replacing the list',
    );
    await ask.getByRole('button', { name: 'No, keep the list' }).click();
    return (await windows()).join(', ');
  });

  // Route Data, Vehicle Data and Associates, on the numbers the old app's harness wrote down.
  await otherPagesChecks({ app, page, check, assert, until, ask, goTo, root });

  await check('a table layout is kept in the saved data', async () => {
    const set = await ask('layout:set', {
      view: 'smoke',
      order: ['b', 'a'],
      widths: { a: 120 },
    });
    assert(set.ok, 'the layout was not saved');
    const got = await ask('layout:get', { view: 'smoke' });
    assert(
      got.ok && got.value.order.join() === 'b,a' && got.value.widths.a === 120,
      `got ${JSON.stringify(got)}`,
    );
  });

  await check('demo mode goes away', async () => {
    await goTo(page, 'settings');
    await page.getByLabel('Show made-up drivers and vans').uncheck();
    await page.waitForSelector('[data-testid="demo-banner"]', {
      state: 'detached',
      timeout: 5_000,
    });
    await goTo(page, 'home');
    const after = await page.locator('[data-testid="data-summary"]').innerText();
    assert(/Drivers in your list: 0/.test(after), 'the demo drivers are still showing');
    assert(!settingsOnDisk().demoMode, 'demo mode was saved to disk');
    const snap = await ask('state:snapshot');
    assert(
      snap.ok && snap.value.roster.rows.length === 0,
      'the demo roster is still in the snapshot',
    );
    assert(snap.value.mode === 'real', 'the snapshot still says demo');
    return `${demoRows} demo rows gone`;
  });

  // Column layout of the real data: set, then checked again after the restart below.
  await check('a layout is set on the real data', async () => {
    const set = await ask('layout:set', { view: 'restart', order: ['y', 'x'], widths: { x: 99 } });
    assert(set.ok, 'the layout was not saved');
  });

  await goTo(page, 'associates'); // the page to come back to
  await app.evaluate(({ BrowserWindow }) =>
    // Small enough to fit a 1024x768 build machine, so the app has no reason to move it.
    BrowserWindow.getAllWindows()[0].setBounds({ x: 60, y: 60, width: 820, height: 620 }),
  );
  await new Promise((done) => setTimeout(done, 800));
  await app.close();
  first = null;

  // ------------------------------------------------------------------ second run
  second = await launch();
  const again = second.page;

  await check("What's new does not show a second time", async () => {
    assert(
      (await again.locator('dialog[data-dialog="whats-new"]').count()) === 0,
      'it showed again',
    );
  });

  await check('the last page, theme and text size are remembered', async () => {
    assert(
      (await again.getAttribute('[data-nav="associates"]', 'aria-current')) === 'page',
      'wrong page',
    );
    assert((await htmlTheme(again)) === 'dark', 'theme was not remembered');
    assert((await fontScale(again)) === '1.1', 'text size was not remembered');
  });

  await check('the table layout comes back after a restart', async () => {
    const got = await again.evaluate(() => window.loadout.calls['layout:get']({ view: 'restart' }));
    assert(
      got.ok && got.value.order.join() === 'y,x' && got.value.widths.x === 99,
      `got ${JSON.stringify(got)}`,
    );
  });

  await check('the window comes back at the size and place it was left at', async () => {
    assert(existsSync(windowStatePath), 'no window state was saved');
    const b = await second.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getBounds(),
    );
    assert(b.width === 820 && b.height === 620, `window was ${b.width}x${b.height}`);
    assert(b.x === 60 && b.y === 60, `window was at ${b.x},${b.y}`);
  });

  await second.app.close();
  second = null;

  // ------------------------------------------------------------------ the old app's data
  // A first run with the old app's (made-up) database found by the environment override, which
  // only an app that is not installed honours.
  oldDir = mkdtempSync(join(tmpdir(), 'loadout-smoke-old-'));
  writeFileSync(join(oldDir, 'settings.json'), JSON.stringify({ autoTours: false }));
  const oldDb = resolve(root, '..', '..', 'packages', 'fixtures', 'v1', 'loadout.db');
  const oldEnv = { LOADOUT_OLD_DB: oldDb };
  third = await launch(oldDir, oldEnv);
  const fresh = third.page;
  const oldDialog = fresh.locator('dialog[data-dialog="old-data"]');

  await check(
    'a first run offers to bring over the old data, and Not now puts it away',
    async () => {
      await oldDialog.waitFor({ state: 'visible', timeout: 10_000 });
      const text = await oldDialog.innerText();
      assert(
        text.includes('We found your old roster data. Bring it over?'),
        'the question is missing',
      );
      for (const label of ['Yes', 'Not now', 'Choose a different file']) {
        assert(text.includes(label), `no "${label}" button`);
      }
      await fresh.click('[data-action="old-data-not-now"]');
      await oldDialog.waitFor({ state: 'hidden', timeout: 5_000 });
      await until(
        () => JSON.parse(readFileSync(join(oldDir, 'settings.json'), 'utf8')).oldDataAsked === true,
        'the answer was not saved',
      );
      const info = await fresh.evaluate(() => window.loadout.calls['data:get-source-info']());
      const rows = Object.values(info.value.counts).reduce((sum, n) => sum + n, 0);
      assert(rows === 0, 'Not now still brought data over');
    },
  );

  await check(
    'Settings brings the old data over, in words, and refuses to do it twice',
    async () => {
      await goTo(fresh, 'settings');
      await fresh.click('[data-testid="bring-over-old-data"]');
      await oldDialog.waitFor({ state: 'visible', timeout: 5_000 });
      await fresh.click('[data-action="old-data-yes"]');
      const summary = await fresh
        .locator('[data-testid="old-data-summary"]')
        .waitFor({ state: 'visible', timeout: 20_000 })
        .then(() => fresh.locator('[data-testid="old-data-summary"]').innerText());
      assert(/^Brought over .*\d+ drivers/.test(summary), 'no count of drivers in words');
      assert(/\d+ vans/.test(summary), 'no count of vans in words');
      await fresh.click('[data-action="old-data-close"]');
      await oldDialog.waitFor({ state: 'hidden', timeout: 5_000 });
      const info = await fresh.evaluate(() => window.loadout.calls['data:get-source-info']());
      assert(
        info.value.counts.associates > 0 && info.value.counts.vehicles > 0,
        'nothing was saved',
      );
      // The data is in the app now, not just in the database.
      const snapshot = await fresh.evaluate(() => window.loadout.calls['state:snapshot']());
      assert(
        snapshot.value.associates.length === info.value.counts.associates,
        'the page was not told',
      );
      // Again: nothing is written over what is saved.
      await fresh.click('[data-testid="bring-over-old-data"]');
      await oldDialog.waitFor({ state: 'visible', timeout: 5_000 });
      // The dialog looks for the old file first, which takes a moment on a slow machine.
      await oldDialog
        .getByText('already has saved data')
        .waitFor({ state: 'visible', timeout: 10_000 })
        .catch(() => assert(false, 'no refusal in words'));
      await fresh.click('[data-action="old-data-close"]');
      const again2 = await fresh.evaluate(() => window.loadout.calls['data:get-source-info']());
      assert(
        JSON.stringify(again2.value.counts) === JSON.stringify(info.value.counts),
        'the second try changed the data',
      );
      return summary.replace(/^Brought over /, '');
    },
  );

  await check('a file the person chooses that is not a database is refused in words', async () => {
    // The picker is a window the check cannot click, so it stands in for the choice.
    const junk = join(oldDir, 'not-a-database.db');
    writeFileSync(junk, 'just some words');
    await third.app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, junk);
    const picked = await fresh.evaluate(() => window.loadout.calls['migration:pick']());
    assert(picked.ok && picked.value.chosen === true, 'the chosen file was not taken');
    const run = await fresh.evaluate(() =>
      window.loadout.calls['migration:run']({ from: 'chosen' }),
    );
    assert(run.ok === false && run.reason === 'refused', `got ${JSON.stringify(run)}`);
    assert(/could not be read/.test(run.message), 'the reason is not in words');
    assert(!run.message.includes(oldDir), 'the reason shows a place on the computer');
  });

  await third.app.close();
  third = null;
  third = await launch(oldDir, oldEnv);

  await check(
    'after a restart the old data stays and the question is not asked again',
    async () => {
      assert(
        (await third.page.locator('dialog[data-dialog="old-data"]').count()) === 0,
        'asked again',
      );
      const info = await third.page.evaluate(() => window.loadout.calls['data:get-source-info']());
      assert(info.value.counts.associates > 0, 'the brought-over data is gone');
    },
  );

  await check('no errors were printed by the page or the main process', async () => {
    assert(problems.length === 0, problems.slice(0, 3).join(' | '));
  });
} catch (error) {
  results.push({
    ok: false,
    name: 'the smoke run',
    detail: String(error.message ?? error).split('\n')[0],
  });
} finally {
  for (const run of [first, second, third]) {
    try {
      await run?.app.close();
    } catch {
      // Already closed.
    }
  }
  rmSync(dataDir, { recursive: true, force: true });
  if (oldDir) rmSync(oldDir, { recursive: true, force: true });
}

console.log('');
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` (${r.detail})` : ''}`);
}
if (problems.length > 0) {
  console.log('');
  console.log('Errors seen while running:');
  for (const p of problems.slice(0, 10)) console.log(`  ${p}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log('');
console.log(
  failed === 0
    ? `Smoke check passed: ${results.length} checks.`
    : `Smoke check FAILED: ${failed} of ${results.length} checks.`,
);
setTimeout(() => process.exit(failed === 0 ? 0 : 1), 100);
