/*******************************************************
 * PAY TRACKER V2.1
 * WeekManager.gs
 *
 * Handles:
 * - Week creation
 * - Week block layout
 * - Automatic dates
 * - Month colour themes
 * - Week visibility
 * - Week data detection
 * - Automatic row capacity
 *
 * This file depends on:
 * - Config.gs
 * - Utilities.gs
 * - PayCalculator.gs
 *******************************************************/

const PayTrackerWeekManager = Object.freeze({
  /**
   * Creates one complete weekly block.
   *
   * This creates:
   * - Week heading
   * - Four pay tables
   * - Dates and day names
   * - Shift dropdowns
   * - Hours and pay formatting
   * - Table totals
   * - Separator row
   *
   * The weekly summary panel is added later by
   * SummaryService.gs.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} weekNumber
   */
  createWeek: function (
    sheet,
    weekNumber
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const normalisedWeekNumber =
      PayTrackerUtils.requirePositiveInteger(
        weekNumber,
        'weekNumber'
      );

    PayTrackerUtils.ensureRowCapacity(
      sheet,
      normalisedWeekNumber
    );

    const startRow =
      PayTrackerUtils.getWeekStartRow(
        normalisedWeekNumber
      );

    const weekStartDate =
      PayTrackerUtils.getWeekStartDate(
        normalisedWeekNumber
      );

    const weekEndDate =
      PayTrackerUtils.addDays(
        weekStartDate,
        6
      );

    const monthStyle =
      PayTrackerUtils.getMonthStyleForWeek(
        weekStartDate,
        weekEndDate
      );

    PayTrackerWeekManager
      .prepareWeekBlockRange(
        sheet,
        startRow
      );

    PayTrackerWeekManager
      .createWeekHeader(
        sheet,
        normalisedWeekNumber,
        startRow,
        weekStartDate,
        weekEndDate,
        monthStyle
      );

    getConfiguredPayTables_().forEach(
      function (table) {
        PayTrackerWeekManager
          .createPayTable(
            sheet,
            table,
            startRow,
            weekStartDate,
            monthStyle
          );
      }
    );

    PayTrackerWeekManager
      .formatWeekSeparator(
        sheet,
        startRow
      );
  },


  /**
   * Breaks apart merges in one complete week block.
   *
   * This allows the week to be safely rebuilt.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} startRow
   */
  prepareWeekBlockRange: function (
    sheet,
    startRow
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const row =
      PayTrackerUtils.requirePositiveInteger(
        startRow,
        'startRow'
      );

    sheet
      .getRange(
        row,
        1,
        PayTrackerConfig.SHEET.BLOCK_HEIGHT,
        PayTrackerConfig.SHEET.TOTAL_COLUMNS
      )
      .breakApart();
  },


  /**
   * Creates and formats a week's main heading.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} weekNumber
   * @param {number} startRow
   * @param {Date} weekStartDate
   * @param {Date} weekEndDate
   * @param {Object} monthStyle
   */
  createWeekHeader: function (
    sheet,
    weekNumber,
    startRow,
    weekStartDate,
    weekEndDate,
    monthStyle
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const headerText =
      PayTrackerUtils.buildWeekHeaderText(
        weekNumber,
        weekStartDate,
        weekEndDate,
        monthStyle.name
      );

    sheet
      .getRange(
        startRow,
        1,
        1,
        PayTrackerConfig.SHEET
          .WEEK_HEADER_COLUMNS
      )
      .merge()
      .setValue(headerText)
      .setBackground(
        monthStyle.colour
      )
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setFontSize(13)
      .setHorizontalAlignment('left')
      .setVerticalAlignment('middle');

    sheet.setRowHeight(
      startRow,
      30
    );
  },


  /**
   * Creates one pay table inside a weekly block.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object} table
   * @param {number} startRow
   * @param {Date} weekStartDate
   * @param {Object} monthStyle
   */
  createPayTable: function (
    sheet,
    table,
    startRow,
    weekStartDate,
    monthStyle
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    if (
      !table ||
      !table.name ||
      !table.startColumn
    ) {
      throw new Error(
        'A valid pay table configuration is required.'
      );
    }

    const dateColumn =
      table.startColumn;

    const dayColumn =
      table.startColumn + 1;

    const shiftColumn =
      table.startColumn + 2;

    const hoursColumn =
      table.startColumn + 3;

    const payColumn =
      table.startColumn + 4;

    PayTrackerWeekManager
      .createTableTitle(
        sheet,
        table,
        startRow,
        monthStyle
      );

    PayTrackerWeekManager
      .createTableColumnHeaders(
        sheet,
        table,
        startRow,
        monthStyle
      );

    const firstDataRow =
      startRow +
      PayTrackerConfig.SHEET
        .WEEK_DATA_ROW_OFFSET;

    const dateValues = [];
    const dayValues = [];

    for (
      let dayIndex = 0;
      dayIndex <
        PayTrackerConfig.SHEET
          .WEEK_DATA_ROW_COUNT;
      dayIndex++
    ) {
      if (dayIndex < 7) {
        const currentDate =
          PayTrackerUtils.addDays(
            weekStartDate,
            dayIndex
          );

        dateValues.push([
          PayTrackerUtils.stripTime(
            currentDate
          )
        ]);

        dayValues.push([
          PayTrackerUtils.getDayName(
            currentDate
          )
        ]);
      } else {
        dateValues.push([
          'Extra'
        ]);

        dayValues.push([
          'Extra'
        ]);
      }
    }

    sheet
      .getRange(
        firstDataRow,
        dateColumn,
        PayTrackerConfig.SHEET
          .WEEK_DATA_ROW_COUNT,
        1
      )
      .setValues(dateValues);

    sheet
      .getRange(
        firstDataRow,
        dayColumn,
        PayTrackerConfig.SHEET
          .WEEK_DATA_ROW_COUNT,
        1
      )
      .setValues(dayValues);

    sheet
      .getRange(
        firstDataRow,
        dateColumn,
        7,
        1
      )
      .setNumberFormat(
        PayTrackerConfig.FORMATS.DATE
      );

    const shiftValidation =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          table.shifts,
          true
        )
        .setAllowInvalid(false)
        .build();

    sheet
      .getRange(
        firstDataRow,
        shiftColumn,
        PayTrackerConfig.SHEET
          .WEEK_DATA_ROW_COUNT,
        1
      )
      .setDataValidation(
        shiftValidation
      )
      .setNumberFormat('@');

    sheet
      .getRange(
        firstDataRow,
        hoursColumn,
        PayTrackerConfig.SHEET
          .WEEK_DATA_ROW_COUNT,
        1
      )
      .setNumberFormat(
        PayTrackerConfig.FORMATS.HOURS
      );

    sheet
      .getRange(
        firstDataRow,
        payColumn,
        PayTrackerConfig.SHEET
          .WEEK_DATA_ROW_COUNT,
        1
      )
      .setNumberFormat(
        PayTrackerConfig.FORMATS.CURRENCY
      );

    PayTrackerWeekManager
      .createTableTotal(
        sheet,
        table,
        startRow
      );
  },


  /**
   * Creates one table's merged title row.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object} table
   * @param {number} startRow
   * @param {Object} monthStyle
   */
  createTableTitle: function (
    sheet,
    table,
    startRow,
    monthStyle
  ) {
    sheet
      .getRange(
        startRow + 1,
        table.startColumn,
        1,
        5
      )
      .merge()
      .setValue(
        table.name
      )
      .setBackground(
        PayTrackerUtils.darkenColour(
          monthStyle.colour,
          0.72
        )
      )
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setVerticalAlignment('middle');
  },


  /**
   * Creates one table's Date, Day, Type, Hours and Pay
   * headings.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object} table
   * @param {number} startRow
   * @param {Object} monthStyle
   */
  createTableColumnHeaders: function (
    sheet,
    table,
    startRow,
    monthStyle
  ) {
    sheet
      .getRange(
        startRow + 2,
        table.startColumn,
        1,
        5
      )
      .setValues([[
        'Date',
        'Day',
        'Type',
        'Hours',
        'Pay'
      ]])
      .setBackground(
        PayTrackerUtils.lightenColour(
          monthStyle.colour,
          0.18
        )
      )
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setVerticalAlignment('middle');
  },


  /**
   * Creates a table's weekly total formula.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object} table
   * @param {number} startRow
   */
  createTableTotal: function (
    sheet,
    table,
    startRow
  ) {
    const hoursColumn =
      table.startColumn + 3;

    const payColumn =
      table.startColumn + 4;

    const totalRow =
      startRow +
      PayTrackerConfig.SHEET
        .WEEK_TOTAL_ROW_OFFSET;

    const firstDataRow =
      startRow +
      PayTrackerConfig.SHEET
        .WEEK_DATA_ROW_OFFSET;

    const finalDataRow =
      firstDataRow +
      PayTrackerConfig.SHEET
        .WEEK_DATA_ROW_COUNT -
      1;

    sheet
      .getRange(
        totalRow,
        hoursColumn
      )
      .setValue('Total')
      .setFontWeight('bold');

    sheet
      .getRange(
        totalRow,
        payColumn
      )
      .setFormula(
        '=SUM(' +
        PayTrackerUtils.columnLetter(
          payColumn
        ) +
        firstDataRow +
        ':' +
        PayTrackerUtils.columnLetter(
          payColumn
        ) +
        finalDataRow +
        ')'
      )
      .setNumberFormat(
        PayTrackerConfig.FORMATS.CURRENCY
      )
      .setFontWeight('bold');
  },


  /**
   * Formats the grey row between weekly blocks.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} startRow
   */
  formatWeekSeparator: function (
    sheet,
    startRow
  ) {
    sheet
      .getRange(
        startRow +
          PayTrackerConfig.SHEET
            .WEEK_SEPARATOR_ROW_OFFSET,
        1,
        1,
        PayTrackerConfig.SHEET
          .TOTAL_COLUMNS
      )
      .setBackground('#d1d5db');
  },


  /**
   * Adds the next sequential week to the sheet.
   *
   * The summary panel will be added by SummaryService.gs
   * after that module is connected.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet=} optionalSheet
   * @return {number} New week number.
   */
  addNextWeek: function (
    optionalSheet
  ) {
    const sheet =
      optionalSheet ||
      PayTrackerUtils.getPaySheet();

    const existingWeeks =
      PayTrackerUtils.getExistingWeekCount(
        sheet
      );

    const nextWeekNumber =
      existingWeeks + 1;

    PayTrackerWeekManager.createWeek(
      sheet,
      nextWeekNumber
    );

    SpreadsheetApp.flush();

    return nextWeekNumber;
  },


  /**
   * Adds multiple sequential weeks.
   *
   * @param {number} numberOfWeeks
   * @param {GoogleAppsScript.Spreadsheet.Sheet=} optionalSheet
   * @return {number[]} Created week numbers.
   */
  addWeeks: function (
    numberOfWeeks,
    optionalSheet
  ) {
    const amount =
      PayTrackerUtils.requirePositiveInteger(
        numberOfWeeks,
        'numberOfWeeks'
      );

    const sheet =
      optionalSheet ||
      PayTrackerUtils.getPaySheet();

    const existingWeeks =
      PayTrackerUtils.getExistingWeekCount(
        sheet
      );

    const finalWeekNumber =
      existingWeeks + amount;

    PayTrackerUtils.ensureRowCapacity(
      sheet,
      finalWeekNumber
    );

    const createdWeeks = [];

    for (
      let offset = 1;
      offset <= amount;
      offset++
    ) {
      const weekNumber =
        existingWeeks + offset;

      PayTrackerWeekManager.createWeek(
        sheet,
        weekNumber
      );

      createdWeeks.push(
        weekNumber
      );
    }

    SpreadsheetApp.flush();

    return createdWeeks;
  },


  /**
   * Ensures a required week exists.
   *
   * Missing intermediate weeks are created automatically.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} requiredWeekNumber
   * @return {number[]} Created week numbers.
   */
  ensureWeekExists: function (
    sheet,
    requiredWeekNumber
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const requestedWeekNumber =
      PayTrackerUtils.requirePositiveInteger(
        requiredWeekNumber,
        'requiredWeekNumber'
      );

    const existingWeeks =
      PayTrackerUtils.getExistingWeekCount(
        sheet
      );

    if (
      existingWeeks >= requestedWeekNumber
    ) {
      return [];
    }

    const missingWeekCount =
      requestedWeekNumber -
      existingWeeks;

    return PayTrackerWeekManager.addWeeks(
      missingWeekCount,
      sheet
    );
  },


  /**
   * Rewrites dates and day names across every existing week.
   *
   * Shift selections, hours and pay values are preserved.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet=} optionalSheet
   * @return {number} Number of updated weeks.
   */
  fixAllWeekDates: function (
    optionalSheet
  ) {
    const sheet =
      optionalSheet ||
      PayTrackerUtils.getPaySheet();

    const existingWeeks =
      PayTrackerUtils.getExistingWeekCount(
        sheet
      );

    const tables =
      getConfiguredPayTables_();

    for (
      let weekNumber = 1;
      weekNumber <= existingWeeks;
      weekNumber++
    ) {
      const startRow =
        PayTrackerUtils.getWeekStartRow(
          weekNumber
        );

      const weekStartDate =
        PayTrackerUtils.getWeekStartDate(
          weekNumber
        );

      tables.forEach(
        function (table) {
          PayTrackerWeekManager
            .fixTableDates(
              sheet,
              table,
              startRow,
              weekStartDate
            );
        }
      );
    }

    SpreadsheetApp.flush();

    return existingWeeks;
  },


  /**
   * Repairs the dates in one pay table.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object} table
   * @param {number} startRow
   * @param {Date} weekStartDate
   */
  fixTableDates: function (
    sheet,
    table,
    startRow,
    weekStartDate
  ) {
    const dateColumn =
      table.startColumn;

    const dayColumn =
      table.startColumn + 1;

    const firstDataRow =
      startRow +
      PayTrackerConfig.SHEET
        .WEEK_DATA_ROW_OFFSET;

    const dateValues = [];
    const dayValues = [];

    for (
      let dayIndex = 0;
      dayIndex < 7;
      dayIndex++
    ) {
      const currentDate =
        PayTrackerUtils.addDays(
          weekStartDate,
          dayIndex
        );

      dateValues.push([
        PayTrackerUtils.stripTime(
          currentDate
        )
      ]);

      dayValues.push([
        PayTrackerUtils.getDayName(
          currentDate
        )
      ]);
    }

    sheet
      .getRange(
        firstDataRow,
        dateColumn,
        7,
        1
      )
      .setValues(dateValues)
      .setNumberFormat(
        PayTrackerConfig.FORMATS.DATE
      );

    sheet
      .getRange(
        firstDataRow,
        dayColumn,
        7,
        1
      )
      .setValues(dayValues);

    const extraRow =
      firstDataRow + 7;

    sheet
      .getRange(
        extraRow,
        dateColumn
      )
      .setValue('Extra');

    sheet
      .getRange(
        extraRow,
        dayColumn
      )
      .setValue('Extra');
  },


  /**
   * Reapplies week and table colours without clearing data.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet=} optionalSheet
   * @return {number} Number of recoloured weeks.
   */
  applyMonthColours: function (
    optionalSheet
  ) {
    const sheet =
      optionalSheet ||
      PayTrackerUtils.getPaySheet();

    const existingWeeks =
      PayTrackerUtils.getExistingWeekCount(
        sheet
      );

    const tables =
      getConfiguredPayTables_();

    for (
      let weekNumber = 1;
      weekNumber <= existingWeeks;
      weekNumber++
    ) {
      const startRow =
        PayTrackerUtils.getWeekStartRow(
          weekNumber
        );

      const weekStartDate =
        PayTrackerUtils.getWeekStartDate(
          weekNumber
        );

      const weekEndDate =
        PayTrackerUtils.addDays(
          weekStartDate,
          6
        );

      const monthStyle =
        PayTrackerUtils.getMonthStyleForWeek(
          weekStartDate,
          weekEndDate
        );

      const weekHeader =
        PayTrackerUtils.buildWeekHeaderText(
          weekNumber,
          weekStartDate,
          weekEndDate,
          monthStyle.name
        );

      sheet
        .getRange(
          startRow,
          1,
          1,
          PayTrackerConfig.SHEET
            .WEEK_HEADER_COLUMNS
        )
        .setValue(
          weekHeader
        )
        .setBackground(
          monthStyle.colour
        )
        .setFontColor('#ffffff')
        .setFontWeight('bold')
        .setFontSize(13);

      tables.forEach(
        function (table) {
          sheet
            .getRange(
              startRow + 1,
              table.startColumn,
              1,
              5
            )
            .setBackground(
              PayTrackerUtils.darkenColour(
                monthStyle.colour,
                0.72
              )
            )
            .setFontColor('#ffffff')
            .setFontWeight('bold');

          sheet
            .getRange(
              startRow + 2,
              table.startColumn,
              1,
              5
            )
            .setBackground(
              PayTrackerUtils.lightenColour(
                monthStyle.colour,
                0.18
              )
            )
            .setFontColor('#ffffff')
            .setFontWeight('bold');
        }
      );
    }

    SpreadsheetApp.flush();

    return existingWeeks;
  },


  /**
   * Returns true when any shift exists in a weekly block.
   *
   * Monday-Sunday and Extra rows are all checked.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} startRow
   * @return {boolean}
   */
  weekHasShiftData: function (
    sheet,
    startRow
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const firstDataRow =
      startRow +
      PayTrackerConfig.SHEET
        .WEEK_DATA_ROW_OFFSET;

    return getConfiguredPayTables_().some(
      function (table) {
        const shiftColumn =
          table.startColumn + 2;

        const shiftValues = sheet
          .getRange(
            firstDataRow,
            shiftColumn,
            PayTrackerConfig.SHEET
              .WEEK_DATA_ROW_COUNT,
            1
          )
          .getDisplayValues();

        return shiftValues.some(
          function (row) {
            return String(
              row[0] || ''
            ).trim() !== '';
          }
        );
      }
    );
  },


  /**
   * Shows only:
   * - Current week
   * - Previous week
   * - Weeks containing shift data
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet=} optionalSheet
   */
  showRelevantWeeksOnly: function (
    optionalSheet
  ) {
    const sheet =
      optionalSheet ||
      PayTrackerUtils.getPaySheet();

    PayTrackerUtils.showAllRows(
      sheet
    );

    const today =
      PayTrackerUtils.stripTime(
        new Date()
      );

    const currentWeekNumber =
      PayTrackerUtils.getWeekNumberFromDate(
        today
      );

    const previousWeekNumber =
      currentWeekNumber - 1;

    const existingWeeks =
      PayTrackerUtils.getExistingWeekCount(
        sheet
      );

    for (
      let weekNumber = 1;
      weekNumber <= existingWeeks;
      weekNumber++
    ) {
      const startRow =
        PayTrackerUtils.getWeekStartRow(
          weekNumber
        );

      const shouldShow =
        weekNumber === currentWeekNumber ||
        weekNumber === previousWeekNumber ||
        PayTrackerWeekManager
          .weekHasShiftData(
            sheet,
            startRow
          );

      if (!shouldShow) {
        sheet.hideRows(
          startRow,
          PayTrackerConfig.SHEET
            .BLOCK_HEIGHT
        );
      }
    }
  },


  /**
   * Shows every row and week.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet=} optionalSheet
   */
  showAllWeeks: function (
    optionalSheet
  ) {
    const sheet =
      optionalSheet ||
      PayTrackerUtils.getPaySheet();

    PayTrackerUtils.showAllRows(
      sheet
    );
  }
});


