/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Web/ReportsWorkspaceService.js
 *
 * Browser-safe controller for the Reports workspace.
 *
 * Important:
 * - This service does not calculate or store anything.
 * - It only reads and aggregates records that already
 *   exist in the PaySheet, Payment History and Savings
 *   History sheets, so Reports never becomes a second
 *   source of truth.
 *******************************************************/

const PayTrackerWebReportsWorkspaceService =
  Object.freeze({
    MONTHS_TO_INCLUDE: 12,
    WEEKS_TO_INCLUDE: 12,

    getData: function() {
      const spreadsheet =
        SpreadsheetApp
          .getActiveSpreadsheet();

      if (!spreadsheet) {
        throw new Error(
          'No active Pay Tracker spreadsheet is available.'
        );
      }

      const payWeeks =
        PayTrackerWebReportsWorkspaceService
          .readPayWeeks(spreadsheet);

      return {
        success: true,
        generatedAt:
          new Date().toISOString(),
        spreadsheetUrl:
          spreadsheet.getUrl(),
        weeklyEarnings:
          PayTrackerWebReportsWorkspaceService
            .buildWeeklyEarnings(payWeeks),
        monthlySummary:
          PayTrackerWebReportsWorkspaceService
            .buildMonthlySummary(
              spreadsheet,
              payWeeks
            )
      };
    },

    /**
     * Reads the PaySheet once and returns every week that has
     * recorded shift data.
     *
     * Both the weekly chart and the monthly income column need
     * this data, so it is read a single time and shared rather
     * than re-reading the whole PaySheet per caller.
     *
     * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet
     * @return {Object[]}
     */
    readPayWeeks: function(spreadsheet) {
      const sheetName =
        PayTrackerWebPayWorkspaceService
          .getPaySheetName();

      const sheet =
        spreadsheet.getSheetByName(
          sheetName
        );

      if (!sheet) {
        return [];
      }

      const payData =
        PayTrackerWebPayWorkspaceService
          .readPaySheet(sheet);

      return payData.weeks
        .filter(function(week) {
          return week.hasData;
        });
    },

    buildWeeklyEarnings: function(payWeeks) {
      return payWeeks
        .slice(
          -PayTrackerWebReportsWorkspaceService
            .WEEKS_TO_INCLUDE
        )
        .map(function(week) {
          return {
            weekNumber:
              week.weekNumber,
            weekLabel:
              week.weekLabel,
            weekStart:
              PayTrackerWebReportsWorkspaceService
                .serializeDate(
                  week.weekStart
                ),
            gross:
              Number(week.gross) || 0,
            takeHome:
              Number(week.takeHome) || 0
          };
        });
    },

    buildMonthlySummary: function(spreadsheet, payWeeks) {
      const months =
        PayTrackerWebReportsWorkspaceService
          .buildRecentMonthBuckets(
            PayTrackerWebReportsWorkspaceService
              .MONTHS_TO_INCLUDE
          );

      PayTrackerWebReportsWorkspaceService
        .addIncomeToMonths(
          payWeeks,
          months
        );

      PayTrackerWebReportsWorkspaceService
        .addSpendingToMonths(
          spreadsheet,
          months
        );

      PayTrackerWebReportsWorkspaceService
        .addSavingsToMonths(
          spreadsheet,
          months
        );

      return Object.keys(months)
        .sort()
        .map(function(key) {
          const month =
            months[key];

          return {
            monthLabel:
              month.label,
            income:
              PayTrackerUtils.roundCurrency(
                month.income
              ),
            spending:
              PayTrackerUtils.roundCurrency(
                month.spending
              ),
            saved:
              PayTrackerUtils.roundCurrency(
                month.saved
              ),
            net:
              PayTrackerUtils.roundCurrency(
                month.income -
                month.spending -
                month.saved
              )
          };
        });
    },

    /**
     * Builds an ordered set of empty month buckets, keyed
     * by "yyyy-MM", covering the most recent N months
     * including the current month.
     *
     * @param {number} monthCount
     * @return {Object}
     */
    buildRecentMonthBuckets: function(monthCount) {
      const timezone =
        Session.getScriptTimeZone();

      const months = {};

      const today =
        new Date();

      for (
        let offset = monthCount - 1;
        offset >= 0;
        offset--
      ) {
        const bucketDate =
          new Date(
            today.getFullYear(),
            today.getMonth() - offset,
            1
          );

        const key =
          Utilities.formatDate(
            bucketDate,
            timezone,
            'yyyy-MM'
          );

        months[key] = {
          label:
            Utilities.formatDate(
              bucketDate,
              timezone,
              'MMM yy'
            ),
          income: 0,
          spending: 0,
          saved: 0
        };
      }

      return months;
    },

    addIncomeToMonths: function(payWeeks, months) {
      const timezone =
        Session.getScriptTimeZone();

      payWeeks
        .filter(function(week) {
          return (
            week.weekStart instanceof Date
          );
        })
        .forEach(function(week) {
          const key =
            Utilities.formatDate(
              week.weekStart,
              timezone,
              'yyyy-MM'
            );

          if (!months[key]) {
            return;
          }

          months[key].income +=
            Number(week.takeHome) || 0;
        });
    },

    addSpendingToMonths: function(spreadsheet, months) {
      const sheet =
        spreadsheet.getSheetByName(
          PayTrackerFinanceConfig
            .SHEETS
            .PAYMENT_HISTORY
        );

      if (
        !sheet ||
        sheet.getLastRow() <
        PayTrackerFinanceConfig.FIRST_DATA_ROW
      ) {
        return;
      }

      const timezone =
        Session.getScriptTimeZone();

      const config =
        PayTrackerFinanceConfig
          .PAYMENT_HISTORY;

      const columns =
        config.COLUMNS;

      sheet
        .getRange(
          PayTrackerFinanceConfig.FIRST_DATA_ROW,
          1,
          sheet.getLastRow() -
            PayTrackerFinanceConfig.FIRST_DATA_ROW +
            1,
          config.HEADERS.length
        )
        .getValues()
        .forEach(function(row) {
          const undoStatus =
            String(
              row[
                columns.UNDO_STATUS - 1
              ] || ''
            ).trim();

          if (
            undoStatus ===
            PayTrackerFinanceConfig
              .UNDO_STATUSES
              .UNDONE
          ) {
            return;
          }

          const paidDate =
            row[
              columns.PAID_DATE - 1
            ];

          if (
            !(paidDate instanceof Date)
          ) {
            return;
          }

          const key =
            Utilities.formatDate(
              paidDate,
              timezone,
              'yyyy-MM'
            );

          if (!months[key]) {
            return;
          }

          months[key].spending +=
            Number(
              row[
                columns.AMOUNT_PAID - 1
              ]
            ) || 0;
        });
    },

    addSavingsToMonths: function(spreadsheet, months) {
      const sheet =
        spreadsheet.getSheetByName(
          PayTrackerSavingsConfig
            .SHEETS
            .HISTORY
        );

      if (
        !sheet ||
        sheet.getLastRow() <
        PayTrackerSavingsConfig.FIRST_DATA_ROW
      ) {
        return;
      }

      const timezone =
        Session.getScriptTimeZone();

      const config =
        PayTrackerSavingsConfig.HISTORY;

      const columns =
        config.COLUMNS;

      sheet
        .getRange(
          PayTrackerSavingsConfig.FIRST_DATA_ROW,
          1,
          sheet.getLastRow() -
            PayTrackerSavingsConfig.FIRST_DATA_ROW +
            1,
          config.HEADERS.length
        )
        .getValues()
        .forEach(function(row) {
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

          const key =
            Utilities.formatDate(
              depositedDate,
              timezone,
              'yyyy-MM'
            );

          if (!months[key]) {
            return;
          }

          months[key].saved +=
            Number(
              row[
                columns.AMOUNT - 1
              ]
            ) || 0;
        });
    },

    serializeDate: function(value) {
      if (!value) {
        return '';
      }

      const date =
        value instanceof Date
          ? value
          : new Date(value);

      return Number.isNaN(
        date.getTime()
      )
        ? ''
        : date.toISOString();
    }
  });

function makePayTrackerReportsResponseBrowserSafe_(data) {
  return JSON.parse(
    JSON.stringify(
      data,
      function(key, value) {
        if (value instanceof Date) {
          return value.toISOString();
        }

        return value;
      }
    )
  );
}

function getPayTrackerReportsWorkspace() {
  return makePayTrackerReportsResponseBrowserSafe_(
    PayTrackerWebReportsWorkspaceService.getData()
  );
}
