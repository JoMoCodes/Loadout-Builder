// Builds the two Node-side files of the app into dist/: the main process (dist/main/main.js)
// and the bridge to the screens (dist/preload/preload.js).
//
// They are bundled (with Vite) rather than compiled file by file, because the app's own
// packages (@loadout/core, @loadout/storage) are TypeScript source that Electron cannot load
// directly. Anything with native code or its own files stays outside the bundle and is loaded
// from node_modules at run time: electron, better-sqlite3 and electron-updater.

import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTSIDE = ['electron', 'better-sqlite3', 'electron-updater'];

async function bundle(entry, outName) {
  await build({
    root,
    configFile: false,
    logLevel: 'warn',
    publicDir: false,
    resolve: { conditions: ['node'] },
    ssr: { noExternal: [/^@loadout\//], external: OUTSIDE },
    build: {
      ssr: resolve(root, entry),
      outDir: resolve(root, 'dist', outName),
      emptyOutDir: true,
      target: 'node22',
      minify: false,
      sourcemap: true,
      rollupOptions: {
        external: [...OUTSIDE, /^node:/, ...builtinModules],
        output: { format: 'cjs', entryFileNames: `${outName}.js` },
      },
    },
  });
}

await bundle('src/main/main.ts', 'main');
await bundle('src/preload/preload.ts', 'preload');
console.log('Built the app code (dist/main, dist/preload).');
