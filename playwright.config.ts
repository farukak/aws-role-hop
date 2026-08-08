import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests load the real built extension into Chromium. Only Chromium
 * is covered: Playwright can install an unpacked MV3 extension through a
 * persistent context, which Firefox and Safari do not support. Those two targets
 * are verified by `npm run build:firefox` / `build:safari` and `web-ext lint`.
 */
export default defineConfig({
  testDir: 'e2e',
  outputDir: '.output/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
