'use strict';

const { defineConfig, devices } = require('@playwright/test');
const { config } = require('./src/utilities/ConfigReader');

/**
 * Browser launch options shared by the Cucumber hooks and by any plain
 * Playwright Test spec added later, so a change to HEADLESS or SLOWMO applies to
 * both runners.
 */
const browserLaunchOptions = {
  headless: config.headless,
  slowMo: config.slowMo,
  channel: config.channel,
  // Note: --start-maximized is deliberately absent. Combined with the fixed
  // viewport it produces a window/screen metric mismatch that bot detection
  // flags, and Playwright overrides it anyway once a viewport is set.
  args: config.browser === 'chromium' ? ['--disable-blink-features=AutomationControlled'] : [],
};

/**
 * Browser context options shared by the Cucumber hooks and Playwright Test.
 */
const browserContextOptions = {
  viewport: config.viewport,
  locale: config.locale,
  timezoneId: config.timezoneId,
  ignoreHTTPSErrors: config.ignoreHttpsErrors,
  acceptDownloads: true,
  recordVideo:
    config.video === 'off'
      ? undefined
      : { dir: `${config.artifactsDir}/videos`, size: config.viewport },
};

/**
 * Playwright Test configuration.
 *
 * Cucumber drives the BDD suite; this file keeps the project aligned with the
 * official Playwright layout, enables `npx playwright test` for any non-BDD
 * spec, and makes `npx playwright show-trace` work out of the box.
 */
module.exports = defineConfig({
  testDir: './src',
  testMatch: '**/*.spec.js',
  outputDir: `${config.artifactsDir}/playwright`,
  timeout: config.stepTimeout,
  expect: { timeout: config.expectTimeout },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : config.retryCount,
  workers: config.parallelWorkers,
  reporter: [
    ['list'],
    ['html', { outputFolder: `${config.reportsDir}/playwright-report`, open: 'never' }],
    ['json', { outputFile: `${config.reportsDir}/playwright-results.json` }],
  ],
  use: {
    baseURL: config.baseUrl,
    headless: config.headless,
    viewport: config.viewport,
    locale: config.locale,
    timezoneId: config.timezoneId,
    ignoreHTTPSErrors: config.ignoreHttpsErrors,
    acceptDownloads: true,
    actionTimeout: config.timeout,
    navigationTimeout: config.navigationTimeout,
    screenshot: config.screenshot === 'retain-on-failure' ? 'only-on-failure' : config.screenshot,
    video: config.video,
    trace: config.trace,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});

module.exports.browserLaunchOptions = browserLaunchOptions;
module.exports.browserContextOptions = browserContextOptions;
