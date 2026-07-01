import { defineConfig } from '@playwright/test';

export default defineConfig({
  globalSetup: './tests/global-setup.js',
  testDir: './tests',
  timeout: 120000,
  retries: 1,
  use: {
    browserName: 'chromium',
    headless: false,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },
  reporter: [
    ['list'],
    ['json', { outputFile: 'results/last-run.json' }],
    ['html', { open: 'never' }],
  ],
});
