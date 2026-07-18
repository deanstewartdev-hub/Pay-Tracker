/*******************************************************
 * PAY TRACKER V2.1
 * SheetBuilder.gs
 *
 * Handles:
 * - Initial Pay Tracker setup
 * - Destructive rebuild confirmation
 * - Safety backup before rebuild
 * - Sheet preparation
 * - Initial week creation
 * - Weekly summary creation
 * - Running totals creation
 * - Standard sheet formatting
 *
 * This file depends on:
 * - Config.gs
 * - Utilities.gs
 * - WeekManager.gs
 * - SummaryService.gs
 * - BackupService.gs
 *******************************************************/

const PayTrackerSheetBuilder = Object.freeze({
  /**
   * Displays a confirmation prompt before rebuilding PaySheet.
   *
   * @return {boolean}
   */
  confirmFullRebuild: function () {
    const ui =
      SpreadsheetApp.getUi();

    const response = ui.alert(
      'Setup Pay Tracker',
      [
        'WARNING: This will clear and rebuild the full PaySheet tab.',
        '',
        'A safety backup will be created first.',
        '',
        'Existing shift data on PaySheet will then be removed.',
        '',
        'Continue?'
      ].join('\n'),
      ui.ButtonSet.YES_NO
    );

    return response === ui.Button.YES;
  },


  /**
   * Performs the complete Pay Tracker setup.
   *
   * This operation:
   * 1. Confirms with the user
   * 2. Creates a safety backup
   * 3. Clears and prepares PaySheet
   * 4. Creates the configured number of weeks
   * 5. Builds weekly summaries
   * 6. Builds running totals
   * 7. Applies standard widths
   *
   * @return {Object}
   */
  setup: function () {
    const sheet =
      PayTrackerUtils.getPaySheet();

    if (
      !PayTrackerSheetBuilder
        .confirmFullRebuild()
    ) {
      return {
        cancelled: true,
        createdWeeks: 0,
        backupName: null
      };
    }

    const backupResult =
      PayTrackerBackupService
        .createSafetyBackup(
          'full Pay Tracker setup'
        );

    PayTrackerSheetBuilder
      .prepareSheet(
        sheet
      );

    const initialWeekCount =
      PayTrackerConfig.SHEET
        .INITIAL_NUMBER_OF_WEEKS;

    PayTrackerUtils.ensureRowCapacity(
      sheet,
      initialWeekCount
    );

    for (
      let weekNumber = 1;
      weekNumber <= initialWeekCount;
      weekNumber++
    ) {
      PayTrackerWeekManager.createWeek(
        sheet,
        weekNumber
      );

      PayTrackerSummaryService
        .buildWeeklySummary(
          sheet,
          PayTrackerUtils
            .getWeekStartRow(
              weekNumber
            )
        );
    }

    PayTrackerSummaryService
      .buildRunningTotals(
        sheet
      );

    PayTrackerSheetBuilder
      .applyStandardLayout(
        sheet
      );

    SpreadsheetApp.flush();

    return {
      cancelled: false,
      createdWeeks:
        initialWeekCount,
      backupName:
        backupResult.backupName
    };
  },


  /**
   * Clears and prepares PaySheet for a full rebuild.
   *
   * This function is destructive.
   *
   * It should only be called after:
   * - User confirmation
   * - A successful backup
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  prepareSheet: function (
    sheet
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    sheet.setFrozenRows(0);
    sheet.setFrozenColumns(0);

    const maximumRows =
      sheet.getMaxRows();

    const maximumColumns =
      sheet.getMaxColumns();

    if (
      maximumRows > 0 &&
      maximumColumns > 0
    ) {
      const fullSheetRange =
        sheet.getRange(
          1,
          1,
          maximumRows,
          maximumColumns
        );

      fullSheetRange
        .clearDataValidations();

      fullSheetRange
        .breakApart();
    }

    SpreadsheetApp.flush();

    sheet.clear();
    sheet.clearConditionalFormatRules();

    PayTrackerSheetBuilder
      .ensureColumnCapacity(
        sheet
      );
  },


  /**
   * Ensures PaySheet has enough columns for:
   * - Four pay tables
   * - Weekly summary panels
   * - Running totals
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  ensureColumnCapacity: function (
    sheet
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const requiredColumns =
      PayTrackerConfig.SHEET
        .TOTAL_COLUMNS;

    const currentColumns =
      sheet.getMaxColumns();

    if (
      currentColumns >=
      requiredColumns
    ) {
      return;
    }

    sheet.insertColumnsAfter(
      currentColumns,
      requiredColumns -
      currentColumns
    );
  },


  /**
   * Applies the standard Pay Tracker sheet layout.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  applyStandardLayout: function (
    sheet
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    PayTrackerSummaryService
      .applySummaryColumnWidths(
        sheet
      );

    PayTrackerSheetBuilder
      .applyPayTableColumnWidths(
        sheet
      );

    PayTrackerSheetBuilder
      .applySpacerColumnWidths(
        sheet
      );
  },


  /**
   * Applies standard widths to each pay table.
   *
   * Every pay table contains:
   * - Date
   * - Day
   * - Type
   * - Hours
   * - Pay
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  applyPayTableColumnWidths: function (
    sheet
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    getConfiguredPayTables_().forEach(
      function (table) {
        const dateColumn =
          table.startColumn;

        const dayColumn =
          table.startColumn + 1;

        const typeColumn =
          table.startColumn + 2;

        const hoursColumn =
          table.startColumn + 3;

        const payColumn =
          table.startColumn + 4;

        sheet.setColumnWidth(
          dateColumn,
          95
        );

        sheet.setColumnWidth(
          dayColumn,
          85
        );

        sheet.setColumnWidth(
          typeColumn,
          210
        );

        sheet.setColumnWidth(
          hoursColumn,
          70
        );

        sheet.setColumnWidth(
          payColumn,
          90
        );
      }
    );
  },


  /**
   * Applies widths to the blank separator columns between
   * pay tables and summary cards.
   *
   * Spacer columns:
   * F, L, R, X, Y, AB
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  applySpacerColumnWidths: function (
    sheet
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const spacerColumns = [
      6,
      12,
      18,
      24,
      25,
      28
    ];

    spacerColumns.forEach(
      function (column) {
        sheet.setColumnWidth(
          column,
          18
        );
      }
    );
  },


  /**
   * Creates one complete week through the central builder.
   *
   * This is a convenience method for future modules.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} weekNumber
   */
  createCompleteWeek: function (
    sheet,
    weekNumber
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const normalisedWeekNumber =
      PayTrackerUtils
        .requirePositiveInteger(
          weekNumber,
          'weekNumber'
        );

    PayTrackerWeekManager.createWeek(
      sheet,
      normalisedWeekNumber
    );

    PayTrackerSummaryService
      .buildWeeklySummary(
        sheet,
        PayTrackerUtils
          .getWeekStartRow(
            normalisedWeekNumber
          )
      );

    PayTrackerSummaryService
      .buildRunningTotals(
        sheet
      );

    PayTrackerSheetBuilder
      .applyStandardLayout(
        sheet
      );

    SpreadsheetApp.flush();
  },


  /**
   * Adds the next complete week.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet=} optionalSheet
   * @return {number}
   */
  addNextCompleteWeek: function (
    optionalSheet
  ) {
    const sheet =
      optionalSheet ||
      PayTrackerUtils.getPaySheet();

    const nextWeekNumber =
      PayTrackerUtils
        .getExistingWeekCount(
          sheet
        ) + 1;

    PayTrackerSheetBuilder
      .createCompleteWeek(
        sheet,
        nextWeekNumber
      );

    return nextWeekNumber;
  },


  /**
   * Adds multiple complete weeks.
   *
   * @param {number} numberOfWeeks
   * @param {GoogleAppsScript.Spreadsheet.Sheet=} optionalSheet
   * @return {number[]}
   */
  addCompleteWeeks: function (
    numberOfWeeks,
    optionalSheet
  ) {
    const amount =
      PayTrackerUtils
        .requirePositiveInteger(
          numberOfWeeks,
          'numberOfWeeks'
        );

    const sheet =
      optionalSheet ||
      PayTrackerUtils.getPaySheet();

    const existingWeeks =
      PayTrackerUtils
        .getExistingWeekCount(
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

      PayTrackerSummaryService
        .buildWeeklySummary(
          sheet,
          PayTrackerUtils
            .getWeekStartRow(
              weekNumber
            )
        );

      createdWeeks.push(
        weekNumber
      );
    }

    PayTrackerSummaryService
      .buildRunningTotals(
        sheet
      );

    PayTrackerSheetBuilder
      .applyStandardLayout(
        sheet
      );

    SpreadsheetApp.flush();

    return createdWeeks;
  },


  /**
   * Ensures a specific week exists as a complete week.
   *
   * Any missing weeks before it are also created.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} requiredWeekNumber
   * @return {number[]}
   */
  ensureCompleteWeekExists: function (
    sheet,
    requiredWeekNumber
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const requestedWeek =
      PayTrackerUtils
        .requirePositiveInteger(
          requiredWeekNumber,
          'requiredWeekNumber'
        );

    const existingWeeks =
      PayTrackerUtils
        .getExistingWeekCount(
          sheet
        );

    if (
      existingWeeks >=
      requestedWeek
    ) {
      return [];
    }

    const numberOfWeeksToAdd =
      requestedWeek -
      existingWeeks;

    return PayTrackerSheetBuilder
      .addCompleteWeeks(
        numberOfWeeksToAdd,
        sheet
      );
  },


  /**
   * Repairs the overall visual layout without changing
   * shifts, hours, dates, pay values, or formulas.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet=} optionalSheet
   */
  refreshLayout: function (
    optionalSheet
  ) {
    const sheet =
      optionalSheet ||
      PayTrackerUtils.getPaySheet();

    PayTrackerSheetBuilder
      .ensureColumnCapacity(
        sheet
      );

    PayTrackerSheetBuilder
      .applyStandardLayout(
        sheet
      );

    SpreadsheetApp.flush();
  }
});


/**
 * Temporary modular wrapper for full Pay Tracker setup.
 *
 * This will replace the original setupPayTracker function
 * after Main.gs is introduced.
 */
function payTrackerSetup_() {
  PayTrackerUtils.withDocumentLock(
    function () {
      const result =
        PayTrackerSheetBuilder.setup();

      if (result.cancelled) {
        return;
      }

      PayTrackerUtils.showMessage(
        'Pay Tracker Created',
        result.createdWeeks +
        ' weeks were created successfully.' +
        '\n\nSafety backup:\n' +
        result.backupName
      );
    }
  );
}


/**
 * Temporary modular wrapper for adding one complete week.
 */
function payTrackerAddCompleteWeek_() {
  PayTrackerUtils.withDocumentLock(
    function () {
      const weekNumber =
        PayTrackerSheetBuilder
          .addNextCompleteWeek();

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
 * Temporary modular wrapper for repairing column widths.
 */
function payTrackerRefreshLayout_() {
  PayTrackerUtils.withDocumentLock(
    function () {
      PayTrackerSheetBuilder
        .refreshLayout();

      PayTrackerUtils.showMessage(
        'Layout Updated',
        'The Pay Tracker column widths and layout were refreshed.'
      );
    }
  );
}