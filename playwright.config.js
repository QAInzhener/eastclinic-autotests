import { defineConfig } from '@playwright/test';

// Точечные перезапуски одного теста с дашборда (кнопка «▶») не должны стирать
// test-results/ и playwright-report/ ночного прогона — Playwright по умолчанию
// очищает outputDir в начале КАЖДОГО прогона, даже для одного файла. dashboard.js
// помечает такие прогоны переменной DASHBOARD_ADHOC_RUN=1, и они пишутся в
// отдельные adhoc-папки, не задевая общие результаты cron-прогона.
const isAdhoc = process.env.DASHBOARD_ADHOC_RUN === '1';

export default defineConfig({
  globalSetup: './tests/global-setup.js',
  testDir: './tests',
  timeout: 120000,
  retries: 1,
  outputDir: isAdhoc ? 'test-results-adhoc' : 'test-results',
  use: {
    browserName: 'chromium',
    headless: false,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    ignoreHTTPSErrors: true,
    actionTimeout: 30000,
    navigationTimeout: 30000,
  },
  reporter: [
    ['list'],
    ['json', { outputFile: 'results/last-run.json' }],
    ['html', { outputFolder: isAdhoc ? 'playwright-report-adhoc' : 'playwright-report', open: 'never' }],
  ],
});
