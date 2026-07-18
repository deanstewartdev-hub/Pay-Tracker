/*******************************************************
 * PAY TRACKER V2.6
 * FinanceDashboard.gs
 *
 * Unified dashboard for:
 * - Pay and income
 * - Bills
 * - Debts
 * - Finance payments
 * - Savings pots
 * - Contribution schedules
 * - Months-to-goal forecasts
 * - Life Goals
 *******************************************************/

const PayTrackerFinanceDashboard = Object.freeze({
  /**
   * Creates or refreshes the complete Finance Dashboard.
   *
   * @return {Object}
   */
  refresh: function () {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    if (!spreadsheet) {
      throw new Error(
        'No active spreadsheet is available.'
      );
    }

    const dashboardSheet =
      PayTrackerFinanceService.getOrCreateSheet(
        spreadsheet,
        PayTrackerFinanceConfig.SHEETS.DASHBOARD
      );

    const figures =
      PayTrackerFinanceDashboard.calculateDashboardFigures();

    PayTrackerFinanceDashboard.buildDashboard(
      dashboardSheet,
      figures
    );

    PayTrackerFinanceDashboard.buildDashboardCharts(
      dashboardSheet,
      figures
    );

    SpreadsheetApp.flush();

    return figures;
  },


  /**
   * Calculates all finance and savings dashboard figures.
   *
   * @return {Object}
   */
  calculateDashboardFigures: function () {
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

    const paymentsSheet =
      spreadsheet.getSheetByName(
        PayTrackerFinanceConfig.SHEETS.PAYMENTS
      );

    const historySheet =
      spreadsheet.getSheetByName(
        PayTrackerFinanceConfig.SHEETS.PAYMENT_HISTORY
      );

    const estimatedMonthlyTakeHome =
      PayTrackerFinanceDashboard
        .calculateEstimatedMonthlyTakeHome();

    const billFigures =
      PayTrackerFinanceDashboard.calculateBillFigures(
        billsSheet
      );

    const debtFigures =
      PayTrackerFinanceDashboard.calculateDebtFigures(
        debtsSheet
      );

    const paymentFigures =
      PayTrackerFinanceDashboard.calculatePaymentFigures(
        paymentsSheet,
        historySheet
      );

    const savingsFigures =
      typeof PayTrackerSavingsDashboardService !==
      'undefined'
        ? PayTrackerSavingsDashboardService.calculateFigures()
        : PayTrackerFinanceDashboard.getEmptySavingsFigures();

    const disposableBeforeSavings =
      estimatedMonthlyTakeHome -
      billFigures.monthlyBills -
      debtFigures.monthlyDebtRepayments;

    const disposableAfterSavings =
      disposableBeforeSavings -
      savingsFigures.totalMonthlyContributions;

    const totalCommitted =
      billFigures.monthlyBills +
      debtFigures.monthlyDebtRepayments +
      savingsFigures.totalMonthlyContributions;

    const committedPercentage =
      estimatedMonthlyTakeHome > 0
        ? Math.min(
            Math.max(
              totalCommitted /
              estimatedMonthlyTakeHome,
              0
            ),
            1
          )
        : 0;

    const totalDebtProgress =
      debtFigures.originalDebt > 0
        ? Math.min(
            debtFigures.debtRepaid /
            debtFigures.originalDebt,
            1
          )
        : 0;

    const netWorth =
      savingsFigures.totalSavings -
      debtFigures.totalDebtRemaining;

    return {
      estimatedMonthlyTakeHome:
        PayTrackerUtils.roundCurrency(
          estimatedMonthlyTakeHome
        ),

      monthlyBills:
        PayTrackerUtils.roundCurrency(
          billFigures.monthlyBills
        ),

      monthlyDebtRepayments:
        PayTrackerUtils.roundCurrency(
          debtFigures.monthlyDebtRepayments
        ),

      monthlySavings:
        PayTrackerUtils.roundCurrency(
          savingsFigures.totalMonthlyContributions
        ),

      disposableBeforeSavings:
        PayTrackerUtils.roundCurrency(
          disposableBeforeSavings
        ),

      disposableIncome:
        PayTrackerUtils.roundCurrency(
          disposableAfterSavings
        ),

      committedIncome:
        PayTrackerUtils.roundCurrency(
          totalCommitted
        ),

      committedPercentage:
        committedPercentage,

      totalDebtRemaining:
        PayTrackerUtils.roundCurrency(
          debtFigures.totalDebtRemaining
        ),

      originalDebt:
        PayTrackerUtils.roundCurrency(
          debtFigures.originalDebt
        ),

      debtRepaid:
        PayTrackerUtils.roundCurrency(
          debtFigures.debtRepaid
        ),

      totalDebtProgress:
        totalDebtProgress,

      billsDueNextThirtyDays:
        PayTrackerUtils.roundCurrency(
          billFigures.billsDueNextThirtyDays
        ),

      activeBills:
        billFigures.activeBills,

      activeDebts:
        debtFigures.activeDebts,

      overduePayments:
        paymentFigures.overduePayments,

      dueNextSevenDays:
        paymentFigures.dueNextSevenDays,

      dueNextThirtyDays:
        paymentFigures.dueNextThirtyDays,

      paidThisMonth:
        PayTrackerUtils.roundCurrency(
          paymentFigures.paidThisMonth
        ),

      debtRows:
        debtFigures.debtRows,

      monthlyPaymentHistory:
        paymentFigures.monthlyPaymentHistory,

      monthlySavingsAvailable:
        savingsFigures.monthlySavingsAvailable,

      totalSavings:
        savingsFigures.totalSavings,

      totalSavingsGoals:
        savingsFigures.totalSavingsGoals,

      totalSavingsRemaining:
        savingsFigures.totalAmountRemaining,

      savingsProgress:
        savingsFigures.overallSavingsProgress,

      annualSavingsInterest:
        savingsFigures.totalAnnualInterest,

      monthlySavingsInterest:
        savingsFigures.totalMonthlyInterest,

      activePots:
        savingsFigures.activePots,

      completedPots:
        savingsFigures.completedPots,

      upcomingContributions:
        savingsFigures.upcomingContributions,

      overdueContributions:
        savingsFigures.overdueContributions,

      depositedThisMonth:
        savingsFigures.depositedThisMonth,

      depositedThisYear:
        savingsFigures.depositedThisYear,

      allocationTotal:
        savingsFigures.allocationTotal,

      allocationValid:
        savingsFigures.allocationValid,

      savingsPotRows:
        PayTrackerSavingsDashboardService
          .sortPotsForDashboard(
            savingsFigures.potRows
          ),

      goalRows:
        PayTrackerSavingsDashboardService
          .sortGoalsForDashboard(
            savingsFigures.goalRows
          ),

      netWorth:
        PayTrackerUtils.roundCurrency(
          netWorth
        )
    };
  },


  /**
   * Returns safe empty savings figures.
   *
   * @return {Object}
   */
  getEmptySavingsFigures: function () {
    return {
      monthlySavingsAvailable: 0,
      totalSavings: 0,
      totalSavingsGoals: 0,
      totalAmountRemaining: 0,
      totalMonthlyContributions: 0,
      totalAnnualInterest: 0,
      totalMonthlyInterest: 0,
      overallSavingsProgress: 0,
      activePots: 0,
      completedPots: 0,
      upcomingContributions: 0,
      overdueContributions: 0,
      depositedThisMonth: 0,
      depositedThisYear: 0,
      allocationTotal: 0,
      allocationValid: true,
      potRows: [],
      goalRows: []
    };
  },


  /**
   * Calculates bill totals.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet|null} billsSheet
   * @return {Object}
   */
  calculateBillFigures: function (
    billsSheet
  ) {
    const result = {
      monthlyBills: 0,
      billsDueNextThirtyDays: 0,
      activeBills: 0
    };

    if (
      !billsSheet ||
      billsSheet.getLastRow() <
      PayTrackerFinanceConfig.FIRST_DATA_ROW
    ) {
      return result;
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

    const today =
      PayTrackerUtils.stripTime(
        new Date()
      );

    const thirtyDaysFromToday =
      PayTrackerUtils.addDays(
        today,
        30
      );

    rows.forEach(
      function (row) {
        const active =
          String(
            row[
              columns.ACTIVE - 1
            ] || ''
          ).trim();

        if (
          active !==
          'Yes'
        ) {
          return;
        }

        result.activeBills++;

        result.monthlyBills +=
          Number(
            row[
              columns.MONTHLY_COST - 1
            ]
          ) || 0;

        const dueDate =
          row[
            columns.NEXT_DUE_DATE - 1
          ];

        if (
          dueDate instanceof Date &&
          dueDate.getTime() >=
            today.getTime() &&
          dueDate.getTime() <=
            thirtyDaysFromToday.getTime()
        ) {
          result.billsDueNextThirtyDays +=
            Number(
              row[
                columns.AMOUNT - 1
              ]
            ) || 0;
        }
      }
    );

    return result;
  },


  /**
   * Calculates debt totals.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet|null} debtsSheet
   * @return {Object}
   */
  calculateDebtFigures: function (
    debtsSheet
  ) {
    const result = {
      monthlyDebtRepayments: 0,
      totalDebtRemaining: 0,
      originalDebt: 0,
      debtRepaid: 0,
      activeDebts: 0,
      debtRows: []
    };

    if (
      !debtsSheet ||
      debtsSheet.getLastRow() <
      PayTrackerFinanceConfig.FIRST_DATA_ROW
    ) {
      return result;
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
        const debtName =
          String(
            row[
              columns.NAME - 1
            ] || ''
          ).trim();

        if (
          debtName ===
          ''
        ) {
          return;
        }

        const originalAmount =
          Math.max(
            Number(
              row[
                columns.ORIGINAL_AMOUNT - 1
              ]
            ) || 0,
            0
          );

        const currentBalance =
          Math.max(
            Number(
              row[
                columns.CURRENT_BALANCE - 1
              ]
            ) || 0,
            0
          );

        const active =
          String(
            row[
              columns.ACTIVE - 1
            ] || ''
          ).trim();

        const amountRepaid =
          Math.max(
            originalAmount -
            currentBalance,
            0
          );

        const progress =
          originalAmount > 0
            ? Math.min(
                amountRepaid /
                originalAmount,
                1
              )
            : 0;

        result.originalDebt +=
          originalAmount;

        result.totalDebtRemaining +=
          currentBalance;

        result.debtRepaid +=
          amountRepaid;

        if (
          active ===
          'Yes'
        ) {
          result.activeDebts++;

          result.monthlyDebtRepayments +=
            Number(
              row[
                columns.MONTHLY_REPAYMENT - 1
              ]
            ) || 0;
        }

        result.debtRows.push({
          name:
            debtName,

          originalAmount:
            originalAmount,

          currentBalance:
            currentBalance,

          amountRepaid:
            amountRepaid,

          progress:
            progress,

          active:
            active
        });
      }
    );

    return result;
  },


  /**
   * Calculates payment queue and history figures.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet|null} paymentsSheet
   * @param {GoogleAppsScript.Spreadsheet.Sheet|null} historySheet
   * @return {Object}
   */
  calculatePaymentFigures: function (
    paymentsSheet,
    historySheet
  ) {
    const result = {
      overduePayments: 0,
      dueNextSevenDays: 0,
      dueNextThirtyDays: 0,
      paidThisMonth: 0,
      monthlyPaymentHistory: []
    };

    const today =
      PayTrackerUtils.stripTime(
        new Date()
      );

    const sevenDaysFromToday =
      PayTrackerUtils.addDays(
        today,
        7
      );

    const thirtyDaysFromToday =
      PayTrackerUtils.addDays(
        today,
        30
      );

    if (
      paymentsSheet &&
      paymentsSheet.getLastRow() >=
        PayTrackerFinanceConfig.FIRST_DATA_ROW
    ) {
      const columns =
        PayTrackerFinanceConfig.PAYMENTS.COLUMNS;

      const rows =
        paymentsSheet
          .getRange(
            2,
            1,
            paymentsSheet.getLastRow() - 1,
            PayTrackerFinanceConfig.PAYMENTS.HEADERS.length
          )
          .getValues();

      rows.forEach(
        function (row) {
          const dueDate =
            row[
              columns.DUE_DATE - 1
            ];

          if (
            !(dueDate instanceof Date)
          ) {
            return;
          }

          const dueTime =
            PayTrackerUtils
              .stripTime(
                dueDate
              )
              .getTime();

          if (
            dueTime <
            today.getTime()
          ) {
            result.overduePayments++;
          }

          if (
            dueTime >=
              today.getTime() &&
            dueTime <=
              sevenDaysFromToday.getTime()
          ) {
            result.dueNextSevenDays++;
          }

          if (
            dueTime >=
              today.getTime() &&
            dueTime <=
              thirtyDaysFromToday.getTime()
          ) {
            result.dueNextThirtyDays++;
          }
        }
      );
    }

    if (
      !historySheet ||
      historySheet.getLastRow() <
        PayTrackerFinanceConfig.FIRST_DATA_ROW
    ) {
      return result;
    }

    const columns =
      PayTrackerFinanceConfig.PAYMENT_HISTORY.COLUMNS;

    const rows =
      historySheet
        .getRange(
          2,
          1,
          historySheet.getLastRow() - 1,
          PayTrackerFinanceConfig.PAYMENT_HISTORY.HEADERS.length
        )
        .getValues();

    const currentMonth =
      today.getMonth();

    const currentYear =
      today.getFullYear();

    const monthlyTotals =
      {};

    rows.forEach(
      function (row) {
        const undoStatus =
          String(
            row[
              columns.UNDO_STATUS - 1
            ] || ''
          ).trim();

        if (
          undoStatus ===
          PayTrackerFinanceConfig.UNDO_STATUSES.UNDONE
        ) {
          return;
        }

        const paidDate =
          row[
            columns.PAID_DATE - 1
          ];

        const amountPaid =
          Number(
            row[
              columns.AMOUNT_PAID - 1
            ]
          ) || 0;

        if (
          !(paidDate instanceof Date)
        ) {
          return;
        }

        if (
          paidDate.getMonth() ===
            currentMonth &&
          paidDate.getFullYear() ===
            currentYear
        ) {
          result.paidThisMonth +=
            amountPaid;
        }

        const monthKey =
          Utilities.formatDate(
            paidDate,
            Session.getScriptTimeZone(),
            'yyyy-MM'
          );

        const monthLabel =
          Utilities.formatDate(
            paidDate,
            Session.getScriptTimeZone(),
            'MMM yyyy'
          );

        if (
          !monthlyTotals[
            monthKey
          ]
        ) {
          monthlyTotals[
            monthKey
          ] = {
            month:
              monthLabel,

            amount:
              0
          };
        }

        monthlyTotals[
          monthKey
        ].amount +=
          amountPaid;
      }
    );

    result.monthlyPaymentHistory =
      Object.keys(
        monthlyTotals
      )
        .sort()
        .map(
          function (key) {
            return monthlyTotals[
              key
            ];
          }
        );

    return result;
  },


  /**
   * Estimates monthly take-home from populated PaySheet weeks.
   *
   * @return {number}
   */
  calculateEstimatedMonthlyTakeHome: function () {
    let sheet;

    try {
      sheet =
        PayTrackerUtils.getPaySheet();
    } catch (error) {
      return 0;
    }

    const existingWeeks =
      PayTrackerUtils.getExistingWeekCount(
        sheet
      );

    let totalTakeHome =
      0;

    let populatedWeeks =
      0;

    for (
      let weekNumber = 1;
      weekNumber <= existingWeeks;
      weekNumber++
    ) {
      const startRow =
        PayTrackerUtils.getWeekStartRow(
          weekNumber
        );

      if (
        !PayTrackerWeekManager.weekHasShiftData(
          sheet,
          startRow
        )
      ) {
        continue;
      }

      const weeklyTakeHome =
        Number(
          sheet
            .getRange(
              startRow + 5,
              PayTrackerConfig
                .SHEET
                .WEEKLY_SUMMARY_VALUE_COLUMN
            )
            .getValue()
        ) || 0;

      totalTakeHome +=
        weeklyTakeHome;

      populatedWeeks++;
    }

    if (
      populatedWeeks ===
      0
    ) {
      return 0;
    }

    return (
      totalTakeHome /
      populatedWeeks *
      52 /
      12
    );
  },


  /**
   * Builds the complete visible dashboard.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object} figures
   */
  buildDashboard: function (
    sheet,
    figures
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const requiredRows =
      105;

    const requiredColumns =
      20;

    PayTrackerFinanceDashboard.ensureDashboardSize(
      sheet,
      requiredRows,
      requiredColumns
    );

    sheet
      .getRange(
        1,
        1,
        sheet.getMaxRows(),
        sheet.getMaxColumns()
      )
      .breakApart();

    sheet.clear();

    sheet.setTabColor(
      '#9333ea'
    );

    sheet.setFrozenRows(
      2
    );

    sheet
      .getRange(
        'A1:H1'
      )
      .merge()
      .setValue(
        'PERSONAL FINANCE & SAVINGS DASHBOARD'
      )
      .setBackground(
        '#0f172a'
      )
      .setFontColor(
        '#ffffff'
      )
      .setFontWeight(
        'bold'
      )
      .setFontSize(
        16
      )
      .setHorizontalAlignment(
        'center'
      );

    PayTrackerFinanceDashboard.buildTopCards(
      sheet,
      figures
    );

    PayTrackerFinanceDashboard.buildFinancialProgress(
      sheet,
      figures
    );

    PayTrackerFinanceDashboard.buildStatusCards(
      sheet,
      figures
    );

    PayTrackerFinanceDashboard.buildDebtProgressSection(
      sheet,
      figures.debtRows
    );

    PayTrackerFinanceDashboard.buildSavingsPotSection(
      sheet,
      figures.savingsPotRows
    );

    PayTrackerFinanceDashboard.buildLifeGoalsSection(
      sheet,
      figures.goalRows
    );

    PayTrackerFinanceDashboard.buildSavingsScheduleSection(
      sheet,
      figures.savingsPotRows
    );

    for (
      let column = 1;
      column <= 8;
      column++
    ) {
      sheet.setColumnWidth(
        column,
        125
      );
    }

    sheet.setRowHeight(
      1,
      36
    );
  },


  /**
   * Builds dashboard KPI cards.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object} figures
   */
  buildTopCards: function (
    sheet,
    figures
  ) {
    const cards = [
      {
        range: 'A3:B5',
        label:
          'Estimated Monthly Take Home',
        value:
          figures.estimatedMonthlyTakeHome,
        background:
          '#dcfce7',
        font:
          '#166534'
      },

      {
        range: 'C3:D5',
        label:
          'Monthly Bills',
        value:
          figures.monthlyBills,
        background:
          '#dbeafe',
        font:
          '#1e3a8a'
      },

      {
        range: 'E3:F5',
        label:
          'Monthly Debt Repayments',
        value:
          figures.monthlyDebtRepayments,
        background:
          '#fee2e2',
        font:
          '#991b1b'
      },

      {
        range: 'G3:H5',
        label:
          'Planned Monthly Savings',
        value:
          figures.monthlySavings,
        background:
          '#ccfbf1',
        font:
          '#115e59'
      },

      {
        range: 'A7:B9',
        label:
          'Disposable After Savings',
        value:
          figures.disposableIncome,
        background:
          figures.disposableIncome >= 0
            ? '#dcfce7'
            : '#fee2e2',
        font:
          figures.disposableIncome >= 0
            ? '#166534'
            : '#991b1b'
      },

      {
        range: 'C7:D9',
        label:
          'Total Savings',
        value:
          figures.totalSavings,
        background:
          '#f3e8ff',
        font:
          '#6b21a8'
      },

      {
        range: 'E7:F9',
        label:
          'Total Debt Remaining',
        value:
          figures.totalDebtRemaining,
        background:
          '#ffedd5',
        font:
          '#9a3412'
      },

      {
        range: 'G7:H9',
        label:
          'Net Worth',
        value:
          figures.netWorth,
        background:
          figures.netWorth >= 0
            ? '#ecfccb'
            : '#fee2e2',
        font:
          figures.netWorth >= 0
            ? '#3f6212'
            : '#991b1b'
      },

      {
        range: 'A11:B13',
        label:
          'Finance Paid This Month',
        value:
          figures.paidThisMonth,
        background:
          '#e0f2fe',
        font:
          '#075985'
      },

      {
        range: 'C11:D13',
        label:
          'Saved This Month',
        value:
          figures.depositedThisMonth,
        background:
          '#d1fae5',
        font:
          '#065f46'
      },

      {
        range: 'E11:F13',
        label:
          'Estimated Annual Interest',
        value:
          figures.annualSavingsInterest,
        background:
          '#fef3c7',
        font:
          '#92400e'
      },

      {
        range: 'G11:H13',
        label:
          'Bills Due Next 30 Days',
        value:
          figures.billsDueNextThirtyDays,
        background:
          '#fef3c7',
        font:
          '#92400e'
      }
    ];

    cards.forEach(
      function (card) {
        PayTrackerFinanceDashboard.buildCard(
          sheet,
          card
        );
      }
    );
  },


  /**
   * Builds one dashboard card.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object} card
   */
  buildCard: function (
    sheet,
    card
  ) {
    const range =
      sheet.getRange(
        card.range
      );

    range
      .merge()
      .setBackground(
        card.background
      )
      .setFontColor(
        card.font
      )
      .setBorder(
        true,
        true,
        true,
        true,
        false,
        false,
        '#94a3b8',
        SpreadsheetApp.BorderStyle.SOLID
      )
      .setHorizontalAlignment(
        'center'
      )
      .setVerticalAlignment(
        'middle'
      )
      .setWrap(
        true
      )
      .setFontWeight(
        'bold'
      )
      .setFontSize(
        12
      )
      .setValue(
        card.label +
        '\n\n£' +
        Number(
          card.value || 0
        ).toLocaleString(
          'en-GB',
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }
        )
      );
  },


  /**
   * Builds financial progress bars.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object} figures
   */
  buildFinancialProgress: function (
    sheet,
    figures
  ) {
    PayTrackerFinanceDashboard.buildSectionHeader(
      sheet,
      'A15:H15',
      'FINANCIAL PROGRESS',
      '#334155'
    );

    const rows = [
      {
        row: 16,
        label:
          'Income Committed',
        value:
          figures.committedPercentage,
        colour:
          '#dc2626'
      },

      {
        row: 17,
        label:
          'Total Debt Repaid',
        value:
          figures.totalDebtProgress,
        colour:
          '#16a34a'
      },

      {
        row: 18,
        label:
          'Overall Savings Progress',
        value:
          figures.savingsProgress,
        colour:
          '#7c3aed'
      }
    ];

    rows.forEach(
      function (item) {
        sheet
          .getRange(
            item.row,
            1,
            1,
            2
          )
          .merge()
          .setValue(
            item.label
          );

        sheet
          .getRange(
            item.row,
            3,
            1,
            4
          )
          .merge()
          .setFormula(
            '=SPARKLINE(' +
            item.value +
            ',{"charttype","bar";"max",1;' +
            '"color1","' +
            item.colour +
            '"})'
          );

        sheet
          .getRange(
            item.row,
            7,
            1,
            2
          )
          .merge()
          .setValue(
            (
              item.value *
              100
            ).toFixed(1) +
            '%'
          )
          .setHorizontalAlignment(
            'right'
          );
      }
    );

    sheet
      .getRange(
        'A16:H18'
      )
      .setBackground(
        '#f8fafc'
      )
      .setBorder(
        true,
        true,
        true,
        true,
        true,
        true,
        '#cbd5e1',
        SpreadsheetApp.BorderStyle.SOLID
      );

    if (
      !figures.allocationValid
    ) {
      sheet
        .getRange(
          'A19:H19'
        )
        .merge()
        .setValue(
          'Savings allocation warning: active Percentage Allocation pots total ' +
          (
            figures.allocationTotal *
            100
          ).toFixed(2) +
          '%. They should total 100%.'
        )
        .setBackground(
          '#fee2e2'
        )
        .setFontColor(
          '#991b1b'
        )
        .setFontWeight(
          'bold'
        )
        .setHorizontalAlignment(
          'center'
        );
    }
  },


  /**
   * Builds dashboard status cards.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object} figures
   */
  buildStatusCards: function (
    sheet,
    figures
  ) {
    PayTrackerFinanceDashboard.buildSectionHeader(
      sheet,
      'A21:H21',
      'UPCOMING STATUS',
      '#334155'
    );

    const statuses = [
      {
        range:
          'A22:B24',
        label:
          'Overdue Payments',
        value:
          figures.overduePayments
      },

      {
        range:
          'C22:D24',
        label:
          'Due in 7 Days',
        value:
          figures.dueNextSevenDays
      },

      {
        range:
          'E22:F24',
        label:
          'Upcoming Savings Deposits',
        value:
          figures.upcomingContributions
      },

      {
        range:
          'G22:H24',
        label:
          'Overdue Savings Deposits',
        value:
          figures.overdueContributions
      }
    ];

    statuses.forEach(
      function (status) {
        sheet
          .getRange(
            status.range
          )
          .merge()
          .setValue(
            status.label +
            '\n\n' +
            status.value
          )
          .setBackground(
            '#f8fafc'
          )
          .setFontWeight(
            'bold'
          )
          .setFontSize(
            12
          )
          .setHorizontalAlignment(
            'center'
          )
          .setVerticalAlignment(
            'middle'
          )
          .setBorder(
            true,
            true,
            true,
            true,
            false,
            false,
            '#cbd5e1',
            SpreadsheetApp.BorderStyle.SOLID
          );
      }
    );
  },


  /**
   * Builds debt progress rows.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object[]} debtRows
   */
  buildDebtProgressSection: function (
    sheet,
    debtRows
  ) {
    PayTrackerFinanceDashboard.buildSectionHeader(
      sheet,
      'A26:H26',
      'DEBT REPAYMENT PROGRESS',
      '#334155'
    );

    PayTrackerFinanceDashboard.buildBasicProgressRows(
      sheet,
      27,
      debtRows || [],
      function (item) {
        return item.name;
      },
      function (item) {
        return item.progress;
      },
      '#16a34a',
      'No debts have been entered.'
    );
  },


  /**
   * Builds savings-pot progress rows with months to goal.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object[]} potRows
   */
  buildSavingsPotSection: function (
    sheet,
    potRows
  ) {
    PayTrackerFinanceDashboard.buildSectionHeader(
      sheet,
      'A39:H39',
      'SAVINGS POT PROGRESS',
      '#0f766e'
    );

    const rows =
      potRows || [];

    if (
      rows.length ===
      0
    ) {
      sheet
        .getRange(
          'A40:H41'
        )
        .merge()
        .setValue(
          'No active savings pots have been entered.'
        )
        .setHorizontalAlignment(
          'center'
        );

      return;
    }

    let currentRow =
      40;

    rows
      .slice(
        0,
        10
      )
      .forEach(
        function (pot) {
          const statusStyle =
            PayTrackerSavingsDashboardService
              .getTargetStatusStyle(
                pot.targetStatus
              );

          sheet
            .getRange(
              currentRow,
              1,
              1,
              2
            )
            .merge()
            .setValue(
              pot.name
            )
            .setFontWeight(
              'bold'
            );

          sheet
            .getRange(
              currentRow,
              3,
              1,
              3
            )
            .merge()
            .setFormula(
              '=SPARKLINE(' +
              pot.progress +
              ',{"charttype","bar";"max",1;' +
              '"color1","#7c3aed"})'
            );

          sheet
            .getRange(
              currentRow,
              6
            )
            .setValue(
              (
                pot.progress *
                100
              ).toFixed(1) +
              '%'
            )
            .setHorizontalAlignment(
              'right'
            );

          sheet
            .getRange(
              currentRow,
              7
            )
            .setValue(
              PayTrackerSavingsDashboardService
                .formatMonthsToGoal(
                  pot.monthsToGoal
                )
            );

          sheet
            .getRange(
              currentRow,
              8
            )
            .setValue(
              statusStyle.text
            )
            .setBackground(
              statusStyle.background
            )
            .setFontColor(
              statusStyle.font
            )
            .setFontWeight(
              'bold'
            )
            .setHorizontalAlignment(
              'center'
            );

          currentRow++;
        }
      );

    sheet
      .getRange(
        40,
        1,
        currentRow - 40,
        8
      )
      .setBackground(
        '#f8fafc'
      )
      .setBorder(
        true,
        true,
        true,
        true,
        true,
        true,
        '#cbd5e1',
        SpreadsheetApp.BorderStyle.SOLID
      );
  },


  /**
   * Builds Life Goal progress rows.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object[]} goalRows
   */
  buildLifeGoalsSection: function (
    sheet,
    goalRows
  ) {
    PayTrackerFinanceDashboard.buildSectionHeader(
      sheet,
      'A53:H53',
      'LIFE GOALS',
      '#c2410c'
    );

    const rows =
      goalRows || [];

    if (
      rows.length ===
      0
    ) {
      sheet
        .getRange(
          'A54:H55'
        )
        .merge()
        .setValue(
          'No active Life Goals have been entered.'
        )
        .setHorizontalAlignment(
          'center'
        );

      return;
    }

    let currentRow =
      54;

    rows
      .slice(
        0,
        10
      )
      .forEach(
        function (goal) {
          const statusStyle =
            PayTrackerSavingsDashboardService
              .getTargetStatusStyle(
                goal.targetStatus
              );

          sheet
            .getRange(
              currentRow,
              1,
              1,
              2
            )
            .merge()
            .setValue(
              goal.name
            )
            .setFontWeight(
              'bold'
            );

          sheet
            .getRange(
              currentRow,
              3,
              1,
              3
            )
            .merge()
            .setFormula(
              '=SPARKLINE(' +
              goal.progress +
              ',{"charttype","bar";"max",1;' +
              '"color1","#f97316"})'
            );

          sheet
            .getRange(
              currentRow,
              6
            )
            .setValue(
              (
                goal.progress *
                100
              ).toFixed(1) +
              '%'
            )
            .setHorizontalAlignment(
              'right'
            );

          sheet
            .getRange(
              currentRow,
              7
            )
            .setValue(
              PayTrackerSavingsDashboardService
                .formatMonthsToGoal(
                  goal.monthsRemaining
                )
            );

          sheet
            .getRange(
              currentRow,
              8
            )
            .setValue(
              statusStyle.text
            )
            .setBackground(
              statusStyle.background
            )
            .setFontColor(
              statusStyle.font
            )
            .setFontWeight(
              'bold'
            )
            .setHorizontalAlignment(
              'center'
            );

          currentRow++;
        }
      );

    sheet
      .getRange(
        54,
        1,
        currentRow - 54,
        8
      )
      .setBackground(
        '#f8fafc'
      )
      .setBorder(
        true,
        true,
        true,
        true,
        true,
        true,
        '#cbd5e1',
        SpreadsheetApp.BorderStyle.SOLID
      );
  },


  /**
   * Builds a readable contribution-schedule table.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object[]} potRows
   */
  buildSavingsScheduleSection: function (
    sheet,
    potRows
  ) {
    PayTrackerFinanceDashboard.buildSectionHeader(
      sheet,
      'A67:H67',
      'SAVINGS CONTRIBUTION SCHEDULES',
      '#0369a1'
    );

    sheet
      .getRange(
        'A68:H68'
      )
      .setValues([[
        'Pot',
        'Method',
        'Frequency',
        'Amount',
        'Monthly Equivalent',
        'Months to Goal',
        'Target Status',
        'Provider'
      ]])
      .setBackground(
        '#e0f2fe'
      )
      .setFontWeight(
        'bold'
      )
      .setHorizontalAlignment(
        'center'
      );

    const rows =
      potRows || [];

    if (
      rows.length ===
      0
    ) {
      sheet
        .getRange(
          'A69:H70'
        )
        .merge()
        .setValue(
          'No active savings schedules have been entered.'
        )
        .setHorizontalAlignment(
          'center'
        );

      return;
    }

    const output =
      rows
        .slice(
          0,
          15
        )
        .map(
          function (pot) {
            return [
              pot.name,

              pot.contributionMethod,

              pot.contributionFrequency,

              pot.contributionAmount,

              pot.monthlyEquivalent,

              PayTrackerSavingsDashboardService
                .formatMonthsToGoal(
                  pot.monthsToGoal
                ),

              pot.targetStatus,

              pot.provider
            ];
          }
        );

    sheet
      .getRange(
        69,
        1,
        output.length,
        8
      )
      .setValues(
        output
      )
      .setBackground(
        '#f8fafc'
      )
      .setBorder(
        true,
        true,
        true,
        true,
        true,
        true,
        '#cbd5e1',
        SpreadsheetApp.BorderStyle.SOLID
      );

    sheet
      .getRange(
        69,
        4,
        output.length,
        2
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.CURRENCY
      );
  },


  /**
   * Builds standard progress rows.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} firstRow
   * @param {Object[]} items
   * @param {Function} nameGetter
   * @param {Function} progressGetter
   * @param {string} colour
   * @param {string} emptyMessage
   */
  buildBasicProgressRows: function (
    sheet,
    firstRow,
    items,
    nameGetter,
    progressGetter,
    colour,
    emptyMessage
  ) {
    if (
      !items ||
      items.length ===
      0
    ) {
      sheet
        .getRange(
          firstRow,
          1,
          2,
          8
        )
        .merge()
        .setValue(
          emptyMessage
        )
        .setHorizontalAlignment(
          'center'
        );

      return;
    }

    let currentRow =
      firstRow;

    items
      .slice(
        0,
        10
      )
      .forEach(
        function (item) {
          const progress =
            Math.min(
              Math.max(
                Number(
                  progressGetter(
                    item
                  )
                ) || 0,
                0
              ),
              1
            );

          sheet
            .getRange(
              currentRow,
              1,
              1,
              2
            )
            .merge()
            .setValue(
              nameGetter(
                item
              )
            )
            .setFontWeight(
              'bold'
            );

          sheet
            .getRange(
              currentRow,
              3,
              1,
              4
            )
            .merge()
            .setFormula(
              '=SPARKLINE(' +
              progress +
              ',{"charttype","bar";"max",1;' +
              '"color1","' +
              colour +
              '"})'
            );

          sheet
            .getRange(
              currentRow,
              7,
              1,
              2
            )
            .merge()
            .setValue(
              (
                progress *
                100
              ).toFixed(1) +
              '%'
            )
            .setHorizontalAlignment(
              'right'
            );

          currentRow++;
        }
      );

    sheet
      .getRange(
        firstRow,
        1,
        currentRow - firstRow,
        8
      )
      .setBackground(
        '#f8fafc'
      )
      .setBorder(
        true,
        true,
        true,
        true,
        true,
        true,
        '#cbd5e1',
        SpreadsheetApp.BorderStyle.SOLID
      );
  },


  /**
   * Builds a section header.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {string} rangeAddress
   * @param {string} title
   * @param {string} background
   */
  buildSectionHeader: function (
    sheet,
    rangeAddress,
    title,
    background
  ) {
    sheet
      .getRange(
        rangeAddress
      )
      .merge()
      .setValue(
        title
      )
      .setBackground(
        background
      )
      .setFontColor(
        '#ffffff'
      )
      .setFontWeight(
        'bold'
      )
      .setHorizontalAlignment(
        'center'
      );
  },


  /**
   * Builds hidden chart data and dashboard charts.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object} figures
   */
  buildDashboardCharts: function (
    sheet,
    figures
  ) {
    sheet
      .getCharts()
      .forEach(
        function (chart) {
          sheet.removeChart(
            chart
          );
        }
      );

    const helperColumn =
      PayTrackerFinanceConfig
        .DASHBOARD
        .HELPER_START_COLUMN;

    sheet
      .getRange(
        1,
        helperColumn,
        110,
        10
      )
      .clear();

    PayTrackerFinanceDashboard.buildIncomeChart(
      sheet,
      figures,
      helperColumn
    );

    PayTrackerFinanceDashboard.buildDebtChart(
      sheet,
      figures,
      helperColumn + 3
    );

    PayTrackerFinanceDashboard.buildSavingsChart(
      sheet,
      figures,
      helperColumn,
      20
    );

    PayTrackerFinanceDashboard.buildGoalChart(
      sheet,
      figures,
      helperColumn + 3,
      20
    );

    try {
      sheet.hideColumns(
        helperColumn,
        10
      );
    } catch (error) {
      console.warn(
        'Unable to hide dashboard helper columns: ' +
        error.message
      );
    }
  },


  /**
   * Builds the income-allocation doughnut chart.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object} figures
   * @param {number} helperColumn
   */
  buildIncomeChart: function (
    sheet,
    figures,
    helperColumn
  ) {
    const data = [
      [
        'Category',
        'Amount'
      ],

      [
        'Bills',
        figures.monthlyBills
      ],

      [
        'Debt Repayments',
        figures.monthlyDebtRepayments
      ],

      [
        'Savings',
        figures.monthlySavings
      ],

      [
        'Disposable Income',
        Math.max(
          figures.disposableIncome,
          0
        )
      ]
    ];

    sheet
      .getRange(
        1,
        helperColumn,
        data.length,
        2
      )
      .setValues(
        data
      );

    const chart =
      sheet
        .newChart()
        .setChartType(
          Charts.ChartType.PIE
        )
        .addRange(
          sheet.getRange(
            1,
            helperColumn,
            data.length,
            2
          )
        )
        .setPosition(
          82,
          1,
          0,
          0
        )
        .setOption(
          'title',
          'Monthly Income Allocation'
        )
        .setOption(
          'pieHole',
          0.45
        )
        .setOption(
          'legend',
          {
            position:
              'right'
          }
        )
        .build();

    sheet.insertChart(
      chart
    );
  },


  /**
   * Builds remaining debt by account chart.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object} figures
   * @param {number} helperColumn
   */
  buildDebtChart: function (
    sheet,
    figures,
    helperColumn
  ) {
    const data = [
      [
        'Debt',
        'Remaining Balance'
      ]
    ];

    figures.debtRows
      .forEach(
        function (debt) {
          data.push([
            debt.name,
            debt.currentBalance
          ]);
        }
      );

    if (
      data.length ===
      1
    ) {
      return;
    }

    sheet
      .getRange(
        1,
        helperColumn,
        data.length,
        2
      )
      .setValues(
        data
      );

    const chart =
      sheet
        .newChart()
        .setChartType(
          Charts.ChartType.BAR
        )
        .addRange(
          sheet.getRange(
            1,
            helperColumn,
            data.length,
            2
          )
        )
        .setPosition(
          82,
          5,
          0,
          0
        )
        .setOption(
          'title',
          'Remaining Balance by Debt'
        )
        .setOption(
          'legend',
          {
            position:
              'none'
          }
        )
        .build();

    sheet.insertChart(
      chart
    );
  },


  /**
   * Builds savings balance by pot chart.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object} figures
   * @param {number} helperColumn
   * @param {number} helperRow
   */
  buildSavingsChart: function (
    sheet,
    figures,
    helperColumn,
    helperRow
  ) {
    const data = [
      [
        'Savings Pot',
        'Balance'
      ]
    ];

    figures.savingsPotRows
      .forEach(
        function (pot) {
          data.push([
            pot.name,
            pot.currentBalance
          ]);
        }
      );

    if (
      data.length ===
      1
    ) {
      return;
    }

    sheet
      .getRange(
        helperRow,
        helperColumn,
        data.length,
        2
      )
      .setValues(
        data
      );

    const chart =
      sheet
        .newChart()
        .setChartType(
          Charts.ChartType.BAR
        )
        .addRange(
          sheet.getRange(
            helperRow,
            helperColumn,
            data.length,
            2
          )
        )
        .setPosition(
          97,
          1,
          0,
          0
        )
        .setOption(
          'title',
          'Savings Balance by Pot'
        )
        .setOption(
          'legend',
          {
            position:
              'none'
          }
        )
        .build();

    sheet.insertChart(
      chart
    );
  },


  /**
   * Builds Life Goal progress chart.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object} figures
   * @param {number} helperColumn
   * @param {number} helperRow
   */
  buildGoalChart: function (
    sheet,
    figures,
    helperColumn,
    helperRow
  ) {
    const data = [
      [
        'Life Goal',
        'Progress %'
      ]
    ];

    figures.goalRows
      .forEach(
        function (goal) {
          data.push([
            goal.name,
            goal.progress *
            100
          ]);
        }
      );

    if (
      data.length ===
      1
    ) {
      return;
    }

    sheet
      .getRange(
        helperRow,
        helperColumn,
        data.length,
        2
      )
      .setValues(
        data
      );

    const chart =
      sheet
        .newChart()
        .setChartType(
          Charts.ChartType.COLUMN
        )
        .addRange(
          sheet.getRange(
            helperRow,
            helperColumn,
            data.length,
            2
          )
        )
        .setPosition(
          97,
          5,
          0,
          0
        )
        .setOption(
          'title',
          'Life Goal Progress'
        )
        .setOption(
          'legend',
          {
            position:
              'none'
          }
        )
        .setOption(
          'vAxis',
          {
            minValue:
              0,

            maxValue:
              100
          }
        )
        .build();

    sheet.insertChart(
      chart
    );
  },


  /**
   * Ensures the dashboard has enough rows and columns.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} requiredRows
   * @param {number} requiredColumns
   */
  ensureDashboardSize: function (
    sheet,
    requiredRows,
    requiredColumns
  ) {
    if (
      sheet.getMaxRows() <
      requiredRows
    ) {
      sheet.insertRowsAfter(
        sheet.getMaxRows(),
        requiredRows -
        sheet.getMaxRows()
      );
    }

    if (
      sheet.getMaxColumns() <
      requiredColumns
    ) {
      sheet.insertColumnsAfter(
        sheet.getMaxColumns(),
        requiredColumns -
        sheet.getMaxColumns()
      );
    }
  }
});