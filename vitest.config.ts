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
  },
});
