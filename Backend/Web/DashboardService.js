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

      const cashFlow =
        PayTrackerWebDashboardService
          .buildCashFlow(
            pay,
            finance,
            savings.settings
          );

      return {
        success: true,
        generatedAt: startedAt.toISOString(),
        durationMilliseconds:
          new Date().getTime() - startedAt.getTime(),
        pay: pay,
        finance: finance,
        cashFlow: cashFlow,
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