/**
 * Temporary modular wrapper for adding a week.
 *
 * The final public menu function will be connected through
 * Main.gs after the original script is retired.
 */
function payTrackerAddNextWeek_() {
  PayTrackerUtils.withDocumentLock(
    function () {
      const weekNumber =
        PayTrackerWeekManager
          .addNextWeek();

      PayTrackerUtils.showMessage(
        'Week Added',
        'Week ' +
        weekNumber +
        ' was added successfully.'
      );
    }
  );
}


/**
 * Temporary modular wrapper for fixing week dates.
 */
function payTrackerFixAllWeekDates_() {
  PayTrackerUtils.withDocumentLock(
    function () {
      const updatedWeeks =
        PayTrackerWeekManager
          .fixAllWeekDates();

      PayTrackerUtils.showMessage(
        'Week Dates Repaired',
        updatedWeeks +
        ' week blocks were updated. Shift and pay data were preserved.'
      );
    }
  );
}


/**
 * Temporary modular wrapper for applying month colours.
 */
function payTrackerApplyMonthColours_() {
  PayTrackerUtils.withDocumentLock(
    function () {
      const updatedWeeks =
        PayTrackerWeekManager
          .applyMonthColours();

      PayTrackerUtils.showMessage(
        'Month Colours Applied',
        updatedWeeks +
        ' existing weeks were updated. No shift data was cleared.'
      );
    }
  );
}


/**
 * Temporary modular wrapper for showing relevant weeks.
 */
function payTrackerShowRelevantWeeks_() {
  PayTrackerWeekManager
    .showRelevantWeeksOnly();
}


/**
 * Temporary modular wrapper for showing all weeks.
 */
function payTrackerShowAllWeeks_() {
  PayTrackerWeekManager
    .showAllWeeks();
}