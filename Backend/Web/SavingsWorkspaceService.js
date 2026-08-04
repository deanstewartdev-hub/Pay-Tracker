/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Web/SavingsWorkspaceService.js
 *
 * Browser-safe controller for the Savings workspace.
 *******************************************************/

const PayTrackerWebSavingsWorkspaceService =
  Object.freeze({
    getData: function() {
      const spreadsheet =
        SpreadsheetApp
          .getActiveSpreadsheet();

      if (!spreadsheet) {
        throw new Error(
          'No active Pay Tracker spreadsheet is available.'
        );
      }

      PayTrackerSavingsContributionService
        .syncUpcomingContributions();

      const dashboard =
        PayTrackerSavingsDashboardService
          .calculateFigures();

      return {
        success: true,
        generatedAt:
          new Date().toISOString(),
        spreadsheetUrl:
          spreadsheet.getUrl(),
        settings:
          PayTrackerWebSavingsWorkspaceService
            .readSettings(),
        dashboard:
          dashboard,
        pots:
          dashboard.potRows,
        goals:
          dashboard.goalRows,
        contributions:
          PayTrackerWebSavingsWorkspaceService
            .readContributions(spreadsheet),
        history:
          PayTrackerWebSavingsWorkspaceService
            .readHistory(spreadsheet)
      };
    },

    readSettings: function() {
      const config =
        PayTrackerSavingsConfig.SETTINGS;

      return {
        mode:
          String(
            PayTrackerSavingsService
              .getSettingValue(
                config.KEYS.MODE
              ) || ''
          ),
        percentage:
          Number(
            PayTrackerSavingsService
              .getSettingValue(
                config.KEYS.PERCENTAGE
              )
          ) || 0,
        fixedAmount:
          Number(
            PayTrackerSavingsService
              .getSettingValue(
                config.KEYS.FIXED_AMOUNT
              )
          ) || 0,
        maximumAmount:
          Number(
            PayTrackerSavingsService
              .getSettingValue(
                config.KEYS.MAXIMUM_AMOUNT
              )
          ) || 0,
        defaultDepositDay:
          Number(
            PayTrackerSavingsService
              .getSettingValue(
                config.KEYS.DEFAULT_DEPOSIT_DAY
              )
          ) || 1,
        lastRecalculated:
          PayTrackerWebSavingsWorkspaceService
            .serializeDate(
              PayTrackerSavingsService
                .getSettingValue(
                  config.KEYS.LAST_RECALCULATED
                )
            )
      };
    },

    readContributions: function(spreadsheet) {
      const sheet =
        spreadsheet.getSheetByName(
          PayTrackerSavingsConfig
            .SHEETS
            .CONTRIBUTIONS
        );

      if (
        !sheet ||
        sheet.getLastRow() <
        PayTrackerSavingsConfig.FIRST_DATA_ROW
      ) {
        return [];
      }

      const config =
        PayTrackerSavingsConfig.CONTRIBUTIONS;

      const columns =
        config.COLUMNS;

      const today =
        PayTrackerUtils.stripTime(
          new Date()
        );

      return sheet
        .getRange(
          PayTrackerSavingsConfig.FIRST_DATA_ROW,
          1,
          sheet.getLastRow() -
            PayTrackerSavingsConfig.FIRST_DATA_ROW +
            1,
          config.HEADERS.length
        )
        .getValues()
        .filter(function(row) {
          return (
            String(
              row[column_(columns.ID)] || ''
            ).trim() !== ''
          );
        })
        .map(function(row) {
          const dueDateRaw =
            row[column_(columns.DUE_DATE)];

          const dueDate =
            dueDateRaw instanceof Date
              ? dueDateRaw
              : null;

          return {
            id:
              String(
                row[column_(columns.ID)] || ''
              ).trim(),
            dueDate:
              PayTrackerWebSavingsWorkspaceService
                .serializeDate(dueDateRaw),
            potId:
              String(
                row[column_(columns.POT_ID)] || ''
              ).trim(),
            potName:
              String(
                row[column_(columns.POT_NAME)] || ''
              ).trim(),
            amount:
              Number(
                row[column_(columns.AMOUNT)]
              ) || 0,
            deposited:
              row[column_(columns.DEPOSITED)] === true,
            status:
              String(
                row[column_(columns.STATUS)] || ''
              ).trim(),
            notes:
              String(
                row[column_(columns.NOTES)] || ''
              ).trim(),
            method:
              String(
                row[column_(columns.METHOD)] || ''
              ).trim(),
            frequency:
              String(
                row[column_(columns.FREQUENCY)] || ''
              ).trim(),
            overdue:
              Boolean(
                dueDate &&
                PayTrackerUtils
                  .stripTime(dueDate)
                  .getTime() <
                today.getTime()
              )
          };
        })
        .sort(function(left, right) {
          return (
            new Date(left.dueDate || 0).getTime() -
            new Date(right.dueDate || 0).getTime()
          );
        });
    },

    readHistory: function(spreadsheet) {
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
        return [];
      }

      const config =
        PayTrackerSavingsConfig.HISTORY;

      const columns =
        config.COLUMNS;

      return sheet
        .getRange(
          PayTrackerSavingsConfig.FIRST_DATA_ROW,
          1,
          sheet.getLastRow() -
            PayTrackerSavingsConfig.FIRST_DATA_ROW +
            1,
          config.HEADERS.length
        )
        .getValues()
        .filter(function(row) {
          return (
            String(
              row[column_(columns.ID)] || ''
            ).trim() !== '' &&
            String(
              row[column_(columns.UNDO_STATUS)] || ''
            ).trim() !==
              PayTrackerSavingsConfig
                .UNDO_STATUSES
                .UNDONE
          );
        })
        .map(function(row) {
          return {
            id:
              String(
                row[column_(columns.ID)] || ''
              ).trim(),
            originalDueDate:
              PayTrackerWebSavingsWorkspaceService
                .serializeDate(
                  row[column_(columns.ORIGINAL_DUE_DATE)]
                ),
            depositedDate:
              PayTrackerWebSavingsWorkspaceService
                .serializeDate(
                  row[column_(columns.DEPOSITED_DATE)]
                ),
            potName:
              String(
                row[column_(columns.POT_NAME)] || ''
              ).trim(),
            amount:
              Number(
                row[column_(columns.AMOUNT)]
              ) || 0,
            previousBalance:
              Number(
                row[column_(columns.PREVIOUS_BALANCE)]
              ) || 0,
            balanceAfter:
              Number(
                row[column_(columns.BALANCE_AFTER)]
              ) || 0,
            method:
              String(
                row[column_(columns.METHOD)] || ''
              ).trim(),
            frequency:
              String(
                row[column_(columns.FREQUENCY)] || ''
              ).trim()
          };
        })
        .sort(function(left, right) {
          return (
            new Date(right.depositedDate || 0).getTime() -
            new Date(left.depositedDate || 0).getTime()
          );
        })
        .slice(0, 50);
    },

    markContributionDeposited: function(contributionId) {
      const spreadsheet =
        SpreadsheetApp.getActiveSpreadsheet();

      const sheet =
        spreadsheet.getSheetByName(
          PayTrackerSavingsConfig
            .SHEETS
            .CONTRIBUTIONS
        );

      if (!sheet) {
        throw new Error(
          'Savings Contributions sheet was not found.'
        );
      }

      const row =
        PayTrackerWebSavingsWorkspaceService
          .findContributionRowById(
            sheet,
            contributionId
          );

      if (!row) {
        throw new Error(
          'Savings contribution "' +
          contributionId +
          '" was not found.'
        );
      }

      PayTrackerSavingsContributionService
        .processContributionRow(
          sheet,
          row
        );

      PayTrackerSavingsContributionService
        .syncUpcomingContributions();

      PayTrackerLifeGoalsService
        .recalculateAllGoals();

      PayTrackerFinanceDashboard.refresh();

      return PayTrackerWebSavingsWorkspaceService
        .getData();
    },

    undoLastContribution: function() {
      PayTrackerSavingsContributionService
        .undoLastContribution();

      return PayTrackerWebSavingsWorkspaceService
        .getData();
    },

    findContributionRowById: function(sheet, contributionId) {
      if (
        !sheet ||
        sheet.getLastRow() <
        PayTrackerSavingsConfig.FIRST_DATA_ROW
      ) {
        return null;
      }

      const targetId =
        String(
          contributionId || ''
        ).trim();

      if (targetId === '') {
        return null;
      }

      const idColumn =
        PayTrackerSavingsConfig
          .CONTRIBUTIONS
          .COLUMNS
          .ID;

      const values =
        sheet
          .getRange(
            PayTrackerSavingsConfig.FIRST_DATA_ROW,
            idColumn,
            sheet.getLastRow() -
              PayTrackerSavingsConfig.FIRST_DATA_ROW +
              1,
            1
          )
          .getDisplayValues();

      for (
        let index = 0;
        index < values.length;
        index++
      ) {
        if (
          String(
            values[index][0] || ''
          ).trim() === targetId
        ) {
          return (
            index +
            PayTrackerSavingsConfig.FIRST_DATA_ROW
          );
        }
      }

      return null;
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

/**
 * Converts a 1-based column index into a 0-based array
 * offset for reading getValues() rows.
 *
 * @param {number} columnNumber
 * @return {number}
 */
function column_(columnNumber) {
  return columnNumber - 1;
}

function makePayTrackerSavingsResponseBrowserSafe_(data) {
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

function getPayTrackerSavingsWorkspace() {
  return makePayTrackerSavingsResponseBrowserSafe_(
    PayTrackerWebSavingsWorkspaceService.getData()
  );
}

function markPayTrackerSavingsContributionDeposited(contributionId) {
  return makePayTrackerSavingsResponseBrowserSafe_(
    PayTrackerWebSavingsWorkspaceService.markContributionDeposited(
      contributionId
    )
  );
}

function undoPayTrackerSavingsContribution() {
  return makePayTrackerSavingsResponseBrowserSafe_(
    PayTrackerWebSavingsWorkspaceService.undoLastContribution()
  );
}
