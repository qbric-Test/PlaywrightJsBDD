'use strict';

const { Given, Then, When } = require('@cucumber/cucumber');
const { expect } = require('chai');

/**
 * Step definitions for features/olx.feature.
 *
 * Steps stay thin: they translate Gherkin into page-object calls and assert on
 * what those calls report. All waiting, locator fallback and interaction logic
 * lives in OlxPage, so a failure here names a business expectation rather than a
 * selector.
 *
 * Web-first assertions (retrying until the expect timeout) happen inside the
 * page object via Playwright's `expect`; chai is used here for plain value
 * comparisons on what the page object returns.
 */

// ----------------------------------------------------------------------
// Given
// ----------------------------------------------------------------------

Given('I open OLX Pakistan website', async function () {
  await this.getOlxPage().openHomePage();

  const currentUrl = await this.getOlxPage().getCurrentUrl();
  expect(currentUrl, 'Browser should be on the OLX Pakistan domain').to.contain('olx.com.pk');
});

// ----------------------------------------------------------------------
// When
// ----------------------------------------------------------------------

When('I click on {string} from the top categories section', async function (categoryName) {
  expect(categoryName, 'Only the Mobiles category tile is implemented by this step').to.equal(
    'Mobiles',
  );

  await this.getOlxPage().clickMobilesCategory();
  this.set('category', categoryName);
});

When('I select {string} from the Sort By dropdown', async function (sortOption) {
  await this.getOlxPage().selectSortByOption(sortOption);
  this.set('sortOption', sortOption);
});

// ----------------------------------------------------------------------
// Then
// ----------------------------------------------------------------------

Then('the Mobiles page should load successfully', async function () {
  const loaded = await this.getOlxPage().verifyMobilesPageLoaded();

  expect(
    loaded,
    'The Mobiles category page did not load: expected the advert grid and the header ' +
      `search control to be present. Current URL: ${await this.getOlxPage().getCurrentUrl()}`,
  ).to.equal(true);
});

Then('page title should contain {string}', async function (expectedFragment) {
  const matches = await this.getOlxPage().verifyPageTitleContains(expectedFragment);

  expect(
    matches,
    `Expected the page title to contain "${expectedFragment}" but it was ` +
      `"${await this.getOlxPage().getPageTitle()}"`,
  ).to.equal(true);
});

Then('Country dropdown should have {string} selected', async function (expectedCountry) {
  await this.getOlxPage().verifyCountrySelected(expectedCountry);

  const actual = await this.getOlxPage().getSelectedCountry();
  expect(actual, 'The country selector did not hold the expected country').to.equal(
    expectedCountry,
  );
});

Then('Search textbox placeholder should be {string}', async function (expectedPlaceholder) {
  await this.getOlxPage().verifySearchPlaceholder(expectedPlaceholder);

  const actual = await this.getOlxPage().getSearchPlaceholder();
  expect(actual, 'The search textbox placeholder did not match').to.equal(expectedPlaceholder);
});

Then('listings should be refreshed', async function () {
  await this.getOlxPage().waitForListingsRefresh();

  const selectedSort = this.get('sortOption');
  if (selectedSort) {
    await this.getOlxPage().verifySortOptionSelected(selectedSort);
  }
});

Then('mobile listings should be displayed successfully', async function () {
  const displayed = await this.getOlxPage().verifyListingsDisplayed();

  expect(displayed, 'Expected at least one mobile listing to be displayed').to.equal(true);

  const count = await this.getOlxPage().getListingCount();
  await this.attachText(`${count} mobile listing(s) displayed`);
});
