'use strict';

const { config } = require('./ConfigReader');
const { Logger } = require('./Logger');

const POLL_INTERVAL_MS = 250;

/**
 * Explicit waiting helpers layered on top of Playwright's auto-waiting.
 *
 * Playwright already waits for actionability before every action, so these
 * helpers cover only what the built-in waits do not: choosing between several
 * candidate locators, waiting for a collection to populate, and polling an
 * arbitrary condition.
 */
class WaitUtils {
  /**
   * @param {import('@playwright/test').Page} page page these helpers act on
   */
  constructor(page) {
    this.page = page;
    this.log = Logger.for('WaitUtils');
  }

  /**
   * Waits until a locator is visible.
   *
   * @param {import('@playwright/test').Locator} locator target
   * @param {number} [timeout] milliseconds to wait
   * @returns {Promise<import('@playwright/test').Locator>} the resolved locator
   */
  async forVisible(locator, timeout = config.timeout) {
    await locator.first().waitFor({ state: 'visible', timeout });
    return locator.first();
  }

  /**
   * Waits until a locator is hidden or detached.
   *
   * @param {import('@playwright/test').Locator} locator target
   * @param {number} [timeout] milliseconds to wait
   */
  async forHidden(locator, timeout = config.timeout) {
    await locator.first().waitFor({ state: 'hidden', timeout });
  }

  /**
   * Returns the first candidate locator that becomes visible.
   *
   * This is the backbone of the locator fallback strategy: production sites ship
   * several markup variants, so a page object passes an ordered candidate list
   * and this picks whichever the current variant renders.
   *
   * @param {import('@playwright/test').Locator[]} candidates ordered candidates
   * @param {number} [timeout] milliseconds to wait
   * @returns {Promise<import('@playwright/test').Locator>} the first visible candidate
   */
  async forFirstVisible(candidates, timeout = config.timeout) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw new Error('forFirstVisible() requires at least one candidate locator');
    }

    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      for (const candidate of candidates) {
        try {
          const first = candidate.first();
          if (await first.isVisible()) {
            return first;
          }
        } catch {
          // A candidate may not apply to the current variant; try the next one.
        }
      }
      await this.page.waitForTimeout(POLL_INTERVAL_MS);
    }

    // Logged at debug because isAnyVisible() uses this to probe for optional
    // elements, where "not visible" is an expected outcome. The thrown Error
    // still carries the full message for genuine failures.
    this.log.debug(`None of the ${candidates.length} candidate locators became visible`);
    throw new Error(
      `None of the ${candidates.length} candidate locators became visible within ${timeout}ms`,
    );
  }

  /**
   * Reports whether any candidate becomes visible, without throwing.
   *
   * @param {import('@playwright/test').Locator[]} candidates ordered candidates
   * @param {number} [timeout=5000] milliseconds to wait
   * @returns {Promise<boolean>} true when one is visible
   */
  async isAnyVisible(candidates, timeout = 5000) {
    try {
      await this.forFirstVisible(candidates, timeout);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolves a candidate list to the locator representing a collection.
   *
   * A candidate rendering at least one *visible* node wins over one that merely
   * matches nodes. Card grids commonly attach a zero-size wrapper element before
   * the card renders, so a plain count check can lock onto the wrapper and then
   * fail the visibility assertion that follows. Only when nothing becomes
   * visible does this fall back to the first candidate matching anything.
   *
   * @param {import('@playwright/test').Locator[]} candidates ordered candidates
   * @param {number} [timeout] milliseconds to wait
   * @returns {Promise<import('@playwright/test').Locator>} the collection locator
   */
  async resolveCollection(candidates, timeout = config.timeout) {
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      for (const candidate of candidates) {
        try {
          if (await candidate.first().isVisible()) {
            return candidate;
          }
        } catch {
          // Try the next candidate.
        }
      }
      await this.page.waitForTimeout(POLL_INTERVAL_MS);
    }

    this.log.debug('No candidate produced a visible node; falling back to a match-count check.');
    for (const candidate of candidates) {
      if ((await candidate.count()) > 0) {
        return candidate;
      }
    }

    throw new Error(
      `None of the ${candidates.length} candidate locators matched any node within ${timeout}ms`,
    );
  }

  /**
   * Waits until a locator matches at least the expected number of nodes.
   *
   * @param {import('@playwright/test').Locator} locator target collection
   * @param {number} expected minimum count
   * @param {number} [timeout] milliseconds to wait
   * @returns {Promise<number>} the observed count
   */
  async forCountAtLeast(locator, expected, timeout = config.timeout) {
    return this.until(
      async () => {
        const count = await locator.count();
        return count >= expected ? count : undefined;
      },
      { timeout, message: `Expected at least ${expected} element(s)` },
    );
  }

  /**
   * Waits for the DOM to be parsed.
   *
   * @param {number} [timeout] milliseconds to wait
   */
  async forDomContentLoaded(timeout = config.navigationTimeout) {
    await this.page.waitForLoadState('domcontentloaded', { timeout });
  }

  /**
   * Best-effort wait for network quiescence. Never fails the test, because
   * third-party trackers can keep a page from ever reaching network idle.
   *
   * @param {number} [timeout=8000] milliseconds to wait
   */
  async forNetworkIdle(timeout = 8000) {
    try {
      await this.page.waitForLoadState('networkidle', { timeout });
    } catch {
      this.log.debug(`Network idle not reached within ${timeout}ms; continuing.`);
    }
  }

  /**
   * Waits for the URL to satisfy a pattern or predicate.
   *
   * @param {string|RegExp|Function} pattern glob, regular expression or predicate
   * @param {number} [timeout] milliseconds to wait
   */
  async forUrl(pattern, timeout = config.navigationTimeout) {
    await this.page.waitForURL(pattern, { timeout });
  }

  /**
   * Polls a predicate until it returns a defined, non-false value.
   *
   * @param {Function} predicate async function returning undefined while unsatisfied
   * @param {object} [options] poll options
   * @param {number} [options.timeout] milliseconds to wait
   * @param {number} [options.interval] poll interval
   * @param {string} [options.message] failure message
   * @returns {Promise<*>} the first satisfying value
   */
  async until(predicate, options = {}) {
    const timeout = options.timeout ?? config.timeout;
    const interval = options.interval ?? POLL_INTERVAL_MS;
    const deadline = Date.now() + timeout;
    let lastError;

    while (Date.now() < deadline) {
      try {
        const result = await predicate();
        if (result !== undefined && result !== false) {
          return result;
        }
      } catch (error) {
        lastError = error;
      }
      await this.page.waitForTimeout(interval);
    }

    const message = options.message ?? 'Condition was not met';
    if (lastError) {
      this.log.debug(`${message} (last error: ${lastError.message})`);
    }
    throw new Error(`${message} within ${timeout}ms`);
  }

  /**
   * Fixed pause. Use sparingly, and only where no event-based wait exists.
   *
   * @param {number} milliseconds how long to pause
   */
  async pause(milliseconds) {
    await this.page.waitForTimeout(milliseconds);
  }
}

module.exports = { WaitUtils };
