import { defineConfig } from 'vitest/config';

// One run covers every workspace: the core, the desktop app, and the repo's own scripts.
export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.{ts,tsx}',
      'scripts/**/*.test.mjs',
    ],
    environment: 'node',
    // The Windows build machine is several times slower than a desktop, and a few tests build a
    // whole made-up database first. Five seconds (the default) is not enough there.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
