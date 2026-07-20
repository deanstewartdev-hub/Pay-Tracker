/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Web/PayWorkspaceService.js
 *
 * Purpose:
 * - Supply live Pay Workspace data
 * - Read every valid PaySheet week in one batched request
 * - Select the latest populated week by default
 * - Support previous and next week navigation
 * - Preserve all existing PaySheet calculations
 *
 * Important:
 * - This service does not calculate shift pay
 * - This service does not modify the PaySheet
 * - Stored spreadsheet totals remain the source of truth
 *******************************************************/

const PayTrackerWebPayWorkspaceService = Object.freeze({
  /**
   * Returns data for the Pay Workspace.
   *
   * @param {number|string=} requestedWeekNumber
   *     Optional week number requested by the browser.
   * @return {Object} Pay Workspace response.
   */
  getPayWorkspaceData: function(requestedWeekNumber) {
    const startedAt = new Date();

    try {
      const spreadsheet =
        SpreadsheetApp.getActiveSpreadsheet();

      if (!spreadsheet) {
        throw new Error(
          'No active Pay Tracker spreadsheet is available.'
        );
      }

      const sheetName =
        PayTrackerWebPayWorkspaceService
          .getPaySheetName();

      const sheet =
        spreadsheet.getSheetByName(sheetName);

      if (!sheet) {
        return {
          success: true,
          generatedAt: startedAt.toISOString(),
          durationMilliseconds:
            new Date().getTime() -
            startedAt.getTime(),

          spreadsheetUrl:
            spreadsheet.getUrl(),

          sheetName: sheetName,

          weeks: [],

          selectedWeek: null,

          selectedWeekIndex: -1,

          navigation: {
            hasPrevious: false,
            hasNext: false,
            previousWeekNumber: null,
            nextWeekNumber: null,
            latestWeekNumber: null
          },

          message:
            'The PaySheet could not be found.'
        };
      }

      const payData =
        PayTrackerWebPayWorkspaceService
          .readPaySheet(sheet);

      const selected =
        PayTrackerWebPayWorkspaceService
          .selectWeek(
            payData.weeks,
            requestedWeekNumber
          );

      return {
        success: true,

        generatedAt:
          startedAt.toISOString(),

        durationMilliseconds:
          new Date().getTime() -
          startedAt.getTime(),

        spreadsheetUrl:
          spreadsheet.getUrl(),

        sheetName: sheetName,

        weeks:
          payData.weeks.map(function(week) {
            return {
              weekNumber:
                week.weekNumber,

              weekLabel:
                week.weekLabel,

              weekStart:
                week.weekStart,

              weekEnd:
                week.weekEnd,

              hasData:
                week.hasData
            };
          }),

        selectedWeek:
          selected.week,

        selectedWeekIndex:
          selected.index,

        navigation:
          PayTrackerWebPayWorkspaceService
            .buildNavigation(
              payData.weeks,
              selected.index
            ),

        message:
          selected.week
            ? (
              selected.week.hasData
                ? ''
                : 'No shifts are recorded for this week.'
            )
            : 'No valid PaySheet weeks were found.'
      };
    } catch (error) {
      console.error(
        'Pay Workspace data generation failed.',
        error
      );

      return {
        success: false,

        generatedAt:
          startedAt.toISOString(),

        error:
          PayTrackerWebPayWorkspaceService
            .getErrorMessage(error)
      };
    }
  },

  /**
   * Reads the PaySheet in two batched requests.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   *     PaySheet.
   * @return {Object} Parsed PaySheet data.
   */
  readPaySheet: function(sheet) {
    const config =
      PayTrackerWebPayWorkspaceService
        .getSheetConfig();

    const lastRow =
      Math.max(
        sheet.getLastRow(),
        1
      );

    const lastColumn =
      Math.max(
        sheet.getLastColumn(),
        config.totalColumns
      );

    const range =
      sheet.getRange(
        1,
        1,
        lastRow,
        lastColumn
      );

    const values =
      range.getValues();

    const displayValues =
      range.getDisplayValues();

    const tables =
      PayTrackerWebPayWorkspaceService
        .getPayTables();

    const weeks = [];

    for (
      let startIndex = 0;
      startIndex < values.length;
      startIndex += config.blockHeight
    ) {
      const week =
        PayTrackerWebPayWorkspaceService
          .readWeekBlock({
            values: values,
            displayValues: displayValues,
            startIndex: startIndex,
            config: config,
            tables: tables
          });

      if (week) {
        weeks.push(week);
      }
    }

    weeks.sort(function(firstWeek, secondWeek) {
      return (
        firstWeek.weekNumber -
        secondWeek.weekNumber
      );
    });

    return {
      weeks: weeks
    };
  },

  /**
   * Reads one PaySheet week block.
   *
   * @param {Object} options Read options.
   * @return {Object|null} Parsed week or null.
   */
  readWeekBlock: function(options) {
    const values =
      options.values;

    const displayValues =
      options.displayValues;

    const startIndex =
      options.startIndex;

    const config =
      options.config;

    const tables =
      options.tables;

    const headerText = String(
      displayValues[startIndex] &&
      displayValues[startIndex][0]
        ? displayValues[startIndex][0]
        : ''
    ).trim();

    const weekMatch =
      headerText.match(/^Week\s+(\d+)/i);

    if (!weekMatch) {
      return null;
    }

    const weekNumber =
      Number(weekMatch[1]) || 0;

    if (weekNumber <= 0) {
      return null;
    }

    const employers =
      PayTrackerWebPayWorkspaceService
        .createEmptyEmployers();

    let grossFromEmployers = 0;
    let totalShifts = 0;
    let hasData = false;

    tables.forEach(function(table) {
      const employerKey =
        PayTrackerWebPayWorkspaceService
          .getEmployerKey(
            table.name
          );

      const employer =
        PayTrackerWebPayWorkspaceService
          .readEmployerWeek({
            values: values,
            displayValues: displayValues,
            startIndex: startIndex,
            config: config,
            table: table,
            employerKey: employerKey
          });

      employers[employerKey] =
        employer;

      grossFromEmployers +=
        employer.total;

      totalShifts +=
        employer.shifts;

      if (employer.shifts > 0) {
        hasData = true;
      }
    });

    const summary =
      PayTrackerWebPayWorkspaceService
        .readWeekSummary({
          values: values,
          startIndex: startIndex,
          config: config
        });

   const dates =
  PayTrackerWebPayWorkspaceService
    .readWeekDates({
      values: values,
      displayValues: displayValues,
      startIndex: startIndex,
      config: config,
      headerText: headerText
    });

    const gross =
      PayTrackerWebPayWorkspaceService
        .roundCurrency(
          grossFromEmployers
        );

    const taxableGross =
      PayTrackerWebPayWorkspaceService
        .roundCurrency(
          summary.taxableGross
        );

    const estimatedDeductions =
      PayTrackerWebPayWorkspaceService
        .roundCurrency(
          summary.estimatedDeductions
        );

    const taxableTakeHome =
      PayTrackerWebPayWorkspaceService
        .roundCurrency(
          summary.taxableTakeHome
        );

    const loggingCash =
      PayTrackerWebPayWorkspaceService
        .roundCurrency(
          summary.loggingCash
        );

    const takeHome =
      PayTrackerWebPayWorkspaceService
        .roundCurrency(
          summary.totalTakeHome ||
          taxableTakeHome + loggingCash
        );

    return {
      hasData: hasData,

      weekNumber: weekNumber,

      weekLabel:
        PayTrackerWebPayWorkspaceService
          .formatWeekLabel(
            weekNumber,
            dates.firstDate,
            dates.lastDate
          ),

      weekStart:
        PayTrackerWebPayWorkspaceService
          .serializeDate(
            dates.firstDate
          ),

      weekEnd:
        PayTrackerWebPayWorkspaceService
          .serializeDate(
            dates.lastDate
          ),

      gross: gross,

      taxableGross:
        taxableGross,

      estimatedDeductions:
        estimatedDeductions,

      taxableTakeHome:
        taxableTakeHome,

      loggingCash:
        loggingCash,

      takeHome:
        takeHome,

      deductionRate:
        taxableGross > 0
          ? estimatedDeductions /
            taxableGross
          : 0,

      totalShifts:
        totalShifts,

      /*
       * Hours are deliberately null during the Pay
       * Dashboard feature.
       *
       * Shift durations will be connected through the
       * established shift configuration during the Shift
       * Table feature instead of estimating them here.
       */
      totalHours: null,

      employers:
        employers,

      message:
        hasData
          ? ''
          : 'No shifts are recorded for this week.'
    };
  },

  /**
   * Reads one employer table from a week block.
   *
   * This follows the same configured column indexing used
   * by the working Dashboard service.
   *
   * @param {Object} options Read options.
   * @return {Object} Employer summary.
   */
  readEmployerWeek: function(options) {
    const values =
      options.values;

    const displayValues =
      options.displayValues;

    const startIndex =
      options.startIndex;

    const config =
      options.config;

    const table =
      options.table;

    const employerKey =
      options.employerKey;

    const shiftColumnIndex =
      Number(table.startColumn) + 1;

    const payColumnIndex =
      Number(table.startColumn) + 3;

    let shifts = 0;
    let calculatedTotal = 0;

    const entries = [];

    for (
      let dayIndex = 0;
      dayIndex < config.dataRowCount;
      dayIndex++
    ) {
      const rowIndex =
        startIndex +
        config.dataRowOffset +
        dayIndex;

      if (rowIndex >= values.length) {
        break;
      }

      const shiftName = String(
        displayValues[rowIndex] &&
        displayValues[rowIndex][shiftColumnIndex]
          ? displayValues[rowIndex][shiftColumnIndex]
          : ''
      ).trim();

      const pay =
        Number(
          values[rowIndex] &&
          values[rowIndex][payColumnIndex]
            ? values[rowIndex][payColumnIndex]
            : 0
        ) || 0;

      if (shiftName !== '') {
        shifts++;

        entries.push({
          dayIndex:
            dayIndex,

          shiftName:
            shiftName,

          pay:
            PayTrackerWebPayWorkspaceService
              .roundCurrency(pay)
        });
      }

      calculatedTotal += pay;
    }

    const totalRowIndex =
      startIndex +
      config.totalRowOffset;

    const storedTotal =
      totalRowIndex < values.length
        ? (
          Number(
            values[totalRowIndex] &&
            values[totalRowIndex][payColumnIndex]
              ? values[totalRowIndex][payColumnIndex]
              : 0
          ) || 0
        )
        : 0;

    return {
      key:
        employerKey,

      name:
        String(
          table.name ||
          PayTrackerWebPayWorkspaceService
            .getDefaultEmployerName(
              employerKey
            )
        ),

      taxable:
        Boolean(table.taxable),

      shifts:
        shifts,

      total:
        PayTrackerWebPayWorkspaceService
          .roundCurrency(
            storedTotal ||
            calculatedTotal
          ),

      entries:
        entries
    };
  },

  /**
   * Reads stored week summary figures.
   *
   * PaySheet summary order:
   * 1. Taxable gross
   * 2. Estimated deductions
   * 3. Taxable take-home
   * 4. Logging/cash income
   * 5. Total take-home
   *
   * @param {Object} options Read options.
   * @return {Object} Week summary.
   */
  readWeekSummary: function(options) {
    const values =
      options.values;

    const startIndex =
      options.startIndex;

    const config =
      options.config;

    const summaryStartIndex =
      startIndex + 1;

    const summaryColumnIndex =
      config.summaryValueColumn - 1;

    const summaryValues = [];

    for (let index = 0; index < 5; index++) {
      const rowIndex =
        summaryStartIndex + index;

      summaryValues.push(
        rowIndex < values.length
          ? (
            Number(
              values[rowIndex] &&
              values[rowIndex][summaryColumnIndex]
                ? values[rowIndex][summaryColumnIndex]
                : 0
            ) || 0
          )
          : 0
      );
    }

    return {
      taxableGross:
        summaryValues[0],

      estimatedDeductions:
        summaryValues[1],

      taxableTakeHome:
        summaryValues[2],

      loggingCash:
        summaryValues[3],

      totalTakeHome:
        summaryValues[4]
    };
  },

   /**
   * Reads the first and last dates from a PaySheet week.
   *
   * The function checks the raw spreadsheet values first,
   * then checks displayed date text as a fallback.
   *
   * @param {Object} options Read options.
   * @return {Object} Week dates.
   */
  readWeekDates: function(options) {
    const values =
      options.values || [];

    const displayValues =
      options.displayValues || [];

    const startIndex =
      Number(options.startIndex) || 0;

    const config =
      options.config || {};

    const dataRowOffset =
      Number(config.dataRowOffset) || 2;

    const dataRowCount =
      Number(config.dataRowCount) || 7;

    const dates = [];

    /**
     * Adds a valid date to the result.
     *
     * @param {*} value Possible date value.
     */
    const addDate = function(value) {
      let date = null;

      if (
        Object.prototype.toString.call(value) ===
          '[object Date]' &&
        !Number.isNaN(value.getTime())
      ) {
        date = new Date(value.getTime());
      } else {
        const text =
          String(value || '').trim();

        if (!text) {
          return;
        }

        /*
         * UK numeric date:
         * 27/07/2026
         * 27-07-2026
         */
        const numericMatch =
          text.match(
            /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/
          );

        if (numericMatch) {
          let year =
            Number(numericMatch[3]);

          if (year < 100) {
            year += 2000;
          }

          date = new Date(
            year,
            Number(numericMatch[2]) - 1,
            Number(numericMatch[1]),
            12,
            0,
            0,
            0
          );
        } else {
          const parsed =
            new Date(text);

          if (!Number.isNaN(parsed.getTime())) {
            date = parsed;
          }
        }
      }

      if (
        date &&
        !Number.isNaN(date.getTime())
      ) {
        dates.push(date);
      }
    };

    for (
      let dayIndex = 0;
      dayIndex < dataRowCount;
      dayIndex++
    ) {
      const rowIndex =
        startIndex +
        dataRowOffset +
        dayIndex;

      if (rowIndex >= values.length) {
        break;
      }

      const rawRow =
        values[rowIndex] || [];

      const displayedRow =
        displayValues[rowIndex] || [];

      let dateFoundForRow = false;

      /*
       * Check the first four columns. This preserves the
       * existing column-A behaviour while safely handling
       * dates stored beside the day name.
       */
      for (
        let columnIndex = 0;
        columnIndex < 4;
        columnIndex++
      ) {
        const dateCountBefore =
          dates.length;

        addDate(
          rawRow[columnIndex]
        );

        if (
          dates.length >
          dateCountBefore
        ) {
          dateFoundForRow = true;
          break;
        }
      }

      if (dateFoundForRow) {
        continue;
      }

      /*
       * Fall back to the displayed text because Sheets may
       * return a formatted date as text in some layouts.
       */
      for (
        let columnIndex = 0;
        columnIndex < 4;
        columnIndex++
      ) {
        const dateCountBefore =
          dates.length;

        addDate(
          displayedRow[columnIndex]
        );

        if (
          dates.length >
          dateCountBefore
        ) {
          break;
        }
      }
    }

    if (dates.length === 0) {
      return {
        firstDate: null,
        lastDate: null
      };
    }

    dates.sort(function(firstDate, secondDate) {
      return (
        firstDate.getTime() -
        secondDate.getTime()
      );
    });

    return {
      firstDate:
        dates[0],

      lastDate:
        dates[dates.length - 1]
    };
  },

  /**
   * Selects a requested week or the latest populated week.
   *
   * @param {Array<Object>} weeks Weeks.
   * @param {number|string=} requestedWeekNumber
   *     Requested week number.
   * @return {Object} Selected week result.
   */
  selectWeek: function(
    weeks,
    requestedWeekNumber
  ) {
    if (
      !Array.isArray(weeks) ||
      weeks.length === 0
    ) {
      return {
        week: null,
        index: -1
      };
    }

    const normalizedRequestedWeek =
      Number(requestedWeekNumber);

    if (
      Number.isFinite(
        normalizedRequestedWeek
      ) &&
      normalizedRequestedWeek > 0
    ) {
      const requestedIndex =
        weeks.findIndex(function(week) {
          return (
            week.weekNumber ===
            normalizedRequestedWeek
          );
        });

      if (requestedIndex >= 0) {
        return {
          week:
            weeks[requestedIndex],

          index:
            requestedIndex
        };
      }
    }

    for (
      let index = weeks.length - 1;
      index >= 0;
      index--
    ) {
      if (weeks[index].hasData) {
        return {
          week:
            weeks[index],

          index:
            index
        };
      }
    }

    return {
      week:
        weeks[weeks.length - 1],

      index:
        weeks.length - 1
    };
  },

  /**
   * Builds week navigation metadata.
   *
   * @param {Array<Object>} weeks Weeks.
   * @param {number} selectedIndex Selected index.
   * @return {Object} Navigation metadata.
   */
  buildNavigation: function(
    weeks,
    selectedIndex
  ) {
    if (
      !Array.isArray(weeks) ||
      weeks.length === 0 ||
      selectedIndex < 0
    ) {
      return {
        hasPrevious: false,
        hasNext: false,
        previousWeekNumber: null,
        nextWeekNumber: null,
        latestWeekNumber: null
      };
    }

    let latestPopulatedWeek = null;

    for (
      let index = weeks.length - 1;
      index >= 0;
      index--
    ) {
      if (weeks[index].hasData) {
        latestPopulatedWeek =
          weeks[index];

        break;
      }
    }

    if (!latestPopulatedWeek) {
      latestPopulatedWeek =
        weeks[weeks.length - 1];
    }

    return {
      hasPrevious:
        selectedIndex > 0,

      hasNext:
        selectedIndex <
        weeks.length - 1,

      previousWeekNumber:
        selectedIndex > 0
          ? weeks[selectedIndex - 1]
              .weekNumber
          : null,

      nextWeekNumber:
        selectedIndex <
        weeks.length - 1
          ? weeks[selectedIndex + 1]
              .weekNumber
          : null,

      latestWeekNumber:
        latestPopulatedWeek.weekNumber
    };
  },

  /**
   * Returns configured PaySheet employer tables.
   *
   * @return {Array<Object>} Table definitions.
   */
  getPayTables: function() {
    const configuredTables =
      typeof PayTrackerConfig !==
        'undefined' &&
      PayTrackerConfig &&
      PayTrackerConfig.TABLES
        ? PayTrackerConfig.TABLES
        : {};

    return Object.keys(configuredTables)
      .map(function(key) {
        return configuredTables[key];
      })
      .filter(function(table) {
        return (
          table &&
          Number(table.startColumn) > 0
        );
      });
  },

  /**
   * Creates the standard employer response structure.
   *
   * @return {Object} Empty employer map.
   */
  createEmptyEmployers: function() {
    return {
      nhs: {
        key: 'nhs',
        name: 'NHS',
        taxable: true,
        shifts: 0,
        total: 0,
        entries: []
      },

      relief: {
        key: 'relief',
        name: 'Relief Assistant Warden',
        taxable: true,
        shifts: 0,
        total: 0,
        entries: []
      },

      security: {
        key: 'security',
        name: 'Night Security Warden',
        taxable: true,
        shifts: 0,
        total: 0,
        entries: []
      },

      logging: {
        key: 'logging',
        name: 'Logging Cash',
        taxable: false,
        shifts: 0,
        total: 0,
        entries: []
      }
    };
  },

  /**
   * Converts a configured table name to a browser key.
   *
   * @param {*} name Employer name.
   * @return {string} Employer key.
   */
  getEmployerKey: function(name) {
    const normalized =
      String(name || '')
        .trim()
        .toLowerCase();

    if (
      normalized.indexOf('nhs') !== -1
    ) {
      return 'nhs';
    }

    if (
      normalized.indexOf('relief') !== -1
    ) {
      return 'relief';
    }

    if (
      normalized.indexOf('security') !== -1
    ) {
      return 'security';
    }

    if (
      normalized.indexOf('logging') !== -1
    ) {
      return 'logging';
    }

    return normalized
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  },

  /**
   * Returns a fallback employer display name.
   *
   * @param {string} key Employer key.
   * @return {string} Display name.
   */
  getDefaultEmployerName: function(key) {
    const names = {
      nhs: 'NHS',
      relief: 'Relief Assistant Warden',
      security: 'Night Security Warden',
      logging: 'Logging Cash'
    };

    return names[key] || key;
  },

  /**
   * Returns required PaySheet configuration.
   *
   * @return {Object} Normalized configuration.
   */
  getSheetConfig: function() {
    if (
      typeof PayTrackerConfig ===
        'undefined' ||
      !PayTrackerConfig ||
      !PayTrackerConfig.SHEET
    ) {
      throw new Error(
        'Pay Tracker sheet configuration is unavailable.'
      );
    }

    const sheetConfig =
      PayTrackerConfig.SHEET;

    return {
      blockHeight:
        Number(
          sheetConfig.BLOCK_HEIGHT
        ) || 12,

      dataRowOffset:
        Number(
          sheetConfig
            .WEEK_DATA_ROW_OFFSET
        ) || 2,

      dataRowCount:
        Number(
          sheetConfig
            .WEEK_DATA_ROW_COUNT
        ) || 7,

      totalRowOffset:
        Number(
          sheetConfig
            .WEEK_TOTAL_ROW_OFFSET
        ) || 9,

      summaryValueColumn:
        Number(
          sheetConfig
            .WEEKLY_SUMMARY_VALUE_COLUMN
        ) || 14,

      totalColumns:
        Number(
          sheetConfig.TOTAL_COLUMNS
        ) || 30
    };
  },

  /**
   * Returns the configured PaySheet name.
   *
   * @return {string} Sheet name.
   */
  getPaySheetName: function() {
    if (
      typeof PayTrackerConfig !==
        'undefined' &&
      PayTrackerConfig &&
      PayTrackerConfig.SHEET &&
      PayTrackerConfig.SHEET.NAME
    ) {
      return String(
        PayTrackerConfig.SHEET.NAME
      );
    }

    return 'PaySheet';
  },

  /**
   * Formats a week label.
   *
   * @param {number} weekNumber Week number.
   * @param {*} firstDate First date.
   * @param {*} lastDate Last date.
   * @return {string} Week label.
   */
  formatWeekLabel: function(
    weekNumber,
    firstDate,
    lastDate
  ) {
    const first =
      PayTrackerWebPayWorkspaceService
        .toDate(firstDate);

    const last =
      PayTrackerWebPayWorkspaceService
        .toDate(lastDate);

    if (!first || !last) {
      return 'Week ' + weekNumber;
    }

    const timeZone =
      Session.getScriptTimeZone() ||
      'Europe/London';

    return (
      'Week ' +
      weekNumber +
      ' • ' +
      Utilities.formatDate(
        first,
        timeZone,
        'dd MMM'
      ) +
      ' - ' +
      Utilities.formatDate(
        last,
        timeZone,
        'dd MMM yyyy'
      )
    );
  },

  /**
   * Serializes a spreadsheet date.
   *
   * @param {*} value Date value.
   * @return {string|null} ISO date.
   */
  serializeDate: function(value) {
    const date =
      PayTrackerWebPayWorkspaceService
        .toDate(value);

    return date
      ? date.toISOString()
      : null;
  },

  /**
   * Converts a value into a valid Date.
   *
   * @param {*} value Date value.
   * @return {Date|null} Date or null.
   */
  toDate: function(value) {
    if (
      Object.prototype.toString.call(
        value
      ) === '[object Date]' &&
      !Number.isNaN(value.getTime())
    ) {
      return value;
    }

    if (!value) {
      return null;
    }

    const parsed =
      new Date(value);

    return Number.isNaN(
      parsed.getTime()
    )
      ? null
      : parsed;
  },

  /**
   * Rounds a monetary value.
   *
   * @param {*} value Numeric value.
   * @return {number} Rounded amount.
   */
  roundCurrency: function(value) {
    const number =
      Number(value) || 0;

    return (
      Math.round(number * 100) /
      100
    );
  },

  /**
   * Safely extracts an error message.
   *
   * @param {*} error Error value.
   * @return {string} Error message.
   */
  getErrorMessage: function(error) {
    if (
      error &&
      typeof error.message ===
        'string' &&
      error.message.trim() !== ''
    ) {
      return error.message.trim();
    }

    return String(
      error ||
      'An unknown Pay Workspace error occurred.'
    );
  }
});

/**
 * Browser-callable Apps Script entrypoint.
 *
 * @param {number|string=} requestedWeekNumber
 *     Optional requested week number.
 * @return {Object} Pay Workspace response.
 */
function getPayTrackerWebPayWorkspaceData(
  requestedWeekNumber
) {
  return PayTrackerWebPayWorkspaceService
    .getPayWorkspaceData(
      requestedWeekNumber
    );
}