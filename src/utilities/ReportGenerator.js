'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const reporter = require('multiple-cucumber-html-reporter');
const { config } = require('./ConfigReader');

/**
 * Builds the rich HTML report from the JSON emitted by Cucumber.
 *
 * Run automatically after `npm test` (via the `posttest` script) or on demand
 * with `npm run report`.
 */
function generate() {
  const jsonFile = path.resolve(process.cwd(), config.reportsDir, 'cucumber-report.json');

  if (!fs.existsSync(jsonFile)) {
    console.warn(
      `[report] No JSON report at ${jsonFile}. Run the suite first (npm test); skipping.`,
    );
    return;
  }

  // multiple-cucumber-html-reporter reads a directory, not a file, and fails on
  // anything in it that is not a Cucumber JSON report — so the input is staged
  // into a directory of its own.
  const jsonDir = path.resolve(process.cwd(), config.reportsDir, 'json');
  fs.mkdirSync(jsonDir, { recursive: true });
  fs.copyFileSync(jsonFile, path.join(jsonDir, 'cucumber-report.json'));

  const outputDir = path.resolve(process.cwd(), config.reportsDir, 'html');

  reporter.generate({
    jsonDir,
    reportPath: outputDir,
    openReportInBrowser: false,
    disableLog: true,
    pageTitle: 'PlaywrightJsBdd — OLX Pakistan',
    reportName: 'PlaywrightJsBdd Automation Report',
    displayDuration: true,
    durationInMS: true,
    metadata: {
      browser: {
        name: config.browser,
        version: 'Playwright bundled',
      },
      device: os.hostname(),
      platform: {
        name: os.platform(),
        version: os.release(),
      },
    },
    customData: {
      title: 'Run details',
      data: [
        { label: 'Project', value: 'PlaywrightJsBdd' },
        { label: 'Environment', value: config.env },
        { label: 'Base URL', value: config.baseUrl },
        { label: 'Browser', value: config.browser },
        { label: 'Headless', value: String(config.headless) },
        { label: 'Parallel workers', value: String(config.parallelWorkers) },
        { label: 'Executed', value: new Date().toISOString() },
      ],
    },
  });

  console.log(`[report] HTML report written to ${path.join(outputDir, 'index.html')}`);
}

if (require.main === module) {
  generate();
}

module.exports = { generate };
