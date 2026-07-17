/*******************************************************
 * PAY TRACKER V2.1
 * SummaryService.gs
 *
 * Handles:
 * - Weekly summary panels
 * - Running pay totals
 * - Estimated deduction formulas
 * - Summary formatting
 * - Summary refresh operations
 *
 * This file depends on:
 * - Config.gs
 * - Utilities.gs
 * - WeekManager.gs
 *******************************************************/

const PayTrackerSummaryService = Object.freeze({
  /**
   * Builds or rebuilds one weekly summary panel.
   *
   * The panel displays:
   * - Taxable Gross
   * - Estimated Deductions
   * - Staffline Take Home
   * - Logging Cash
   * - Total Take Home
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} weekStartRow
   */
  buildWeeklySummary: function (
    sheet,
    weekStartRow
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const startRow =
      PayTrackerUtils.requirePositiveInteger(
        weekStartRow,
        'weekStartRow'
      );

    const labelColumn =
      PayTrackerConfig.SHEET
        .WEEKLY_SUMMARY_LABEL_COLUMN;

    const valueColumn =
      PayTrackerConfig.SHEET
        .WEEKLY_SUMMARY_VALUE_COLUMN;

    const summaryRange =
      sheet.getRange(
        startRow + 1,
        labelColumn,
        PayTrackerConfig.SUMMARY
          .LABELS.length,
        2
      );

    summaryRange
      .clearFormat()
      .setVerticalAlignment('middle');

    sheet
      .getRange(
        startRow + 1,
        labelColumn,
        PayTrackerConfig.SUMMARY
          .LABELS.length,
        1
      )
      .setValues(
        PayTrackerConfig.SUMMARY
          .LABELS.map(
            function (label) {
              return [label];
            }
          )
      )
      .setFontWeight('bold')
      .setFontSize(10);

    const taxableGrossCell =
      PayTrackerUtils.cellReference(
        startRow + 1,
        valueColumn
      );

    const deductionsCell =
      PayTrackerUtils.cellReference(
        startRow + 2,
        valueColumn
      );

    const stafflineTakeHomeCell =
      PayTrackerUtils.cellReference(
        startRow + 3,
        valueColumn
      );

    const loggingCashCell =
      PayTrackerUtils.cellReference(
        startRow + 4,
        valueColumn
      );

    const taxableTableTotalReferences =
      getConfiguredPayTables_()
        .filter(
          function (table) {
            return table.taxable;
          }
        )
        .map(
          function (table) {
            return PayTrackerUtils
              .cellReference(
                startRow +
                  PayTrackerConfig.SHEET
                    .WEEK_TOTAL_ROW_OFFSET,
                table.startColumn + 4
              );
          }
        );

    const loggingTable =
      getConfiguredPayTableByName_(
        'Logging Cash'
      );

    if (!loggingTable) {
      throw new Error(
        'Logging Cash table configuration was not found.'
      );
    }

    const loggingTableTotalReference =
      PayTrackerUtils.cellReference(
        startRow +
          PayTrackerConfig.SHEET
            .WEEK_TOTAL_ROW_OFFSET,
        loggingTable.startColumn + 4
      );

    sheet
      .getRange(
        startRow + 1,
        valueColumn
      )
      .setFormula(
        PayTrackerUtils.buildSumFormula(
          taxableTableTotalReferences
        )
      );

    sheet
      .getRange(
        startRow + 2,
        valueColumn
      )
      .setFormula(
        PayTrackerSummaryService
          .buildDeductionFormula(
            taxableGrossCell
          )
      );

    sheet
      .getRange(
        startRow + 3,
        valueColumn
      )
      .setFormula(
        '=' +
        taxableGrossCell +
        '-' +
        deductionsCell
      );

    sheet
      .getRange(
        startRow + 4,
        valueColumn
      )
      .setFormula(
        '=' +
        loggingTableTotalReference
      );

    sheet
      .getRange(
        startRow + 5,
        valueColumn
      )
      .setFormula(
        '=' +
        stafflineTakeHomeCell +
        '+' +
        loggingCashCell
      );

    sheet
      .getRange(
        startRow + 1,
        valueColumn,
        PayTrackerConfig.SUMMARY
          .LABELS.length,
        1
      )
      .setNumberFormat(
        PayTrackerConfig.FORMATS.CURRENCY
      )
      .setFontWeight('bold')
      .setHorizontalAlignment('right');

    PayTrackerSummaryService
      .applyWeeklySummaryStyles(
        sheet,
        startRow
      );

    sheet.setRowHeights(
      startRow + 1,
      PayTrackerConfig.SUMMARY
        .LABELS.length,
      24
    );
  },


  /**
   * Builds the tiered estimated-deductions formula.
   *
   * Current configured tiers:
   * - Below £600: 16%
   * - Below £800: 20%
   * - Below £1,100: 27%
   * - £1,100 and above: 30%
   *
   * The formula is generated from Config.gs rather than
   * being hard-coded into the weekly summary function.
   *
   * @param {string} grossCellReference
   * @return {string}
   */
  buildDeductionFormula: function (
    grossCellReference
  ) {
    const grossCell = String(
      grossCellReference || ''
    ).trim();

    if (grossCell === '') {
      throw new Error(
        'A gross cell reference is required.'
      );
    }

    const tiers =
      PayTrackerConfig.DEDUCTION_TIERS;

    if (
      !Array.isArray(tiers) ||
      tiers.length === 0
    ) {
      return '=0';
    }

    function buildTierFormula(
      tierIndex
    ) {
      const tier =
        tiers[tierIndex];

      const rate =
        Number(tier.rate);

      if (
        !Number.isFinite(rate)
      ) {
        throw new Error(
          'Invalid deduction rate at tier ' +
          (tierIndex + 1) +
          '.'
        );
      }

      const calculation =
        grossCell +
        '*' +
        rate;

      const isFinalTier =
        tierIndex ===
        tiers.length - 1;

      const hasNoMaximum =
        tier.maximumGross === null ||
        tier.maximumGross === undefined;

      if (
        isFinalTier ||
        hasNoMaximum
      ) {
        return calculation;
      }

      const maximumGross =
        Number(tier.maximumGross);

      if (
        !Number.isFinite(
          maximumGross
        )
      ) {
        throw new Error(
          'Invalid maximum gross at deduction tier ' +
          (tierIndex + 1) +
          '.'
        );
      }

      return (
        'IF(' +
        grossCell +
        '<' +
        maximumGross +
        ',' +
        calculation +
        ',' +
        buildTierFormula(
          tierIndex + 1
        ) +
        ')'
      );
    }

    return (
      '=' +
      buildTierFormula(0)
    );
  },


  /**
   * Applies formatting to one weekly summary card.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} weekStartRow
   */
  applyWeeklySummaryStyles: function (
    sheet,
    weekStartRow
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const startRow =
      PayTrackerUtils.requirePositiveInteger(
        weekStartRow,
        'weekStartRow'
      );

    const labelColumn =
      PayTrackerConfig.SHEET
        .WEEKLY_SUMMARY_LABEL_COLUMN;

    const styles =
      PayTrackerConfig.SUMMARY.STYLES;

    sheet
      .getRange(
        startRow + 1,
        labelColumn,
        PayTrackerConfig.SUMMARY
          .LABELS.length,
        2
      )
      .setBackground(
        styles.CARD.background
      )
      .setBorder(
        true,
        true,
        true,
        true,
        true,
        true,
        styles.CARD.border,
        SpreadsheetApp
          .BorderStyle.SOLID
      );

    PayTrackerSummaryService
      .applySummaryRowStyle(
        sheet,
        startRow + 1,
        labelColumn,
        styles.GROSS
      );

    PayTrackerSummaryService
      .applySummaryRowStyle(
        sheet,
        startRow + 2,
        labelColumn,
        styles.DEDUCTIONS
      );

    PayTrackerSummaryService
      .applySummaryRowStyle(
        sheet,
        startRow + 3,
        labelColumn,
        styles.TAKE_HOME
      );

    PayTrackerSummaryService
      .applySummaryRowStyle(
        sheet,
        startRow + 4,
        labelColumn,
        styles.CASH
      );

    sheet
      .getRange(
        startRow + 5,
        labelColumn,
        1,
        2
      )
      .setBackground(
        styles.TOTAL.background
      )
      .setFontColor(
        styles.TOTAL.font
      )
      .setFontWeight('bold')
      .setFontSize(11);
  },


  /**
   * Applies a background and font colour to one summary row.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} row
   * @param {number} column
   * @param {Object} style
   */
  applySummaryRowStyle: function (
    sheet,
    row,
    column,
    style
  ) {
    sheet
      .getRange(
        row,
        column,
        1,
        2
      )
      .setBackground(
        style.background
      )
      .setFontColor(
        style.font
      );
  },


  /**
   * Builds or rebuilds the running totals card.
   *
   * The running totals include every existing week.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet=} optionalSheet
   */
  buildRunningTotals: function (
    optionalSheet
  ) {
    const sheet =
      optionalSheet ||
      PayTrackerUtils.getPaySheet();

    PayTrackerUtils.validateSheet(
      sheet
    );

    const titleRange =
      sheet.getRange('AC1:AD1');

    const labelRange =
      sheet.getRange('AC2:AC6');

    const valueRange =
      sheet.getRange('AD2:AD6');

    const fullRange =
      sheet.getRange('AC1:AD6');

    titleRange.breakApart();

    fullRange
      .clearFormat()
      .setVerticalAlignment('middle');

    const totalStyle =
      PayTrackerConfig.SUMMARY
        .STYLES.TOTAL;

    titleRange
      .merge()
      .setValue(
        'RUNNING PAY TOTALS'
      )
      .setBackground(
        totalStyle.background
      )
      .setFontColor(
        totalStyle.font
      )
      .setFontWeight('bold')
      .setFontSize(12)
      .setHorizontalAlignment(
        'center'
      );

    labelRange
      .setValues(
        PayTrackerConfig.SUMMARY
          .LABELS.map(
            function (label) {
              return [label];
            }
          )
      )
      .setFontWeight('bold')
      .setFontSize(10);

    const existingWeeks =
      PayTrackerUtils.getExistingWeekCount(
        sheet
      );

    const taxableGrossReferences = [];
    const deductionReferences = [];
    const stafflineTakeHomeReferences = [];
    const loggingCashReferences = [];
    const totalTakeHomeReferences = [];

    for (
      let weekNumber = 1;
      weekNumber <= existingWeeks;
      weekNumber++
    ) {
      const startRow =
        PayTrackerUtils.getWeekStartRow(
          weekNumber
        );

      taxableGrossReferences.push(
        PayTrackerUtils.cellReference(
          startRow + 1,
          PayTrackerConfig.SHEET
            .WEEKLY_SUMMARY_VALUE_COLUMN
        )
      );

      deductionReferences.push(
        PayTrackerUtils.cellReference(
          startRow + 2,
          PayTrackerConfig.SHEET
            .WEEKLY_SUMMARY_VALUE_COLUMN
        )
      );

      stafflineTakeHomeReferences.push(
        PayTrackerUtils.cellReference(
          startRow + 3,
          PayTrackerConfig.SHEET
            .WEEKLY_SUMMARY_VALUE_COLUMN
        )
      );

      loggingCashReferences.push(
        PayTrackerUtils.cellReference(
          startRow + 4,
          PayTrackerConfig.SHEET
            .WEEKLY_SUMMARY_VALUE_COLUMN
        )
      );

      totalTakeHomeReferences.push(
        PayTrackerUtils.cellReference(
          startRow + 5,
          PayTrackerConfig.SHEET
            .WEEKLY_SUMMARY_VALUE_COLUMN
        )
      );
    }

    sheet
      .getRange('AD2')
      .setFormula(
        PayTrackerUtils.buildSumFormula(
          taxableGrossReferences
        )
      );

    sheet
      .getRange('AD3')
      .setFormula(
        PayTrackerUtils.buildSumFormula(
          deductionReferences
        )
      );

    sheet
      .getRange('AD4')
      .setFormula(
        PayTrackerUtils.buildSumFormula(
          stafflineTakeHomeReferences
        )
      );

    sheet
      .getRange('AD5')
      .setFormula(
        PayTrackerUtils.buildSumFormula(
          loggingCashReferences
        )
      );

    sheet
      .getRange('AD6')
      .setFormula(
        PayTrackerUtils.buildSumFormula(
          totalTakeHomeReferences
        )
      );

    valueRange
      .setNumberFormat(
        PayTrackerConfig.FORMATS.CURRENCY
      )
      .setFontWeight('bold')
      .setHorizontalAlignment('right');

    PayTrackerSummaryService
      .applyRunningTotalsStyles(
        sheet
      );

    PayTrackerSummaryService
      .applySummaryColumnWidths(
        sheet
      );

    sheet.setRowHeight(
      1,
      30
    );

    sheet.setRowHeights(
      2,
      PayTrackerConfig.SUMMARY
        .LABELS.length,
      26
    );
  },


  /**
   * Applies styles to the running totals card.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  applyRunningTotalsStyles: function (
    sheet
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const styles =
      PayTrackerConfig.SUMMARY.STYLES;

    sheet
      .getRange('AC2:AD6')
      .setBackground(
        styles.CARD.background
      )
      .setBorder(
        true,
        true,
        true,
        true,
        true,
        true,
        '#64748b',
        SpreadsheetApp
          .BorderStyle.SOLID
      );

    sheet
      .getRange('AC2:AD2')
      .setBackground(
        styles.GROSS.background
      )
      .setFontColor(
        styles.GROSS.font
      );

    sheet
      .getRange('AC3:AD3')
      .setBackground(
        styles.DEDUCTIONS.background
      )
      .setFontColor(
        styles.DEDUCTIONS.font
      );

    sheet
      .getRange('AC4:AD4')
      .setBackground(
        styles.TAKE_HOME.background
      )
      .setFontColor(
        styles.TAKE_HOME.font
      );

    sheet
      .getRange('AC5:AD5')
      .setBackground(
        styles.CASH.background
      )
      .setFontColor(
        styles.CASH.font
      );

    sheet
      .getRange('AC6:AD6')
      .setBackground(
        styles.TOTAL.background
      )
      .setFontColor(
        styles.TOTAL.font
      )
      .setFontWeight('bold')
      .setFontSize(12);
  },


  /**
   * Applies the standard summary column widths.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  applySummaryColumnWidths: function (
    sheet
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    sheet.setColumnWidth(
      PayTrackerConfig.SHEET
        .WEEKLY_SUMMARY_LABEL_COLUMN,
      PayTrackerConfig.COLUMN_WIDTHS
        .WEEKLY_SUMMARY_LABEL
    );

    sheet.setColumnWidth(
      PayTrackerConfig.SHEET
        .WEEKLY_SUMMARY_VALUE_COLUMN,
      PayTrackerConfig.COLUMN_WIDTHS
        .WEEKLY_SUMMARY_VALUE
    );

    sheet.setColumnWidth(
      PayTrackerConfig.SHEET
        .RUNNING_TOTAL_LABEL_COLUMN,
      PayTrackerConfig.COLUMN_WIDTHS
        .RUNNING_TOTAL_LABEL
    );

    sheet.setColumnWidth(
      PayTrackerConfig.SHEET
        .RUNNING_TOTAL_VALUE_COLUMN,
      PayTrackerConfig.COLUMN_WIDTHS
        .RUNNING_TOTAL_VALUE
    );
  },


  /**
   * Rebuilds weekly summaries for all existing weeks.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet=} optionalSheet
   * @return {number} Number of rebuilt weeks.
   */
  rebuildAllWeeklySummaries: function (
    optionalSheet
  ) {
    const sheet =
      optionalSheet ||
      PayTrackerUtils.getPaySheet();

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

      PayTrackerSummaryService
        .buildWeeklySummary(
          sheet,
          startRow
        );
    }

    return existingWeeks;
  },


  /**
   * Rebuilds weekly summaries and running totals.
   *
   * Shift, hours, date and pay data are not cleared.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet=} optionalSheet
   * @return {number} Number of rebuilt weekly summaries.
   */
  refreshAllSummaries: function (
    optionalSheet
  ) {
    const sheet =
      optionalSheet ||
      PayTrackerUtils.getPaySheet();

    const rebuiltWeeks =
      PayTrackerSummaryService
        .rebuildAllWeeklySummaries(
          sheet
        );

    PayTrackerSummaryService
      .buildRunningTotals(
        sheet
      );

    SpreadsheetApp.flush();

    return rebuiltWeeks;
  },


  /**
   * Creates a complete week including its weekly summary,
   * then refreshes the running totals.
   *
   * This method will be used by the final Main.gs entrypoints.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} weekNumber
   */
  createCompleteWeek: function (
    sheet,
    weekNumber
  ) {
    PayTrackerWeekManager.createWeek(
      sheet,
      weekNumber
    );

    const startRow =
      PayTrackerUtils.getWeekStartRow(
        weekNumber
      );

    PayTrackerSummaryService
      .buildWeeklySummary(
        sheet,
        startRow
      );

    PayTrackerSummaryService
      .buildRunningTotals(
        sheet
      );
  },


  /**
   * Adds the next complete week with summary panels.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet=} optionalSheet
   * @return {number} New week number.
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

    PayTrackerSummaryService
      .createCompleteWeek(
        sheet,
        nextWeekNumber
      );

    SpreadsheetApp.flush();

    return nextWeekNumber;
  },


  /**
   * Ensures a requested week exists with complete summary
   * panels for every created week.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} requiredWeekNumber
   * @return {number[]} Created week numbers.
   */
  ensureCompleteWeekExists: function (
    sheet,
    requiredWeekNumber
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const requestedWeek =
      PayTrackerUtils.requirePositiveInteger(
        requiredWeekNumber,
        'requiredWeekNumber'
      );

    const existingWeeks =
      PayTrackerUtils.getExistingWeekCount(
        sheet
      );

    if (
      existingWeeks >= requestedWeek
    ) {
      return [];
    }

    PayTrackerUtils.ensureRowCapacity(
      sheet,
      requestedWeek
    );

    const createdWeeks = [];

    for (
      let weekNumber = existingWeeks + 1;
      weekNumber <= requestedWeek;
      weekNumber++
    ) {
      PayTrackerWeekManager.createWeek(
        sheet,
        weekNumber
      );

      PayTrackerSummaryService
        .buildWeeklySummary(
          sheet,
          PayTrackerUtils.getWeekStartRow(
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

    SpreadsheetApp.flush();

    return createdWeeks;
  }
});


/**
 * Temporary modular wrapper for refreshing all summaries.
 *
 * The final public menu function will be connected through
 * Main.gs after the original script is retired.
 */
function payTrackerRefreshSummaries_() {
  PayTrackerUtils.withDocumentLock(
    function () {
      const rebuiltWeeks =
        PayTrackerSummaryService
          .refreshAllSummaries();

      PayTrackerUtils.showMessage(
        'Summary Panels Updated',
        rebuiltWeeks +
        ' weekly summaries and the running totals were rebuilt. No shift data was cleared.'
      );
    }
  );
}


/**
 * Temporary modular wrapper for adding the next complete
 * week with its summary panel.
 */
function payTrackerAddNextCompleteWeek_() {
  PayTrackerUtils.withDocumentLock(
    function () {
      const weekNumber =
        PayTrackerSummaryService
          .addNextCompleteWeek();

      PayTrackerUtils.showMessage(
        'Week Added',
        'Week ' +
        weekNumber +
        ' was added with its summary panel.'
      );
    }
  );
}