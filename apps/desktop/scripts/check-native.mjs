// Runs after `npm ci` / `npm install`. The app's database library (better-sqlite3) has a native
// part, and Electron has its own copy of Node, so the native part has to load inside Electron
// and not only in plain Node. This script checks that by loading it inside Electron, and if
// that fails it rebuilds it for Electron (@electron/rebuild). `npm run rebuild` forces a rebuild.
//
// It never fails the install: if something is wrong it says so, and `npm start` will say it
// again with the real reason.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function electronBinary() {
  try {
    const path = require('electron');
    return typeof path === 'string' && existsSync(path) ? path : null;
  } catch {
    return null;
  }
}

function loadsInsideElectron(binary) {
  const probe = "new (require('better-sqlite3'))(':memory:').close()";
  const run = spawnSync(binary, ['-e', probe], {
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'ignore',
  });
  return run.status === 0;
}

const binary = electronBinary();
if (!binary) {
  console.log('Skipped the database check: Electron is not downloaded on this computer.');
} else if (loadsInsideElectron(binary)) {
  console.log('Database library loads inside Electron. No rebuild needed.');
} else {
  console.log('Database library does not load inside Electron. Rebuilding it for Electron...');
  const rebuild = spawnSync(
    process.execPath,
    [require.resolve('@electron/rebuild/lib/cli.js'), '-f', '-w', 'better-sqlite3'],
    { cwd: root, stdio: 'inherit' },
  );
  if (rebuild.status === 0 && loadsInsideElectron(binary)) {
    console.log('Rebuilt the database library for Electron.');
  } else {
    console.warn(
      'Could not make the database library work inside Electron. Run `npm run rebuild`.',
    );
  }
}
