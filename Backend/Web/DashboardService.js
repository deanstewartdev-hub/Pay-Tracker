/*******************************************************
 * PAY TRACKER V2.6
 * Backend/Web/DashboardService.js
 *
 * Purpose:
 * - Supply live data to the web dashboard
 * - Read the latest populated PaySheet week
 * - Combine Pay, Finance, Savings and Life Goal figures
 * - Return browser-safe structured data
 *******************************************************/

const PayTrackerWebDashboardService = Object.freeze({
  /**
   * Returns all live dashboard data.
   *
   * This is the public Apps Script function called by
   * google.script.run from the browser.
   *
   * @return {Object} Dashboard response.
   */
  getDashboardData: function() {
    const generatedAt = new Date();

    try {
      const payData =
        PayTrackerWebDashboardService
          .getLatestPayWeekData();

      const financeData =
        PayTrackerWebDashboardService
          .getFinanceData();

      const cashFlow =
        PayTrackerWebDashboardService
          .buildWeeklyCashFlow(
            payData,
            financeData
          );

      return {
        success: true,

        generatedAt:
          generatedAt.toISOString(),

        pay: payData,

        finance: financeData,

        cashFlow: cashFlow,

        savingsPots:
          PayTrackerWebDashboardService
            .buildSavingsPots(
              financeData
            ),

        commitments:
          PayTrackerWebDashboardService
            .buildCommitments(
              financeData
            ),

        lifeGoals:
          PayTrackerWebDashboardService
            .buildLifeGoals(
              financeData
            ),

        activity: [],

        messages: {
          cashFlow:
            cashFlow.hasData
              ? 'Weekly cash flow calculated from your latest populated pay week.'
              : 'Add shifts to the PaySheet to calculate weekly cash flow.'
        }
      };
    } catch (error) {
      console.error(
        'Web dashboard data could not be generated.',
        error
      );

      return {
        success: false,
        generatedAt:
          generatedAt.toISOString(),
        error:
          PayTrackerWebDashboardService
            .getErrorMessage(error)
      };
    }
  },

  /**
   * Reads the latest populated PaySheet week.
   *
   * @return {Object} Weekly pay figures.
   */
  getLatestPayWeekData: function() {
    let sheet;

    try {
      sheet = PayTrackerUtils.getPaySheet();
    } catch (error) {
      return PayTrackerWebDashboardService
        .getEmptyPayData(
          'The PaySheet could not be found.'
        );
    }

    const existingWeeks =
      PayTrackerUtils.getExistingWeekCount(
        sheet
      );

    if (existingWeeks < 1) {
      return PayTrackerWebDashboardService
        .getEmptyPayData(
          'No PaySheet weeks have been created.'
        );
    }

    let selectedWeekNumber = 0;
    let selectedStartRow = 0;

    for (
      let weekNumber = existingWeeks;
      weekNumber >= 1;
      weekNumber--
    ) {
      const startRow =
        PayTrackerUtils.getWeekStartRow(
          weekNumber
        );

      if (
        PayTrackerWeekManager.weekHasShiftData(
          sheet,
          startRow
        )
      ) {
        selectedWeekNumber = weekNumber;
        selectedStartRow = startRow;
        break;
      }
    }

    if (!selectedWeekNumber) {
      return PayTrackerWebDashboardService
        .getEmptyPayData(
          'No shifts have been entered yet.'
        );
    }

    const tables =
      getConfiguredPayTables_();

    const employerRows = {};

    tables.forEach(function(table) {
      const key =
        PayTrackerWebDashboardService
          .getEmployerKey(table.name);

      employerRows[key] =
        PayTrackerWebDashboardService
          .readEmployerWeek(
            sheet,
            selectedStartRow,
            table
          );
    });

    const summaryValueColumn =
      PayTrackerConfig.SHEET
        .WEEKLY_SUMMARY_VALUE_COLUMN;

    const summaryValues = sheet
      .getRange(
        selectedStartRow + 1,
        summaryValueColumn,
        5,
        1
      )
      .getValues()
      .map(function(row) {
        return (
          Number(row[0]) || 0
        );
      });

    const taxableGross =
      summaryValues[0] || 0;

    const estimatedDeductions =
      summaryValues[1] || 0;

    const taxableTakeHome =
      summaryValues[2] || 0;

    const loggingCash =
      summaryValues[3] || 0;

    const totalTakeHome =
      summaryValues[4] || 0;

    const firstDate =
      PayTrackerWebDashboardService
        .readWeekDate(
          sheet,
          selectedStartRow,
          0
        );

    const lastDate =
      PayTrackerWebDashboardService
        .readWeekDate(
          sheet,
          selectedStartRow,
          6
        );

    const totalGross =
      Object.keys(employerRows)
        .reduce(function(total, key) {
          return (
            total +
            employerRows[key].total
          );
        }, 0);

    return {
      hasData: true,

      weekNumber:
        selectedWeekNumber,

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
        PayTrackerUtils.roundCurrency(
          totalGross
        ),

      taxableGross:
        PayTrackerUtils.roundCurrency(
          taxableGross
        ),

      estimatedDeductions:
        PayTrackerUtils.roundCurrency(
          estimatedDeductions
        ),

      taxableTakeHome:
        PayTrackerUtils.roundCurrency(
          taxableTakeHome
        ),

      loggingCash:
        PayTrackerUtils.roundCurrency(
          loggingCash
        ),

      takeHome:
        PayTrackerUtils.roundCurrency(
          totalTakeHome
        ),

      deductionRate:
        taxableGross > 0
          ? estimatedDeductions /
            taxableGross
          : 0,

      employers: employerRows,

      message: ''
    };
  },

  /**
   * Reads one employer table for the selected week.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} weekStartRow
   * @param {Object} table
   * @return {Object} Employer figures.
   */
  readEmployerWeek: function(
    sheet,
    weekStartRow,
    table
  ) {
    const firstDataRow =
      weekStartRow +
      PayTrackerConfig.SHEET
        .WEEK_DATA_ROW_OFFSET;

    const rowCount =
      PayTrackerConfig.SHEET
        .WEEK_DATA_ROW_COUNT;

    const shiftColumn =
      table.startColumn + 2;

    const payColumn =
      table.startColumn + 4;

    const shiftValues = sheet
      .getRange(
        firstDataRow,
        shiftColumn,
        rowCount,
        1
      )
      .getDisplayValues();

    const payValues = sheet
      .getRange(
        firstDataRow,
        payColumn,
        rowCount,
        1
      )
      .getValues();

    let shiftCount = 0;
    let calculatedTotal = 0;

    for (
      let rowIndex = 0;
      rowIndex < rowCount;
      rowIndex++
    ) {
      const shiftName =
        String(
          shiftValues[rowIndex][0] || ''
        ).trim();

      if (shiftName !== '') {
        shiftCount++;
      }

      calculatedTotal +=
        Number(
          payValues[rowIndex][0]
        ) || 0;
    }

    const storedTotal =
      Number(
        sheet
          .getRange(
            weekStartRow +
              PayTrackerConfig.SHEET
                .WEEK_TOTAL_ROW_OFFSET,
            payColumn
          )
          .getValue()
      ) || 0;

    return {
      name: table.name,

      taxable:
        Boolean(table.taxable),

      shifts:
        shiftCount,

      total:
        PayTrackerUtils.roundCurrency(
          storedTotal || calculatedTotal
        )
    };
  },

  /**
   * Reads Finance and Savings dashboard calculations.
   *
   * @return {Object} Finance dashboard figures.
   */
  getFinanceData: function() {
    if (
      typeof PayTrackerFinanceDashboard ===
      'undefined'
    ) {
      return (
        PayTrackerWebDashboardService
          .getEmptyFinanceData(
            'Finance Dashboard service is unavailable.'
          )
      );
    }

    try {
      const figures =
        PayTrackerFinanceDashboard
          .calculateDashboardFigures();

      return Object.assign(
        {
          available: true,
          message: ''
        },
        figures || {}
      );
    } catch (error) {
      console.error(
        'Finance dashboard figures could not be read.',
        error
      );

      return (
        PayTrackerWebDashboardService
          .getEmptyFinanceData(
            PayTrackerWebDashboardService
              .getErrorMessage(error)
          )
      );
    }
  },

  /**
   * Converts monthly finance amounts to weekly values and
   * calculates disposable income and suggested savings.
   *
   * @param {Object} payData
   * @param {Object} financeData
   * @return {Object} Weekly cash-flow figures.
   */
  buildWeeklyCashFlow: function(
    payData,
    financeData
  ) {
    const monthlyToWeekly =
      12 / 52;

    const takeHome =
      Number(payData.takeHome) || 0;

    const bills =
      (
        Number(
          financeData.monthlyBills
        ) || 0
      ) * monthlyToWeekly;

    const debtRepayments =
      (
        Number(
          financeData
            .monthlyDebtRepayments
        ) || 0
      ) * monthlyToWeekly;

    /*
     * Debt repayments are included with bills because
     * both are committed outgoing payments.
     */
    const committedPayments =
      bills + debtRepayments;

    const weeklySpending =
      PayTrackerWebDashboardService
        .getConfiguredWeeklySpending();

    const disposableBeforeSavings =
      takeHome -
      committedPayments -
      weeklySpending;

    const plannedWeeklySavings =
      (
        Number(
          financeData.monthlySavings
        ) || 0
      ) * monthlyToWeekly;

    const suggestedSavings =
      Math.min(
        Math.max(
          plannedWeeklySavings,
          0
        ),
        Math.max(
          disposableBeforeSavings,
          0
        )
      );

    const availableAfterSavings =
      disposableBeforeSavings -
      suggestedSavings;

    return {
      hasData:
        Boolean(payData.hasData),

      takeHome:
        PayTrackerUtils.roundCurrency(
          takeHome
        ),

      bills:
        PayTrackerUtils.roundCurrency(
          committedPayments
        ),

      weeklySpending:
        PayTrackerUtils.roundCurrency(
          weeklySpending
        ),

      disposableIncome:
        PayTrackerUtils.roundCurrency(
          disposableBeforeSavings
        ),

      suggestedSavings:
        PayTrackerUtils.roundCurrency(
          suggestedSavings
        ),

      availableAfterSavings:
        PayTrackerUtils.roundCurrency(
          availableAfterSavings
        ),

      savingsRate:
        disposableBeforeSavings > 0
          ? suggestedSavings /
            disposableBeforeSavings
          : 0
    };
  },

  /**
   * Returns the configured weekly spending allowance.
   *
   * This currently defaults to £100 per week. Later this
   * will be moved into the web Settings page.
   *
   * @return {number} Weekly spending allowance.
   */
  getConfiguredWeeklySpending: function() {
    return 100;
  },

  /**
   * Returns up to three active savings pots.
   *
   * @param {Object} financeData
   * @return {Object[]} Savings pots.
   */
  buildSavingsPots: function(financeData) {
    const rows =
      Array.isArray(
        financeData.savingsPotRows
      )
        ? financeData.savingsPotRows
        : [];

    return rows
      .slice(0, 3)
      .map(function(pot) {
        return {
          id:
            String(pot.id || ''),

          name:
            String(
              pot.name ||
              'Savings pot'
            ),

          provider:
            String(
              pot.provider || ''
            ),

          accountType:
            String(
              pot.accountType || ''
            ),

          balance:
            PayTrackerUtils
              .roundCurrency(
                Number(
                  pot.currentBalance
                ) || 0
              ),

          goal:
            PayTrackerUtils
              .roundCurrency(
                Number(
                  pot.goalAmount
                ) || 0
              ),

          contribution:
            PayTrackerUtils
              .roundCurrency(
                PayTrackerWebDashboardService
                  .getWeeklyContribution(
                    pot
                  )
              ),

          progress:
            PayTrackerWebDashboardService
              .clampProgress(
                pot.progress
              ),

          monthsToGoal:
            pot.monthsToGoal,

          targetStatus:
            String(
              pot.targetStatus || ''
            )
        };
      });
  },

  /**
   * Returns Life Goals for the web dashboard.
   *
   * @param {Object} financeData
   * @return {Object[]} Life Goals.
   */
  buildLifeGoals: function(financeData) {
    const rows =
      Array.isArray(
        financeData.goalRows
      )
        ? financeData.goalRows
        : [];

    return rows
      .slice(0, 3)
      .map(function(goal) {
        return {
          id:
            String(goal.id || ''),

          name:
            String(
              goal.name ||
              'Life goal'
            ),

          target:
            PayTrackerUtils
              .roundCurrency(
                Number(
                  goal.targetAmount
                ) || 0
              ),

          current:
            PayTrackerUtils
              .roundCurrency(
                Number(
                  goal.currentAmount
                ) || 0
              ),

          progress:
            PayTrackerWebDashboardService
              .clampProgress(
                goal.progress
              ),

          monthsRemaining:
            goal.monthsRemaining,

          completionDate:
            PayTrackerWebDashboardService
              .serializeDate(
                goal.completionDate
              ),

          targetStatus:
            String(
              goal.targetStatus || ''
            ),

          priority:
            String(
              goal.priority || ''
            )
        };
      });
  },

  /**
   * Builds basic commitment summary rows.
   *
   * @param {Object} financeData
   * @return {Object[]} Commitments.
   */
  buildCommitments: function(financeData) {
    const commitments = [];

    const dueNextSevenDays =
      Number(
        financeData.dueNextSevenDays
      ) || 0;

    const overduePayments =
      Number(
        financeData.overduePayments
      ) || 0;

    const upcomingContributions =
      Number(
        financeData.upcomingContributions
      ) || 0;

    if (overduePayments > 0) {
      commitments.push({
        type: 'danger',
        name:
          overduePayments +
          (
            overduePayments === 1
              ? ' overdue payment'
              : ' overdue payments'
          ),
        detail:
          'Open Finance to review.',
        amount: null
      });
    }

    if (dueNextSevenDays > 0) {
      commitments.push({
        type: 'warning',
        name:
          dueNextSevenDays +
          (
            dueNextSevenDays === 1
              ? ' payment due soon'
              : ' payments due soon'
          ),
        detail:
          'Due within seven days.',
        amount: null
      });
    }

    if (upcomingContributions > 0) {
      commitments.push({
        type: 'info',
        name:
          upcomingContributions +
          (
            upcomingContributions === 1
              ? ' savings contribution'
              : ' savings contributions'
          ),
        detail:
          'Scheduled contribution queue.',
        amount: null
      });
    }

    return commitments.slice(0, 3);
  },

  /**
   * Converts a pot contribution to a weekly equivalent.
   *
   * @param {Object} pot
   * @return {number} Weekly contribution.
   */
  getWeeklyContribution: function(pot) {
    const amount =
      Math.max(
        Number(
          pot.contributionAmount
        ) || 0,
        0
      );

    const frequency =
      String(
        pot.contributionFrequency || ''
      )
        .trim()
        .toLowerCase();

    if (
      frequency === 'weekly'
    ) {
      return amount;
    }

    if (
      frequency === 'fortnightly'
    ) {
      return amount / 2;
    }

    if (
      frequency === 'monthly'
    ) {
      return amount * 12 / 52;
    }

    const monthlyEquivalent =
      Math.max(
        Number(
          pot.monthlyEquivalent
        ) || 0,
        0
      );

    return (
      monthlyEquivalent *
      12 /
      52
    );
  },

  /**
   * Reads a date from the first configured pay table.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} weekStartRow
   * @param {number} dayIndex
   * @return {*}
   */
  readWeekDate: function(
    sheet,
    weekStartRow,
    dayIndex
  ) {
    const firstTable =
      getConfiguredPayTables_()[0];

    if (!firstTable) {
      return null;
    }

    return sheet
      .getRange(
        weekStartRow +
          PayTrackerConfig.SHEET
            .WEEK_DATA_ROW_OFFSET +
          dayIndex,
        firstTable.startColumn
      )
      .getValue();
  },

  /**
   * Returns the normalized dashboard employer key.
   *
   * @param {*} employerName
   * @return {string}
   */
  getEmployerKey: function(employerName) {
    const name =
      String(employerName || '')
        .trim()
        .toLowerCase();

    if (name.indexOf('nhs') !== -1) {
      return 'nhs';
    }

    if (
      name.indexOf('relief') !== -1
    ) {
      return 'relief';
    }

    if (
      name.indexOf('security') !== -1
    ) {
      return 'security';
    }

    if (
      name.indexOf('logging') !== -1
    ) {
      return 'logging';
    }

    return name
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  },

  /**
   * Formats the selected week label.
   *
   * @param {number} weekNumber
   * @param {*} startDate
   * @param {*} endDate
   * @return {string}
   */
  formatWeekLabel: function(
    weekNumber,
    startDate,
    endDate
  ) {
    const timeZone =
      Session.getScriptTimeZone();

    if (
      startDate instanceof Date &&
      endDate instanceof Date
    ) {
      return (
        'Week ' +
        weekNumber +
        ' · ' +
        Utilities.formatDate(
          startDate,
          timeZone,
          'd MMM'
        ) +
        ' – ' +
        Utilities.formatDate(
          endDate,
          timeZone,
          'd MMM yyyy'
        )
      );
    }

    return 'Week ' + weekNumber;
  },

  /**
   * Returns empty pay data.
   *
   * @param {string=} message
   * @return {Object}
   */
  getEmptyPayData: function(message) {
    return {
      hasData: false,
      weekNumber: 0,
      weekLabel: 'No populated week',
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
          name:
            'Relief Assistant Warden',
          taxable: true,
          shifts: 0,
          total: 0
        },

        security: {
          name:
            'Night Security Warden',
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

      message:
        message ||
        'No live pay data is available.'
    };
  },

  /**
   * Returns empty finance figures.
   *
   * @param {string=} message
   * @return {Object}
   */
  getEmptyFinanceData: function(message) {
    return {
      available: false,
      message:
        message ||
        'Finance data is unavailable.',

      estimatedMonthlyTakeHome: 0,
      monthlyBills: 0,
      monthlyDebtRepayments: 0,
      monthlySavings: 0,
      disposableBeforeSavings: 0,
      disposableIncome: 0,
      committedIncome: 0,
      committedPercentage: 0,
      totalDebtRemaining: 0,
      originalDebt: 0,
      debtRepaid: 0,
      totalDebtProgress: 0,
      billsDueNextThirtyDays: 0,
      activeBills: 0,
      activeDebts: 0,
      overduePayments: 0,
      dueNextSevenDays: 0,
      dueNextThirtyDays: 0,
      paidThisMonth: 0,
      monthlyPaymentHistory: [],
      monthlySavingsAvailable: 0,
      totalSavings: 0,
      totalSavingsGoals: 0,
      totalSavingsRemaining: 0,
      savingsProgress: 0,
      annualSavingsInterest: 0,
      monthlySavingsInterest: 0,
      activePots: 0,
      completedPots: 0,
      upcomingContributions: 0,
      overdueContributions: 0,
      depositedThisMonth: 0,
      depositedThisYear: 0,
      allocationTotal: 0,
      allocationValid: true,
      savingsPotRows: [],
      goalRows: [],
      netWorth: 0
    };
  },

  /**
   * Clamps progress between zero and one.
   *
   * @param {*} progress
   * @return {number}
   */
  clampProgress: function(progress) {
    return Math.min(
      Math.max(
        Number(progress) || 0,
        0
      ),
      1
    );
  },

  /**
   * Serializes a Date safely for the browser.
   *
   * @param {*} value
   * @return {string|null}
   */
  serializeDate: function(value) {
    return value instanceof Date
      ? value.toISOString()
      : null;
  },

  /**
   * Returns a readable error message.
   *
   * @param {*} error
   * @return {string}
   */
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
 * Public browser endpoint.
 *
 * @return {Object} Live dashboard data.
 */
function getPayTrackerWebDashboardData() {
  return PayTrackerWebDashboardService
    .getDashboardData();
}