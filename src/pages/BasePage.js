'use strict';

const { expect } = require('@playwright/test');
const { config, configReader } = require('../utilities/ConfigReader');
const { Logger } = require('../utilities/Logger');
const { WaitUtils } = require('../utilities/WaitUtils');

/**
 * Base class for every page object.
 *
 * Owns the Playwright page, exposes the reusable interaction primitives, and
 * centralises logging so concrete page objects stay declarative.
 *
 * Every primitive accepts either a single Locator or an ordered array of
 * candidate locators. The array form applies the fallback strategy, resolving
 * to whichever candidate the current markup variant renders.
 */
class BasePage {
  /**
   * @param {import('@playwright/test').Page} page page under test
   * @param {string} scope logger scope, usually the subclass name
   */
  constructor(page, scope) {
    this.page = page;
    this.wait = new WaitUtils(page);
    this.log = Logger.for(scope);
  }

  // ------------------------------------------------------------------
  // Navigation
  // ------------------------------------------------------------------

  /**
   * Navigates to an absolute URL, or a path relative to BASE_URL.
   *
   * @param {string} [url='/'] absolute URL or leading-slash path
   */
  async navigate(url = '/') {
    const target = configReader.url(url);
    this.log.navigation(target);

    await this.page.goto(target, {
      waitUntil: 'domcontentloaded',
      timeout: config.navigationTimeout,
    });
    await this.waitForPageLoad();
  }

  /**
   * Reloads the current page.
   */
  async reload() {
    await this.page.reload({
      waitUntil: 'domcontentloaded',
      timeout: config.navigationTimeout,
    });
    await this.waitForPageLoad();
  }

  /**
   * Waits for the DOM to be parsed and the network to settle.
   */
  async waitForPageLoad() {
    await this.wait.forDomContentLoaded();
    await this.wait.forNetworkIdle();
  }

  /**
   * @returns {Promise<string>} the current URL
   */
  async getCurrentUrl() {
    return this.page.url();
  }

  /**
   * @returns {Promise<string>} the document title
   */
  async getPageTitle() {
    return this.page.title();
  }

  // ------------------------------------------------------------------
  // Interactions
  // ------------------------------------------------------------------

  /**
   * Clicks an element. Playwright auto-waits for actionability, so no explicit
   * wait is needed beforehand. Falls back to a forced click when a sticky header
   * or an animation intercepts the pointer event.
   *
   * @param {import('@playwright/test').Locator|import('@playwright/test').Locator[]} locator target
   * @param {string} [description='element'] name used in logs
   */
  async click(locator, description = 'element') {
    this.log.action('Click', description);
    const resolved = await this.resolve(locator);

    try {
      await resolved.click({ timeout: config.timeout });
    } catch {
      this.log.debug(`Standard click on ${description} failed; retrying forced.`);
      await resolved.scrollIntoViewIfNeeded();
      await resolved.click({ force: true, timeout: config.timeout });
    }
  }

  /**
   * Clears a field and types a value.
   *
   * Retries once against a freshly resolved locator: search widgets commonly
   * swap the input element the moment it receives focus, which detaches the node
   * resolved milliseconds earlier.
   *
   * @param {import('@playwright/test').Locator|import('@playwright/test').Locator[]} locator target
   * @param {string} value text to enter
   * @param {string} [description='field'] name used in logs
   */
  async fill(locator, value, description = 'field') {
    this.log.action(`Fill '${value}' into`, description);

    const attempt = async () => {
      const field = await this.resolve(locator);
      await field.fill('');
      await field.fill(value);
    };

    try {
      await attempt();
    } catch {
      this.log.debug(`First fill attempt on ${description} failed; re-resolving.`);
      await attempt();
    }
  }

  /**
   * Types character by character, which triggers the key events that type-ahead
   * widgets listen for.
   *
   * @param {import('@playwright/test').Locator|import('@playwright/test').Locator[]} locator target
   * @param {string} value text to enter
   * @param {number} [delay=60] milliseconds between keystrokes
   * @param {string} [description='field'] name used in logs
   */
  async type(locator, value, delay = 60, description = 'field') {
    this.log.action(`Type '${value}' into`, description);
    const field = await this.resolve(locator);
    await field.fill('');
    await field.pressSequentially(value, { delay });
  }

  /**
   * Presses a key on an element.
   *
   * @param {import('@playwright/test').Locator|import('@playwright/test').Locator[]} locator target
   * @param {string} key key name, e.g. "Enter"
   * @param {string} [description='element'] name used in logs
   */
  async press(locator, key, description = 'element') {
    this.log.action(`Press '${key}' on`, description);
    const resolved = await this.resolve(locator);
    await resolved.press(key);
  }

  /**
   * Selects an option from a native `<select>` element.
   *
   * @param {import('@playwright/test').Locator|import('@playwright/test').Locator[]} locator the select
   * @param {string} value option value or label
   * @param {string} [description='dropdown'] name used in logs
   */
  async selectOption(locator, value, description = 'dropdown') {
    this.log.action(`Select '${value}' from`, description);
    const select = await this.resolve(locator);
    await select.selectOption(value);
  }

