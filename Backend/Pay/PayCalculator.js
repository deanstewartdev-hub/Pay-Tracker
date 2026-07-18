/*******************************************************
 * PAY TRACKER V2.1
 * PayCalculator.gs
 *
 * Handles:
 * - Pay calculation rules
 * - Dynamic hours
 * - Manual shift edits
 * - Multi-cell paste handling
 * - Pay-cell updates
 *
 * This file depends on:
 * - Config.gs
 * - Utilities.gs
 *******************************************************/

const PayTrackerPayCalculator = Object.freeze({
  /**
   * Calculates pay for a shift.
   *
   * Behaviour:
   * - When valid hours are entered and the shift has an
   *   hourly rate, pay is calculated from hours × rate.
   * - When no hours are entered, the configured fixed amount
   *   is used.
   * - When a shift has no hourly rate, its fixed amount is
   *   always used.
   *
   * @param {string} tableName
   * @param {string} shiftType
   * @param {*} hours
   * @return {number}
   */
  calculatePay: function (
    tableName,
    shiftType,
    hours
  ) {
    const normalisedTableName = String(
      tableName || ''
    ).trim();

    const normalisedShiftType = String(
      shiftType || ''
    ).trim();

    const tableRules =
      getConfiguredPayRules_(
        normalisedTableName
      );

    if (
      !tableRules ||
      !tableRules[normalisedShiftType]
    ) {
      return 0;
    }

    const rule =
      tableRules[normalisedShiftType];

    const hasHours =
      PayTrackerUtils.hasNumericHours(
        hours
      );

    const hasHourlyRate =
      rule.hourlyRate !== null &&
      rule.hourlyRate !== undefined &&
      Number.isFinite(
        Number(rule.hourlyRate)
      );

    if (
      hasHours &&
      hasHourlyRate
    ) {
      return PayTrackerUtils.roundCurrency(
        Number(hours) *
        Number(rule.hourlyRate)
      );
    }

    return PayTrackerUtils.roundCurrency(
      Number(rule.fixedAmount || 0)
    );
  },


  /**
   * Recalculates one table row.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {string} tableName
   * @param {number} row
   */
  updatePayForRow: function (
    sheet,
    tableName,
    row
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const table =
      getConfiguredPayTableByName_(
        tableName
      );

    if (!table) {
      return;
    }

    const rowNumber =
      Number(row);

    if (
      !PayTrackerUtils.isWeekDataRow(
        rowNumber
      )
    ) {
      return;
    }

    const shiftColumn =
      table.startColumn + 2;

    const hoursColumn =
      table.startColumn + 3;

    const payColumn =
      table.startColumn + 4;

    const rowValues = sheet
      .getRange(
        rowNumber,
        shiftColumn,
        1,
        2
      )
      .getValues()[0];

    const selectedShift = String(
      rowValues[0] || ''
    ).trim();

    const hoursValue =
      rowValues[1];

    const payCell = sheet.getRange(
      rowNumber,
      payColumn
    );

    if (
      selectedShift === '' ||
      !PayTrackerPayCalculator
        .isConfiguredShift(
          table.name,
          selectedShift
        )
    ) {
      payCell.clearContent();
      return;
    }

    const pay =
      PayTrackerPayCalculator
        .calculatePay(
          table.name,
          selectedShift,
          hoursValue
        );

    payCell
      .setValue(pay)
      .setNumberFormat(
        PayTrackerConfig.FORMATS.CURRENCY
      );
  },


  /**
   * Recalculates every pay row in one weekly table.
   *
   * Useful after configuration or rate changes.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {string} tableName
   * @param {number} weekStartRow
   */
  recalculateWeeklyTable: function (
    sheet,
    tableName,
    weekStartRow
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const table =
      getConfiguredPayTableByName_(
        tableName
      );

    if (!table) {
      throw new Error(
        'Unknown pay table: ' +
        tableName
      );
    }

    const startRow =
      PayTrackerUtils.requirePositiveInteger(
        weekStartRow,
        'weekStartRow'
      );

    const firstDataRow =
      startRow +
      PayTrackerConfig.SHEET
        .WEEK_DATA_ROW_OFFSET;

    const shiftColumn =
      table.startColumn + 2;

    const hoursColumn =
      table.startColumn + 3;

    const payColumn =
      table.startColumn + 4;

    const dataRowCount =
      PayTrackerConfig.SHEET
        .WEEK_DATA_ROW_COUNT;

    const shiftAndHours = sheet
      .getRange(
        firstDataRow,
        shiftColumn,
        dataRowCount,
        2
      )
      .getValues();

    const payValues =
      shiftAndHours.map(
        function (rowValues) {
          const shiftType = String(
            rowValues[0] || ''
          ).trim();

          const hours =
            rowValues[1];

          if (
            shiftType === '' ||
            !PayTrackerPayCalculator
              .isConfiguredShift(
                table.name,
                shiftType
              )
          ) {
            return [''];
          }

          return [
            PayTrackerPayCalculator
              .calculatePay(
                table.name,
                shiftType,
                hours
              )
          ];
        }
      );

    sheet
      .getRange(
        firstDataRow,
        payColumn,
        dataRowCount,
        1
      )
      .setValues(payValues)
      .setNumberFormat(
        PayTrackerConfig.FORMATS.CURRENCY
      );
  },


  /**
   * Recalculates every existing shift in PaySheet.
   *
   * This does not modify:
   * - Shift selections
   * - Hours
   * - Dates
   * - Day names
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet=} optionalSheet
   */
  recalculateAllPay: function (
    optionalSheet
  ) {
    const sheet =
      optionalSheet ||
      PayTrackerUtils.getPaySheet();

    PayTrackerUtils.validateSheet(
      sheet
    );

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
      const weekStartRow =
        PayTrackerUtils.getWeekStartRow(
          weekNumber
        );

      tables.forEach(
        function (table) {
          PayTrackerPayCalculator
            .recalculateWeeklyTable(
              sheet,
              table.name,
              weekStartRow
            );
        }
      );
    }

    SpreadsheetApp.flush();
  },


  /**
   * Returns true when a shift exists in the configured
   * dropdown list and pay rules.
   *
   * @param {string} tableName
   * @param {string} shiftType
   * @return {boolean}
   */
  isConfiguredShift: function (
    tableName,
    shiftType
  ) {
    const table =
      getConfiguredPayTableByName_(
        tableName
      );

    if (!table) {
      return false;
    }

    const normalisedShift = String(
      shiftType || ''
    ).trim();

    if (normalisedShift === '') {
      return false;
    }

    const shiftExistsInDropdown =
      table.shifts.indexOf(
        normalisedShift
      ) !== -1;

    const rules =
      getConfiguredPayRules_(
        table.name
      );

    const shiftHasPayRule =
      Boolean(
        rules &&
        rules[normalisedShift]
      );

    return (
      shiftExistsInDropdown &&
      shiftHasPayRule
    );
  },


  /**
   * Returns the configured hourly rate.
   *
   * Returns null when:
   * - The table is not configured
   * - The shift is not configured
   * - The shift is fixed-rate only
   *
   * @param {string} tableName
   * @param {string} shiftType
   * @return {number|null}
   */
  getHourlyRate: function (
    tableName,
    shiftType
  ) {
    const rules =
      getConfiguredPayRules_(
        tableName
      );

    const normalisedShift = String(
      shiftType || ''
    ).trim();

    if (
      !rules ||
      !rules[normalisedShift]
    ) {
      return null;
    }

    const rate =
      rules[normalisedShift]
        .hourlyRate;

    if (
      rate === null ||
      rate === undefined ||
      !Number.isFinite(
        Number(rate)
      )
    ) {
      return null;
    }

    return Number(rate);
  },


  /**
   * Returns the configured fixed amount.
   *
   * @param {string} tableName
   * @param {string} shiftType
   * @return {number|null}
   */
  getFixedAmount: function (
    tableName,
    shiftType
  ) {
    const rules =
      getConfiguredPayRules_(
        tableName
      );

    const normalisedShift = String(
      shiftType || ''
    ).trim();

    if (
      !rules ||
      !rules[normalisedShift]
    ) {
      return null;
    }

    const amount =
      Number(
        rules[normalisedShift]
          .fixedAmount
      );

    if (!Number.isFinite(amount)) {
      return null;
    }

    return amount;
  },


  /**
   * Determines which table and rows were affected by an
   * edit event.
   *
   * Supports:
   * - Single-cell edits
   * - Multi-row pastes
   * - Multi-column pastes
   *
   * @param {GoogleAppsScript.Events.SheetsOnEdit} event
   * @return {Object[]}
   */
  getAffectedPayRows: function (
    event
  ) {
    if (
      !event ||
      !event.range
    ) {
      return [];
    }

    const editedFirstRow =
      event.range.getRow();

    const editedLastRow =
      event.range.getLastRow();

    const editedFirstColumn =
      event.range.getColumn();

    const editedLastColumn =
      event.range.getLastColumn();

    const affectedRows = [];
    const rowKeys = {};

    getConfiguredPayTables_().forEach(
      function (table) {
        const shiftColumn =
          table.startColumn + 2;

        const hoursColumn =
          table.startColumn + 3;

        const shiftColumnEdited =
          shiftColumn >=
            editedFirstColumn &&
          shiftColumn <=
            editedLastColumn;

        const hoursColumnEdited =
          hoursColumn >=
            editedFirstColumn &&
          hoursColumn <=
            editedLastColumn;

        if (
          !shiftColumnEdited &&
          !hoursColumnEdited
        ) {
          return;
        }

        for (
          let row = editedFirstRow;
          row <= editedLastRow;
          row++
        ) {
          if (
            !PayTrackerUtils
              .isWeekDataRow(row)
          ) {
            continue;
          }

          const key =
            table.name +
            '|' +
            row;

          if (rowKeys[key]) {
            continue;
          }

          rowKeys[key] = true;

          affectedRows.push({
            tableName: table.name,
            row: row
          });
        }
      }
    );

    return affectedRows;
  },


  /**
   * Processes a spreadsheet edit event.
   *
   * @param {GoogleAppsScript.Events.SheetsOnEdit} event
   */
  handleEdit: function (event) {
    if (
      !event ||
      !event.range
    ) {
      return;
    }

    const sheet =
      event.range.getSheet();

    if (
      sheet.getName() !==
      PayTrackerConfig.SHEET.NAME
    ) {
      return;
    }

    const affectedRows =
      PayTrackerPayCalculator
        .getAffectedPayRows(event);

    affectedRows.forEach(
      function (affectedRow) {
        PayTrackerPayCalculator
          .updatePayForRow(
            sheet,
            affectedRow.tableName,
            affectedRow.row
          );
      }
    );
  }
});


/**
 * Temporary modular edit trigger.
 *
 * IMPORTANT:
 * The original large script already contains an onEdit
 * function. Apps Script must only have one final onEdit
 * entrypoint.
 *
 * For now, this function has a different name so it does not
 * conflict with the working tracker.
 *
 * It will be connected through Main.gs near the end of the
 * refactor.
 *
 * @param {GoogleAppsScript.Events.SheetsOnEdit} event
 */
function payTrackerHandleEdit_(event) {
  PayTrackerPayCalculator.handleEdit(
    event
  );
}


/**
 * Manual test function.
 *
 * This recalculates all existing Pay cells without changing
 * shift selections or hours.
 *
 * Do not run this while you are still testing the modular
 * files unless you have already created a backup.
 */
function testRecalculateAllPay_() {
  PayTrackerUtils.withDocumentLock(
    function () {
      PayTrackerPayCalculator
        .recalculateAllPay();

      PayTrackerUtils.showMessage(
        'Pay Recalculation Complete',
        'All existing shift pay values were recalculated.'
      );
    }
  );
}