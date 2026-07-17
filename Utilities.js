/*******************************************************
 * PAY TRACKER V2.1
 * Utilities.gs
 *
 * Shared low-level utility functions.
 *
 * This file contains:
 * - Spreadsheet access helpers
 * - Safe document locking
 * - Date helpers
 * - Week calculations
 * - Column and cell reference helpers
 * - Number and currency helpers
 * - Colour helpers
 * - Validation helpers
 * - User notification helpers
 *
 * Business-specific pay logic should not be placed here.
 *******************************************************/

const PayTrackerUtils = Object.freeze({
  /**
   * Returns the configured PaySheet.
   *
   * @return {GoogleAppsScript.Spreadsheet.Sheet}
   */
  getPaySheet: function () {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    if (!spreadsheet) {
      throw new Error(
        'No active spreadsheet is available.'
      );
    }

    const sheet = spreadsheet.getSheetByName(
      PayTrackerConfig.SHEET.NAME
    );

    if (!sheet) {
      throw new Error(
        'Sheet not found: ' +
        PayTrackerConfig.SHEET.NAME
      );
    }

    return sheet;
  },


  /**
   * Confirms that a value is a valid Google Sheet object.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  validateSheet: function (sheet) {
    if (
      !sheet ||
      typeof sheet.getRange !== 'function' ||
      typeof sheet.getName !== 'function'
    ) {
      throw new Error(
        'A valid Google Sheet is required.'
      );
    }
  },


  /**
   * Executes a callback while holding the spreadsheet
   * document lock.
   *
   * This prevents calendar sync, setup, backups, and other
   * write operations from running over one another.
   *
   * @param {Function} callback
   * @return {*}
   */
  withDocumentLock: function (callback) {
    if (typeof callback !== 'function') {
      throw new Error(
        'A callback function is required.'
      );
    }

    const lock =
      LockService.getDocumentLock();

    let lockAcquired = false;

    try {
      lock.waitLock(
        PayTrackerConfig.LOCK
          .WAIT_TIMEOUT_MILLISECONDS
      );

      lockAcquired = true;

      return callback();
    } catch (error) {
      PayTrackerUtils.logError(
        'Document lock operation failed',
        error
      );

      throw error;
    } finally {
      if (lockAcquired) {
        try {
          lock.releaseLock();
        } catch (releaseError) {
          console.warn(
            'Unable to release document lock: ' +
            releaseError.message
          );
        }
      }
    }
  },


  /**
   * Returns a copy of a date set to midday.
   *
   * Midday is used rather than midnight to reduce daylight
   * saving and timezone rollover problems.
   *
   * @param {Date} date
   * @return {Date}
   */
  stripTime: function (date) {
    PayTrackerUtils.validateDate(
      date,
      'date'
    );

    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      12,
      0,
      0,
      0
    );
  },


  /**
   * Adds days to a date without modifying the supplied date.
   *
   * @param {Date} date
   * @param {number} numberOfDays
   * @return {Date}
   */
  addDays: function (
    date,
    numberOfDays
  ) {
    PayTrackerUtils.validateDate(
      date,
      'date'
    );

    const days =
      Number(numberOfDays);

    if (!Number.isFinite(days)) {
      throw new Error(
        'numberOfDays must be a valid number.'
      );
    }

    const result =
      PayTrackerUtils.stripTime(date);

    result.setDate(
      result.getDate() + days
    );

    return PayTrackerUtils.stripTime(
      result
    );
  },


  /**
   * Returns the display name for a date's day of week.
   *
   * @param {Date} date
   * @return {string}
   */
  getDayName: function (date) {
    PayTrackerUtils.validateDate(
      date,
      'date'
    );

    const dayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday'
    ];

    return dayNames[
      date.getDay()
    ];
  },


  /**
   * Returns the first date used by Pay Tracker.
   *
   * @return {Date}
   */
  getFirstWeekStartDate: function () {
    return PayTrackerUtils.stripTime(
      new Date(
        PayTrackerConfig.FIRST_WEEK.YEAR,
        PayTrackerConfig.FIRST_WEEK
          .MONTH_INDEX,
        PayTrackerConfig.FIRST_WEEK.DAY,
        12,
        0,
        0,
        0
      )
    );
  },


  /**
   * Returns the Monday for a configured week number.
   *
   * @param {number} weekNumber
   * @return {Date}
   */
  getWeekStartDate: function (
    weekNumber
  ) {
    const normalisedWeekNumber =
      PayTrackerUtils.requirePositiveInteger(
        weekNumber,
        'weekNumber'
      );

    return PayTrackerUtils.addDays(
      PayTrackerUtils
        .getFirstWeekStartDate(),
      (
        normalisedWeekNumber - 1
      ) * 7
    );
  },


  /**
   * Returns the spreadsheet row where a week begins.
   *
   * @param {number} weekNumber
   * @return {number}
   */
  getWeekStartRow: function (
    weekNumber
  ) {
    const normalisedWeekNumber =
      PayTrackerUtils.requirePositiveInteger(
        weekNumber,
        'weekNumber'
      );

    return (
      1 +
      (
        normalisedWeekNumber - 1
      ) *
      PayTrackerConfig.SHEET.BLOCK_HEIGHT
    );
  },


  /**
   * Converts a date into its Pay Tracker week number.
   *
   * Dates before the first configured Monday return a value
   * less than one.
   *
   * @param {Date} date
   * @return {number}
   */
  getWeekNumberFromDate: function (
    date
  ) {
    PayTrackerUtils.validateDate(
      date,
      'date'
    );

    const firstMonday =
      PayTrackerUtils
        .getFirstWeekStartDate();

    const targetDate =
      PayTrackerUtils.stripTime(date);

    const millisecondsPerDay =
      24 * 60 * 60 * 1000;

    const differenceInDays =
      Math.floor(
        (
          targetDate.getTime() -
          firstMonday.getTime()
        ) /
        millisecondsPerDay
      );

    return (
      Math.floor(
        differenceInDays / 7
      ) + 1
    );
  },


  /**
   * Detects the highest week number currently present.
   *
   * Supports headers such as:
   * Week 1
   * Week 1 • 20 Apr - 26 Apr 2026 • April
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @return {number}
   */
  getExistingWeekCount: function (
    sheet
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const lastRow = Math.max(
      sheet.getLastRow(),
      1
    );

    const values = sheet
      .getRange(
        1,
        1,
        lastRow,
        1
      )
      .getDisplayValues();

    let highestWeekNumber = 0;

    values.forEach(function (row) {
      const value = String(
        row[0] || ''
      ).trim();

      const match = value.match(
        /^Week\s+(\d+)\b/i
      );

      if (!match) {
        return;
      }

      const weekNumber =
        Number(match[1]);

      if (
        Number.isInteger(weekNumber) &&
        weekNumber > highestWeekNumber
      ) {
        highestWeekNumber =
          weekNumber;
      }
    });

    return highestWeekNumber;
  },


  /**
   * Returns true when a row belongs to a weekly data area.
   *
   * This includes Monday through Sunday and the Extra row.
   *
   * @param {number} row
   * @return {boolean}
   */
  isWeekDataRow: function (row) {
    const rowNumber = Number(row);

    if (
      !Number.isInteger(rowNumber) ||
      rowNumber < 1
    ) {
      return false;
    }

    const relativeRow =
      (
        rowNumber - 1
      ) %
      PayTrackerConfig.SHEET.BLOCK_HEIGHT;

    const firstDataOffset =
      PayTrackerConfig.SHEET
        .WEEK_DATA_ROW_OFFSET;

    const dataRowCount =
      PayTrackerConfig.SHEET
        .WEEK_DATA_ROW_COUNT;

    return (
      relativeRow >= firstDataOffset &&
      relativeRow <
        firstDataOffset + dataRowCount
    );
  },


  /**
   * Ensures the sheet has enough rows for the requested
   * week number.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} requiredWeekNumber
   */
  ensureRowCapacity: function (
    sheet,
    requiredWeekNumber
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const weekNumber =
      PayTrackerUtils.requirePositiveInteger(
        requiredWeekNumber,
        'requiredWeekNumber'
      );

    const requiredRows =
      PayTrackerUtils.getWeekStartRow(
        weekNumber
      ) +
      PayTrackerConfig.SHEET.BLOCK_HEIGHT -
      1;

    const currentRows =
      sheet.getMaxRows();

    if (currentRows >= requiredRows) {
      return;
    }

    sheet.insertRowsAfter(
      currentRows,
      requiredRows - currentRows
    );
  },


  /**
   * Shows all rows in a sheet.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  showAllRows: function (sheet) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const maxRows =
      sheet.getMaxRows();

    if (maxRows > 0) {
      sheet.showRows(
        1,
        maxRows
      );
    }
  },


  /**
   * Converts a one-based column number into a letter.
   *
   * Examples:
   * 1 = A
   * 26 = Z
   * 27 = AA
   *
   * @param {number} columnNumber
   * @return {string}
   */
  columnLetter: function (
    columnNumber
  ) {
    let currentNumber =
      PayTrackerUtils.requirePositiveInteger(
        columnNumber,
        'columnNumber'
      );

    let result = '';

    while (currentNumber > 0) {
      const remainder =
        (
          currentNumber - 1
        ) % 26;

      result =
        String.fromCharCode(
          65 + remainder
        ) +
        result;

      currentNumber =
        Math.floor(
          (
            currentNumber - 1
          ) / 26
        );
    }

    return result;
  },


  /**
   * Builds an A1 cell reference.
   *
   * @param {number} row
   * @param {number} column
   * @return {string}
   */
  cellReference: function (
    row,
    column
  ) {
    const rowNumber =
      PayTrackerUtils.requirePositiveInteger(
        row,
        'row'
      );

    return (
      PayTrackerUtils.columnLetter(
        column
      ) +
      rowNumber
    );
  },


  /**
   * Builds a SUM formula from cell references.
   *
   * @param {string[]} references
   * @return {string}
   */
  buildSumFormula: function (
    references
  ) {
    if (
      !Array.isArray(references) ||
      references.length === 0
    ) {
      return '=0';
    }

    const validReferences =
      references
        .map(function (reference) {
          return String(
            reference || ''
          ).trim();
        })
        .filter(function (reference) {
          return reference !== '';
        });

    if (validReferences.length === 0) {
      return '=0';
    }

    return (
      '=SUM(' +
      validReferences.join(',') +
      ')'
    );
  },


  /**
   * Rounds a value to two decimal places.
   *
   * @param {number} value
   * @return {number}
   */
  roundToTwoDecimals: function (
    value
  ) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return 0;
    }

    return (
      Math.round(
        (
          number +
          Number.EPSILON
        ) *
        100
      ) /
      100
    );
  },


  /**
   * Currency-specific alias for two-decimal rounding.
   *
   * @param {number} value
   * @return {number}
   */
  roundCurrency: function (value) {
    return PayTrackerUtils
      .roundToTwoDecimals(value);
  },


  /**
   * Converts an Hours cell value into either a valid number
   * or a blank string.
   *
   * @param {*} hours
   * @return {number|string}
   */
  normaliseHours: function (hours) {
    if (
      hours === '' ||
      hours === null ||
      hours === undefined
    ) {
      return '';
    }

    const numericHours =
      Number(hours);

    if (!Number.isFinite(numericHours)) {
      return '';
    }

    return PayTrackerUtils
      .roundToTwoDecimals(
        numericHours
      );
  },


  /**
   * Returns true when a value represents entered hours.
   *
   * Zero is considered valid entered hours.
   *
   * @param {*} hours
   * @return {boolean}
   */
  hasNumericHours: function (hours) {
    if (
      hours === '' ||
      hours === null ||
      hours === undefined
    ) {
      return false;
    }

    return Number.isFinite(
      Number(hours)
    );
  },


  /**
   * Validates and returns a positive integer.
   *
   * @param {*} value
   * @param {string} fieldName
   * @return {number}
   */
  requirePositiveInteger: function (
    value,
    fieldName
  ) {
    const number = Number(value);
    const name = String(
      fieldName || 'value'
    );

    if (
      !Number.isInteger(number) ||
      number < 1
    ) {
      throw new Error(
        name +
        ' must be a positive whole number.'
      );
    }

    return number;
  },


  /**
   * Throws when a value is not a valid Date.
   *
   * @param {*} date
   * @param {string} fieldName
   */
  validateDate: function (
    date,
    fieldName
  ) {
    if (
      !(date instanceof Date) ||
      isNaN(date.getTime())
    ) {
      throw new Error(
        String(fieldName || 'date') +
        ' must be a valid date.'
      );
    }
  },


  /**
   * Produces a unique backup sheet name.
   *
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet
   * @return {string}
   */
  createUniqueBackupName: function (
    spreadsheet
  ) {
    if (
      !spreadsheet ||
      typeof spreadsheet.getSheetByName !==
        'function'
    ) {
      throw new Error(
        'A valid spreadsheet is required.'
      );
    }

    const baseName =
      'Backup_' +
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        PayTrackerConfig.FORMATS
          .BACKUP_TIMESTAMP
      );

    let backupName = baseName;
    let suffix = 1;

    while (
      spreadsheet.getSheetByName(
        backupName
      )
    ) {
      backupName =
        baseName +
        '_' +
        suffix;

      suffix++;
    }

    return backupName;
  },


  /**
   * Returns the colour theme to use for a week.
   *
   * When a week spans two months, the month containing at
   * least four days is used.
   *
   * @param {Date} weekStartDate
   * @param {Date} weekEndDate
   * @return {Object}
   */
  getMonthStyleForWeek: function (
    weekStartDate,
    weekEndDate
  ) {
    PayTrackerUtils.validateDate(
      weekStartDate,
      'weekStartDate'
    );

    PayTrackerUtils.validateDate(
      weekEndDate,
      'weekEndDate'
    );

    const startMonth =
      weekStartDate.getMonth();

    const endMonth =
      weekEndDate.getMonth();

    if (startMonth !== endMonth) {
      const finalDayOfStartMonth =
        new Date(
          weekStartDate.getFullYear(),
          startMonth + 1,
          0
        ).getDate();

      const daysInStartMonth =
        finalDayOfStartMonth -
        weekStartDate.getDate() +
        1;

      if (daysInStartMonth < 4) {
        return PayTrackerConfig
          .MONTH_STYLES[endMonth];
      }
    }

    return PayTrackerConfig
      .MONTH_STYLES[startMonth];
  },


  /**
   * Builds the displayed week header text.
   *
   * @param {number} weekNumber
   * @param {Date} weekStartDate
   * @param {Date} weekEndDate
   * @param {string} monthName
   * @return {string}
   */
  buildWeekHeaderText: function (
    weekNumber,
    weekStartDate,
    weekEndDate,
    monthName
  ) {
    const normalisedWeekNumber =
      PayTrackerUtils.requirePositiveInteger(
        weekNumber,
        'weekNumber'
      );

    PayTrackerUtils.validateDate(
      weekStartDate,
      'weekStartDate'
    );

    PayTrackerUtils.validateDate(
      weekEndDate,
      'weekEndDate'
    );

    const timezone =
      Session.getScriptTimeZone();

    const formattedStartDate =
      Utilities.formatDate(
        weekStartDate,
        timezone,
        PayTrackerConfig.FORMATS
          .WEEK_START_DATE
      );

    const formattedEndDate =
      Utilities.formatDate(
        weekEndDate,
        timezone,
        PayTrackerConfig.FORMATS
          .WEEK_END_DATE
      );

    return (
      'Week ' +
      normalisedWeekNumber +
      ' • ' +
      formattedStartDate +
      ' - ' +
      formattedEndDate +
      ' • ' +
      String(monthName || '')
    );
  },


  /**
   * Darkens a six-character hex colour.
   *
   * @param {string} hexColour
   * @param {number} multiplier
   * @return {string}
   */
  darkenColour: function (
    hexColour,
    multiplier
  ) {
    const rgb =
      PayTrackerUtils
        .parseHexColour(
          hexColour
        );

    const factor =
      Number(multiplier);

    if (!Number.isFinite(factor)) {
      throw new Error(
        'multiplier must be a valid number.'
      );
    }

    return PayTrackerUtils.rgbToHex(
      rgb.red * factor,
      rgb.green * factor,
      rgb.blue * factor
    );
  },


  /**
   * Lightens a six-character hex colour.
   *
   * @param {string} hexColour
   * @param {number} amount
   * @return {string}
   */
  lightenColour: function (
    hexColour,
    amount
  ) {
    const rgb =
      PayTrackerUtils
        .parseHexColour(
          hexColour
        );

    const factor =
      Number(amount);

    if (!Number.isFinite(factor)) {
      throw new Error(
        'amount must be a valid number.'
      );
    }

    return PayTrackerUtils.rgbToHex(
      rgb.red +
        (
          255 - rgb.red
        ) * factor,

      rgb.green +
        (
          255 - rgb.green
        ) * factor,

      rgb.blue +
        (
          255 - rgb.blue
        ) * factor
    );
  },


  /**
   * Parses a six-character hex colour.
   *
   * @param {string} hexColour
   * @return {{red:number, green:number, blue:number}}
   */
  parseHexColour: function (
    hexColour
  ) {
    const cleanColour =
      String(hexColour || '')
        .replace('#', '')
        .trim();

    if (
      !/^[0-9a-fA-F]{6}$/.test(
        cleanColour
      )
    ) {
      throw new Error(
        'Invalid hex colour: ' +
        hexColour
      );
    }

    return {
      red: parseInt(
        cleanColour.substring(0, 2),
        16
      ),

      green: parseInt(
        cleanColour.substring(2, 4),
        16
      ),

      blue: parseInt(
        cleanColour.substring(4, 6),
        16
      )
    };
  },


  /**
   * Converts RGB values into a six-character hex colour.
   *
   * @param {number} red
   * @param {number} green
   * @param {number} blue
   * @return {string}
   */
  rgbToHex: function (
    red,
    green,
    blue
  ) {
    return (
      '#' +
      PayTrackerUtils
        .clampColourValue(red)
        .toString(16)
        .padStart(2, '0') +
      PayTrackerUtils
        .clampColourValue(green)
        .toString(16)
        .padStart(2, '0') +
      PayTrackerUtils
        .clampColourValue(blue)
        .toString(16)
        .padStart(2, '0')
    );
  },


  /**
   * Constrains an RGB value to the range 0-255.
   *
   * @param {number} value
   * @return {number}
   */
  clampColourValue: function (value) {
    return Math.max(
      0,
      Math.min(
        255,
        Math.round(
          Number(value) || 0
        )
      )
    );
  },


  /**
   * Displays a standard information dialog.
   *
   * @param {string} title
   * @param {string} message
   */
  showMessage: function (
    title,
    message
  ) {
    SpreadsheetApp.getUi().alert(
      String(title || PayTrackerConfig.APP.NAME),
      String(message || ''),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  },


  /**
   * Logs an error and attempts to show it to the user.
   *
   * @param {string} context
   * @param {*} error
   */
  showError: function (
    context,
    error
  ) {
    const message =
      error && error.message
        ? error.message
        : String(error);

    const title =
      String(
        context ||
        'Pay Tracker Error'
      );

    PayTrackerUtils.logError(
      title,
      error
    );

    try {
      SpreadsheetApp.getUi().alert(
        title,
        message,
        SpreadsheetApp
          .getUi()
          .ButtonSet.OK
      );
    } catch (uiError) {
      console.error(
        'Unable to display error dialog: ' +
        uiError.message
      );
    }
  },


  /**
   * Writes a consistent error message to the execution log.
   *
   * @param {string} context
   * @param {*} error
   */
  logError: function (
    context,
    error
  ) {
    const message =
      error && error.message
        ? error.message
        : String(error);

    const stack =
      error && error.stack
        ? '\n' + error.stack
        : '';

    console.error(
      String(context || 'Error') +
      ': ' +
      message +
      stack
    );
  }
});