'use strict';

const fs = require('fs');
const path = require('path');
const { config } = require('./ConfigReader');

const LEVEL_WEIGHT = { debug: 10, info: 20, warn: 30, error: 40 };
const LEVEL_COLOUR = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};
const RESET = '\x1b[0m';

/**
 * Dependency-free logger.
 *
 * Every message goes to the console, respecting LOG_LEVEL, and is appended to a
 * shared execution log under the artifacts directory, so parallel Cucumber
 * workers all contribute to one file.
 *
 * The named helpers (browserLaunched, navigation, action, validation, cleanup)
 * give the log a consistent vocabulary, which makes a failed run readable
 * without opening the test code.
 */
class Logger {
  /**
   * @param {string} scope name shown on every line, usually a class name
   */
  constructor(scope) {
    this.scope = scope;
  }

  /**
   * @param {string} scope logger scope
   * @returns {Logger} a new logger
   */
  static for(scope) {
    return new Logger(scope);
  }

  // ------------------------------------------------------------------
  // Domain events
  // ------------------------------------------------------------------

  /**
   * @param {string} browser engine name
   * @param {boolean} headless whether the run is headless
   */
  browserLaunched(browser, headless) {
    this.#write('info', `BROWSER   | Launched ${browser} (headless=${headless})`);
  }

  /**
   * @param {string} url destination
   */
  navigation(url) {
    this.#write('info', `NAVIGATE  | ${url}`);
  }

  /**
   * @param {string} action what was done, e.g. "Click"
   * @param {string} description the element it was done to
   */
  action(action, description) {
    this.#write('info', `ACTION    | ${action} -> ${description}`);
  }

  /**
   * @param {string} message what was verified
   */
  validation(message) {
    this.#write('info', `VERIFY    | ${message}`);
  }

  /**
   * @param {string} name scenario name
   */
  scenarioStart(name) {
    this.#write('info', `SCENARIO  | START  | ${name}`);
  }

  /**
   * @param {string} name scenario name
   * @param {string} status final status
   */
  scenarioEnd(name, status) {
    this.#write('info', `SCENARIO  | END    | ${name} | status=${status}`);
  }

  /**
   * @param {string} message what was cleaned up
   */
  cleanup(message) {
    this.#write('info', `CLEANUP   | ${message}`);
  }

  /**
   * @param {string} type artifact kind, e.g. "Screenshot"
   * @param {string} filePath where it was written
   */
  artifact(type, filePath) {
    this.#write('info', `ARTIFACT  | ${type} -> ${filePath}`);
  }

  // ------------------------------------------------------------------
  // Generic levels
  // ------------------------------------------------------------------

  debug(message, ...details) {
    this.#write('debug', message, details);
  }

  info(message, ...details) {
    this.#write('info', message, details);
  }

  warn(message, ...details) {
    this.#write('warn', message, details);
  }

  error(message, ...details) {
    this.#write('error', `FAILURE   | ${message}`, details);
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  #write(level, message, details = []) {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[config.logLevel]) {
      return;
    }

    const timestamp = new Date().toISOString();
    const label = level.toUpperCase().padEnd(5, ' ');
    const extras = details.length > 0 ? ` ${details.map(Logger.#stringify).join(' ')}` : '';

    const plain = `[${timestamp}] [${label}] [${this.scope}] ${message}${extras}`;
    const coloured =
      `${LEVEL_COLOUR[level]}[${timestamp}] [${label}]${RESET} ` +
      `[${this.scope}] ${message}${extras}`;

    if (level === 'error') {
      console.error(coloured);
    } else if (level === 'warn') {
      console.warn(coloured);
    } else {
      process.stdout.write(`${coloured}\n`);
    }

    Logger.#appendToFile(plain);
  }

  static #stringify(value) {
    if (value instanceof Error) {
      return value.stack ?? value.message;
    }
    if (typeof value === 'object' && value !== null) {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  static #appendToFile(line) {
    try {
      if (!Logger.logFile) {
        const logDir = path.resolve(process.cwd(), config.artifactsDir, 'logs');
        fs.mkdirSync(logDir, { recursive: true });
        Logger.logFile = path.join(logDir, 'execution.log');
      }
      fs.appendFileSync(Logger.logFile, `${line}\n`, { encoding: 'utf-8' });
    } catch {
      // Logging must never break a test run, so file errors are swallowed.
    }
  }
}

const logger = Logger.for('Framework');

module.exports = { Logger, logger };
