/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Web/SettingsWorkspaceService.js
 *
 * Browser-safe controller for the Settings workspace.
 *
 * Scope:
 * - Savings Settings only (mode, percentage, fixed amount,
 *   maximum amount, default deposit day).
 *
 * Deliberately out of scope:
 * - Payroll Gmail/Drive integration settings and the Monzo
 *   bank connection are not exposed here. Both involve
 *   external account access and are configured through
 *   their own guided setup flows rather than a plain
 *   settings form.
 *******************************************************/

const PayTrackerWebSettingsWorkspaceService =
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

      return {
        success: true,
        generatedAt:
          new Date().toISOString(),
        spreadsheetUrl:
          spreadsheet.getUrl(),
        savings:
          PayTrackerWebSettingsWorkspaceService
            .readSavingsSettings(),
        savingsModes:
          PayTrackerSavingsConfig.SAVINGS_MODES
      };
    },

    readSavingsSettings: function() {
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
          PayTrackerWebSettingsWorkspaceService
            .serializeDate(
              PayTrackerSavingsService
                .getSettingValue(
                  config.KEYS.LAST_RECALCULATED
                )
            )
      };
    },

    updateSavingsSettings: function(payload) {
      const config =
        PayTrackerSavingsConfig.SETTINGS;

      const mode =
        String(
          (payload && payload.mode) || ''
        ).trim();

      if (
        PayTrackerSavingsConfig
          .SAVINGS_MODES
          .indexOf(mode) === -1
      ) {
        throw new Error(
          'Choose a valid Savings Mode.'
        );
      }

      const percentage =
        Number(
          payload && payload.percentage
        );

      if (
        !Number.isFinite(percentage) ||
        percentage < 0 ||
        percentage > 100
      ) {
        throw new Error(
          'Disposable Income Savings % must be between 0 and 100.'
        );
      }

      const fixedAmount =
        Number(
          payload && payload.fixedAmount
        );

      if (
        !Number.isFinite(fixedAmount) ||
        fixedAmount < 0
      ) {
        throw new Error(
          'Fixed Monthly Savings Amount must be zero or a positive number.'
        );
      }

      const maximumAmount =
        Number(
          payload && payload.maximumAmount
        );

      if (
        !Number.isFinite(maximumAmount) ||
        maximumAmount < 0
      ) {
        throw new Error(
          'Maximum Monthly Savings must be zero or a positive number.'
        );
      }

      const defaultDepositDay =
        Number(
          payload && payload.defaultDepositDay
        );

      if (
        !Number.isInteger(defaultDepositDay) ||
        defaultDepositDay < 1 ||
        defaultDepositDay > 28
      ) {
        throw new Error(
          'Default Deposit Day must be a whole number between 1 and 28.'
        );
      }

      PayTrackerSavingsService.setSettingValue(
        config.KEYS.MODE,
        mode
      );

      PayTrackerSavingsService.setSettingValue(
        config.KEYS.PERCENTAGE,
        percentage / 100
      );

      PayTrackerSavingsService.setSettingValue(
        config.KEYS.FIXED_AMOUNT,
        fixedAmount
      );

      PayTrackerSavingsService.setSettingValue(
        config.KEYS.MAXIMUM_AMOUNT,
        maximumAmount
      );

      PayTrackerSavingsService.setSettingValue(
        config.KEYS.DEFAULT_DEPOSIT_DAY,
        defaultDepositDay
      );

      PayTrackerSavingsService.recalculateAll();

      PayTrackerSavingsContributionService
        .syncUpcomingContributions();

      PayTrackerLifeGoalsService
        .recalculateAllGoals();

      PayTrackerFinanceDashboard.refresh();

      return PayTrackerWebSettingsWorkspaceService
        .getData();
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

function makePayTrackerSettingsResponseBrowserSafe_(data) {
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

function getPayTrackerSettingsWorkspace() {
  return makePayTrackerSettingsResponseBrowserSafe_(
    PayTrackerWebSettingsWorkspaceService.getData()
  );
}

function updatePayTrackerSavingsSettings(payload) {
  return makePayTrackerSettingsResponseBrowserSafe_(
    PayTrackerWebSettingsWorkspaceService.updateSavingsSettings(
      payload
    )
  );
}
