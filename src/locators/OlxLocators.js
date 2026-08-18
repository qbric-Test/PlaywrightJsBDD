'use strict';

/**
 * Central locator repository for OLX Pakistan.
 *
 * Every element is exposed as an ordered array of candidate locators, most
 * semantic first, and the page object resolves whichever candidate the current
 * markup variant renders. This matters on OLX in particular: its CSS class
 * names are build hashes (`_520955ba`, `b5720141`) that change on every deploy,
 * so they are never used as primary selectors.
 *
 * Preference order: role and accessible name, then placeholder and label, then
 * stable attributes such as image `alt` text and `href` patterns, and only then
 * structural CSS. No XPath is used.
 */
class OlxLocators {
  /**
   * @param {import('@playwright/test').Page} page page these locators bind to
   */
  constructor(page) {
    this.page = page;
  }

  // ------------------------------------------------------------------
  // Home page: top categories
  // ------------------------------------------------------------------

  /**
   * A tile in the top categories strip.
   *
   * OLX renders each category name twice: once as a plain text link in a
   * collapsed list and once as the icon tile in the top categories section. Only
   * the tile is visible, so the variant carrying the category image is first.
   *
   * @param {string} categoryName visible label, e.g. "Mobiles"
   * @returns {import('@playwright/test').Locator[]} ordered candidates
   */
  topCategory(categoryName) {
    const exact = new RegExp(`^\\s*${OlxLocators.#escape(categoryName)}\\s*$`, 'i');

    return [
      this.page.locator('a').filter({ has: this.page.locator(`img[alt="${categoryName}"]`) }),
      this.page.getByRole('link', { name: categoryName, exact: true }),
      this.page.getByRole('link', { name: exact }),
      this.page.locator('a').filter({ hasText: exact }),
    ];
  }

  /**
   * @returns {import('@playwright/test').Locator[]} the Mobiles category tile
   */
  get mobilesCategory() {
    return this.topCategory('Mobiles');
  }

  // ------------------------------------------------------------------
  // Header
  // ------------------------------------------------------------------

  /**
   * The country / location selector.
   *
   * OLX renders this as a text input whose *value* is the selected location,
   * not as a native `<select>`, so the selection is verified with a value
   * assertion rather than a selected-option lookup.
   *
   * @returns {import('@playwright/test').Locator[]} ordered candidates
   */
  get countryDropdown() {
    return [
      this.page.getByPlaceholder('Location', { exact: true }),
      this.page.locator('input[placeholder="Location"]'),
      this.page.locator('header input[placeholder*="Location" i]'),
    ];
  }

  /**
   * The country currently held by the location selector. Same control as
   * {@link countryDropdown}; named separately so step definitions read well.
   *
   * @returns {import('@playwright/test').Locator[]} ordered candidates
   */
  get selectedCountry() {
    return this.countryDropdown;
  }

  /**
   * @returns {import('@playwright/test').Locator[]} the main search textbox
   */
  get searchTextbox() {
    return [
      this.page.getByPlaceholder('Find Cars, Mobile Phones and more...'),
      this.page.locator('input[placeholder^="Find Cars"]'),
      this.page.getByRole('textbox', { name: /find cars/i }),
    ];
  }

  // ------------------------------------------------------------------
  // Sorting
  // ------------------------------------------------------------------

  /**
   * The "Sort by" dropdown trigger.
   *
   * Rendered as a button holding two spans ("Sort by: " and the current value)
   * plus a chevron image whose `alt` text is stable across deploys, which makes
   * it the most reliable anchor available.
   *
   * @returns {import('@playwright/test').Locator[]} ordered candidates
   */
  get sortByDropdown() {
    return [
      this.page.locator('button:has(img[alt="Sort options dropdown"])'),
      this.page.locator('button').filter({ hasText: /sort by/i }),
      this.page.getByRole('button', { name: /sort by/i }),
    ];
  }

  /**
   * @returns {import('@playwright/test').Locator[]} the option list the dropdown reveals
   */
  get sortOptionsList() {
    return [this.page.getByRole('listbox'), this.page.locator('ul[role="listbox"]')];
  }

  /**
   * A single option inside the open sort dropdown.
   *
   * @param {string} optionName visible label, e.g. "Newly listed"
   * @returns {import('@playwright/test').Locator[]} ordered candidates
   */
  sortOption(optionName) {
    const exact = new RegExp(`^\\s*${OlxLocators.#escape(optionName)}\\s*$`, 'i');

    return [
      this.page.getByRole('option', { name: optionName, exact: true }),
      this.page.locator('li[role="option"]').filter({ hasText: exact }),
      this.page.getByRole('listbox').getByText(exact),
    ];
  }

  /**
   * @returns {import('@playwright/test').Locator[]} the "Newly listed" option
   */
  get newlyListedOption() {
    return this.sortOption('Newly listed');
  }

  /**
   * @returns {import('@playwright/test').Locator[]} the option marked aria-selected="true"
   */
  get selectedSortOption() {
    return [
      this.page.locator('li[role="option"][aria-selected="true"]'),
      this.page.getByRole('option', { selected: true }),
    ];
  }

  // ------------------------------------------------------------------
  // Listings
  // ------------------------------------------------------------------

  /**
   * The container holding the advert grid.
   *
   * @returns {import('@playwright/test').Locator[]} ordered candidates
   */
  get listingsContainer() {
    return [
      this.page.locator('ul:has(li[aria-label="Listing"])'),
      this.page.getByRole('main'),
      this.page.locator('main'),
    ];
  }

  /**
   * Individual advert cards.
   *
   * The `li[aria-label="Listing"]` variant is first because the item anchors
   * attach before the card renders and have zero size until their image loads.
   *
   * @returns {import('@playwright/test').Locator[]} ordered candidates
   */
  get listingCards() {
    return [
      this.page.locator('li[aria-label="Listing"]'),
      this.page.locator('article'),
      this.page.locator('a[href*="-iid-"]'),
    ];
  }

  /**
   * Links to individual adverts. OLX item URLs always carry an `-iid-<id>`
   * suffix, which makes this a reliable structural anchor.
   *
   * @returns {import('@playwright/test').Locator[]} ordered candidates
   */
  get listingLinks() {
    return [this.page.locator('a[href*="-iid-"]'), this.page.locator('a[href*="/item/"]')];
  }

  /**
   * @returns {import('@playwright/test').Locator[]} the main page heading
   */
  get pageHeading() {
    return [this.page.getByRole('heading').first(), this.page.locator('h1').first()];
  }

  /**
   * @returns {import('@playwright/test').Locator[]} the loading spinner
   */
  get loadingSpinner() {
    return [
      this.page.locator('[class*="loader" i]'),
      this.page.locator('[class*="spinner" i]'),
      this.page.getByRole('progressbar'),
    ];
  }

  // ------------------------------------------------------------------
  // Interstitials
  // ------------------------------------------------------------------

  /**
   * @returns {import('@playwright/test').Locator[]} cookie and consent banners
   */
  get cookieAcceptButton() {
    return [
      this.page.getByRole('button', { name: /accept all|accept cookies|i agree|got it/i }),
      this.page.locator('#onetrust-accept-btn-handler'),
    ];
  }

  /**
   * @returns {import('@playwright/test').Locator[]} close controls for overlays
   */
  get modalCloseButton() {
    return [
      this.page.getByRole('button', { name: /^close$/i }),
      this.page.locator('button[aria-label="Close"]'),
    ];
  }

  static #escape(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

module.exports = { OlxLocators };
