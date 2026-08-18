# PlaywrightJsBdd

Playwright + JavaScript + Cucumber BDD automation framework, built on the Page
Object Model with a browser per scenario.

## Stack

| Concern            | Tool                            |
| ------------------ | ------------------------------- |
| Browser automation | Playwright                      |
| Language           | JavaScript (ES6+, CommonJS)     |
| Runtime            | Node.js 18+                     |
| BDD runner         | Cucumber (`@cucumber/cucumber`) |
| Assertions         | Playwright `expect` + chai      |
| Config             | dotenv                          |
| Reporting          | multiple-cucumber-html-reporter |

## Setup

```bash
npm install
```

```bash
npm run install:browsers
```

## Run

```bash
npm test
```

| Command               | What it does                                   |
| --------------------- | ---------------------------------------------- |
| `npm test`            | Full suite, then builds the HTML report        |
| `npm run smoke`       | `@smoke` tagged scenarios only                 |
| `npm run headed`      | Visible browser                                |
| `npm run chrome`      | Chromium                                       |
| `npm run firefox`     | Firefox                                        |
| `npm run webkit`      | WebKit                                         |
| `npm run parallel`    | Four parallel workers                          |
| `npm run serial`      | Single process, useful when debugging          |
| `npm run report`      | Rebuild the HTML report from the existing JSON |
| `npm run report:open` | Open the report in a browser                   |
| `npm run lint`        | ESLint                                         |

Every value in `.env` can be overridden by a real environment variable, so CI can
run `BROWSER=firefox HEADLESS=true npm test` without editing files.

## Layout

```
PlaywrightJsBdd
├── package.json
├── playwright.config.js      # launch/context options shared with the hooks
├── cucumber.js               # runner profiles: default, smoke, regression, ci
├── .env                      # environment configuration
├── features
│   └── olx.feature
├── src
│   ├── pages                 # BasePage, OlxPage
│   ├── locators              # OlxLocators (candidate-list fallback)
│   ├── hooks                 # Hooks.js — setup, artifacts, teardown
│   ├── step-definitions      # olx.steps.js
│   ├── support               # World.js — custom Cucumber World
│   └── utilities             # ConfigReader, Logger, WaitUtils, ReportGenerator
├── reports                   # HTML / JSON / JUnit
└── test-results              # screenshots, videos, traces, logs
```

## Reports and failure artifacts

- Rich HTML report: `reports/html/index.html` (multiple-cucumber-html-reporter)
- Built-in Cucumber HTML: `reports/cucumber-report.html`
- JSON / JUnit: `reports/cucumber-report.json`, `reports/junit-report.xml`
- Screenshots: `test-results/screenshots/` (also attached to the report)
- Videos: `test-results/videos/`
- Traces: `test-results/traces/` — open with
  `npx playwright show-trace test-results/traces/<file>.zip`
- Execution log: `test-results/logs/execution.log`

Screenshots, videos and traces each honour an independent policy — `on`, `off`
or `retain-on-failure` — set in `.env`. Under the default `retain-on-failure`,
passing scenarios leave nothing behind and only failures keep evidence.

## Design notes

**Locator fallback.** Every element in `OlxLocators` is an ordered array of
candidates, most semantic first (`getByRole`, `getByPlaceholder`, `getByLabel`,
image `alt` text), falling back to structural CSS. `WaitUtils.forFirstVisible()`
picks whichever candidate the current markup variant renders. This matters on
OLX because its CSS class names are build hashes (`_520955ba`, `b5720141`) that
change on every deploy and are therefore never used as selectors. No XPath.

**Collection resolution.** `WaitUtils.resolveCollection()` prefers a candidate
with a genuinely _visible_ node over one that merely matches nodes. OLX wraps
each advert in a zero-size `<a>` that attaches before the card renders, so a
plain count check locks onto the wrapper and then fails the visibility assertion
that follows.

**No hard waits.** Playwright's auto-waiting does the work; the helpers in
`WaitUtils` exist only for what it does not cover — candidate selection,
collection population, and arbitrary polling. The one `pause()` helper is
documented as a last resort and is unused by the OLX flow.

**URL waits use predicates, not globs.** Playwright URL globs must match the
whole URL including the scheme, so a partial pattern such as `**sorting=**`
silently never matches and burns the full navigation timeout before failing.

**Assertions.** Web-first assertions that need to retry (visibility, attribute,
value) live in the page object via Playwright's `expect`. Plain value
comparisons live in the step definitions via chai, so a failure names the
business expectation.

## Two things the site dictates

1. **The country control is not a `<select>`.** OLX renders it as a text input
   whose _value_ is the selected location, so "Pakistan is selected" is asserted
   with `toHaveValue`. On the home page that value is empty; it only reads
   `Pakistan` on a category page.
2. **The Sort By control is not a `<select>` either.** It is a `<button>` plus a
   `role="listbox"`, which is why `BasePage` carries `selectCustomOption()`
   alongside the native `selectOption()`.

## Notes on parallelism

`PARALLEL_WORKERS` defaults to `1`. The framework is parallel-safe — the custom
World gives each scenario its own browser, context and page, with no shared
state — but OLX is a live production site, and concurrent browsers from one IP
invite rate limiting. Raise it for suites that target your own environments.

## Adding a page

1. Add locators to `src/locators/<Name>Locators.js` as candidate arrays.
2. Create `src/pages/<Name>Page.js` extending `BasePage`.
3. Expose it from `World.setPage()`.
4. Write the feature, then step definitions that delegate to the page object.
