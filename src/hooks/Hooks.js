'use strict';

const fs = require('fs');
const path = require('path');
const { After, AfterAll, Before, BeforeAll, Status } = require('@cucumber/cucumber');
const { chromium, firefox, webkit } = require('@playwright/test');
const { config, configReader } = require('../utilities/ConfigReader');
const { Logger } = require('../utilities/Logger');

const log = Logger.for('Hooks');

const BROWSER_ENGINES = { chromium, firefox, webkit };

/**
 * Prepares the output directories once per worker process.
 */
BeforeAll(async function prepareRun() {
  for (const directory of [config.reportsDir, config.artifactsDir]) {
    fs.mkdirSync(path.resolve(process.cwd(), directory), { recursive: true });
  }

  log.info(
    `Starting run | env=${config.env} | browser=${config.browser} | ` +
      `headless=${config.headless} | baseUrl=${config.baseUrl}`,
  );
});

/**
 * Per-scenario setup: launch the browser, create an isolated context with video
 * recording, start tracing, and open a page.
 *
 * A browser per scenario keeps parallel workers fully independent and guarantees
 * a crashed scenario cannot poison its neighbours.
 */
Before(async function launchBrowser(scenario) {
  this.scenarioName = slugify(scenario.pickle.name);
  log.scenarioStart(scenario.pickle.name);

  const engine = BROWSER_ENGINES[config.browser];
  this.browser = await engine.launch({
    headless: config.headless,
    slowMo: config.slowMo,
    channel: config.channel,
    // Note: --start-maximized is deliberately absent. Combined with the fixed
    // viewport below it produces a window/screen metric mismatch that bot
    // detection flags, and Playwright overrides it anyway once a viewport is set.
    args: config.browser === 'chromium' ? ['--disable-blink-features=AutomationControlled'] : [],
  });
  log.browserLaunched(config.browser, config.headless);

  this.context = await this.browser.newContext({
    viewport: config.viewport,
    locale: config.locale,
    timezoneId: config.timezoneId,
    ignoreHTTPSErrors: config.ignoreHttpsErrors,
    acceptDownloads: true,
    // Recording must be enabled at context creation; unwanted recordings are
    // discarded during teardown.
    recordVideo:
      config.video === 'off'
        ? undefined
        : { dir: path.join(config.artifactsDir, 'videos'), size: config.viewport },
  });

  this.context.setDefaultTimeout(config.timeout);
  this.context.setDefaultNavigationTimeout(config.navigationTimeout);

  if (config.trace !== 'off') {
    await this.context.tracing.start({
      title: scenario.pickle.name,
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    log.debug('Tracing started');
  }

  const page = await this.context.newPage();
  page.on('pageerror', (error) => log.debug(`Page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      log.debug(`Console error: ${message.text()}`);
    }
  });

  this.setPage(page);
});

/**
 * Per-scenario teardown.
 *
 * On failure: writes a screenshot under test-results/screenshots, attaches it to
 * the report, and writes the trace under test-results/traces. Always: stops
 * tracing, closes page, context and browser, then keeps or discards the video
 * according to the configured policy.
 */
After(async function teardownBrowser(scenario) {
  const failed = scenario.result?.status === Status.FAILED;
  const stem = `${this.scenarioName}-${timestamp()}`;

  try {
    if (failed && this.page && !this.page.isClosed()) {
      await captureScreenshot(this, stem);
      await this.attachText(`URL at failure: ${this.page.url()}`);
    }

    if (config.trace !== 'off' && this.context) {
      const keepTrace = config.trace === 'on' || failed;

      if (keepTrace) {
        this.tracePath = configReader.artifactPath('traces', `${stem}.zip`);
        await this.context.tracing.stop({ path: this.tracePath });
        await this.attachText(`Trace: npx playwright show-trace ${this.tracePath}`);
        log.artifact('Trace', this.tracePath);
      } else {
        await this.context.tracing.stop();
      }
    }
  } catch (error) {
    log.warn('Artifact capture failed during teardown', error);
  } finally {
    // Resolve the recording path before the context closes; the handle is
    // unusable afterwards.
    const videoPath = await resolveVideoPath(this);

    await closeQuietly(async () => {
      if (this.page && !this.page.isClosed()) {
        await this.page.close();
      }
    });
    await closeQuietly(async () => {
      if (this.context) {
        await this.context.close();
      }
    });
    await closeQuietly(async () => {
      if (this.browser && this.browser.isConnected()) {
        await this.browser.close();
      }
    });

    log.cleanup('Browser resources released');

    await handleVideo(this, videoPath, failed, stem);
    log.scenarioEnd(scenario.pickle.name, scenario.result?.status ?? 'UNKNOWN');
  }
});

/**
 * Reports where the artifacts landed once the worker finishes.
 */
AfterAll(async function summarise() {
  log.info(`Run finished. Reports: ${config.reportsDir} | Artifacts: ${config.artifactsDir}`);
});

/**
 * Captures the failure screenshot.
 *
 * A full-page capture is attempted first because it shows the whole failing
 * view, but infinite-scroll listing pages can make it very slow, so it is
 * bounded and falls back to a viewport capture rather than stalling teardown.
 *
 * @param {import('../support/World').PlaywrightWorld} world the scenario world
 * @param {string} stem artifact file-name stem
 */
async function captureScreenshot(world, stem) {
  if (config.screenshot === 'off') {
    return;
  }

  const screenshotPath = configReader.artifactPath('screenshots', `${stem}.png`);

  try {
    const image = await world.page.screenshot({
      path: screenshotPath,
      fullPage: true,
      timeout: 20000,
    });
    await Promise.resolve(world.attach(image, 'image/png'));
    log.artifact('Screenshot', screenshotPath);
    return;
  } catch {
    log.warn('Full-page screenshot timed out; falling back to a viewport capture');
  }

  try {
    const image = await world.page.screenshot({
      path: screenshotPath,
      fullPage: false,
      timeout: 10000,
    });
    await Promise.resolve(world.attach(image, 'image/png'));
    log.artifact('Screenshot', screenshotPath);
  } catch (error) {
    log.warn('Could not capture a failure screenshot', error);
  }
}

/**
 * Reads the recording path before the context is closed.
 *
 * @param {import('../support/World').PlaywrightWorld} world the scenario world
 * @returns {Promise<string|undefined>} the recording path, when there is one
 */
async function resolveVideoPath(world) {
  if (config.video === 'off' || !world.page || world.page.isClosed()) {
    return undefined;
  }
  try {
    return await world.page.video()?.path();
  } catch {
    return undefined;
  }
}

/**
 * Renames a kept recording to match its screenshot and trace, or deletes it when
 * the scenario passed under retain-on-failure.
 *
 * @param {import('../support/World').PlaywrightWorld} world the scenario world
 * @param {string|undefined} videoPath the raw recording path
 * @param {boolean} failed whether the scenario failed
 * @param {string} stem artifact file-name stem
 */
async function handleVideo(world, videoPath, failed, stem) {
  if (!videoPath || !fs.existsSync(videoPath)) {
    return;
  }

  const keepVideo = config.video === 'on' || failed;

  if (!keepVideo) {
    await closeQuietly(async () => fs.promises.unlink(videoPath));
    return;
  }

  const target = configReader.artifactPath('videos', `${stem}.webm`);
  try {
    await fs.promises.rename(videoPath, target);
    await world.attachText(`Video: ${target}`);
    log.artifact('Video', target);
  } catch (error) {
    log.warn('Could not finalise the recorded video', error);
  }
}

/**
 * Runs a teardown action and swallows any error, so one failing close call
 * cannot leave a browser process orphaned.
 *
 * @param {Function} action the teardown step
 */
async function closeQuietly(action) {
  try {
    await action();
  } catch (error) {
    log.debug('Teardown step failed and was ignored', error);
  }
}

/**
 * Converts a scenario name into a file-system-safe slug.
 *
 * @param {string} value the scenario name
 * @returns {string} the slug
 */
function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * @returns {string} a compact, sortable timestamp for artifact file names
 */
function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
