'use strict';

const { World, setWorldConstructor, setDefaultTimeout } = require('@cucumber/cucumber');
const { OlxPage } = require('../pages/OlxPage');
const { config } = require('../utilities/ConfigReader');
const { Logger } = require('../utilities/Logger');

/**
 * Custom Cucumber World.
 *
 * One instance is created per scenario, including in parallel runs, so every
 * scenario owns an isolated browser, context, page and page-object graph. Step
 * definitions never touch Playwright directly: they go through the page objects
 * exposed here.
 */
class PlaywrightWorld extends World {
  /**
   * @param {object} options Cucumber world options
   */
  constructor(options) {
    super(options);

    /** @type {import('@playwright/test').Browser} */
    this.browser = undefined;

    /** @type {import('@playwright/test').BrowserContext} */
    this.context = undefined;

    /** @type {import('@playwright/test').Page} */
    this.page = undefined;

    /** @type {OlxPage} */
    this.olxPage = undefined;

    /** Free-form data shared between the steps of one scenario. */
    this.data = {};

    /** Slug of the running scenario, used to name artifacts. */
    this.scenarioName = 'scenario';

    /** Absolute path of this scenario's trace file, when one is kept. */
    this.tracePath = undefined;

    // Named `logger`, not `log`: Cucumber's World already owns a `log` method
    // for writing text into the report, and overriding it breaks attachments.
    this.logger = Logger.for('Scenario');
  }

  /**
   * Stores the page and builds the page objects bound to it.
   *
   * @param {import('@playwright/test').Page} page the page created by the Before hook
   */
  setPage(page) {
    this.page = page;
    this.olxPage = new OlxPage(page);
  }

  /**
   * @returns {OlxPage} the OLX page object for this scenario
   */
  getOlxPage() {
    if (!this.olxPage) {
      throw new Error(
        'Page objects are not available: the Before hook has not created a page yet.',
      );
    }
    return this.olxPage;
  }

  /**
   * Stores a value for a later step in the same scenario.
   *
   * @param {string} key lookup key
   * @param {*} value value to keep
   */
  set(key, value) {
    this.data[key] = value;
  }

  /**
   * Reads a value stored earlier in the same scenario.
   *
   * @param {string} key lookup key
   * @returns {*} the stored value, or undefined
   */
  get(key) {
    return this.data[key];
  }

  /**
   * Reads a value a previous step is required to have set.
   *
   * @param {string} key lookup key
   * @returns {*} the stored value
   */
  require(key) {
    const value = this.data[key];
    if (value === undefined) {
      throw new Error(`Scenario context is missing the required key "${key}"`);
    }
    return value;
  }

  /**
   * Attaches a PNG screenshot of the current page to the Cucumber report.
   *
   * @param {string} [name='screenshot'] label used in logs
   */
  async attachScreenshot(name = 'screenshot') {
    if (!this.page || this.page.isClosed()) {
      return;
    }
    const image = await this.page.screenshot({ fullPage: true });
    await Promise.resolve(this.attach(image, 'image/png'));
    this.logger.debug(`Attached screenshot: ${name}`);
  }

  /**
   * Attaches a plain-text note to the Cucumber report.
   *
   * @param {string} text note content
   */
  async attachText(text) {
    await Promise.resolve(this.attach(text, 'text/plain'));
  }
}

setWorldConstructor(PlaywrightWorld);

// Cucumber's default 5-second step timeout is far too short for real browser
// interactions against a production site.
setDefaultTimeout(config.stepTimeout);

module.exports = { PlaywrightWorld };
