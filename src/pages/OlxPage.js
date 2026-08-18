'use strict';

const { expect } = require('@playwright/test');
const { OlxLocators } = require('../locators/OlxLocators');
const { config } = require('../utilities/ConfigReader');
const { BasePage } = require('./BasePage');

/**
 * Page object for OLX Pakistan: home page, category listing pages and the sort
 * control they share.
 *
 * Methods express business actions. Where a verification needs to retry, it uses
 * a Playwright web-first assertion here; where it is a plain value comparison,
 * the observed value is returned so the step definition can assert on it.
 */
class OlxPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page page under test
   */
  constructor(page) {
    super(page, 'OlxPage');
    this.elements = new OlxLocators(page);
  }

  // ------------------------------------------------------------------
  // Navigation
  // ------------------------------------------------------------------

  /**
   * Opens the OLX Pakistan home page and clears any first-visit overlay.
   */
  async openHomePage() {
    await this.navigate('/');
    await this.dismissInterstitials();
  }

  /**
   * Clicks the Mobiles tile in the top categories strip and waits for the
   * category page to settle.
   */
  async clickMobilesCategory() {
    const tile = await this.waitForVisible(this.elements.mobilesCategory);
    await tile.scrollIntoViewIfNeeded();

    this.log.action('Click', 'Mobiles category tile');
    await tile.click({ timeout: config.timeout });

    // OLX category URLs carry a "_c<id>" suffix, e.g. /mobiles_c1411.
    // A predicate is used rather than a glob: globs must match the whole URL
    // including the scheme, so a partial pattern silently burns the timeout.
    try {
      await this.wait.forUrl((url) => /_c\d+/.test(url.toString()), config.navigationTimeout);
    } catch {
      this.log.debug('Category URL pattern not observed; verifying page content directly.');
    }

    await this.waitForPageLoad();
    await this.dismissInterstitials();
  }

  // ------------------------------------------------------------------
  // Verifications
  // ------------------------------------------------------------------

  /**
   * Verifies the Mobiles category page rendered.
   *
   * Two signals are required: the advert grid is populated, and the header
   * search control is present. Together they rule out an error page or an empty
   * shell that still returns HTTP 200.
   *
   * @returns {Promise<boolean>} true when the page loaded successfully
   */
  async verifyMobilesPageLoaded() {
    await this.waitForPageLoad();

    const cards = await this.wait.resolveCollection(this.elements.listingCards);
    await this.wait.forCountAtLeast(cards, 1);

    await expect(cards.first(), 'First listing card should be visible').toBeVisible({
      timeout: config.expectTimeout,
    });

    const searchVisible = await this.isVisible(this.elements.searchTextbox, config.expectTimeout);

    const count = await cards.count();
    this.log.validation(`Mobiles page loaded (${count} card(s), search=${searchVisible})`);

    return count > 0 && searchVisible;
  }

  /**
   * @param {string} expectedTitle expected substring
   * @returns {Promise<boolean>} true when the document title contains it
   */
  async verifyPageTitleContains(expectedTitle) {
    const actual = await this.getPageTitle();
    this.log.validation(`Page title is '${actual}'`);
    return actual.toLowerCase().includes(expectedTitle.toLowerCase());
  }

  /**
   * Verifies the country selector holds the expected country.
   *
   * OLX renders this control as a text input rather than a native select, so the
   * "selected" country is its value.
   *
   * @param {string} expectedCountry expected country, e.g. "Pakistan"
   * @returns {Promise<boolean>} true when the value matches
   */
  async verifyCountrySelected(expectedCountry) {
    const dropdown = await this.waitForVisible(this.elements.selectedCountry);

    await expect(dropdown, `Country dropdown should hold "${expectedCountry}"`).toHaveValue(
      expectedCountry,
      { timeout: config.expectTimeout },
    );

    this.log.validation(`Country dropdown has '${expectedCountry}' selected`);
    return true;
  }

  /**
   * @returns {Promise<string>} the country currently held by the selector
   */
  async getSelectedCountry() {
    return this.getInputValue(this.elements.selectedCountry);
  }

  /**
   * Verifies the search textbox placeholder matches exactly.
   *
   * @param {string} expectedPlaceholder expected placeholder text
   * @returns {Promise<boolean>} true when it matches
   */
  async verifySearchPlaceholder(expectedPlaceholder) {
    const searchBox = await this.waitForVisible(this.elements.searchTextbox);

    await expect(searchBox, 'Search textbox placeholder should match').toHaveAttribute(
      'placeholder',
      expectedPlaceholder,
      { timeout: config.expectTimeout },
    );

    this.log.validation(`Search placeholder is '${expectedPlaceholder}'`);
    return true;
  }

  /**
   * @returns {Promise<string|null>} the placeholder of the search textbox
   */
  async getSearchPlaceholder() {
    return this.getAttribute(this.elements.searchTextbox, 'placeholder');
  }

  // ------------------------------------------------------------------
  // Sorting
  // ------------------------------------------------------------------

  /**
   * Opens the Sort By dropdown and selects an option.
   *
   * @param {string} option visible option label, e.g. "Newly listed"
   */
  async selectSortByOption(option) {
    await this.selectCustomOption(
      this.elements.sortByDropdown,
      this.elements.sortOptionsList,
      this.elements.sortOption(option),
      option,
      'Sort By dropdown',
    );

    // OLX reflects the choice in the query string, e.g. ?sorting=desc-creation.
    try {
      await this.wait.forUrl(
        (url) => url.toString().includes('sorting='),
        config.navigationTimeout,
      );
    } catch {
      this.log.debug('Sorting query parameter not observed; verifying the control directly.');
    }
  }

  /**
   * @returns {Promise<string>} the label shown on the Sort By control
   */
  async getSelectedSortOption() {
    return this.getText(this.elements.sortByDropdown);
  }

  /**
   * Verifies the Sort By control reflects the chosen option.
   *
   * @param {string} expectedOption expected option label
   * @returns {Promise<boolean>} true when the control shows it
   */
  async verifySortOptionSelected(expectedOption) {
    const trigger = await this.waitForVisible(this.elements.sortByDropdown);

    await expect(trigger, `Sort control should show "${expectedOption}"`).toContainText(
      expectedOption,
      { timeout: config.expectTimeout },
    );

    this.log.validation(`Sort by is set to '${expectedOption}'`);
    return true;
  }

  // ------------------------------------------------------------------
  // Listings
  // ------------------------------------------------------------------

  /**
   * Waits for the advert grid to finish refreshing after a sort change.
   *
   * The spinner is transient and easy to miss between polls, so the definitive
   * signal is rendered advert cards rather than the disappearance of a loading
   * indicator.
   */
  async waitForListingsRefresh() {
    this.log.info('Waiting for the listings to refresh');

    await this.wait.forDomContentLoaded();

    const cards = await this.wait.resolveCollection(this.elements.listingCards);
    await this.wait.forCountAtLeast(cards, 1);
    await this.wait.forNetworkIdle();

    this.log.info(`Listings refreshed: ${await cards.count()} card(s) rendered`);
  }

  /**
   * @returns {Promise<boolean>} true when at least one advert card is displayed
   */
  async verifyListingsDisplayed() {
    const count = await this.getListingCount();
    this.log.validation(`${count} mobile listing(s) displayed`);
    return count > 0;
  }

  /**
   * @returns {Promise<number>} the number of advert cards currently rendered
   */
  async getListingCount() {
    try {
      const cards = await this.wait.resolveCollection(this.elements.listingCards);
      return cards.count();
    } catch (error) {
      this.log.debug(`No listings resolved: ${error.message}`);
      return 0;
    }
  }

  // ------------------------------------------------------------------
  // Shared helpers
  // ------------------------------------------------------------------

  /**
   * Closes cookie banners and promo overlays when they appear.
   *
   * Deliberately non-fatal: none of these overlays is guaranteed to render, so a
   * missing one must never fail a scenario.
   */
  async dismissInterstitials() {
    const candidates = [...this.elements.cookieAcceptButton, ...this.elements.modalCloseButton];

    for (const candidate of candidates) {
      try {
        const button = candidate.first();
        if (await button.isVisible({ timeout: 1000 })) {
          await button.click({ timeout: 5000 });
          this.log.debug('Dismissed an overlay');
          return;
        }
      } catch {
        // The overlay is optional; try the next candidate.
      }
    }
  }
}

module.exports = { OlxPage };