  /**
   * Selects an option from a custom dropdown: clicks the trigger, waits for the
   * option list, then clicks the option.
   *
   * OLX builds its sort control from a `<button>` and a `role="listbox"` list
   * rather than a native `<select>`, so this drives the widget the way a user
   * does.
   *
   * @param {import('@playwright/test').Locator[]} trigger candidates for the control that opens the list
   * @param {import('@playwright/test').Locator[]} optionList candidates for the option list
   * @param {import('@playwright/test').Locator[]} option candidates for the option to pick
   * @param {string} optionLabel visible option text, used in logs
   * @param {string} [description='dropdown'] name used in logs
   */
  async selectCustomOption(trigger, optionList, option, optionLabel, description = 'dropdown') {
    await this.click(trigger, description);
    await this.waitForVisible(optionList);

    this.log.action(`Select '${optionLabel}' from`, description);
    const target = await this.resolve(option);
    await target.click({ timeout: config.timeout });
  }

  /**
   * Scrolls an element into the viewport.
   *
   * @param {import('@playwright/test').Locator|import('@playwright/test').Locator[]} locator target
   */
  async scrollIntoView(locator) {
    const resolved = await this.resolve(locator);
    await resolved.scrollIntoViewIfNeeded();
  }

  // ------------------------------------------------------------------
  // State queries
  // ------------------------------------------------------------------

  /**
   * @param {import('@playwright/test').Locator|import('@playwright/test').Locator[]} locator target
   * @returns {Promise<string>} the trimmed inner text
   */
  async getText(locator) {
    const resolved = await this.resolve(locator);
    return (await resolved.innerText()).trim();
  }

  /**
   * @param {import('@playwright/test').Locator|import('@playwright/test').Locator[]} locator target
   * @param {string} attribute attribute name
   * @returns {Promise<string|null>} the attribute value
   */
  async getAttribute(locator, attribute) {
    const resolved = await this.resolve(locator);
    return resolved.getAttribute(attribute);
  }

  /**
   * @param {import('@playwright/test').Locator|import('@playwright/test').Locator[]} locator target
   * @returns {Promise<string>} the trimmed input value
   */
  async getInputValue(locator) {
    const resolved = await this.resolve(locator);
    return (await resolved.inputValue()).trim();
  }

  /**
   * Reports whether an element is visible. Never throws.
   *
   * @param {import('@playwright/test').Locator|import('@playwright/test').Locator[]} locator target
   * @param {number} [timeout=5000] milliseconds to wait
   * @returns {Promise<boolean>} true when visible within the timeout
   */
  async isVisible(locator, timeout = 5000) {
    if (Array.isArray(locator)) {
      return this.wait.isAnyVisible(locator, timeout);
    }
    try {
      await locator.first().waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * @param {import('@playwright/test').Locator[]} candidates ordered candidates
   * @returns {Promise<number>} how many nodes the resolved collection matches
   */
  async getCount(candidates) {
    const collection = Array.isArray(candidates)
      ? await this.wait.resolveCollection(candidates)
      : candidates;
    return collection.count();
  }

  // ------------------------------------------------------------------
  // Waits and assertions
  // ------------------------------------------------------------------

  /**
   * Waits until an element is visible and returns it.
   *
   * @param {import('@playwright/test').Locator|import('@playwright/test').Locator[]} locator target
   * @param {number} [timeout] milliseconds to wait
   * @returns {Promise<import('@playwright/test').Locator>} the resolved locator
   */
  async waitForVisible(locator, timeout = config.timeout) {
    return this.resolve(locator, timeout);
  }

  /**
   * Asserts an element is visible, using a web-first assertion so the check
   * retries until the expect timeout elapses.
   *
   * @param {import('@playwright/test').Locator|import('@playwright/test').Locator[]} locator target
   * @param {string} [description='element'] name used in the failure message
   */
  async assertVisible(locator, description = 'element') {
    const resolved = await this.resolve(locator, config.expectTimeout);
    await expect(resolved, `${description} should be visible`).toBeVisible({
      timeout: config.expectTimeout,
    });
    this.log.validation(`${description} is displayed`);
  }

  // ------------------------------------------------------------------
  // Artifacts
  // ------------------------------------------------------------------

  /**
   * @param {boolean} [fullPage=true] whether to capture the whole scrollable page
   * @returns {Promise<Buffer>} the PNG bytes
   */
  async captureScreenshot(fullPage = true) {
    return this.page.screenshot({ fullPage, timeout: config.timeout });
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  /**
   * Resolves a target to a single visible locator, applying the fallback
   * strategy when a candidate array is supplied.
   *
   * @param {import('@playwright/test').Locator|import('@playwright/test').Locator[]} locator target
   * @param {number} [timeout] milliseconds to wait
   * @returns {Promise<import('@playwright/test').Locator>} the resolved locator
   * @protected
   */
  async resolve(locator, timeout = config.timeout) {
    if (Array.isArray(locator)) {
      return this.wait.forFirstVisible(locator, timeout);
    }
    const first = locator.first();
    await first.waitFor({ state: 'visible', timeout });
    return first;
  }
}

module.exports = { BasePage };
