'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const VALID_BROWSERS = ['chromium', 'firefox', 'webkit'];
const VALID_ARTIFACT_MODES = ['on', 'off', 'retain-on-failure'];
const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

/**
 * Reads and validates framework configuration.
 *
 * Values come from `.env`, optionally layered with an environment specific
 * `.env.<ENV>` file. Real environment variables always win, so CI can override
 * anything without editing files:
 *
 *   BROWSER=firefox HEADLESS=true npm test
 *
 * Implemented as a lazily built singleton, so each Cucumber worker process
 * parses the environment exactly once.
 */
class ConfigReader {
  constructor() {
    ConfigReader.#loadEnvFiles();
    this.values = this.#build();
  }

  /**
   * Returns the shared instance.
   *
   * @returns {ConfigReader} the singleton
   */
  static getInstance() {
    if (!ConfigReader.instance) {
      ConfigReader.instance = new ConfigReader();
    }
    return ConfigReader.instance;
  }

  static #loadEnvFiles() {
    const rootDir = path.resolve(__dirname, '..', '..');
    const baseEnvFile = path.join(rootDir, '.env');

    if (fs.existsSync(baseEnvFile)) {
      dotenv.config({ path: baseEnvFile });
    } else {
      dotenv.config();
    }

    const envName = process.env.ENV;
    if (envName) {
      const scopedEnvFile = path.join(rootDir, `.env.${envName}`);
      if (fs.existsSync(scopedEnvFile)) {
        dotenv.config({ path: scopedEnvFile, override: true });
      }
    }
  }

  #build() {
    return {
      env: this.#string('ENV', 'qa'),
      baseUrl: this.#stripTrailingSlash(this.#string('BASE_URL', 'https://www.olx.com.pk')),
      browser: this.#enum('BROWSER', VALID_BROWSERS, 'chromium'),
      headless: this.#boolean('HEADLESS', true),
      slowMo: this.#number('SLOWMO', 0),
      channel: this.#optionalString('CHANNEL'),
      viewport: {
        width: this.#number('VIEWPORT_WIDTH', 1920),
        height: this.#number('VIEWPORT_HEIGHT', 1080),
      },
      locale: this.#string('LOCALE', 'en-PK'),
      timezoneId: this.#string('TIMEZONE', 'Asia/Karachi'),
      ignoreHttpsErrors: this.#boolean('IGNORE_HTTPS_ERRORS', true),
      timeout: this.#number('TIMEOUT', 30000),
      navigationTimeout: this.#number('NAVIGATION_TIMEOUT', 60000),
      expectTimeout: this.#number('EXPECT_TIMEOUT', 15000),
      stepTimeout: this.#number('STEP_TIMEOUT', 90000),
      parallelWorkers: this.#number('PARALLEL_WORKERS', 1),
      retryCount: this.#number('RETRY_COUNT', 0),
      screenshot: this.#enum('SCREENSHOT', VALID_ARTIFACT_MODES, 'retain-on-failure'),
      video: this.#enum('VIDEO', VALID_ARTIFACT_MODES, 'retain-on-failure'),
      trace: this.#enum('TRACE', VALID_ARTIFACT_MODES, 'retain-on-failure'),
      artifactsDir: this.#string('ARTIFACTS_DIR', 'test-results'),
      reportsDir: this.#string('REPORTS_DIR', 'reports'),
      logLevel: this.#enum('LOG_LEVEL', VALID_LOG_LEVELS, 'info'),
    };
  }

  /**
   * @returns {object} the fully resolved configuration
   */
  all() {
    return this.values;
  }

  /**
   * @param {string} key configuration key
   * @returns {*} the resolved value
   */
  get(key) {
    return this.values[key];
  }

  /**
   * Builds an absolute URL from the base URL and a relative path.
   *
   * @param {string} [relativePath='/'] path or absolute URL
   * @returns {string} an absolute URL
   */
  url(relativePath = '/') {
    if (/^https?:\/\//i.test(relativePath)) {
      return relativePath;
    }
    const suffix = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
    return `${this.values.baseUrl}${suffix}`;
  }

  /**
   * Resolves a path inside the artifacts directory, creating it when missing.
   *
   * @param {...string} segments path segments
   * @returns {string} an absolute path
   */
  artifactPath(...segments) {
    const target = path.resolve(process.cwd(), this.values.artifactsDir, ...segments);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    return target;
  }

  /**
   * Resolves a path inside the reports directory, creating it when missing.
   *
   * @param {...string} segments path segments
   * @returns {string} an absolute path
   */
  reportPath(...segments) {
    const target = path.resolve(process.cwd(), this.values.reportsDir, ...segments);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    return target;
  }

  // ------------------------------------------------------------------
  // Typed readers
  // ------------------------------------------------------------------

  #optionalString(key) {
    const raw = process.env[key];
    if (raw === undefined) {
      return undefined;
    }
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  #string(key, fallback) {
    return this.#optionalString(key) ?? fallback;
  }

  #number(key, fallback) {
    const raw = this.#optionalString(key);
    if (raw === undefined) {
      return fallback;
    }
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      throw new Error(`Invalid numeric value for environment variable "${key}": "${raw}"`);
    }
    return parsed;
  }

  #boolean(key, fallback) {
    const raw = this.#optionalString(key);
    if (raw === undefined) {
      return fallback;
    }
    const normalised = raw.toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalised)) {
      return true;
    }
    if (['false', '0', 'no', 'n'].includes(normalised)) {
      return false;
    }
    throw new Error(`Invalid boolean value for environment variable "${key}": "${raw}"`);
  }

  #enum(key, allowed, fallback) {
    const raw = this.#optionalString(key);
    if (raw === undefined) {
      return fallback;
    }
    const normalised = raw.toLowerCase();
    if (!allowed.includes(normalised)) {
      throw new Error(
        `Invalid value for environment variable "${key}": "${raw}". Allowed: ${allowed.join(', ')}`,
      );
    }
    return normalised;
  }

  #stripTrailingSlash(value) {
    return value.endsWith('/') ? value.slice(0, -1) : value;
  }
}

const configReader = ConfigReader.getInstance();
const config = configReader.all();

module.exports = { ConfigReader, configReader, config };
