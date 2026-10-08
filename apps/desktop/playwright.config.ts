// Browser tests for the screens, run against Vite's dev server (not Electron).
//
//   npm run test:ui -w @loadout/desktop
//
// Chromium comes from PLAYWRIGHT_BROWSERS_PATH; never run `playwright install` here.

import { defineConfig, devices } from '@playwright/test';

// Another port can be given with UI_TEST_PORT, so two copies of the tests can run side by side.
const PORT = Number(process.env.UI_TEST_PORT ?? 5179);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1400, height: 800 },
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 800 } },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
