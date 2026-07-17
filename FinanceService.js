/*******************************************************
 * PAY TRACKER V2.4
 * FinanceService.gs
 *
 * Handles:
 * - Finance sheet setup
 * - Bill calculations
 * - Debt calculations
 * - Debt percentage progress
 * - Finance row edits
 * - Frequency conversions
 *******************************************************/

const PayTrackerFinanceService = Object.freeze({
  /**
   * Creates or upgrades every finance sheet.
   *
   * Existing rows are preserved.
   *
   * @return {Object}
   */
  setupFinanceModule: function () {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    if (!spreadsheet) {
      throw new Error(
        'No active spreadsheet is available.'
      );
    }

    const billsSheet =
      PayTrackerFinanceService.getOrCreateSheet(
        spreadsheet,
        PayTrackerFinanceConfig.SHEETS.BILLS
      );

    const debtsSheet =
      PayTrackerFinanceService.getOrCreateSheet(
        spreadsheet,
        PayTrackerFinanceConfig.SHEETS.DEBTS
      );

    const paymentsSheet =
      PayTrackerFinanceService.getOrCreateSheet(
        spreadsheet,
        PayTrackerFinanceConfig.SHEETS.PAYMENTS
      );

    const historySheet =
      PayTrackerFinanceService.getOrCreateSheet(
        spreadsheet,
        PayTrackerFinanceConfig.SHEETS.PAYMENT_HISTORY
      );

    PayTrackerFinanceService.buildBillsSheet(
      billsSheet
    );

    PayTrackerFinanceService.buildDebtsSheet(
      debtsSheet
    );

    PayTrackerPaymentService.buildPaymentsSheet(
      paymentsSheet
    );

    PayTrackerPaymentService.buildPaymentHistorySheet(
      historySheet
    );

    PayTrackerFinanceService.recalculateAllFinanceRows();

    PayTrackerPaymentService.syncUpcomingPayments();

    return {
      billsSheet: billsSheet.getName(),
      debtsSheet: debtsSheet.getName(),
      paymentsSheet: paymentsSheet.getName(),
      paymentHistorySheet: historySheet.getName()
    };
  },


  /**
   * Returns an existing sheet or creates a new one.
   *
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet
   * @param {string} sheetName
   * @return {GoogleAppsScript.Spreadsheet.Sheet}
   */
  getOrCreateSheet: function (
    spreadsheet,
    sheetName
  ) {
    let sheet =
      spreadsheet.getSheetByName(
        sheetName
      );

    if (!sheet) {
      sheet =
        spreadsheet.insertSheet(
          sheetName
        );
    }

    return sheet;
  },


  /**
   * Builds and formats the Bills tab.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  buildBillsSheet: function (
    sheet
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const headers =
      PayTrackerFinanceConfig.BILLS.HEADERS;

    PayTrackerFinanceService.ensureSheetColumns(
      sheet,
      headers.length
    );

    sheet
      .getRange(
        1,
        1,
        1,
        headers.length
      )
      .setValues([headers])
      .setBackground('#0f172a')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');

    sheet.setFrozenRows(1);
    sheet.setTabColor('#2563eb');

    const rowCount =
      Math.max(
        sheet.getMaxRows() - 1,
        1
      );

    const categoryValidation =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          PayTrackerFinanceConfig.BILL_CATEGORIES,
          true
        )
        .setAllowInvalid(false)
        .build();

    const frequencyValidation =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          PayTrackerFinanceConfig.BILL_FREQUENCIES,
          true
        )
        .setAllowInvalid(false)
        .build();

    const activeValidation =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          PayTrackerFinanceConfig.ACTIVE_VALUES,
          true
        )
        .setAllowInvalid(false)
        .build();

    sheet
      .getRange(
        2,
        PayTrackerFinanceConfig.BILLS.COLUMNS.CATEGORY,
        rowCount,
        1
      )
      .setDataValidation(
        categoryValidation
      );

    sheet
      .getRange(
        2,
        PayTrackerFinanceConfig.BILLS.COLUMNS.FREQUENCY,
        rowCount,
        1
      )
      .setDataValidation(
        frequencyValidation
      );

    sheet
      .getRange(
        2,
        PayTrackerFinanceConfig.BILLS.COLUMNS.ACTIVE,
        rowCount,
        1
      )
      .setDataValidation(
        activeValidation
      );

    sheet
      .getRange(
        2,
        PayTrackerFinanceConfig.BILLS.COLUMNS.AMOUNT,
        rowCount,
        1
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.CURRENCY
      );

    sheet
      .getRange(
        2,
        PayTrackerFinanceConfig.BILLS.COLUMNS.WEEKLY_COST,
        rowCount,
        2
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.CURRENCY
      );

    sheet
      .getRange(
        2,
        PayTrackerFinanceConfig.BILLS.COLUMNS.NEXT_DUE_DATE,
        rowCount,
        1
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.DATE
      );

    const widths = [
      135,
      210,
      135,
      105,
      125,
      120,
      85,
      110,
      115,
      270
    ];

    widths.forEach(
      function (
        width,
        index
      ) {
        sheet.setColumnWidth(
          index + 1,
          width
        );
      }
    );
  },


  /**
   * Builds and formats the Debts tab.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  buildDebtsSheet: function (
    sheet
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const headers =
      PayTrackerFinanceConfig.DEBTS.HEADERS;

    PayTrackerFinanceService.ensureSheetColumns(
      sheet,
      headers.length
    );

    sheet
      .getRange(
        1,
        1,
        1,
        headers.length
      )
      .setValues([headers])
      .setBackground('#7c2d12')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');

    sheet.setFrozenRows(1);
    sheet.setTabColor('#dc2626');

    const rowCount =
      Math.max(
        sheet.getMaxRows() - 1,
        1
      );

    const typeValidation =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          PayTrackerFinanceConfig.DEBT_TYPES,
          true
        )
        .setAllowInvalid(false)
        .build();

    const frequencyValidation =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          PayTrackerFinanceConfig.DEBT_FREQUENCIES,
          true
        )
        .setAllowInvalid(false)
        .build();

    const activeValidation =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          PayTrackerFinanceConfig.ACTIVE_VALUES,
          true
        )
        .setAllowInvalid(false)
        .build();

    sheet
      .getRange(
        2,
        PayTrackerFinanceConfig.DEBTS.COLUMNS.TYPE,
        rowCount,
        1
      )
      .setDataValidation(
        typeValidation
      );

    sheet
      .getRange(
        2,
        PayTrackerFinanceConfig.DEBTS.COLUMNS.FREQUENCY,
        rowCount,
        1
      )
      .setDataValidation(
        frequencyValidation
      );

    sheet
      .getRange(
        2,
        PayTrackerFinanceConfig.DEBTS.COLUMNS.ACTIVE,
        rowCount,
        1
      )
      .setDataValidation(
        activeValidation
      );

    const currencyColumns = [
      PayTrackerFinanceConfig.DEBTS.COLUMNS.ORIGINAL_AMOUNT,
      PayTrackerFinanceConfig.DEBTS.COLUMNS.CURRENT_BALANCE,
      PayTrackerFinanceConfig.DEBTS.COLUMNS.REPAYMENT_AMOUNT,
      PayTrackerFinanceConfig.DEBTS.COLUMNS.MONTHLY_REPAYMENT,
      PayTrackerFinanceConfig.DEBTS.COLUMNS.INTEREST_REMAINING,
      PayTrackerFinanceConfig.DEBTS.COLUMNS.AMOUNT_REPAID
    ];

    currencyColumns.forEach(
      function (column) {
        sheet
          .getRange(
            2,
            column,
            rowCount,
            1
          )
          .setNumberFormat(
            PayTrackerFinanceConfig.FORMATS.CURRENCY
          );
      }
    );

    sheet
      .getRange(
        2,
        PayTrackerFinanceConfig.DEBTS.COLUMNS.APR,
        rowCount,
        1
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.APR_NUMBER
      );

    sheet
      .getRange(
        2,
        PayTrackerFinanceConfig.DEBTS.COLUMNS.PERCENTAGE_REPAID,
        rowCount,
        1
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.PERCENTAGE
      );

    sheet
      .getRange(
        2,
        PayTrackerFinanceConfig.DEBTS.COLUMNS.MONTHS_LEFT,
        rowCount,
        1
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.INTEGER
      );

    [
      PayTrackerFinanceConfig.DEBTS.COLUMNS.START_DATE,
      PayTrackerFinanceConfig.DEBTS.COLUMNS.NEXT_PAYMENT_DATE,
      PayTrackerFinanceConfig.DEBTS.COLUMNS.PAYOFF_DATE
    ].forEach(
      function (column) {
        sheet
          .getRange(
            2,
            column,
            rowCount,
            1
          )
          .setNumberFormat(
            PayTrackerFinanceConfig.FORMATS.DATE
          );
      }
    );

    const widths = [
      135,
      205,
      140,
      120,
      120,
      85,
      120,
      115,
      115,
      125,
      85,
      130,
      125,
      130,
      150,
      260,
      120,
      125,
      190
    ];

    widths.forEach(
      function (
        width,
        index
      ) {
        sheet.setColumnWidth(
          index + 1,
          width
        );
      }
    );
  },


  /**
   * Handles edits made in Bills or Debts.
   *
   * @param {GoogleAppsScript.Events.SheetsOnEdit} event
   */
  handleEdit: function (
    event
  ) {
    if (
      !event ||
      !event.range
    ) {
      return;
    }

    const sheet =
      event.range.getSheet();

    const sheetName =
      sheet.getName();

    if (
      sheetName !==
        PayTrackerFinanceConfig.SHEETS.BILLS &&
      sheetName !==
        PayTrackerFinanceConfig.SHEETS.DEBTS
    ) {
      return;
    }

    const firstRow =
      Math.max(
        event.range.getRow(),
        PayTrackerFinanceConfig.FIRST_DATA_ROW
      );

    const lastRow =
      event.range.getLastRow();

    for (
      let row = firstRow;
      row <= lastRow;
      row++
    ) {
      if (
        sheetName ===
        PayTrackerFinanceConfig.SHEETS.BILLS
      ) {
        PayTrackerFinanceService.updateBillRow(
          sheet,
          row
        );
      }

      if (
        sheetName ===
        PayTrackerFinanceConfig.SHEETS.DEBTS
      ) {
        PayTrackerFinanceService.updateDebtRow(
          sheet,
          row
        );
      }
    }

    PayTrackerPaymentService.syncUpcomingPayments();

    PayTrackerFinanceDashboard.refresh();
  },


  /**
   * Recalculates one bill row.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} row
   */
  updateBillRow: function (
    sheet,
    row
  ) {
    if (
      row <
      PayTrackerFinanceConfig.FIRST_DATA_ROW
    ) {
      return;
    }

    const columns =
      PayTrackerFinanceConfig.BILLS.COLUMNS;

    const values =
      sheet
        .getRange(
          row,
          1,
          1,
          PayTrackerFinanceConfig.BILLS.HEADERS.length
        )
        .getValues()[0];

    const billName =
      String(
        values[
          columns.NAME - 1
        ] || ''
      ).trim();

    if (billName === '') {
      return;
    }

    let billId =
      String(
        values[
          columns.ID - 1
        ] || ''
      ).trim();

    if (billId === '') {
      billId =
        PayTrackerFinanceService.createFinanceId(
          'BILL'
        );

      sheet
        .getRange(
          row,
          columns.ID
        )
        .setValue(
          billId
        );
    }

    const amount =
      Number(
        values[
          columns.AMOUNT - 1
        ]
      ) || 0;

    const frequency =
      String(
        values[
          columns.FREQUENCY - 1
        ] || ''
      ).trim();

    const weeklyCost =
      PayTrackerFinanceService.convertToWeekly(
        amount,
        frequency
      );

    const monthlyCost =
      PayTrackerFinanceService.convertToMonthly(
        amount,
        frequency
      );

    sheet
      .getRange(
        row,
        columns.WEEKLY_COST,
        1,
        2
      )
      .setValues([[
        weeklyCost,
        monthlyCost
      ]])
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.CURRENCY
      );
  },


  /**
   * Recalculates one debt row.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} row
   */
  updateDebtRow: function (
    sheet,
    row
  ) {
    if (
      row <
      PayTrackerFinanceConfig.FIRST_DATA_ROW
    ) {
      return;
    }

    const columns =
      PayTrackerFinanceConfig.DEBTS.COLUMNS;

    const values =
      sheet
        .getRange(
          row,
          1,
          1,
          PayTrackerFinanceConfig.DEBTS.HEADERS.length
        )
        .getValues()[0];

    const debtName =
      String(
        values[
          columns.NAME - 1
        ] || ''
      ).trim();

    if (debtName === '') {
      return;
    }

    let debtId =
      String(
        values[
          columns.ID - 1
        ] || ''
      ).trim();

    if (debtId === '') {
      debtId =
        PayTrackerFinanceService.createFinanceId(
          'DEBT'
        );

      sheet
        .getRange(
          row,
          columns.ID
        )
        .setValue(
          debtId
        );
    }

    const originalAmount =
      Math.max(
        Number(
          values[
            columns.ORIGINAL_AMOUNT - 1
          ]
        ) || 0,
        0
      );

    const currentBalance =
      Math.max(
        Number(
          values[
            columns.CURRENT_BALANCE - 1
          ]
        ) || 0,
        0
      );

    const aprPercentage =
      Math.max(
        Number(
          values[
            columns.APR - 1
          ]
        ) || 0,
        0
      );

    const repaymentAmount =
      Math.max(
        Number(
          values[
            columns.REPAYMENT_AMOUNT - 1
          ]
        ) || 0,
        0
      );

    const frequency =
      String(
        values[
          columns.FREQUENCY - 1
        ] || ''
      ).trim();

    const monthlyRepayment =
      PayTrackerFinanceService.convertToMonthly(
        repaymentAmount,
        frequency
      );

    const estimate =
      PayTrackerFinanceService.calculateDebtEstimate(
        currentBalance,
        aprPercentage,
        monthlyRepayment
      );

    const amountRepaid =
      PayTrackerUtils.roundCurrency(
        Math.max(
          originalAmount -
          currentBalance,
          0
        )
      );

    const percentageRepaid =
      originalAmount > 0
        ? Math.min(
            amountRepaid /
            originalAmount,
            1
          )
        : 0;

    sheet
      .getRange(
        row,
        columns.MONTHLY_REPAYMENT
      )
      .setValue(
        monthlyRepayment
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.CURRENCY
      );

    sheet
      .getRange(
        row,
        columns.MONTHS_LEFT
      )
      .setValue(
        estimate.monthsLeft
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.INTEGER
      );

    if (estimate.payoffDate) {
      sheet
        .getRange(
          row,
          columns.PAYOFF_DATE
        )
        .setValue(
          estimate.payoffDate
        )
        .setNumberFormat(
          PayTrackerFinanceConfig.FORMATS.DATE
        );
    } else {
      sheet
        .getRange(
          row,
          columns.PAYOFF_DATE
        )
        .clearContent();
    }

    sheet
      .getRange(
        row,
        columns.INTEREST_REMAINING
      )
      .setValue(
        estimate.estimatedInterestRemaining
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.CURRENCY
      );

    sheet
      .getRange(
        row,
        columns.AMOUNT_REPAID
      )
      .setValue(
        amountRepaid
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.CURRENCY
      );

    sheet
      .getRange(
        row,
        columns.PERCENTAGE_REPAID
      )
      .setValue(
        percentageRepaid
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.PERCENTAGE
      );

    sheet
      .getRange(
        row,
        columns.PROGRESS_BAR
      )
      .setFormula(
        '=IF(' +
        PayTrackerUtils.cellReference(
          row,
          columns.NAME
        ) +
        '="","",' +
        'SPARKLINE(' +
        PayTrackerUtils.cellReference(
          row,
          columns.PERCENTAGE_REPAID
        ) +
        ',{"charttype","bar";"max",1;' +
        '"color1","#16a34a"}))'
      );
  },


  /**
   * Estimates remaining loan term and interest.
   *
   * @param {number} balance
   * @param {number} aprPercentage
   * @param {number} monthlyPayment
   * @return {Object}
   */
  calculateDebtEstimate: function (
    balance,
    aprPercentage,
    monthlyPayment
  ) {
    const debtBalance =
      Math.max(
        Number(balance) || 0,
        0
      );

    const payment =
      Math.max(
        Number(monthlyPayment) || 0,
        0
      );

    const annualRate =
      Math.max(
        Number(aprPercentage) || 0,
        0
      ) / 100;

    if (
      debtBalance <= 0 ||
      payment <= 0
    ) {
      return {
        monthsLeft: '',
        payoffDate: null,
        estimatedInterestRemaining: 0
      };
    }

    let monthsLeft;

    if (annualRate === 0) {
      monthsLeft =
        Math.ceil(
          debtBalance /
          payment
        );
    } else {
      const monthlyRate =
        annualRate / 12;

      const monthlyInterest =
        debtBalance *
        monthlyRate;

      if (
        payment <=
        monthlyInterest
      ) {
        return {
          monthsLeft: '',
          payoffDate: null,
          estimatedInterestRemaining: 0
        };
      }

      monthsLeft =
        Math.ceil(
          -Math.log(
            1 -
            (
              monthlyRate *
              debtBalance
            ) /
            payment
          ) /
          Math.log(
            1 +
            monthlyRate
          )
        );
    }

    if (
      !Number.isFinite(monthsLeft) ||
      monthsLeft < 1
    ) {
      return {
        monthsLeft: '',
        payoffDate: null,
        estimatedInterestRemaining: 0
      };
    }

    const payoffDate =
      new Date();

    payoffDate.setMonth(
      payoffDate.getMonth() +
      monthsLeft
    );

    const estimatedInterestRemaining =
      Math.max(
        payment *
        monthsLeft -
        debtBalance,
        0
      );

    return {
      monthsLeft: monthsLeft,

      payoffDate:
        PayTrackerUtils.stripTime(
          payoffDate
        ),

      estimatedInterestRemaining:
        PayTrackerUtils.roundCurrency(
          estimatedInterestRemaining
        )
    };
  },


  /**
   * Converts an amount to a weekly average.
   *
   * @param {number} amount
   * @param {string} frequency
   * @return {number}
   */
  convertToWeekly: function (
    amount,
    frequency
  ) {
    const value =
      Math.max(
        Number(amount) || 0,
        0
      );

    switch (
      String(
        frequency || ''
      ).trim()
    ) {
      case 'Weekly':
        return PayTrackerUtils.roundCurrency(
          value
        );

      case 'Fortnightly':
        return PayTrackerUtils.roundCurrency(
          value / 2
        );

      case 'Monthly':
        return PayTrackerUtils.roundCurrency(
          value * 12 / 52
        );

      case 'Quarterly':
        return PayTrackerUtils.roundCurrency(
          value * 4 / 52
        );

      case 'Annual':
        return PayTrackerUtils.roundCurrency(
          value / 52
        );

      case 'One-off':
      default:
        return 0;
    }
  },


  /**
   * Converts an amount to a monthly average.
   *
   * @param {number} amount
   * @param {string} frequency
   * @return {number}
   */
  convertToMonthly: function (
    amount,
    frequency
  ) {
    const value =
      Math.max(
        Number(amount) || 0,
        0
      );

    switch (
      String(
        frequency || ''
      ).trim()
    ) {
      case 'Weekly':
        return PayTrackerUtils.roundCurrency(
          value * 52 / 12
        );

      case 'Fortnightly':
        return PayTrackerUtils.roundCurrency(
          value * 26 / 12
        );

      case 'Monthly':
        return PayTrackerUtils.roundCurrency(
          value
        );

      case 'Quarterly':
        return PayTrackerUtils.roundCurrency(
          value / 3
        );

      case 'Annual':
        return PayTrackerUtils.roundCurrency(
          value / 12
        );

      case 'One-off':
      default:
        return 0;
    }
  },


  /**
   * Recalculates all existing bills and debts.
   */
  recalculateAllFinanceRows: function () {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const billsSheet =
      spreadsheet.getSheetByName(
        PayTrackerFinanceConfig.SHEETS.BILLS
      );

    const debtsSheet =
      spreadsheet.getSheetByName(
        PayTrackerFinanceConfig.SHEETS.DEBTS
      );

    if (billsSheet) {
      for (
        let row = 2;
        row <= billsSheet.getLastRow();
        row++
      ) {
        PayTrackerFinanceService.updateBillRow(
          billsSheet,
          row
        );
      }
    }

    if (debtsSheet) {
      for (
        let row = 2;
        row <= debtsSheet.getLastRow();
        row++
      ) {
        PayTrackerFinanceService.updateDebtRow(
          debtsSheet,
          row
        );
      }
    }

    SpreadsheetApp.flush();
  },


  /**
   * Creates a unique ID.
   *
   * @param {string} prefix
   * @return {string}
   */
  createFinanceId: function (
    prefix
  ) {
    return (
      String(
        prefix || 'FIN'
      ).toUpperCase() +
      '-' +
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        'yyyyMMdd-HHmmss'
      ) +
      '-' +
      Math.floor(
        Math.random() * 1000
      )
        .toString()
        .padStart(3, '0')
    );
  },


  /**
   * Ensures that a sheet has enough columns.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} requiredColumns
   */
  ensureSheetColumns: function (
    sheet,
    requiredColumns
  ) {
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
  }
});