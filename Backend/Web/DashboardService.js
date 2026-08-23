/*******************************************************
 * PAY TRACKER V2.6
 * Backend/Web/DashboardService.js
 *
 * Lightweight web-dashboard data service.
 *
 * Design goals:
 * - One browser request
 * - Batched spreadsheet reads
 * - No dashboard recalculation calls
 * - No repeated week-by-week sheet requests
 * - Safe fallback data when optional sheets are missing
 *******************************************************/

const PayTrackerWebDashboardService = Object.freeze({
  WEEKLY_SPENDING_DEFAULT: 100,

  getDashboardData: function() {
    const startedAt = new Date();

    try {
      const spreadsheet =
        SpreadsheetApp.getActiveSpreadsheet();

      if (!spreadsheet) {
        throw new Error(
          'No active Pay Tracker spreadsheet is available.'
        );
      }

      const pay =
        PayTrackerWebDashboardService
          .readLatestPayWeek(spreadsheet);

      const finance =
        PayTrackerWebDashboardService
          .readFinanceData(spreadsheet);

      const savings =
        PayTrackerWebDashboardService
          .readSavingsData(spreadsheet);

      const subscriptions =
        PayTrackerWebDashboardService
          .readSubscriptionsData();

      const cashFlow =
        PayTrackerWebDashboardService
          .buildCashFlow(
            pay,
            finance,
            savings.settings
          );

      const payBreakdown =
        PayTrackerWebDashboardService
          .buildPayBreakdown(
            pay,
            finance,
            cashFlow,
            subscriptions,
            savings.pots
          );

      return {
        success: true,
        generatedAt: startedAt.toISOString(),
        durationMilliseconds:
          new Date().getTime() - startedAt.getTime(),
        pay: pay,
        finance: finance,
        cashFlow: cashFlow,
        payBreakdown: payBreakdown,
        savingsPots: savings.pots,
        commitments:
          PayTrackerWebDashboardService
            .buildCommitments(
              finance,
              savings
            ),
        lifeGoals: savings.goals,
        activity: [],
        messages: {
          cashFlow:
            cashFlow.hasData
              ? 'Weekly cash flow calculated from the latest populated pay week.'
              : 'Add shifts to the PaySheet to calculate weekly cash flow.'
        }
      };
    } catch (error) {
      console.error(
        'Web dashboard data generation failed.',
        error
      );

      return {
        success: false,
        generatedAt: startedAt.toISOString(),
        error:
          PayTrackerWebDashboardService
            .getErrorMessage(error)
      };
    }
  },

  readLatestPayWeek: function(spreadsheet) {
    const sheetName =
      PayTrackerConfig &&
      PayTrackerConfig.SHEET &&
      PayTrackerConfig.SHEET.NAME
        ? PayTrackerConfig.SHEET.NAME
        : 'PaySheet';

    const sheet =
      spreadsheet.getSheetByName(sheetName);

    if (!sheet) {
      return PayTrackerWebDashboardService
        .emptyPayData(
          'The PaySheet could not be found.'
        );
    }

    const lastRow = Math.max(sheet.getLastRow(), 1);
    const lastColumn = Math.max(
      sheet.getLastColumn(),
      PayTrackerConfig.SHEET.TOTAL_COLUMNS || 30
    );

    const values = sheet
      .getRange(1, 1, lastRow, lastColumn)
      .getValues();

    const displayValues = sheet
      .getRange(1, 1, lastRow, lastColumn)
      .getDisplayValues();

    const blockHeight =
      PayTrackerConfig.SHEET.BLOCK_HEIGHT;

    const dataOffset =
      PayTrackerConfig.SHEET.WEEK_DATA_ROW_OFFSET;

    const dataCount =
      PayTrackerConfig.SHEET.WEEK_DATA_ROW_COUNT;

    const totalOffset =
      PayTrackerConfig.SHEET.WEEK_TOTAL_ROW_OFFSET;

    const summaryColumn =
      PayTrackerConfig.SHEET
        .WEEKLY_SUMMARY_VALUE_COLUMN;

    const tables =
      PayTrackerWebDashboardService
        .getPayTables();

    let selectedStartIndex = -1;
    let selectedWeekNumber = 0;

    for (
      let startIndex = 0;
      startIndex < values.length;
      startIndex += blockHeight
    ) {
      const headerText = String(
        displayValues[startIndex] &&
        displayValues[startIndex][0]
          ? displayValues[startIndex][0]
          : ''
      ).trim();

      const weekMatch =
        headerText.match(/^Week\s+(\d+)/i);

      if (!weekMatch) {
        continue;
      }

      let hasShift = false;

      for (
        let dayIndex = 0;
        dayIndex < dataCount && !hasShift;
        dayIndex++
      ) {
        const rowIndex =
          startIndex + dataOffset + dayIndex;

        if (rowIndex >= displayValues.length) {
          break;
        }

        for (
          let tableIndex = 0;
          tableIndex < tables.length;
          tableIndex++
        ) {
          const shiftColumnIndex =
            tables[tableIndex].startColumn + 1;

          const shiftName = String(
            displayValues[rowIndex][shiftColumnIndex] || ''
          ).trim();

          if (shiftName !== '') {
            hasShift = true;
            break;
          }
        }
      }

      if (hasShift) {
        selectedStartIndex = startIndex;
        selectedWeekNumber = Number(weekMatch[1]) || 0;
      }
    }

    if (selectedStartIndex < 0) {
      return PayTrackerWebDashboardService
        .emptyPayData(
          'No shifts have been entered yet.'
        );
    }

    const employers = {};
    let totalGross = 0;

    tables.forEach(function(table) {
      const key =
        PayTrackerWebDashboardService
          .getEmployerKey(table.name);

      const shiftColumnIndex =
        table.startColumn + 1;

      const payColumnIndex =
        table.startColumn + 3;

      let shifts = 0;
      let calculatedTotal = 0;

      for (
        let dayIndex = 0;
        dayIndex < dataCount;
        dayIndex++
      ) {
        const rowIndex =
          selectedStartIndex + dataOffset + dayIndex;

        if (rowIndex >= values.length) {
          break;
        }

        const shiftName = String(
          displayValues[rowIndex][shiftColumnIndex] || ''
        ).trim();

        if (shiftName !== '') {
          shifts++;
        }

        calculatedTotal +=
          Number(values[rowIndex][payColumnIndex]) || 0;
      }

      const totalRowIndex =
        selectedStartIndex + totalOffset;

      const storedTotal =
        totalRowIndex < values.length
          ? Number(values[totalRowIndex][payColumnIndex]) || 0
          : 0;

      const total =
        PayTrackerWebDashboardService
          .roundCurrency(
            storedTotal || calculatedTotal
          );

      employers[key] = {
        name: table.name,
        taxable: Boolean(table.taxable),
        shifts: shifts,
        total: total
      };

      totalGross += total;
    });

    const summaryStartIndex =
      selectedStartIndex + 1;

    const summaryIndex =
      summaryColumn - 1;

    const summaryValues = [];

    for (let index = 0; index < 5; index++) {
      const rowIndex = summaryStartIndex + index;

      summaryValues.push(
        rowIndex < values.length
          ? Number(values[rowIndex][summaryIndex]) || 0
          : 0
      );
    }

    const taxableGross = summaryValues[0];
    const estimatedDeductions = summaryValues[1];
    const taxableTakeHome = summaryValues[2];
    const loggingCash = summaryValues[3];
    const totalTakeHome = summaryValues[4];

    const firstDateIndex =
      selectedStartIndex + dataOffset;

    const lastDateIndex =
      firstDateIndex + 6;

    const firstDate =
      values[firstDateIndex]
        ? values[firstDateIndex][0]
        : null;

    const lastDate =
      values[lastDateIndex]
        ? values[lastDateIndex][0]
        : null;

    return {
      hasData: true,
      weekNumber: selectedWeekNumber,
      weekLabel:
        PayTrackerWebDashboardService
          .formatWeekLabel(
            selectedWeekNumber,
            firstDate,
            lastDate
          ),
      weekStart:
        PayTrackerWebDashboardService
          .serializeDate(firstDate),
      weekEnd:
        PayTrackerWebDashboardService
          .serializeDate(lastDate),
      gross:
        PayTrackerWebDashboardService
          .roundCurrency(totalGross),
      taxableGross:
        PayTrackerWebDashboardService
          .roundCurrency(taxableGross),
      estimatedDeductions:
        PayTrackerWebDashboardService
          .roundCurrency(estimatedDeductions),
      taxableTakeHome:
        PayTrackerWebDashboardService
          .roundCurrency(taxableTakeHome),
      loggingCash:
        PayTrackerWebDashboardService
          .roundCurrency(loggingCash),
      takeHome:
        PayTrackerWebDashboardService
          .roundCurrency(
            totalTakeHome ||
            taxableTakeHome + loggingCash
          ),
      deductionRate:
        taxableGross > 0
          ? estimatedDeductions / taxableGross
          : 0,
      employers: employers,
      message: ''
    };
  },

  readFinanceData: function(spreadsheet) {
    const billsSheet =
      spreadsheet.getSheetByName('Bills');

    const debtsSheet =
      spreadsheet.getSheetByName('Debts');

    const paymentsSheet =
      spreadsheet.getSheetByName('Finance Payments');

    let monthlyBills = 0;
    let monthlyDebtRepayments = 0;
    let dueNextSevenDays = 0;
    let overduePayments = 0;

    if (billsSheet && billsSheet.getLastRow() >= 2) {
      const rows = billsSheet
        .getRange(
          2,
          1,
          billsSheet.getLastRow() - 1,
          Math.max(billsSheet.getLastColumn(), 9)
        )
        .getValues();

      rows.forEach(function(row) {
        const active =
          String(row[6] || '').trim().toLowerCase();

        if (active === 'yes') {
          monthlyBills += Number(row[8]) || 0;
        }
      });
    }

    if (debtsSheet && debtsSheet.getLastRow() >= 2) {
      const rows = debtsSheet
        .getRange(
          2,
          1,
          debtsSheet.getLastRow() - 1,
          Math.max(debtsSheet.getLastColumn(), 12)
        )
        .getValues();

      rows.forEach(function(row) {
        const active =
          String(row[10] || '').trim().toLowerCase();

        if (active === 'yes') {
          monthlyDebtRepayments +=
            Number(row[11]) || 0;
        }
      });
    }

    if (paymentsSheet && paymentsSheet.getLastRow() >= 2) {
      const today =
        PayTrackerWebDashboardService
          .startOfDay(new Date());

      const sevenDaysLater = new Date(today);
      sevenDaysLater.setDate(
        sevenDaysLater.getDate() + 7
      );

      const rows = paymentsSheet
        .getRange(
          2,
          1,
          paymentsSheet.getLastRow() - 1,
          Math.max(paymentsSheet.getLastColumn(), 8)
        )
        .getValues();

      rows.forEach(function(row) {
        const dueDate =
          PayTrackerWebDashboardService
            .toDate(row[1]);

        const paid =
          row[6] === true ||
          String(row[6] || '').trim().toLowerCase() === 'yes';

        const status =
          String(row[7] || '').trim().toLowerCase();

        if (!dueDate || paid || status === 'completed') {
          return;
        }

        const cleanDueDate =
          PayTrackerWebDashboardService
            .startOfDay(dueDate);

        if (cleanDueDate < today) {
          overduePayments++;
        } else if (cleanDueDate <= sevenDaysLater) {
          dueNextSevenDays++;
        }
      });
    }

    return {
      available: true,
      monthlyBills:
        PayTrackerWebDashboardService
          .roundCurrency(monthlyBills),
      monthlyDebtRepayments:
        PayTrackerWebDashboardService
          .roundCurrency(monthlyDebtRepayments),
      dueNextSevenDays: dueNextSevenDays,
      overduePayments: overduePayments,
      message: ''
    };
  },

  /**
   * Reads confirmed, active subscriptions for the weekly pay
   * breakdown's Committed Costs figure.
   *
   * Reuses PayTrackerSubscriptionRepository (the same
   * repository the Finance workspace uses) rather than
   * re-reading the Subscriptions sheet directly. Subscriptions
   * that were originally seeded from an existing Bill
   * (Linked Bill ID set) are excluded here because they are
   * already counted inside readFinanceData's monthlyBills -
   * counting them again would double-count that cost.
   *
   * @return {Object}
   */
  readSubscriptionsData: function() {
    if (
      typeof PayTrackerSubscriptionRepository ===
      'undefined'
    ) {
      return {
        available: false,
        monthlyCostExcludingBills: 0
      };
    }

    try {
      const records =
        PayTrackerSubscriptionRepository
          .getAll();

      const standalone =
        records.filter(function(record) {
          return (
            record.subscriptionStatus ===
              'Active' &&
            record.reviewStatus ===
              'Confirmed' &&
            !record.linkedBillId
          );
        });

      const monthlyCostExcludingBills =
        standalone.reduce(
          function(total, record) {
            return (
              total +
              (
                Number(record.monthlyCost) || 0
              )
            );
          },
          0
        );

      return {
        available: true,
        count: standalone.length,
        monthlyCostExcludingBills:
          PayTrackerWebDashboardService
            .roundCurrency(
              monthlyCostExcludingBills
            )
      };
    } catch (error) {
      console.error(
        'Reading subscriptions for the dashboard failed.',
        error
      );

      return {
        available: false,
        monthlyCostExcludingBills: 0
      };
    }
  },

  readSavingsData: function(spreadsheet) {
    const settings =
      PayTrackerWebDashboardService
        .readSavingsSettings(spreadsheet);

    const pots =
      PayTrackerWebDashboardService
        .readSavingsPots(spreadsheet);

    const goals =
      PayTrackerWebDashboardService
        .readLifeGoals(spreadsheet);

    const contributionsSheet =
      spreadsheet.getSheetByName(
        'Savings Contributions'
      );

    let upcomingContributions = 0;

    if (
      contributionsSheet &&
      contributionsSheet.getLastRow() >= 2
    ) {
      const rows = contributionsSheet
        .getRange(
          2,
          1,
          contributionsSheet.getLastRow() - 1,
          Math.max(
            contributionsSheet.getLastColumn(),
            7
          )
        )
        .getValues();

      rows.forEach(function(row) {
        const deposited =
          row[5] === true ||
          String(row[5] || '')
            .trim()
            .toLowerCase() === 'yes';

        const status =
          String(row[6] || '')
            .trim()
            .toLowerCase();

        if (!deposited && status === 'upcoming') {
          upcomingContributions++;
        }
      });
    }

    return {
      settings: settings,
      pots: pots,
      goals: goals,
      upcomingContributions:
        upcomingContributions
    };
  },

  readSavingsSettings: function(spreadsheet) {
    const defaults = {
      mode: 'Percentage of Disposable Income',
      percentage: 0.4,
      fixedMonthlyAmount: 0,
      maximumMonthlySavings: 0
    };

    const sheet =
      spreadsheet.getSheetByName(
        'Savings Settings'
      );

    if (!sheet || sheet.getLastRow() < 2) {
      return defaults;
    }

    const rows = sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        Math.max(sheet.getLastColumn(), 2)
      )
      .getValues();

    const values = {};

    rows.forEach(function(row) {
      const key = String(row[0] || '').trim();

      if (key !== '') {
        values[key] = row[1];
      }
    });

    return {
      mode:
        String(
          values['Savings Mode'] ||
          defaults.mode
        ),
      percentage:
        PayTrackerWebDashboardService
          .normalizePercentage(
            values[
              'Disposable Income Savings %'
            ],
            defaults.percentage
          ),
      fixedMonthlyAmount:
        Number(
          values[
            'Fixed Monthly Savings Amount'
          ]
        ) || 0,
      maximumMonthlySavings:
        Number(
          values['Maximum Monthly Savings']
        ) || 0
    };
  },

  readSavingsPots: function(spreadsheet) {
    const sheet =
      spreadsheet.getSheetByName('Savings Pots');

    if (!sheet || sheet.getLastRow() < 2) {
      return [];
    }

    const rows = sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        Math.max(sheet.getLastColumn(), 26)
      )
      .getValues();

    return rows
      .filter(function(row) {
        return (
          String(row[8] || '')
            .trim()
            .toLowerCase() === 'yes'
        );
      })
      .slice(0, 3)
      .map(function(row) {
        const balance = Number(row[4]) || 0;
        const goal = Number(row[5]) || 0;
        const progressValue = Number(row[13]);

        const progress =
          Number.isFinite(progressValue)
            ? PayTrackerWebDashboardService
                .clampProgress(progressValue)
            : goal > 0
              ? PayTrackerWebDashboardService
                  .clampProgress(balance / goal)
              : 0;

        return {
          id: String(row[0] || ''),
          name:
            String(row[1] || 'Savings pot'),
          provider: String(row[2] || ''),
          accountType: String(row[3] || ''),
          balance:
            PayTrackerWebDashboardService
              .roundCurrency(balance),
          goal:
            PayTrackerWebDashboardService
              .roundCurrency(goal),
          contribution:
            PayTrackerWebDashboardService
              .roundCurrency(
                PayTrackerWebDashboardService
                  .weeklyContributionFromPot(row)
              ),
          progress: progress,
          monthsToGoal:
            Number(row[24]) || 0,
          targetStatus:
            String(row[25] || '')
        };
      });
  },

  readLifeGoals: function(spreadsheet) {
    const sheet =
      spreadsheet.getSheetByName('Life Goals');

    if (!sheet || sheet.getLastRow() < 2) {
      return [];
    }

    const rows = sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        Math.max(sheet.getLastColumn(), 15)
      )
      .getValues();

    return rows
      .filter(function(row) {
        return (
          String(row[7] || '')
            .trim()
            .toLowerCase() === 'yes'
        );
      })
      .sort(function(left, right) {
        return (
          PayTrackerWebDashboardService
            .priorityWeight(left[6]) -
          PayTrackerWebDashboardService
            .priorityWeight(right[6])
        );
      })
      .slice(0, 3)
      .map(function(row) {
        const target = Number(row[3]) || 0;
        const current = Number(row[4]) || 0;
        const progressValue = Number(row[9]);

        return {
          id: String(row[0] || ''),
          name:
            String(row[1] || 'Life goal'),
          target:
            PayTrackerWebDashboardService
              .roundCurrency(target),
          current:
            PayTrackerWebDashboardService
              .roundCurrency(current),
          progress:
            Number.isFinite(progressValue)
              ? PayTrackerWebDashboardService
                  .clampProgress(progressValue)
              : target > 0
                ? PayTrackerWebDashboardService
                    .clampProgress(current / target)
                : 0,
          monthsRemaining:
            Number(row[13]) || 0,
          completionDate:
            PayTrackerWebDashboardService
              .serializeDate(row[10]),
          targetStatus:
            String(row[14] || ''),
          priority:
            String(row[6] || '')
        };
      });
  },

  buildCashFlow: function(
    pay,
    finance,
    savingsSettings
  ) {
    const monthlyToWeekly = 12 / 52;

    const takeHome = Number(pay.takeHome) || 0;

    const bills =
      (
        Number(finance.monthlyBills) || 0
      ) * monthlyToWeekly;

    const debtRepayments =
      (
        Number(
          finance.monthlyDebtRepayments
        ) || 0
      ) * monthlyToWeekly;

    const committedPayments =
      bills + debtRepayments;

    const weeklySpending =
      PayTrackerWebDashboardService
        .WEEKLY_SPENDING_DEFAULT;

    const disposableIncome =
      takeHome -
      committedPayments -
      weeklySpending;

    const availableDisposable =
      Math.max(disposableIncome, 0);

    const settings = savingsSettings || {};

    let suggestedSavings = 0;

    if (
      String(settings.mode || '') ===
      'Fixed Monthly Amount'
    ) {
      suggestedSavings =
        (
          Number(settings.fixedMonthlyAmount) || 0
        ) * monthlyToWeekly;
    } else {
      suggestedSavings =
        availableDisposable *
        PayTrackerWebDashboardService
          .normalizePercentage(
            settings.percentage,
            0.4
          );
    }

    const maximumMonthlySavings =
      Number(settings.maximumMonthlySavings) || 0;

    if (maximumMonthlySavings > 0) {
      suggestedSavings = Math.min(
        suggestedSavings,
        maximumMonthlySavings * monthlyToWeekly
      );
    }

    suggestedSavings = Math.min(
      Math.max(suggestedSavings, 0),
      availableDisposable
    );

    const availableAfterSavings =
      disposableIncome - suggestedSavings;

    return {
      hasData: Boolean(pay.hasData),
      takeHome:
        PayTrackerWebDashboardService
          .roundCurrency(takeHome),
      bills:
        PayTrackerWebDashboardService
          .roundCurrency(committedPayments),
      weeklySpending:
        PayTrackerWebDashboardService
          .roundCurrency(weeklySpending),
      disposableIncome:
        PayTrackerWebDashboardService
          .roundCurrency(disposableIncome),
      suggestedSavings:
        PayTrackerWebDashboardService
          .roundCurrency(suggestedSavings),
      availableAfterSavings:
        PayTrackerWebDashboardService
          .roundCurrency(availableAfterSavings),
      savingsRate:
        availableDisposable > 0
          ? suggestedSavings / availableDisposable
          : 0
    };
  },

  /**
   * Builds the Weekly Pay Breakdown shown on the Dashboard.
   *
   * Every figure here is derived from data the Dashboard
   * already calculates (pay, cashFlow) plus a proportional
   * split of the existing estimated-deductions total using
   * real Tax/NI/Pension/Student Loan ratios from the most
   * recently imported payslip, when one exists. Nothing here
   * changes pay.takeHome or cashFlow's own totals - it only
   * explains how the existing totals are made up.
   *
   * @param {Object} pay
   * @param {Object} finance
   * @param {Object} cashFlow
   * @param {Object} subscriptions
   * @param {Object[]} savingsPots
   * @return {Object}
   */
  buildPayBreakdown: function(
    pay,
    finance,
    cashFlow,
    subscriptions,
    savingsPots
  ) {
    const gross =
      Math.max(Number(pay.gross) || 0, 0);

    const takeHome =
      Math.max(Number(pay.takeHome) || 0, 0);

    const totalPayrollDeductions =
      Math.max(gross - takeHome, 0);

    const deductionSplit =
      PayTrackerWebDashboardService
        .splitPayrollDeductions(
          totalPayrollDeductions
        );

    /*
     * Committed Costs is calculated independently here, not read
     * from cashFlow.bills - that field is the established Weekly
     * Cash Flow card's own contract (Bills + Debt repayments only)
     * and must not change behaviour just because this feature also
     * wants to fold in standalone Subscriptions.
     */
    const monthlyToWeekly = 12 / 52;

    const billsOnly =
      (
        Number(finance.monthlyBills) || 0
      ) * monthlyToWeekly;

    const debtsOnly =
      (
        Number(finance.monthlyDebtRepayments) || 0
      ) * monthlyToWeekly;

    const standaloneSubscriptions =
      (
        subscriptions &&
        Number(
          subscriptions.monthlyCostExcludingBills
        )
      ) || 0;

    const subscriptionsOnly =
      standaloneSubscriptions * monthlyToWeekly;

    const committedCosts =
      Math.max(
        billsOnly + debtsOnly + subscriptionsOnly,
        0
      );

    const weeklySpending =
      Math.max(
        Number(cashFlow.weeklySpending) || 0,
        0
      );

    const disposableIncome =
      Number(cashFlow.disposableIncome) || 0;

    const savings =
      Math.max(
        Number(cashFlow.suggestedSavings) || 0,
        0
      );

    const roundedGross =
      PayTrackerWebDashboardService
        .roundCurrency(gross);

    const roundedDeductionsTotal =
      PayTrackerWebDashboardService
        .roundCurrency(
          totalPayrollDeductions
        );

    const roundedCommittedCosts =
      PayTrackerWebDashboardService
        .roundCurrency(committedCosts);

    const roundedWeeklySpending =
      PayTrackerWebDashboardService
        .roundCurrency(weeklySpending);

    const roundedSavings =
      PayTrackerWebDashboardService
        .roundCurrency(savings);

    /*
     * Money Left is deliberately the residual of the other four
     * already-rounded categories (not an independent rounding of
     * cashFlow.availableAfterSavings) - mirroring how Student Loan
     * absorbs the rounding residual in splitPayrollDeductions_.
     * Without this, four independently-rounded penny values can
     * drift a penny away from the displayed gross even though the
     * underlying unrounded figures reconcile exactly.
     */
    const moneyLeft =
      PayTrackerWebDashboardService
        .roundCurrency(
          roundedGross -
          roundedDeductionsTotal -
          roundedCommittedCosts -
          roundedWeeklySpending -
          roundedSavings
        );

    const potBreakdown =
      Array.isArray(savingsPots)
        ? savingsPots
            .filter(function(pot) {
              return (
                Number(pot.contribution) || 0
              ) > 0;
            })
            .map(function(pot) {
              return {
                name: pot.name,
                weeklyContribution:
                  PayTrackerWebDashboardService
                    .roundCurrency(
                      Number(pot.contribution) ||
                      0
                    )
              };
            })
        : [];

    return {
      hasData: Boolean(pay.hasData) && gross > 0,
      gross: roundedGross,
      takeHome:
        PayTrackerWebDashboardService
          .roundCurrency(takeHome),
      disposableIncome:
        PayTrackerWebDashboardService
          .roundCurrency(disposableIncome),
      moneyLeft: moneyLeft,

      deductions: {
        available:
          deductionSplit.available,
        source:
          deductionSplit.source,
        tax:
          deductionSplit.tax,
        nationalInsurance:
          deductionSplit.nationalInsurance,
        pension:
          deductionSplit.pension,
        studentLoan:
          deductionSplit.studentLoan,
        total: roundedDeductionsTotal,
        rateOfGross:
          gross > 0
            ? totalPayrollDeductions / gross
            : 0
      },

      committedCosts: {
        total: roundedCommittedCosts,
        bills:
          PayTrackerWebDashboardService
            .roundCurrency(billsOnly),
        debts:
          PayTrackerWebDashboardService
            .roundCurrency(debtsOnly),
        subscriptions:
          PayTrackerWebDashboardService
            .roundCurrency(subscriptionsOnly),
        subscriptionsAvailable:
          Boolean(
            subscriptions &&
            subscriptions.available
          ),
        rateOfTakeHome:
          takeHome > 0
            ? committedCosts / takeHome
            : 0
      },

      weeklySpending: {
        total: roundedWeeklySpending,
        rateOfTakeHome:
          takeHome > 0
            ? weeklySpending / takeHome
            : 0
      },

      savings: {
        total: roundedSavings,
        rateOfDisposableIncome:
          Number(cashFlow.savingsRate) || 0,
        disposableIncomeBeforeSavings:
          PayTrackerWebDashboardService
            .roundCurrency(
              Math.max(disposableIncome, 0)
            ),
        pots: potBreakdown
      },

      moneyLeftDetail: {
        rateOfGross:
          gross > 0
            ? moneyLeft / gross
            : 0,
        rateOfTakeHome:
          takeHome > 0
            ? moneyLeft / takeHome
            : 0,
        rateOfDisposableIncome:
          disposableIncome > 0
            ? moneyLeft / disposableIncome
            : 0
      },

      markers: {
        takeHome:
          PayTrackerWebDashboardService
            .roundCurrency(takeHome),
        disposableIncome:
          PayTrackerWebDashboardService
            .roundCurrency(disposableIncome)
      }
    };
  },

  /**
   * Splits the existing weekly estimated-deductions total
   * into Tax / National Insurance / Pension / Student Loan
   * using the real ratios found on the most recently
   * imported payslip (Payroll Centre), if one exists.
   *
   * The four returned amounts always sum to exactly
   * totalPayrollDeductions, so Take-Home keeps reconciling
   * with the figure already shown elsewhere on the Dashboard.
   * When no payslip has been imported, or a payslip exists
   * but recorded no deductions, no ratio can be derived - in
   * that case `available` is false and every part is 0; the
   * frontend shows one combined "Payroll deductions" segment
   * instead of guessing a split.
   *
   * @param {number} totalPayrollDeductions
   * @return {Object}
   */
  splitPayrollDeductions: function(
    totalPayrollDeductions
  ) {
    const zeroResult = {
      available: false,
      source: '',
      tax: 0,
      nationalInsurance: 0,
      pension: 0,
      studentLoan: 0
    };

    if (
      typeof PayTrackerPayslipRepository ===
      'undefined'
    ) {
      return zeroResult;
    }

    try {
      const latestPayslip =
        PayTrackerPayslipRepository.getLatest();

      if (!latestPayslip) {
        return zeroResult;
      }

      const tax =
        Math.max(
          Number(latestPayslip.taxActual) || 0,
          0
        );

      const nationalInsurance =
        Math.max(
          Number(
            latestPayslip
              .nationalInsuranceActual
          ) || 0,
          0
        );

      const pension =
        Math.max(
          Number(latestPayslip.pensionActual) ||
          0,
          0
        );

      const studentLoan =
        Math.max(
          Number(
            latestPayslip.studentLoanActual
          ) || 0,
          0
        );

      const observedTotal =
        tax +
        nationalInsurance +
        pension +
        studentLoan;

      if (!(observedTotal > 0)) {
        return zeroResult;
      }

      const roundedTax =
        PayTrackerWebDashboardService
          .roundCurrency(
            totalPayrollDeductions *
            (tax / observedTotal)
          );

      const roundedNationalInsurance =
        PayTrackerWebDashboardService
          .roundCurrency(
            totalPayrollDeductions *
            (nationalInsurance / observedTotal)
          );

      const roundedPension =
        PayTrackerWebDashboardService
          .roundCurrency(
            totalPayrollDeductions *
            (pension / observedTotal)
          );

      /*
       * Student Loan absorbs whatever penny rounding residual
       * is left over, so the four parts always sum to exactly
       * totalPayrollDeductions and Take-Home keeps reconciling
       * with the figure shown elsewhere on the Dashboard.
       */
      const roundedStudentLoan =
        PayTrackerWebDashboardService
          .roundCurrency(
            totalPayrollDeductions -
            roundedTax -
            roundedNationalInsurance -
            roundedPension
          );

      return {
        available: true,
        source:
          'Ratios from payslip ' +
          (latestPayslip.payslipId || ''),
        tax: roundedTax,
        nationalInsurance:
          roundedNationalInsurance,
        pension: roundedPension,
        studentLoan: roundedStudentLoan
      };
    } catch (error) {
      console.error(
        'Reading the latest payslip for the dashboard deduction split failed.',
        error
      );

      return zeroResult;
    }
  },

  buildCommitments: function(finance, savings) {
    const commitments = [];

    const overdue =
      Number(finance.overduePayments) || 0;

    const dueSoon =
      Number(finance.dueNextSevenDays) || 0;

    const upcomingSavings =
      Number(
        savings.upcomingContributions
      ) || 0;

    if (overdue > 0) {
      commitments.push({
        type: 'danger',
        name:
          overdue +
          (overdue === 1
            ? ' overdue payment'
            : ' overdue payments'),
        detail: 'Open Finance to review.',
        amount: null
      });
    }

    if (dueSoon > 0) {
      commitments.push({
        type: 'warning',
        name:
          dueSoon +
          (dueSoon === 1
            ? ' payment due soon'
            : ' payments due soon'),
        detail: 'Due within seven days.',
        amount: null
      });
    }

    if (upcomingSavings > 0) {
      commitments.push({
        type: 'info',
        name:
          upcomingSavings +
          (upcomingSavings === 1
            ? ' savings contribution'
            : ' savings contributions'),
        detail: 'Scheduled contribution queue.',
        amount: null
      });
    }

    return commitments.slice(0, 3);
  },

  getPayTables: function() {
    const configuredTables =
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

  weeklyContributionFromPot: function(row) {
    const frequency =
      String(row[21] || '')
        .trim()
        .toLowerCase();

    const amount =
      Math.max(Number(row[22]) || 0, 0);

    if (frequency === 'weekly') {
      return amount;
    }

    if (frequency === 'fortnightly') {
      return amount / 2;
    }

    if (frequency === 'monthly') {
      return amount * 12 / 52;
    }

    if (frequency === 'quarterly') {
      return amount * 4 / 52;
    }

    if (frequency === 'annual') {
      return amount / 52;
    }

    return (
      Math.max(Number(row[23]) || 0, 0) *
      12 /
      52
    );
  },

  emptyPayData: function(message) {
    return {
      hasData: false,
      weekNumber: 0,
      weekLabel: 'Current week',
      weekStart: null,
      weekEnd: null,
      gross: 0,
      taxableGross: 0,
      estimatedDeductions: 0,
      taxableTakeHome: 0,
      loggingCash: 0,
      takeHome: 0,
      deductionRate: 0,
      employers: {
        nhs: {
          name: 'NHS',
          taxable: true,
          shifts: 0,
          total: 0
        },
        relief: {
          name: 'Relief Assistant Warden',
          taxable: true,
          shifts: 0,
          total: 0
        },
        security: {
          name: 'Night Security Warden',
          taxable: true,
          shifts: 0,
          total: 0
        },
        logging: {
          name: 'Logging Cash',
          taxable: false,
          shifts: 0,
          total: 0
        }
      },
      message: String(message || '')
    };
  },

  getEmployerKey: function(name) {
    const normalized = String(name || '')
      .trim()
      .toLowerCase();

    if (normalized.indexOf('nhs') !== -1) {
      return 'nhs';
    }

    if (normalized.indexOf('relief') !== -1) {
      return 'relief';
    }

    if (normalized.indexOf('security') !== -1) {
      return 'security';
    }

    if (normalized.indexOf('logging') !== -1) {
      return 'logging';
    }

    return normalized
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  },

  formatWeekLabel: function(
    weekNumber,
    firstDate,
    lastDate
  ) {
    const first =
      PayTrackerWebDashboardService
        .toDate(firstDate);

    const last =
      PayTrackerWebDashboardService
        .toDate(lastDate);

    if (!first || !last) {
      return 'Week ' + weekNumber;
    }

    const timeZone =
      Session.getScriptTimeZone();

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

  serializeDate: function(value) {
    const date =
      PayTrackerWebDashboardService
        .toDate(value);

    return date ? date.toISOString() : null;
  },

  toDate: function(value) {
    if (
      Object.prototype.toString.call(value) ===
      '[object Date]' &&
      !Number.isNaN(value.getTime())
    ) {
      return value;
    }

    if (!value) {
      return null;
    }

    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime())
      ? null
      : parsed;
  },

  startOfDay: function(date) {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      0,
      0,
      0,
      0
    );
  },

  normalizePercentage: function(
    value,
    fallback
  ) {
    let number = Number(value);

    if (!Number.isFinite(number)) {
      number = Number(fallback) || 0;
    }

    if (number > 1) {
      number = number / 100;
    }

    return Math.min(Math.max(number, 0), 1);
  },

  clampProgress: function(value) {
    let progress = Number(value) || 0;

    if (progress > 1) {
      progress = progress / 100;
    }

    return Math.min(Math.max(progress, 0), 1);
  },

  priorityWeight: function(value) {
    const priority =
      String(value || '')
        .trim()
        .toLowerCase();

    if (priority === 'high') {
      return 1;
    }

    if (priority === 'medium') {
      return 2;
    }

    if (priority === 'low') {
      return 3;
    }

    return 4;
  },

  roundCurrency: function(value) {
    return Math.round(
      (Number(value) || 0) * 100
    ) / 100;
  },

  getErrorMessage: function(error) {
    if (
      error &&
      typeof error === 'object' &&
      error.message
    ) {
      return String(error.message);
    }

    if (
      typeof error === 'string' &&
      error.trim()
    ) {
      return error.trim();
    }

    return 'An unexpected dashboard error occurred.';
  }
});

/**
 * Public browser endpoint used by google.script.run.
 *
 * @return {Object} Live dashboard data.
 */
function getPayTrackerWebDashboardData() {
  return PayTrackerWebDashboardService
    .getDashboardData();
}
