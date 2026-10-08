// `npm start`: opens the app for development.
// 1. Builds the main-process code and the bridge to the screens.
// 2. Starts the Vite server for the screens.
// 3. Opens Electron pointed at that server.
// Closing the window stops everything.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const build = spawnSync(process.execPath, [resolve(root, 'scripts', 'build-main.mjs')], {
  cwd: root,
  stdio: 'inherit',
});
if (build.status !== 0) {
  console.error('The app code did not build. Fix the errors above and run npm start again.');
  process.exit(build.status ?? 1);
}

const server = await createServer({ root, configFile: resolve(root, 'vite.config.mts') });
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) {
  console.error('The screens server did not start.');
  await server.close();
  process.exit(1);
}

const electronPath = require('electron');
const child = spawn(electronPath, ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url.replace(/\/$/, '') },
});

const stop = async (code) => {
  await server.close();
  process.exit(code ?? 0);
};
child.on('exit', (code) => void stop(code));
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
