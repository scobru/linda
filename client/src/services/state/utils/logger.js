/**
 * Centralized logger for the application
 * @module Logger
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

class Logger {
  constructor(options = {}) {
    this.level = options.level || LOG_LEVELS.INFO;
    this.prefix = options.prefix || 'Gunblade';
  }

  _log(level, message, ...args) {
    if (level >= this.level) {
      const timestamp = new Date().toISOString();
      const prefix = `[${this.prefix}] [${timestamp}]`;

      switch (level) {
        case LOG_LEVELS.DEBUG:
          console.debug(prefix, message, ...args);
          break;
        case LOG_LEVELS.INFO:
          console.log(prefix, message, ...args);
          break;
        case LOG_LEVELS.WARN:
          console.warn(prefix, message, ...args);
          break;
        case LOG_LEVELS.ERROR:
          console.error(prefix, message, ...args);
          break;
      }
    }
  }

  debug(message, ...args) {
    this._log(LOG_LEVELS.DEBUG, message, ...args);
  }

  info(message, ...args) {
    this._log(LOG_LEVELS.INFO, message, ...args);
  }

  warn(message, ...args) {
    this._log(LOG_LEVELS.WARN, message, ...args);
  }

  error(message, ...args) {
    this._log(LOG_LEVELS.ERROR, message, ...args);
  }
}

export const logger = new Logger();
