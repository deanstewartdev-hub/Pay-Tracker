/*******************************************************
 * PAY TRACKER V2.6
 * SavingsDashboardService.gs
 *
 * Supplies savings and Life Goal figures to the unified
 * Finance Dashboard.
 *
 * Includes:
 * - Monthly savings totals
 * - Fixed and percentage-based contributions
 * - Weekly/fortnightly/monthly schedule support
 * - Savings progress
 * - Months-to-goal figures
 * - Target status
 * - Interest estimates
 * - Savings allocation validation
 *******************************************************/

const PayTrackerSavingsDashboardService = Object.freeze({
  /**
   * Calculates all savings and Life Goal dashboard figures.
   *
   * @return {Object}
   */
  calculateFigures: function () {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const potsSheet =
      spreadsheet.getSheetByName(
        PayTrackerSavingsConfig.SHEETS.POTS
      );

    const contributionsSheet =
      spreadsheet.getSheetByName(
        PayTrackerSavingsConfig.SHEETS.CONTRIBUTIONS
      );

    const historySheet =
      spreadsheet.getSheetByName(
        PayTrackerSavingsConfig.SHEETS.HISTORY
      );

    const allocationResult =
      PayTrackerSavingsService.validateAllocation();

    const result = {
      monthlySavingsAvailable:
        PayTrackerSavingsService.calculateMonthlySavingsAvailable(),

      totalSavings:
        0,

      totalSavingsGoals:
        0,

      totalAmountRemaining:
        0,

      totalMonthlyContributions:
        0,

      totalAnnualInterest:
        0,

      totalMonthlyInterest:
        0,

      overallSavingsProgress:
        0,

      activePots:
        0,

      completedPots:
        0,

      upcomingContributions:
        0,

      overdueContributions:
        0,

      depositedThisMonth:
        0,

      depositedThisYear:
        0,

      allocationTotal:
        allocationResult.totalAllocation,

      allocationValid:
        allocationResult.isValid,

      potRows:
        [],

      goalRows:
        PayTrackerLifeGoalsService.getGoalRows()
    };

    PayTrackerSavingsDashboardService.addPotFigures(
      result,
      potsSheet
    );

    PayTrackerSavingsDashboardService.addContributionFigures(
      result,
      contributionsSheet
    );

    PayTrackerSavingsDashboardService.addHistoryFigures(
      result,
      historySheet
    );

    if (
      result.totalSavingsGoals >
      0
    ) {
      result.overallSavingsProgress =
        Math.min(
          result.totalSavings /
          result.totalSavingsGoals,
          1
        );
    }

    result.totalSavings =
      PayTrackerUtils.roundCurrency(
        result.totalSavings
      );

    result.totalSavingsGoals =
      PayTrackerUtils.roundCurrency(
        result.totalSavingsGoals
      );

    result.totalAmountRemaining =
      PayTrackerUtils.roundCurrency(
        result.totalAmountRemaining
      );

    result.totalMonthlyContributions =
      PayTrackerUtils.roundCurrency(
        result.totalMonthlyContributions
      );

    result.totalAnnualInterest =
      PayTrackerUtils.roundCurrency(
        result.totalAnnualInterest
      );

    result.totalMonthlyInterest =
      PayTrackerUtils.roundCurrency(
        result.totalMonthlyInterest
      );

    result.depositedThisMonth =
      PayTrackerUtils.roundCurrency(
        result.depositedThisMonth
      );

    result.depositedThisYear =
      PayTrackerUtils.roundCurrency(
        result.depositedThisYear
      );

    return result;
  },


  /**
   * Adds savings-pot totals and structured pot rows.
   *
   * @param {Object} result
   * @param {GoogleAppsScript.Spreadsheet.Sheet|null} potsSheet
   */
  addPotFigures: function (
    result,
    potsSheet
  ) {
    if (
      !potsSheet ||
      potsSheet.getLastRow() <
        PayTrackerSavingsConfig.FIRST_DATA_ROW
    ) {
      return;
    }

    const config =
      PayTrackerSavingsConfig.POTS;

    const columns =
      config.COLUMNS;

    /*
     * Sheets created before the Monzo Pot link columns
     * existed may not be wide enough yet. Widen safely
     * before reading the full row width.
     */
    PayTrackerFinanceService.ensureSheetColumns(
      potsSheet,
      config.HEADERS.length
    );

    const rows =
      potsSheet
        .getRange(
          2,
          1,
          potsSheet.getLastRow() - 1,
          config.HEADERS.length
        )
        .getValues();

    rows.forEach(
      function (row) {
        const potName =
          String(
            row[
              columns.NAME - 1
            ] || ''
          ).trim();

        if (
          potName ===
          ''
        ) {
          return;
        }

        const currentBalance =
          Math.max(
            Number(
              row[
                columns.CURRENT_BALANCE - 1
              ]
            ) || 0,
            0
          );

        const goalAmount =
          Math.max(
            Number(
              row[
                columns.GOAL_AMOUNT - 1
              ]
            ) || 0,
            0
          );

        const amountRemaining =
          Math.max(
            Number(
              row[
                columns.AMOUNT_REMAINING - 1
              ]
            ) || 0,
            0
          );

        const monthlyEquivalent =
          Math.max(
            Number(
              row[
                columns.MONTHLY_EQUIVALENT - 1
              ]
            ) || 0,
            0
          );

        const contributionAmount =
          Math.max(
            Number(
              row[
                columns.CONTRIBUTION_AMOUNT - 1
              ]
            ) || 0,
            0
          );

        const annualInterest =
          Math.max(
            Number(
              row[
                columns.ANNUAL_INTEREST - 1
              ]
            ) || 0,
            0
          );

        const monthlyInterest =
          Math.max(
            Number(
              row[
                columns.MONTHLY_INTEREST - 1
              ]
            ) || 0,
            0
          );

        const progress =
          Math.min(
            Math.max(
              Number(
                row[
                  columns.PROGRESS - 1
                ]
              ) || 0,
              0
            ),
            1
          );

        const allocation =
          Math.max(
            Number(
              row[
                columns.ALLOCATION - 1
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

        const method =
          String(
            row[
              columns.CONTRIBUTION_METHOD - 1
            ] || ''
          ).trim();

        const frequency =
          String(
            row[
              columns.CONTRIBUTION_FREQUENCY - 1
            ] || ''
          ).trim();

        const monthsToGoal =
          row[
            columns.MONTHS_TO_GOAL - 1
          ];

        const completionDate =
          row[
            columns.COMPLETION_DATE - 1
          ];

        const targetDate =
          row[
            columns.TARGET_DATE - 1
          ];

        const targetStatus =
          String(
            row[
              columns.TARGET_STATUS - 1
            ] || ''
          ).trim();

        const provider =
          String(
            row[
              columns.PROVIDER - 1
            ] || ''
          ).trim();

        const accountType =
          String(
            row[
              columns.ACCOUNT_TYPE - 1
            ] || ''
          ).trim();

        const interestRate =
          Math.max(
            Number(
              row[
                columns.INTEREST_RATE - 1
              ]
            ) || 0,
            0
          );

        result.totalSavings +=
          currentBalance;

        result.totalSavingsGoals +=
          goalAmount;

        result.totalAmountRemaining +=
          amountRemaining;

        result.totalAnnualInterest +=
          annualInterest;

        result.totalMonthlyInterest +=
          monthlyInterest;

        if (
          active ===
          'Yes'
        ) {
          result.activePots++;

          result.totalMonthlyContributions +=
            monthlyEquivalent;
        }

        if (
          goalAmount >
          0 &&
          currentBalance >=
          goalAmount
        ) {
          result.completedPots++;
        }

        result.potRows.push({
          id:
            String(
              row[
                columns.ID - 1
              ] || ''
            ).trim(),

          name:
            potName,

          provider:
            provider,

          accountType:
            accountType,

          currentBalance:
            currentBalance,

          goalAmount:
            goalAmount,

          amountRemaining:
            amountRemaining,

          contributionMethod:
            method,

          contributionFrequency:
            frequency,

          contributionAmount:
            contributionAmount,

          monthlyEquivalent:
            monthlyEquivalent,

          allocation:
            allocation,

          interestRate:
            interestRate,

          monthlyInterest:
            monthlyInterest,

          annualInterest:
            annualInterest,

          progress:
            progress,

          monthsToGoal:
            monthsToGoal,

          completionDate:
            completionDate,

          targetDate:
            targetDate,

          targetStatus:
            targetStatus,

          active:
            active,

          linkedGoalId:
            String(
              row[
                columns.LINKED_GOAL_ID - 1
              ] || ''
            ).trim(),

          monzoPotId:
            String(
              row[
                columns.MONZO_POT_ID - 1
              ] || ''
            ).trim(),

          monzoPotName:
            String(
              row[
                columns.MONZO_POT_NAME - 1
              ] || ''
            ).trim()
        });
      }
    );
  },


  /**
   * Adds upcoming and overdue contribution counts.
   *
   * @param {Object} result
   * @param {GoogleAppsScript.Spreadsheet.Sheet|null} contributionsSheet
   */
  addContributionFigures: function (
    result,
    contributionsSheet
  ) {
    if (
      !contributionsSheet ||
      contributionsSheet.getLastRow() <
        PayTrackerSavingsConfig.FIRST_DATA_ROW
    ) {
      return;
    }

    const config =
      PayTrackerSavingsConfig.CONTRIBUTIONS;

    const columns =
      config.COLUMNS;

    const rows =
      contributionsSheet
        .getRange(
          2,
          1,
          contributionsSheet.getLastRow() - 1,
          config.HEADERS.length
        )
        .getValues();

    const today =
      PayTrackerUtils.stripTime(
        new Date()
      );

    rows.forEach(
      function (row) {
        const contributionId =
          String(
            row[
              columns.ID - 1
            ] || ''
          ).trim();

        if (
          contributionId ===
          ''
        ) {
          return;
        }

        result.upcomingContributions++;

        const dueDate =
          row[
            columns.DUE_DATE - 1
          ];

        if (
          dueDate instanceof Date &&
          PayTrackerUtils
            .stripTime(
              dueDate
            )
            .getTime() <
          today.getTime()
        ) {
          result.overdueContributions++;
        }
      }
    );
  },


  /**
   * Adds savings deposit totals from Savings History.
   *
   * Undone deposits are excluded.
   *
   * @param {Object} result
   * @param {GoogleAppsScript.Spreadsheet.Sheet|null} historySheet
   */
  addHistoryFigures: function (
    result,
    historySheet
  ) {
    if (
      !historySheet ||
      historySheet.getLastRow() <
        PayTrackerSavingsConfig.FIRST_DATA_ROW
    ) {
      return;
    }

    const config =
      PayTrackerSavingsConfig.HISTORY;

    const columns =
      config.COLUMNS;

    const rows =
      historySheet
        .getRange(
          2,
          1,
          historySheet.getLastRow() - 1,
          config.HEADERS.length
        )
        .getValues();

    const today =
      new Date();

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
          PayTrackerSavingsConfig
            .UNDO_STATUSES
            .UNDONE
        ) {
          return;
        }

        const depositedDate =
          row[
            columns.DEPOSITED_DATE - 1
          ];

        if (
          !(depositedDate instanceof Date)
        ) {
          return;
        }

        const amount =
          Number(
            row[
              columns.AMOUNT - 1
            ]
          ) || 0;

        if (
          depositedDate.getMonth() ===
            today.getMonth() &&
          depositedDate.getFullYear() ===
            today.getFullYear()
        ) {
          result.depositedThisMonth +=
            amount;
        }

        if (
          depositedDate.getFullYear() ===
          today.getFullYear()
        ) {
          result.depositedThisYear +=
            amount;
        }
      }
    );
  },


  /**
   * Returns active savings pots ordered by target urgency.
   *
   * Pots with a target date come first, then the earliest
   * estimated completion date.
   *
   * @param {Object[]} potRows
   * @return {Object[]}
   */
  sortPotsForDashboard: function (
    potRows
  ) {
    return (
      potRows || []
    )
      .filter(
        function (pot) {
          return (
            pot.active ===
            'Yes'
          );
        }
      )
      .slice()
      .sort(
        function (
          first,
          second
        ) {
          const firstTarget =
            first.targetDate instanceof Date
              ? first.targetDate.getTime()
              : Number.MAX_SAFE_INTEGER;

          const secondTarget =
            second.targetDate instanceof Date
              ? second.targetDate.getTime()
              : Number.MAX_SAFE_INTEGER;

          if (
            firstTarget !==
            secondTarget
          ) {
            return (
              firstTarget -
              secondTarget
            );
          }

          const firstCompletion =
            first.completionDate instanceof Date
              ? first.completionDate.getTime()
              : Number.MAX_SAFE_INTEGER;

          const secondCompletion =
            second.completionDate instanceof Date
              ? second.completionDate.getTime()
              : Number.MAX_SAFE_INTEGER;

          return (
            firstCompletion -
            secondCompletion
          );
        }
      );
  },


  /**
   * Returns active Life Goals ordered by priority and
   * target date.
   *
   * @param {Object[]} goalRows
   * @return {Object[]}
   */
  sortGoalsForDashboard: function (
    goalRows
  ) {
    const priorityOrder = {
      High: 1,
      Medium: 2,
      Low: 3
    };

    return (
      goalRows || []
    )
      .filter(
        function (goal) {
          return (
            goal.active ===
            'Yes'
          );
        }
      )
      .slice()
      .sort(
        function (
          first,
          second
        ) {
          const firstPriority =
            priorityOrder[
              first.priority
            ] || 99;

          const secondPriority =
            priorityOrder[
              second.priority
            ] || 99;

          if (
            firstPriority !==
            secondPriority
          ) {
            return (
              firstPriority -
              secondPriority
            );
          }

          const firstDate =
            first.completionDate instanceof Date
              ? first.completionDate.getTime()
              : Number.MAX_SAFE_INTEGER;

          const secondDate =
            second.completionDate instanceof Date
              ? second.completionDate.getTime()
              : Number.MAX_SAFE_INTEGER;

          return (
            firstDate -
            secondDate
          );
        }
      );
  },


  /**
   * Formats a months-to-goal value for dashboard display.
   *
   * @param {*} months
   * @return {string}
   */
  formatMonthsToGoal: function (
    months
  ) {
    if (
      months === '' ||
      months === null ||
      typeof months ===
        'undefined'
    ) {
      return 'Not available';
    }

    const value =
      Math.max(
        Number(months) || 0,
        0
      );

    if (
      value ===
      0
    ) {
      return 'Complete';
    }

    const years =
      Math.floor(
        value /
        12
      );

    const remainingMonths =
      value %
      12;

    if (
      years ===
      0
    ) {
      return (
        remainingMonths +
        (
          remainingMonths === 1
            ? ' month'
            : ' months'
        )
      );
    }

    if (
      remainingMonths ===
      0
    ) {
      return (
        years +
        (
          years === 1
            ? ' year'
            : ' years'
        )
      );
    }

    return (
      years +
      (
        years === 1
          ? ' year '
          : ' years '
      ) +
      remainingMonths +
      (
        remainingMonths === 1
          ? ' month'
          : ' months'
      )
    );
  },


  /**
   * Formats one contribution schedule.
   *
   * @param {Object} pot
   * @return {string}
   */
  formatContributionSchedule: function (
    pot
  ) {
    const amount =
      Number(
        pot.contributionAmount || 0
      );

    const frequency =
      String(
        pot.contributionFrequency || ''
      ).trim();

    if (
      amount <=
      0
    ) {
      return 'No contribution';
    }

    return (
      '£' +
      amount.toLocaleString(
        'en-GB',
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      ) +
      (
        frequency !== ''
          ? ' ' +
            frequency.toLowerCase()
          : ''
      )
    );
  },


  /**
   * Returns the text and display colour for a target status.
   *
   * @param {string} status
   * @return {Object}
   */
  getTargetStatusStyle: function (
    status
  ) {
    switch (
      String(
        status || ''
      ).trim()
    ) {
      case 'Complete':
        return {
          text: 'Complete',
          background: '#dcfce7',
          font: '#166534'
        };

      case 'Ahead of Target':
        return {
          text: 'Ahead',
          background: '#d1fae5',
          font: '#065f46'
        };

      case 'On Track':
        return {
          text: 'On Track',
          background: '#dbeafe',
          font: '#1e40af'
        };

      case 'Behind Target':
        return {
          text: 'Behind',
          background: '#fee2e2',
          font: '#991b1b'
        };

      case 'No Contribution':
        return {
          text: 'No Contribution',
          background: '#ffedd5',
          font: '#9a3412'
        };

      case 'No Goal Amount':
        return {
          text: 'No Goal',
          background: '#f1f5f9',
          font: '#475569'
        };

      case 'No Target Date':
      default:
        return {
          text: 'No Target Date',
          background: '#fef3c7',
          font: '#92400e'
        };
    }
  }
});