/*******************************************************
 * PAY TRACKER V2.4
 * PaymentService.gs
 *
 * Handles:
 * - Upcoming payment generation
 * - Paid checkboxes
 * - Bill payments
 * - Debt repayments
 * - Principal and interest calculations
 * - Payment history
 * - Undo Last Payment
 *******************************************************/

const PayTrackerPaymentService = Object.freeze({
  /**
   * Builds the Finance Payments queue.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  buildPaymentsSheet: function (
    sheet
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const headers =
      PayTrackerFinanceConfig.PAYMENTS.HEADERS;

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
      .setBackground('#166534')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');

    sheet.setFrozenRows(1);
    sheet.setTabColor('#16a34a');

    const rowCount =
      Math.max(
        sheet.getMaxRows() - 1,
        1
      );

    sheet
      .getRange(
        2,
        PayTrackerFinanceConfig.PAYMENTS.COLUMNS.PAID,
        rowCount,
        1
      )
      .insertCheckboxes();

    sheet
      .getRange(
        2,
        PayTrackerFinanceConfig.PAYMENTS.COLUMNS.DUE_DATE,
        rowCount,
        1
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.DATE
      );

    sheet
      .getRange(
        2,
        PayTrackerFinanceConfig.PAYMENTS.COLUMNS.AMOUNT_DUE,
        rowCount,
        1
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.CURRENCY
      );

    const widths = [
      145,
      115,
      155,
      145,
      225,
      115,
      75,
      110,
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
   * Builds Payment History and hides recovery columns.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  buildPaymentHistorySheet: function (
    sheet
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const config =
      PayTrackerFinanceConfig.PAYMENT_HISTORY;

    PayTrackerFinanceService.ensureSheetColumns(
      sheet,
      config.HEADERS.length
    );

    sheet
      .getRange(
        1,
        1,
        1,
        config.HEADERS.length
      )
      .setValues([
        config.HEADERS
      ])
      .setBackground('#4c1d95')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');

    sheet.setFrozenRows(1);
    sheet.setTabColor('#7c3aed');

    const rowCount =
      Math.max(
        sheet.getMaxRows() - 1,
        1
      );

    sheet
      .getRange(
        2,
        config.COLUMNS.ORIGINAL_DUE_DATE,
        rowCount,
        2
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.DATE
      );

    [
      config.COLUMNS.AMOUNT_PAID,
      config.COLUMNS.PRINCIPAL,
      config.COLUMNS.INTEREST,
      config.COLUMNS.BALANCE_AFTER,
      config.COLUMNS.PREVIOUS_BALANCE
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
            PayTrackerFinanceConfig.FORMATS.CURRENCY
          );
      }
    );

    sheet
      .getRange(
        2,
        config.COLUMNS.PROCESSED_AT,
        rowCount,
        1
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.DATE_TIME
      );

    [
      config.COLUMNS.PREVIOUS_DUE_DATE,
      config.COLUMNS.PREVIOUS_NEXT_PAYMENT_DATE
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

    const visibleWidths = [
      145,
      120,
      115,
      155,
      145,
      220,
      115,
      115,
      110,
      140,
      260,
      150
    ];

    visibleWidths.forEach(
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

    try {
      sheet.hideColumns(
        config.FIRST_HIDDEN_COLUMN,
        config.HIDDEN_COLUMN_COUNT
      );
    } catch (error) {
      console.warn(
        'Unable to hide Payment History recovery columns: ' +
        error.message
      );
    }
  },


  /**
   * Creates missing upcoming payment rows.
   */
  syncUpcomingPayments: function () {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const paymentsSheet =
      spreadsheet.getSheetByName(
        PayTrackerFinanceConfig.SHEETS.PAYMENTS
      );

    if (!paymentsSheet) {
      return;
    }

    PayTrackerPaymentService.syncBillPayments(
      spreadsheet,
      paymentsSheet
    );

    PayTrackerPaymentService.syncDebtPayments(
      spreadsheet,
      paymentsSheet
    );

    PayTrackerPaymentService.sortUpcomingPayments(
      paymentsSheet
    );

    SpreadsheetApp.flush();
  },


  /**
   * Creates missing bill payments.
   *
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet
   * @param {GoogleAppsScript.Spreadsheet.Sheet} paymentsSheet
   */
  syncBillPayments: function (
    spreadsheet,
    paymentsSheet
  ) {
    const billsSheet =
      spreadsheet.getSheetByName(
        PayTrackerFinanceConfig.SHEETS.BILLS
      );

    if (
      !billsSheet ||
      billsSheet.getLastRow() < 2
    ) {
      return;
    }

    const columns =
      PayTrackerFinanceConfig.BILLS.COLUMNS;

    const rows =
      billsSheet
        .getRange(
          2,
          1,
          billsSheet.getLastRow() - 1,
          PayTrackerFinanceConfig.BILLS.HEADERS.length
        )
        .getValues();

    rows.forEach(
      function (row) {
        const itemId =
          String(
            row[
              columns.ID - 1
            ] || ''
          ).trim();

        const itemName =
          String(
            row[
              columns.NAME - 1
            ] || ''
          ).trim();

        const amountDue =
          Number(
            row[
              columns.AMOUNT - 1
            ]
          ) || 0;

        const dueDate =
          row[
            columns.NEXT_DUE_DATE - 1
          ];

        const active =
          String(
            row[
              columns.ACTIVE - 1
            ] || ''
          ).trim();

        if (
          active !== 'Yes' ||
          itemId === '' ||
          itemName === '' ||
          amountDue <= 0 ||
          !(dueDate instanceof Date)
        ) {
          return;
        }

        PayTrackerPaymentService.ensureUpcomingPayment(
          paymentsSheet,
          {
            dueDate:
              PayTrackerUtils.stripTime(
                dueDate
              ),

            paymentType:
              'Bill Payment',

            itemId: itemId,
            itemName: itemName,
            amountDue: amountDue
          }
        );
      }
    );
  },


  /**
   * Creates missing debt repayments.
   *
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet
   * @param {GoogleAppsScript.Spreadsheet.Sheet} paymentsSheet
   */
  syncDebtPayments: function (
    spreadsheet,
    paymentsSheet
  ) {
    const debtsSheet =
      spreadsheet.getSheetByName(
        PayTrackerFinanceConfig.SHEETS.DEBTS
      );

    if (
      !debtsSheet ||
      debtsSheet.getLastRow() < 2
    ) {
      return;
    }

    const columns =
      PayTrackerFinanceConfig.DEBTS.COLUMNS;

    const rows =
      debtsSheet
        .getRange(
          2,
          1,
          debtsSheet.getLastRow() - 1,
          PayTrackerFinanceConfig.DEBTS.HEADERS.length
        )
        .getValues();

    rows.forEach(
      function (row) {
        const itemId =
          String(
            row[
              columns.ID - 1
            ] || ''
          ).trim();

        const itemName =
          String(
            row[
              columns.NAME - 1
            ] || ''
          ).trim();

        const balance =
          Number(
            row[
              columns.CURRENT_BALANCE - 1
            ]
          ) || 0;

        const repaymentAmount =
          Number(
            row[
              columns.REPAYMENT_AMOUNT - 1
            ]
          ) || 0;

        const dueDate =
          row[
            columns.NEXT_PAYMENT_DATE - 1
          ];

        const active =
          String(
            row[
              columns.ACTIVE - 1
            ] || ''
          ).trim();

        if (
          active !== 'Yes' ||
          itemId === '' ||
          itemName === '' ||
          balance <= 0 ||
          repaymentAmount <= 0 ||
          !(dueDate instanceof Date)
        ) {
          return;
        }

        PayTrackerPaymentService.ensureUpcomingPayment(
          paymentsSheet,
          {
            dueDate:
              PayTrackerUtils.stripTime(
                dueDate
              ),

            paymentType:
              'Debt Repayment',

            itemId: itemId,
            itemName: itemName,
            amountDue: repaymentAmount
          }
        );
      }
    );
  },


  /**
   * Adds a payment when no matching row already exists.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object} payment
   * @return {string|null}
   */
  ensureUpcomingPayment: function (
    sheet,
    payment
  ) {
    const existingPayment =
      PayTrackerPaymentService.findUpcomingPayment(
        sheet,
        payment.paymentType,
        payment.itemId,
        payment.dueDate
      );

    if (existingPayment) {
      return existingPayment.paymentId;
    }

    const targetRow =
      Math.max(
        sheet.getLastRow() + 1,
        2
      );

    const paymentId =
      PayTrackerFinanceService.createFinanceId(
        'PAY'
      );

    sheet
      .getRange(
        targetRow,
        1,
        1,
        PayTrackerFinanceConfig.PAYMENTS.HEADERS.length
      )
      .setValues([[
        paymentId,
        payment.dueDate,
        payment.paymentType,
        payment.itemId,
        payment.itemName,
        PayTrackerUtils.roundCurrency(
          payment.amountDue
        ),
        false,
        PayTrackerFinanceConfig.PAYMENT_STATUSES.UPCOMING,
        ''
      ]]);

    sheet
      .getRange(
        targetRow,
        PayTrackerFinanceConfig.PAYMENTS.COLUMNS.PAID
      )
      .insertCheckboxes()
      .setValue(false);

    sheet
      .getRange(
        targetRow,
        PayTrackerFinanceConfig.PAYMENTS.COLUMNS.DUE_DATE
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.DATE
      );

    sheet
      .getRange(
        targetRow,
        PayTrackerFinanceConfig.PAYMENTS.COLUMNS.AMOUNT_DUE
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.CURRENCY
      );

    return paymentId;
  },


  /**
   * Finds an existing upcoming payment.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {string} paymentType
   * @param {string} itemId
   * @param {Date} dueDate
   * @return {Object|null}
   */
  findUpcomingPayment: function (
    sheet,
    paymentType,
    itemId,
    dueDate
  ) {
    if (
      !sheet ||
      sheet.getLastRow() < 2
    ) {
      return null;
    }

    const columns =
      PayTrackerFinanceConfig.PAYMENTS.COLUMNS;

    const rows =
      sheet
        .getRange(
          2,
          1,
          sheet.getLastRow() - 1,
          PayTrackerFinanceConfig.PAYMENTS.HEADERS.length
        )
        .getValues();

    const targetDate =
      PayTrackerUtils
        .stripTime(
          dueDate
        )
        .getTime();

    for (
      let index = 0;
      index < rows.length;
      index++
    ) {
      const row =
        rows[index];

      const existingDueDate =
        row[
          columns.DUE_DATE - 1
        ];

      if (
        String(
          row[
            columns.TYPE - 1
          ] || ''
        ).trim() !== paymentType ||
        String(
          row[
            columns.ITEM_ID - 1
          ] || ''
        ).trim() !== itemId ||
        !(existingDueDate instanceof Date)
      ) {
        continue;
      }

      if (
        PayTrackerUtils
          .stripTime(
            existingDueDate
          )
          .getTime() === targetDate
      ) {
        return {
          row: index + 2,

          paymentId:
            String(
              row[
                columns.ID - 1
              ] || ''
            ).trim()
        };
      }
    }

    return null;
  },


  /**
   * Handles Paid checkbox edits.
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

    if (
      sheet.getName() !==
      PayTrackerFinanceConfig.SHEETS.PAYMENTS
    ) {
      return;
    }

    const paidColumn =
      PayTrackerFinanceConfig.PAYMENTS.COLUMNS.PAID;

    if (
      event.range.getColumn() > paidColumn ||
      event.range.getLastColumn() < paidColumn
    ) {
      return;
    }

    const rowsToProcess = [];

    for (
      let row = event.range.getRow();
      row <= event.range.getLastRow();
      row++
    ) {
      if (row < 2) {
        continue;
      }

      if (
        sheet
          .getRange(
            row,
            paidColumn
          )
          .getValue() === true
      ) {
        rowsToProcess.push(
          row
        );
      }
    }

    rowsToProcess
      .sort(
        function (
          firstRow,
          secondRow
        ) {
          return secondRow - firstRow;
        }
      )
      .forEach(
        function (row) {
          PayTrackerPaymentService.processPaymentRow(
            sheet,
            row
          );
        }
      );

    PayTrackerPaymentService.syncUpcomingPayments();

    PayTrackerFinanceDashboard.refresh();
  },


  /**
   * Processes one checked payment row.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} paymentsSheet
   * @param {number} row
   */
  processPaymentRow: function (
    paymentsSheet,
    row
  ) {
    const columns =
      PayTrackerFinanceConfig.PAYMENTS.COLUMNS;

    const values =
      paymentsSheet
        .getRange(
          row,
          1,
          1,
          PayTrackerFinanceConfig.PAYMENTS.HEADERS.length
        )
        .getValues()[0];

    const payment = {
      paymentId:
        String(
          values[
            columns.ID - 1
          ] || ''
        ).trim(),

      dueDate:
        values[
          columns.DUE_DATE - 1
        ],

      paymentType:
        String(
          values[
            columns.TYPE - 1
          ] || ''
        ).trim(),

      itemId:
        String(
          values[
            columns.ITEM_ID - 1
          ] || ''
        ).trim(),

      itemName:
        String(
          values[
            columns.ITEM_NAME - 1
          ] || ''
        ).trim(),

      amount:
        Number(
          values[
            columns.AMOUNT_DUE - 1
          ]
        ) || 0,

      notes:
        String(
          values[
            columns.NOTES - 1
          ] || ''
        ).trim()
    };

    paymentsSheet
      .getRange(
        row,
        columns.STATUS
      )
      .setValue(
        PayTrackerFinanceConfig.PAYMENT_STATUSES.PROCESSING
      );

    try {
      let historyRecord;

      if (
        payment.paymentType ===
        'Bill Payment'
      ) {
        historyRecord =
          PayTrackerPaymentService.processBillPayment(
            payment
          );
      } else if (
        payment.paymentType ===
          'Debt Repayment' ||
        payment.paymentType ===
          'Extra Debt Repayment'
      ) {
        historyRecord =
          PayTrackerPaymentService.processDebtPayment(
            payment
          );
      } else {
        throw new Error(
          'Unsupported payment type: ' +
          payment.paymentType
        );
      }

      PayTrackerPaymentService.appendHistory(
        historyRecord
      );

      paymentsSheet.deleteRow(
        row
      );
    } catch (error) {
      paymentsSheet
        .getRange(
          row,
          columns.STATUS
        )
        .setValue(
          PayTrackerFinanceConfig.PAYMENT_STATUSES.ERROR
        );

      paymentsSheet
        .getRange(
          row,
          columns.NOTES
        )
        .setValue(
          error.message
        );

      paymentsSheet
        .getRange(
          row,
          columns.PAID
        )
        .setValue(false);

      throw error;
    }
  },


  /**
   * Processes a bill payment.
   *
   * @param {Object} payment
   * @return {Object}
   */
  processBillPayment: function (
    payment
  ) {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const billsSheet =
      spreadsheet.getSheetByName(
        PayTrackerFinanceConfig.SHEETS.BILLS
      );

    const paymentsSheet =
      spreadsheet.getSheetByName(
        PayTrackerFinanceConfig.SHEETS.PAYMENTS
      );

    const billRow =
      PayTrackerPaymentService.findItemRowById(
        billsSheet,
        payment.itemId
      );

    if (!billRow) {
      throw new Error(
        'Bill was not found: ' +
        payment.itemId
      );
    }

    const columns =
      PayTrackerFinanceConfig.BILLS.COLUMNS;

    const values =
      billsSheet
        .getRange(
          billRow,
          1,
          1,
          PayTrackerFinanceConfig.BILLS.HEADERS.length
        )
        .getValues()[0];

    const frequency =
      String(
        values[
          columns.FREQUENCY - 1
        ] || ''
      ).trim();

    const previousDueDate =
      values[
        columns.NEXT_DUE_DATE - 1
      ];

    const previousActiveStatus =
      String(
        values[
          columns.ACTIVE - 1
        ] || ''
      ).trim();

    let replacementPaymentId = '';

    if (frequency === 'One-off') {
      billsSheet
        .getRange(
          billRow,
          columns.ACTIVE
        )
        .setValue('No');

      billsSheet
        .getRange(
          billRow,
          columns.NEXT_DUE_DATE
        )
        .clearContent();
    } else {
      const nextDueDate =
        PayTrackerPaymentService.advanceDateByFrequency(
          payment.dueDate,
          frequency
        );

      billsSheet
        .getRange(
          billRow,
          columns.NEXT_DUE_DATE
        )
        .setValue(
          nextDueDate
        )
        .setNumberFormat(
          PayTrackerFinanceConfig.FORMATS.DATE
        );

      replacementPaymentId =
        PayTrackerPaymentService.ensureUpcomingPayment(
          paymentsSheet,
          {
            dueDate: nextDueDate,
            paymentType: 'Bill Payment',
            itemId: payment.itemId,
            itemName: payment.itemName,
            amountDue: payment.amount
          }
        ) || '';
    }

    return {
      paymentId: payment.paymentId,
      originalDueDate: payment.dueDate,

      paidDate:
        PayTrackerUtils.stripTime(
          new Date()
        ),

      paymentType: payment.paymentType,
      itemId: payment.itemId,
      itemName: payment.itemName,

      amountPaid:
        PayTrackerUtils.roundCurrency(
          payment.amount
        ),

      principalPaid: 0,
      interestPaid: 0,
      balanceAfter: '',
      notes: payment.notes,
      processedAt: new Date(),

      previousDueDate:
        previousDueDate,

      previousBalance: '',
      previousActiveStatus:
        previousActiveStatus,

      previousNextPaymentDate: '',
      replacementPaymentId:
        replacementPaymentId,

      undoStatus:
        PayTrackerFinanceConfig.UNDO_STATUSES.AVAILABLE
    };
  },


  /**
   * Processes a debt payment.
   *
   * @param {Object} payment
   * @return {Object}
   */
  processDebtPayment: function (
    payment
  ) {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const debtsSheet =
      spreadsheet.getSheetByName(
        PayTrackerFinanceConfig.SHEETS.DEBTS
      );

    const paymentsSheet =
      spreadsheet.getSheetByName(
        PayTrackerFinanceConfig.SHEETS.PAYMENTS
      );

    const debtRow =
      PayTrackerPaymentService.findItemRowById(
        debtsSheet,
        payment.itemId
      );

    if (!debtRow) {
      throw new Error(
        'Debt was not found: ' +
        payment.itemId
      );
    }

    const columns =
      PayTrackerFinanceConfig.DEBTS.COLUMNS;

    const values =
      debtsSheet
        .getRange(
          debtRow,
          1,
          1,
          PayTrackerFinanceConfig.DEBTS.HEADERS.length
        )
        .getValues()[0];

    const previousBalance =
      Math.max(
        Number(
          values[
            columns.CURRENT_BALANCE - 1
          ]
        ) || 0,
        0
      );

    const previousActiveStatus =
      String(
        values[
          columns.ACTIVE - 1
        ] || ''
      ).trim();

    const previousNextPaymentDate =
      values[
        columns.NEXT_PAYMENT_DATE - 1
      ];

    const apr =
      Math.max(
        Number(
          values[
            columns.APR - 1
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

    const interest =
      PayTrackerPaymentService.calculatePeriodicInterest(
        previousBalance,
        apr,
        frequency
      );

    const maximumPayment =
      previousBalance +
      interest;

    const amountPaid =
      Math.min(
        Math.max(
          payment.amount,
          0
        ),
        maximumPayment
      );

    const interestPaid =
      Math.min(
        interest,
        amountPaid
      );

    const principalPaid =
      Math.max(
        amountPaid -
        interestPaid,
        0
      );

    const newBalance =
      PayTrackerUtils.roundCurrency(
        Math.max(
          previousBalance -
          principalPaid,
          0
        )
      );

    debtsSheet
      .getRange(
        debtRow,
        columns.CURRENT_BALANCE
      )
      .setValue(
        newBalance
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.CURRENCY
      );

    let replacementPaymentId = '';

    if (newBalance <= 0) {
      debtsSheet
        .getRange(
          debtRow,
          columns.ACTIVE
        )
        .setValue('No');

      debtsSheet
        .getRange(
          debtRow,
          columns.NEXT_PAYMENT_DATE
        )
        .clearContent();
    } else if (
      payment.paymentType !==
      'Extra Debt Repayment'
    ) {
      const nextPaymentDate =
        PayTrackerPaymentService.advanceDateByFrequency(
          payment.dueDate,
          frequency
        );

      debtsSheet
        .getRange(
          debtRow,
          columns.NEXT_PAYMENT_DATE
        )
        .setValue(
          nextPaymentDate
        )
        .setNumberFormat(
          PayTrackerFinanceConfig.FORMATS.DATE
        );

      replacementPaymentId =
        PayTrackerPaymentService.ensureUpcomingPayment(
          paymentsSheet,
          {
            dueDate: nextPaymentDate,
            paymentType: 'Debt Repayment',
            itemId: payment.itemId,
            itemName: payment.itemName,

            amountDue:
              Number(
                values[
                  columns.REPAYMENT_AMOUNT - 1
                ]
              ) || payment.amount
          }
        ) || '';
    }

    PayTrackerFinanceService.updateDebtRow(
      debtsSheet,
      debtRow
    );

    return {
      paymentId: payment.paymentId,
      originalDueDate: payment.dueDate,

      paidDate:
        PayTrackerUtils.stripTime(
          new Date()
        ),

      paymentType: payment.paymentType,
      itemId: payment.itemId,
      itemName: payment.itemName,

      amountPaid:
        PayTrackerUtils.roundCurrency(
          amountPaid
        ),

      principalPaid:
        PayTrackerUtils.roundCurrency(
          principalPaid
        ),

      interestPaid:
        PayTrackerUtils.roundCurrency(
          interestPaid
        ),

      balanceAfter: newBalance,
      notes: payment.notes,
      processedAt: new Date(),

      previousDueDate: '',
      previousBalance:
        previousBalance,

      previousActiveStatus:
        previousActiveStatus,

      previousNextPaymentDate:
        previousNextPaymentDate,

      replacementPaymentId:
        replacementPaymentId,

      undoStatus:
        PayTrackerFinanceConfig.UNDO_STATUSES.AVAILABLE
    };
  },


  /**
   * Calculates interest for one repayment period.
   *
   * @param {number} balance
   * @param {number} aprPercentage
   * @param {string} frequency
   * @return {number}
   */
  calculatePeriodicInterest: function (
    balance,
    aprPercentage,
    frequency
  ) {
    const periodsPerYear =
      PayTrackerPaymentService.getPeriodsPerYear(
        frequency
      );

    if (periodsPerYear <= 0) {
      return 0;
    }

    const interest =
      (
        Math.max(
          Number(balance) || 0,
          0
        ) *
        (
          Math.max(
            Number(aprPercentage) || 0,
            0
          ) / 100
        )
      ) /
      periodsPerYear;

    return PayTrackerUtils.roundCurrency(
      interest
    );
  },


  /**
   * Returns repayment periods per year.
   *
   * @param {string} frequency
   * @return {number}
   */
  getPeriodsPerYear: function (
    frequency
  ) {
    switch (
      String(
        frequency || ''
      ).trim()
    ) {
      case 'Weekly':
        return 52;

      case 'Fortnightly':
        return 26;

      case 'Monthly':
        return 12;

      case 'Quarterly':
        return 4;

      case 'Annual':
        return 1;

      default:
        return 0;
    }
  },


  /**
   * Advances a date by a recurring frequency.
   *
   * @param {Date} date
   * @param {string} frequency
   * @return {Date}
   */
  advanceDateByFrequency: function (
    date,
    frequency
  ) {
    PayTrackerUtils.validateDate(
      date,
      'date'
    );

    const result =
      PayTrackerUtils.stripTime(
        date
      );

    switch (
      String(
        frequency || ''
      ).trim()
    ) {
      case 'Weekly':
        result.setDate(
          result.getDate() + 7
        );
        break;

      case 'Fortnightly':
        result.setDate(
          result.getDate() + 14
        );
        break;

      case 'Monthly':
        result.setMonth(
          result.getMonth() + 1
        );
        break;

      case 'Quarterly':
        result.setMonth(
          result.getMonth() + 3
        );
        break;

      case 'Annual':
        result.setFullYear(
          result.getFullYear() + 1
        );
        break;

      default:
        throw new Error(
          'Unsupported payment frequency: ' +
          frequency
        );
    }

    return PayTrackerUtils.stripTime(
      result
    );
  },


  /**
   * Appends a completed payment to history.
   *
   * @param {Object} record
   */
  appendHistory: function (
    record
  ) {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const historySheet =
      spreadsheet.getSheetByName(
        PayTrackerFinanceConfig.SHEETS.PAYMENT_HISTORY
      );

    if (!historySheet) {
      throw new Error(
        'Payment History sheet was not found.'
      );
    }

    const targetRow =
      Math.max(
        historySheet.getLastRow() + 1,
        2
      );

    historySheet
      .getRange(
        targetRow,
        1,
        1,
        PayTrackerFinanceConfig.PAYMENT_HISTORY.HEADERS.length
      )
      .setValues([[
        record.paymentId,
        record.originalDueDate,
        record.paidDate,
        record.paymentType,
        record.itemId,
        record.itemName,
        record.amountPaid,
        record.principalPaid,
        record.interestPaid,
        record.balanceAfter,
        record.notes,
        record.processedAt,
        record.previousDueDate,
        record.previousBalance,
        record.previousActiveStatus,
        record.previousNextPaymentDate,
        record.replacementPaymentId,
        record.undoStatus
      ]]);

    historySheet
      .getRange(
        targetRow,
        PayTrackerFinanceConfig.PAYMENT_HISTORY.COLUMNS.ORIGINAL_DUE_DATE,
        1,
        2
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.DATE
      );

    historySheet
      .getRange(
        targetRow,
        PayTrackerFinanceConfig.PAYMENT_HISTORY.COLUMNS.AMOUNT_PAID,
        1,
        4
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.CURRENCY
      );

    historySheet
      .getRange(
        targetRow,
        PayTrackerFinanceConfig.PAYMENT_HISTORY.COLUMNS.PROCESSED_AT
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.DATE_TIME
      );
  },


  /**
   * Undoes the latest available payment.
   *
   * @return {Object}
   */
  undoLastPayment: function () {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const historySheet =
      spreadsheet.getSheetByName(
        PayTrackerFinanceConfig.SHEETS.PAYMENT_HISTORY
      );

    const paymentsSheet =
      spreadsheet.getSheetByName(
        PayTrackerFinanceConfig.SHEETS.PAYMENTS
      );

    if (
      !historySheet ||
      historySheet.getLastRow() < 2
    ) {
      throw new Error(
        'There are no completed payments to undo.'
      );
    }

    const historyRow =
      PayTrackerPaymentService.findLatestUndoableHistoryRow(
        historySheet
      );

    if (!historyRow) {
      throw new Error(
        'There are no payments available to undo.'
      );
    }

    const config =
      PayTrackerFinanceConfig.PAYMENT_HISTORY;

    const values =
      historySheet
        .getRange(
          historyRow,
          1,
          1,
          config.HEADERS.length
        )
        .getValues()[0];

    const record = {
      paymentId:
        String(
          values[
            config.COLUMNS.ID - 1
          ] || ''
        ).trim(),

      originalDueDate:
        values[
          config.COLUMNS.ORIGINAL_DUE_DATE - 1
        ],

      paymentType:
        String(
          values[
            config.COLUMNS.TYPE - 1
          ] || ''
        ).trim(),

      itemId:
        String(
          values[
            config.COLUMNS.ITEM_ID - 1
          ] || ''
        ).trim(),

      itemName:
        String(
          values[
            config.COLUMNS.ITEM_NAME - 1
          ] || ''
        ).trim(),

      amountPaid:
        Number(
          values[
            config.COLUMNS.AMOUNT_PAID - 1
          ]
        ) || 0,

      notes:
        String(
          values[
            config.COLUMNS.NOTES - 1
          ] || ''
        ).trim(),

      previousDueDate:
        values[
          config.COLUMNS.PREVIOUS_DUE_DATE - 1
        ],

      previousBalance:
        values[
          config.COLUMNS.PREVIOUS_BALANCE - 1
        ],

      previousActiveStatus:
        String(
          values[
            config.COLUMNS.PREVIOUS_ACTIVE_STATUS - 1
          ] || ''
        ).trim(),

      previousNextPaymentDate:
        values[
          config.COLUMNS.PREVIOUS_NEXT_PAYMENT_DATE - 1
        ],

      replacementPaymentId:
        String(
          values[
            config.COLUMNS.REPLACEMENT_PAYMENT_ID - 1
          ] || ''
        ).trim()
    };

    if (
      record.replacementPaymentId !== ''
    ) {
      PayTrackerPaymentService.deleteUpcomingPaymentById(
        paymentsSheet,
        record.replacementPaymentId
      );
    }

    if (
      record.paymentType ===
      'Bill Payment'
    ) {
      PayTrackerPaymentService.restoreBillAfterUndo(
        record
      );
    } else {
      PayTrackerPaymentService.restoreDebtAfterUndo(
        record
      );
    }

    PayTrackerPaymentService.restorePaymentToQueue(
      paymentsSheet,
      record
    );

    historySheet
      .getRange(
        historyRow,
        config.COLUMNS.UNDO_STATUS
      )
      .setValue(
        PayTrackerFinanceConfig.UNDO_STATUSES.UNDONE
      );

    PayTrackerPaymentService.syncUpcomingPayments();

    PayTrackerFinanceDashboard.refresh();

    return {
      itemName: record.itemName,
      paymentType: record.paymentType,
      amount: record.amountPaid
    };
  },


  /**
   * Finds the newest history row that has not been undone.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} historySheet
   * @return {number|null}
   */
  findLatestUndoableHistoryRow: function (
    historySheet
  ) {
    const config =
      PayTrackerFinanceConfig.PAYMENT_HISTORY;

    for (
      let row = historySheet.getLastRow();
      row >= 2;
      row--
    ) {
      const status =
        String(
          historySheet
            .getRange(
              row,
              config.COLUMNS.UNDO_STATUS
            )
            .getValue() || ''
        ).trim();

      if (
        status !==
        PayTrackerFinanceConfig.UNDO_STATUSES.UNDONE
      ) {
        return row;
      }
    }

    return null;
  },


  /**
   * Restores a bill after undoing its payment.
   *
   * @param {Object} record
   */
  restoreBillAfterUndo: function (
    record
  ) {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const billsSheet =
      spreadsheet.getSheetByName(
        PayTrackerFinanceConfig.SHEETS.BILLS
      );

    const row =
      PayTrackerPaymentService.findItemRowById(
        billsSheet,
        record.itemId
      );

    if (!row) {
      throw new Error(
        'The original bill could not be found.'
      );
    }

    const columns =
      PayTrackerFinanceConfig.BILLS.COLUMNS;

    billsSheet
      .getRange(
        row,
        columns.NEXT_DUE_DATE
      )
      .setValue(
        record.previousDueDate ||
        record.originalDueDate
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.DATE
      );

    billsSheet
      .getRange(
        row,
        columns.ACTIVE
      )
      .setValue(
        record.previousActiveStatus ||
        'Yes'
      );
  },


  /**
   * Restores a debt after undoing its payment.
   *
   * @param {Object} record
   */
  restoreDebtAfterUndo: function (
    record
  ) {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const debtsSheet =
      spreadsheet.getSheetByName(
        PayTrackerFinanceConfig.SHEETS.DEBTS
      );

    const row =
      PayTrackerPaymentService.findItemRowById(
        debtsSheet,
        record.itemId
      );

    if (!row) {
      throw new Error(
        'The original debt could not be found.'
      );
    }

    const columns =
      PayTrackerFinanceConfig.DEBTS.COLUMNS;

    debtsSheet
      .getRange(
        row,
        columns.CURRENT_BALANCE
      )
      .setValue(
        Number(
          record.previousBalance
        ) || 0
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.CURRENCY
      );

    debtsSheet
      .getRange(
        row,
        columns.ACTIVE
      )
      .setValue(
        record.previousActiveStatus ||
        'Yes'
      );

    if (
      record.previousNextPaymentDate instanceof Date
    ) {
      debtsSheet
        .getRange(
          row,
          columns.NEXT_PAYMENT_DATE
        )
        .setValue(
          record.previousNextPaymentDate
        )
        .setNumberFormat(
          PayTrackerFinanceConfig.FORMATS.DATE
        );
    } else {
      debtsSheet
        .getRange(
          row,
          columns.NEXT_PAYMENT_DATE
        )
        .setValue(
          record.originalDueDate
        )
        .setNumberFormat(
          PayTrackerFinanceConfig.FORMATS.DATE
        );
    }

    PayTrackerFinanceService.updateDebtRow(
      debtsSheet,
      row
    );
  },


  /**
   * Restores the original payment to the upcoming queue.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} paymentsSheet
   * @param {Object} record
   */
  restorePaymentToQueue: function (
    paymentsSheet,
    record
  ) {
    if (!paymentsSheet) {
      throw new Error(
        'Finance Payments sheet was not found.'
      );
    }

    if (
      PayTrackerPaymentService.findPaymentRowById(
        paymentsSheet,
        record.paymentId
      )
    ) {
      return;
    }

    const targetRow =
      Math.max(
        paymentsSheet.getLastRow() + 1,
        2
      );

    paymentsSheet
      .getRange(
        targetRow,
        1,
        1,
        PayTrackerFinanceConfig.PAYMENTS.HEADERS.length
      )
      .setValues([[
        record.paymentId,
        record.originalDueDate,
        record.paymentType,
        record.itemId,
        record.itemName,
        record.amountPaid,
        false,
        PayTrackerFinanceConfig.PAYMENT_STATUSES.UPCOMING,
        'Restored by Undo Last Payment'
      ]]);

    paymentsSheet
      .getRange(
        targetRow,
        PayTrackerFinanceConfig.PAYMENTS.COLUMNS.PAID
      )
      .insertCheckboxes()
      .setValue(false);

    paymentsSheet
      .getRange(
        targetRow,
        PayTrackerFinanceConfig.PAYMENTS.COLUMNS.DUE_DATE
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.DATE
      );

    paymentsSheet
      .getRange(
        targetRow,
        PayTrackerFinanceConfig.PAYMENTS.COLUMNS.AMOUNT_DUE
      )
      .setNumberFormat(
        PayTrackerFinanceConfig.FORMATS.CURRENCY
      );
  },


  /**
   * Deletes an upcoming payment using its payment ID.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {string} paymentId
   */
  deleteUpcomingPaymentById: function (
    sheet,
    paymentId
  ) {
    const row =
      PayTrackerPaymentService.findPaymentRowById(
        sheet,
        paymentId
      );

    if (row) {
      sheet.deleteRow(
        row
      );
    }
  },


  /**
   * Finds a payment row by Payment ID.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {string} paymentId
   * @return {number|null}
   */
  findPaymentRowById: function (
    sheet,
    paymentId
  ) {
    if (
      !sheet ||
      sheet.getLastRow() < 2
    ) {
      return null;
    }

    const ids =
      sheet
        .getRange(
          2,
          1,
          sheet.getLastRow() - 1,
          1
        )
        .getDisplayValues();

    const targetId =
      String(
        paymentId || ''
      ).trim();

    for (
      let index = 0;
      index < ids.length;
      index++
    ) {
      if (
        String(
          ids[index][0] || ''
        ).trim() === targetId
      ) {
        return index + 2;
      }
    }

    return null;
  },


  /**
   * Finds a bill or debt row by Item ID.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {string} itemId
   * @return {number|null}
   */
  findItemRowById: function (
    sheet,
    itemId
  ) {
    return PayTrackerPaymentService.findPaymentRowById(
      sheet,
      itemId
    );
  },


  /**
   * Sorts upcoming payments by due date.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  sortUpcomingPayments: function (
    sheet
  ) {
    if (
      !sheet ||
      sheet.getLastRow() < 3
    ) {
      return;
    }

    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        PayTrackerFinanceConfig.PAYMENTS.HEADERS.length
      )
      .sort([
        {
          column:
            PayTrackerFinanceConfig.PAYMENTS.COLUMNS.DUE_DATE,

          ascending: true
        }
      ]);
  }
});