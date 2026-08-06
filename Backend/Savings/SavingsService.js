/*******************************************************
 * PAY TRACKER V2.6
 * SavingsService.gs
 *
 * Pots-based savings service.
 *
 * Handles:
 * - Savings module setup and safe upgrades
 * - Savings Settings
 * - Savings Pots
 * - Percentage Allocation contributions
 * - Fixed Amount contributions
 * - Weekly, fortnightly, monthly, quarterly,
 *   annual and one-off schedules
 * - Monthly-equivalent calculations
 * - Interest estimates
 * - Estimated months to goal
 * - Estimated completion dates
 * - Target status
 * - Allocation validation
 *
 * IMPORTANT:
 * This service is designed for:
 * - Savings Settings
 * - Savings Pots
 * - Savings Contributions
 * - Savings History
 * - Life Goals
 *
 * It does not use the incompatible Savings Accounts /
 * Savings Transactions architecture.
 *******************************************************/

const PayTrackerSavingsService = Object.freeze({
  /**
   * Creates or safely upgrades the complete savings module.
   *
   * Existing savings data is preserved.
   *
   * @return {Object}
   */
  setupSavingsModule: function () {
  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error(
      'No active spreadsheet is available.'
    );
  }

  const settingsSheet =
    PayTrackerSavingsService.getOrCreateSheet_(
      spreadsheet,
      PayTrackerSavingsConfig.SHEETS.SETTINGS
    );

  const potsSheet =
    PayTrackerSavingsService.getOrCreateSheet_(
      spreadsheet,
      PayTrackerSavingsConfig.SHEETS.POTS
    );

  const contributionsSheet =
    PayTrackerSavingsService.getOrCreateSheet_(
      spreadsheet,
      PayTrackerSavingsConfig.SHEETS.CONTRIBUTIONS
    );

  const historySheet =
    PayTrackerSavingsService.getOrCreateSheet_(
      spreadsheet,
      PayTrackerSavingsConfig.SHEETS.HISTORY
    );

  const goalsSheet =
    PayTrackerSavingsService.getOrCreateSheet_(
      spreadsheet,
      PayTrackerSavingsConfig.SHEETS.GOALS
    );

  PayTrackerSavingsService.buildSettingsSheet(
    settingsSheet
  );

  PayTrackerSavingsService.buildPotsSheet(
    potsSheet
  );

  PayTrackerSavingsContributionService.buildContributionsSheet(
    contributionsSheet
  );

  PayTrackerSavingsContributionService.buildHistorySheet(
    historySheet
  );

  PayTrackerLifeGoalsService.buildGoalsSheet(
    goalsSheet
  );

  /*
   * Complete all sheet creation and formatting before any
   * follow-up service tries to retrieve the sheets again.
   */
  SpreadsheetApp.flush();

  PayTrackerSavingsService.recalculateAll();

  SpreadsheetApp.flush();

  /*
   * The contribution service retrieves fresh sheet objects
   * by name. This prevents references to deleted temporary
   * sheets such as the former Sheet5 or Sheet6.
   */
  PayTrackerSavingsContributionService.syncUpcomingContributions();

  PayTrackerLifeGoalsService.recalculateAllGoals();

  SpreadsheetApp.flush();

  return {
    settingsSheet:
      PayTrackerSavingsConfig.SHEETS.SETTINGS,

    potsSheet:
      PayTrackerSavingsConfig.SHEETS.POTS,

    contributionsSheet:
      PayTrackerSavingsConfig.SHEETS.CONTRIBUTIONS,

    historySheet:
      PayTrackerSavingsConfig.SHEETS.HISTORY,

    goalsSheet:
      PayTrackerSavingsConfig.SHEETS.GOALS
  };
},


  /**
   * Creates a named sheet when it does not already exist.
   *
   * The sheet name must be a valid non-empty string. This
   * prevents accidental blank Sheet5 / Sheet6 creation.
   *
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet
   * @param {string} sheetName
   * @return {GoogleAppsScript.Spreadsheet.Sheet}
   * @private
   */
  getOrCreateSheet_: function (
    spreadsheet,
    sheetName
  ) {
    const cleanSheetName =
      String(
        sheetName || ''
      ).trim();

    if (cleanSheetName === '') {
      throw new Error(
        'A valid savings sheet name is required.'
      );
    }

    let sheet =
      spreadsheet.getSheetByName(
        cleanSheetName
      );

    if (!sheet) {
      sheet =
        spreadsheet.insertSheet(
          cleanSheetName
        );
    }

    return sheet;
  },


  /**
   * Creates or upgrades Savings Settings.
   *
   * Existing setting values are preserved.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  buildSettingsSheet: function (
    sheet
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const config =
      PayTrackerSavingsConfig.SETTINGS;

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
      .setBackground(
        '#1e3a8a'
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

    sheet.setFrozenRows(
      1
    );

    sheet.setTabColor(
      '#2563eb'
    );

    const existingSettings = {};

    if (
      sheet.getLastRow() >=
      PayTrackerSavingsConfig.FIRST_DATA_ROW
    ) {
      const values =
        sheet
          .getRange(
            PayTrackerSavingsConfig.FIRST_DATA_ROW,
            1,
            sheet.getLastRow() - 1,
            1
          )
          .getDisplayValues();

      values.forEach(
        function (
          row,
          index
        ) {
          const key =
            String(
              row[0] || ''
            ).trim();

          if (key !== '') {
            existingSettings[key] =
              index +
              PayTrackerSavingsConfig.FIRST_DATA_ROW;
          }
        }
      );
    }

    config.DEFAULT_ROWS.forEach(
      function (defaultRow) {
        const key =
          String(
            defaultRow[0] || ''
          ).trim();

        if (
          key !== '' &&
          !existingSettings[key]
        ) {
          sheet.appendRow(
            defaultRow
          );
        }
      }
    );

    const modeValidation =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          PayTrackerSavingsConfig.SAVINGS_MODES,
          true
        )
        .setAllowInvalid(false)
        .build();

    const modeRow =
      PayTrackerSavingsService.findSettingRow(
        sheet,
        config.KEYS.MODE
      );

    if (modeRow) {
      sheet
        .getRange(
          modeRow,
          2
        )
        .setDataValidation(
          modeValidation
        );
    }

    const percentageRow =
      PayTrackerSavingsService.findSettingRow(
        sheet,
        config.KEYS.PERCENTAGE
      );

    if (percentageRow) {
      sheet
        .getRange(
          percentageRow,
          2
        )
        .setNumberFormat(
          PayTrackerSavingsConfig.FORMATS.PERCENTAGE
        );
    }

    [
      config.KEYS.FIXED_AMOUNT,
      config.KEYS.MAXIMUM_AMOUNT
    ].forEach(
      function (settingName) {
        const row =
          PayTrackerSavingsService.findSettingRow(
            sheet,
            settingName
          );

        if (row) {
          sheet
            .getRange(
              row,
              2
            )
            .setNumberFormat(
              PayTrackerSavingsConfig.FORMATS.CURRENCY
            );
        }
      }
    );

    const defaultDayRow =
      PayTrackerSavingsService.findSettingRow(
        sheet,
        config.KEYS.DEFAULT_DEPOSIT_DAY
      );

    if (defaultDayRow) {
      sheet
        .getRange(
          defaultDayRow,
          2
        )
        .setNumberFormat(
          PayTrackerSavingsConfig.FORMATS.INTEGER
        );
    }

    const lastRecalculatedRow =
      PayTrackerSavingsService.findSettingRow(
        sheet,
        config.KEYS.LAST_RECALCULATED
      );

    if (lastRecalculatedRow) {
      sheet
        .getRange(
          lastRecalculatedRow,
          2
        )
        .setNumberFormat(
          PayTrackerSavingsConfig.FORMATS.DATE_TIME
        );
    }

    sheet.setColumnWidth(
      1,
      240
    );

    sheet.setColumnWidth(
      2,
      210
    );

    sheet.setColumnWidth(
      3,
      520
    );
  },


  /**
   * Creates or upgrades Savings Pots.
   *
   * Existing values are preserved. New v2.6 columns are
   * appended through SavingsConfig.gs.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  buildPotsSheet: function (
    sheet
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const config =
      PayTrackerSavingsConfig.POTS;

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
      .setBackground(
        '#14532d'
      )
      .setFontColor(
        '#ffffff'
      )
      .setFontWeight(
        'bold'
      )
      .setHorizontalAlignment(
        'center'
      )
      .setVerticalAlignment(
        'middle'
      )
      .setWrap(
        true
      );

    sheet.setFrozenRows(
      1
    );

    sheet.setTabColor(
      '#16a34a'
    );

    const columns =
      config.COLUMNS;

    const rowCount =
      Math.max(
        sheet.getMaxRows() -
        PayTrackerSavingsConfig.FIRST_DATA_ROW +
        1,
        1
      );

    const accountTypeValidation =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          PayTrackerSavingsConfig.ACCOUNT_TYPES,
          true
        )
        .setAllowInvalid(false)
        .build();

    const activeValidation =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          PayTrackerSavingsConfig.ACTIVE_VALUES,
          true
        )
        .setAllowInvalid(false)
        .build();

    const contributionMethodValidation =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          PayTrackerSavingsConfig.CONTRIBUTION_METHODS,
          true
        )
        .setAllowInvalid(false)
        .build();

    const contributionFrequencyValidation =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          PayTrackerSavingsConfig.CONTRIBUTION_FREQUENCIES,
          true
        )
        .setAllowInvalid(false)
        .build();

    sheet
      .getRange(
        PayTrackerSavingsConfig.FIRST_DATA_ROW,
        columns.ACCOUNT_TYPE,
        rowCount,
        1
      )
      .setDataValidation(
        accountTypeValidation
      );

    sheet
      .getRange(
        PayTrackerSavingsConfig.FIRST_DATA_ROW,
        columns.ACTIVE,
        rowCount,
        1
      )
      .setDataValidation(
        activeValidation
      );

    sheet
      .getRange(
        PayTrackerSavingsConfig.FIRST_DATA_ROW,
        columns.CONTRIBUTION_METHOD,
        rowCount,
        1
      )
      .setDataValidation(
        contributionMethodValidation
      );

    sheet
      .getRange(
        PayTrackerSavingsConfig.FIRST_DATA_ROW,
        columns.CONTRIBUTION_FREQUENCY,
        rowCount,
        1
      )
      .setDataValidation(
        contributionFrequencyValidation
      );

    [
      columns.CURRENT_BALANCE,
      columns.GOAL_AMOUNT,
      columns.SUGGESTED_DEPOSIT,
      columns.AMOUNT_REMAINING,
      columns.MONTHLY_INTEREST,
      columns.ANNUAL_INTEREST,
      columns.CONTRIBUTION_AMOUNT,
      columns.MONTHLY_EQUIVALENT
    ].forEach(
      function (column) {
        sheet
          .getRange(
            PayTrackerSavingsConfig.FIRST_DATA_ROW,
            column,
            rowCount,
            1
          )
          .setNumberFormat(
            PayTrackerSavingsConfig.FORMATS.CURRENCY
          );
      }
    );

    [
      columns.ALLOCATION,
      columns.PROGRESS
    ].forEach(
      function (column) {
        sheet
          .getRange(
            PayTrackerSavingsConfig.FIRST_DATA_ROW,
            column,
            rowCount,
            1
          )
          .setNumberFormat(
            PayTrackerSavingsConfig.FORMATS.PERCENTAGE
          );
      }
    );

    sheet
      .getRange(
        PayTrackerSavingsConfig.FIRST_DATA_ROW,
        columns.INTEREST_RATE,
        rowCount,
        1
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.RATE_NUMBER
      );

    [
      columns.TARGET_DATE,
      columns.NEXT_DEPOSIT_DATE,
      columns.COMPLETION_DATE
    ].forEach(
      function (column) {
        sheet
          .getRange(
            PayTrackerSavingsConfig.FIRST_DATA_ROW,
            column,
            rowCount,
            1
          )
          .setNumberFormat(
            PayTrackerSavingsConfig.FORMATS.DATE
          );
      }
    );

    sheet
      .getRange(
        PayTrackerSavingsConfig.FIRST_DATA_ROW,
        columns.MONTHS_TO_GOAL,
        rowCount,
        1
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.INTEGER
      );

    const widths = [
      145,
      190,
      145,
      165,
      125,
      125,
      110,
      125,
      85,
      120,
      130,
      155,
      130,
      105,
      155,
      150,
      155,
      190,
      145,
      270,
      175,
      165,
      140,
      145,
      155,
      140,
      190,
      180
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

    PayTrackerSavingsService.setDefaultPotContributionSettings(
      sheet
    );
  },


  /**
   * Adds defaults to existing populated savings pots.
   *
   * Existing user selections are never overwritten.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  setDefaultPotContributionSettings: function (
    sheet
  ) {
    if (
      !sheet ||
      sheet.getLastRow() <
      PayTrackerSavingsConfig.FIRST_DATA_ROW
    ) {
      return;
    }

    const config =
      PayTrackerSavingsConfig.POTS;

    const columns =
      config.COLUMNS;

    PayTrackerFinanceService.ensureSheetColumns(
      sheet,
      config.HEADERS.length
    );

    const rows =
      sheet
        .getRange(
          PayTrackerSavingsConfig.FIRST_DATA_ROW,
          1,
          sheet.getLastRow() -
            PayTrackerSavingsConfig.FIRST_DATA_ROW +
            1,
          config.HEADERS.length
        )
        .getValues();

    rows.forEach(
      function (
        values,
        index
      ) {
        const row =
          index +
          PayTrackerSavingsConfig.FIRST_DATA_ROW;

        const potName =
          String(
            values[
              columns.NAME - 1
            ] || ''
          ).trim();

        if (potName === '') {
          return;
        }

        const active =
          String(
            values[
              columns.ACTIVE - 1
            ] || ''
          ).trim();

        const method =
          String(
            values[
              columns.CONTRIBUTION_METHOD - 1
            ] || ''
          ).trim();

        const frequency =
          String(
            values[
              columns.CONTRIBUTION_FREQUENCY - 1
            ] || ''
          ).trim();

        if (active === '') {
          sheet
            .getRange(
              row,
              columns.ACTIVE
            )
            .setValue(
              'Yes'
            );
        }

        if (method === '') {
          sheet
            .getRange(
              row,
              columns.CONTRIBUTION_METHOD
            )
            .setValue(
              'Percentage Allocation'
            );
        }

        if (frequency === '') {
          sheet
            .getRange(
              row,
              columns.CONTRIBUTION_FREQUENCY
            )
            .setValue(
              'Monthly'
            );
        }
      }
    );
  },


  /**
   * Handles edits to Savings Settings and Savings Pots.
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
        PayTrackerSavingsConfig.SHEETS.SETTINGS &&
      sheetName !==
        PayTrackerSavingsConfig.SHEETS.POTS
    ) {
      return;
    }

    if (
      sheetName ===
      PayTrackerSavingsConfig.SHEETS.SETTINGS
    ) {
      PayTrackerSavingsService.recalculateAll();

      PayTrackerSavingsContributionService.syncUpcomingContributions();

      PayTrackerLifeGoalsService.recalculateAllGoals();

      PayTrackerFinanceDashboard.refresh();

      return;
    }

    const firstRow =
      Math.max(
        event.range.getRow(),
        PayTrackerSavingsConfig.FIRST_DATA_ROW
      );

    const lastRow =
      event.range.getLastRow();

    if (
      lastRow <
      PayTrackerSavingsConfig.FIRST_DATA_ROW
    ) {
      return;
    }

    for (
      let row = firstRow;
      row <= lastRow;
      row++
    ) {
      PayTrackerSavingsService.updatePotRow(
        sheet,
        row
      );
    }

    PayTrackerSavingsService.validateAllocation();

    PayTrackerSavingsContributionService.syncUpcomingContributions();

    PayTrackerLifeGoalsService.recalculateAllGoals();

    PayTrackerFinanceDashboard.refresh();
  },


  /**
   * Recalculates every populated savings pot.
   *
   * @return {number}
   */
  recalculateAll: function () {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const potsSheet =
      spreadsheet.getSheetByName(
        PayTrackerSavingsConfig.SHEETS.POTS
      );

    if (!potsSheet) {
      return 0;
    }

    PayTrackerSavingsService.setDefaultPotContributionSettings(
      potsSheet
    );

    const lastRow =
      potsSheet.getLastRow();

    if (
      lastRow <
      PayTrackerSavingsConfig.FIRST_DATA_ROW
    ) {
      PayTrackerSavingsService.updateLastRecalculatedSetting();

      return 0;
    }

    let updatedCount =
      0;

    for (
      let row =
        PayTrackerSavingsConfig.FIRST_DATA_ROW;
      row <= lastRow;
      row++
    ) {
      const updated =
        PayTrackerSavingsService.updatePotRow(
          potsSheet,
          row
        );

      if (updated) {
        updatedCount++;
      }
    }

    PayTrackerSavingsService.validateAllocation();

    PayTrackerSavingsService.updateLastRecalculatedSetting();

    SpreadsheetApp.flush();

    return updatedCount;
  },


  /**
   * Recalculates one Savings Pots row.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} row
   * @return {boolean}
   */
  updatePotRow: function (
    sheet,
    row
  ) {
    if (
      !sheet ||
      row <
      PayTrackerSavingsConfig.FIRST_DATA_ROW
    ) {
      return false;
    }

    const config =
      PayTrackerSavingsConfig.POTS;

    const columns =
      config.COLUMNS;

    /*
     * Sheets created before the Monzo Pot link columns
     * existed may not be wide enough yet. Widen safely
     * before reading or writing the full row.
     */
    PayTrackerFinanceService.ensureSheetColumns(
      sheet,
      config.HEADERS.length
    );

    const values =
      sheet
        .getRange(
          row,
          1,
          1,
          config.HEADERS.length
        )
        .getValues()[0];

    const potName =
      String(
        values[
          columns.NAME - 1
        ] || ''
      ).trim();

    if (potName === '') {
      return false;
    }

    let potId =
      String(
        values[
          columns.ID - 1
        ] || ''
      ).trim();

    if (potId === '') {
      potId =
        PayTrackerFinanceService.createFinanceId(
          'POT'
        );

      sheet
        .getRange(
          row,
          columns.ID
        )
        .setValue(
          potId
        );
    }

    let contributionMethod =
      String(
        values[
          columns.CONTRIBUTION_METHOD - 1
        ] || ''
      ).trim();

    let contributionFrequency =
      String(
        values[
          columns.CONTRIBUTION_FREQUENCY - 1
        ] || ''
      ).trim();

    let active =
      String(
        values[
          columns.ACTIVE - 1
        ] || ''
      ).trim();

    if (contributionMethod === '') {
      contributionMethod =
        'Percentage Allocation';

      sheet
        .getRange(
          row,
          columns.CONTRIBUTION_METHOD
        )
        .setValue(
          contributionMethod
        );
    }

    if (contributionFrequency === '') {
      contributionFrequency =
        'Monthly';

      sheet
        .getRange(
          row,
          columns.CONTRIBUTION_FREQUENCY
        )
        .setValue(
          contributionFrequency
        );
    }

    if (active === '') {
      active =
        'Yes';

      sheet
        .getRange(
          row,
          columns.ACTIVE
        )
        .setValue(
          active
        );
    }

    const currentBalance =
      Math.max(
        Number(
          values[
            columns.CURRENT_BALANCE - 1
          ]
        ) || 0,
        0
      );

    const goalAmount =
      Math.max(
        Number(
          values[
            columns.GOAL_AMOUNT - 1
          ]
        ) || 0,
        0
      );

    const allocation =
      Math.max(
        Number(
          values[
            columns.ALLOCATION - 1
          ]
        ) || 0,
        0
      );

    const interestRate =
      Math.max(
        Number(
          values[
            columns.INTEREST_RATE - 1
          ]
        ) || 0,
        0
      );

    const enteredContributionAmount =
      Math.max(
        Number(
          values[
            columns.CONTRIBUTION_AMOUNT - 1
          ]
        ) || 0,
        0
      );

    const monthlySavingsAvailable =
      PayTrackerSavingsService.calculateMonthlySavingsAvailable();

    let contributionAmount =
      0;

    if (
      active === 'Yes' &&
      contributionMethod ===
        'Fixed Amount'
    ) {
      contributionAmount =
        enteredContributionAmount;
    }

    if (
      active === 'Yes' &&
      contributionMethod ===
        'Percentage Allocation'
    ) {
      const monthlyAllocatedAmount =
        monthlySavingsAvailable *
        allocation;

      contributionAmount =
        PayTrackerSavingsService.convertMonthlyAmountToFrequency(
          monthlyAllocatedAmount,
          contributionFrequency
        );
    }

    contributionAmount =
      PayTrackerUtils.roundCurrency(
        contributionAmount
      );

    const monthlyEquivalent =
      PayTrackerSavingsService.convertToMonthlyEquivalent(
        contributionAmount,
        contributionFrequency
      );

    const amountRemaining =
      PayTrackerUtils.roundCurrency(
        Math.max(
          goalAmount -
          currentBalance,
          0
        )
      );

    const progress =
      goalAmount > 0
        ? Math.min(
            currentBalance /
            goalAmount,
            1
          )
        : 0;

    const annualInterest =
      PayTrackerUtils.roundCurrency(
        currentBalance *
        (
          interestRate /
          100
        )
      );

    const monthlyInterest =
      PayTrackerUtils.roundCurrency(
        annualInterest /
        12
      );

    const estimate =
      PayTrackerSavingsService.calculateGoalEstimate(
        currentBalance,
        goalAmount,
        monthlyEquivalent,
        interestRate
      );

    const targetDate =
      values[
        columns.TARGET_DATE - 1
      ];

    const targetStatus =
      PayTrackerSavingsService.calculateTargetStatus(
        currentBalance,
        goalAmount,
        targetDate,
        estimate.completionDate,
        monthlyEquivalent
      );

    let nextDepositDate =
      values[
        columns.NEXT_DEPOSIT_DATE - 1
      ];

    if (
      active === 'Yes' &&
      !(nextDepositDate instanceof Date)
    ) {
      nextDepositDate =
        PayTrackerSavingsService.getDefaultNextDepositDate();

      sheet
        .getRange(
          row,
          columns.NEXT_DEPOSIT_DATE
        )
        .setValue(
          nextDepositDate
        )
        .setNumberFormat(
          PayTrackerSavingsConfig.FORMATS.DATE
        );
    }

    if (
      active !== 'Yes'
    ) {
      contributionAmount =
        0;
    }

    /*
     * Fixed Amount is user-controlled.
     * Percentage Allocation is system-calculated.
     */
    if (
      contributionMethod ===
      'Percentage Allocation'
    ) {
      sheet
        .getRange(
          row,
          columns.CONTRIBUTION_AMOUNT
        )
        .setValue(
          contributionAmount
        )
        .setNumberFormat(
          PayTrackerSavingsConfig.FORMATS.CURRENCY
        );
    }

    sheet
      .getRange(
        row,
        columns.MONTHLY_EQUIVALENT
      )
      .setValue(
        PayTrackerUtils.roundCurrency(
          monthlyEquivalent
        )
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.CURRENCY
      );

    sheet
      .getRange(
        row,
        columns.SUGGESTED_DEPOSIT
      )
      .setValue(
        PayTrackerUtils.roundCurrency(
          monthlyEquivalent
        )
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.CURRENCY
      );

    sheet
      .getRange(
        row,
        columns.AMOUNT_REMAINING
      )
      .setValue(
        amountRemaining
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.CURRENCY
      );

    sheet
      .getRange(
        row,
        columns.PROGRESS
      )
      .setValue(
        progress
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.PERCENTAGE
      );

    sheet
      .getRange(
        row,
        columns.MONTHLY_INTEREST
      )
      .setValue(
        monthlyInterest
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.CURRENCY
      );

    sheet
      .getRange(
        row,
        columns.ANNUAL_INTEREST
      )
      .setValue(
        annualInterest
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.CURRENCY
      );

    if (
      estimate.monthsToGoal === ''
    ) {
      sheet
        .getRange(
          row,
          columns.MONTHS_TO_GOAL
        )
        .clearContent();
    } else {
      sheet
        .getRange(
          row,
          columns.MONTHS_TO_GOAL
        )
        .setValue(
          estimate.monthsToGoal
        )
        .setNumberFormat(
          PayTrackerSavingsConfig.FORMATS.INTEGER
        );
    }

    sheet
      .getRange(
        row,
        columns.TARGET_STATUS
      )
      .setValue(
        targetStatus
      );

    if (
      estimate.completionDate instanceof Date
    ) {
      sheet
        .getRange(
          row,
          columns.COMPLETION_DATE
        )
        .setValue(
          estimate.completionDate
        )
        .setNumberFormat(
          PayTrackerSavingsConfig.FORMATS.DATE
        );
    } else {
      sheet
        .getRange(
          row,
          columns.COMPLETION_DATE
        )
        .clearContent();
    }

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
        '="","",SPARKLINE(' +
        PayTrackerUtils.cellReference(
          row,
          columns.PROGRESS
        ) +
        ',{"charttype","bar";"max",1;' +
        '"color1","#16a34a"}))'
      );

    return true;
  },


  /**
   * Calculates the total monthly amount available for savings.
   *
   * Percentage mode:
   * disposable income × configured savings percentage.
   *
   * Fixed mode:
   * configured fixed monthly savings amount.
   *
   * @return {number}
   */
  calculateMonthlySavingsAvailable: function () {
    const mode =
      String(
        PayTrackerSavingsService.getSettingValue(
          PayTrackerSavingsConfig.SETTINGS.KEYS.MODE
        ) || ''
      ).trim();

    const percentage =
      Math.max(
        Number(
          PayTrackerSavingsService.getSettingValue(
            PayTrackerSavingsConfig.SETTINGS.KEYS.PERCENTAGE
          )
        ) || 0,
        0
      );

    const fixedAmount =
      Math.max(
        Number(
          PayTrackerSavingsService.getSettingValue(
            PayTrackerSavingsConfig.SETTINGS.KEYS.FIXED_AMOUNT
          )
        ) || 0,
        0
      );

    const maximumAmount =
      Math.max(
        Number(
          PayTrackerSavingsService.getSettingValue(
            PayTrackerSavingsConfig.SETTINGS.KEYS.MAXIMUM_AMOUNT
          )
        ) || 0,
        0
      );

    let amountAvailable =
      0;

    if (
      mode ===
      'Fixed Monthly Amount'
    ) {
      amountAvailable =
        fixedAmount;
    } else {
      let monthlyTakeHome =
        0;

      let monthlyBills =
        0;

      let monthlyDebtRepayments =
        0;

      try {
        monthlyTakeHome =
          PayTrackerFinanceDashboard
            .calculateEstimatedMonthlyTakeHome();
      } catch (error) {
        console.warn(
          'Unable to calculate monthly take-home for savings: ' +
          error.message
        );
      }

      try {
        const spreadsheet =
          SpreadsheetApp.getActiveSpreadsheet();

        const billsSheet =
          spreadsheet.getSheetByName(
            PayTrackerFinanceConfig.SHEETS.BILLS
          );

        const billFigures =
          PayTrackerFinanceDashboard.calculateBillFigures(
            billsSheet
          );

        monthlyBills =
          Number(
            billFigures.monthlyBills
          ) || 0;
      } catch (error) {
        console.warn(
          'Unable to calculate monthly bills for savings: ' +
          error.message
        );
      }

      try {
        const spreadsheet =
          SpreadsheetApp.getActiveSpreadsheet();

        const debtsSheet =
          spreadsheet.getSheetByName(
            PayTrackerFinanceConfig.SHEETS.DEBTS
          );

        const debtFigures =
          PayTrackerFinanceDashboard.calculateDebtFigures(
            debtsSheet
          );

        monthlyDebtRepayments =
          Number(
            debtFigures.monthlyDebtRepayments
          ) || 0;
      } catch (error) {
        console.warn(
          'Unable to calculate debt repayments for savings: ' +
          error.message
        );
      }

      const disposableIncome =
        Math.max(
          monthlyTakeHome -
          monthlyBills -
          monthlyDebtRepayments,
          0
        );

      amountAvailable =
        disposableIncome *
        percentage;
    }

    if (
      maximumAmount >
      0
    ) {
      amountAvailable =
        Math.min(
          amountAvailable,
          maximumAmount
        );
    }

    return PayTrackerUtils.roundCurrency(
      Math.max(
        amountAvailable,
        0
      )
    );
  },


  /**
   * Converts one contribution into a monthly equivalent.
   *
   * @param {number} amount
   * @param {string} frequency
   * @return {number}
   */
  convertToMonthlyEquivalent: function (
    amount,
    frequency
  ) {
    const value =
      Math.max(
        Number(
          amount
        ) || 0,
        0
      );

    switch (
      String(
        frequency || ''
      ).trim()
    ) {
      case 'Weekly':
        return PayTrackerUtils.roundCurrency(
          value *
          52 /
          12
        );

      case 'Fortnightly':
        return PayTrackerUtils.roundCurrency(
          value *
          26 /
          12
        );

      case 'Monthly':
        return PayTrackerUtils.roundCurrency(
          value
        );

      case 'Quarterly':
        return PayTrackerUtils.roundCurrency(
          value /
          3
        );

      case 'Annual':
        return PayTrackerUtils.roundCurrency(
          value /
          12
        );

      case 'One-off':
      default:
        return PayTrackerUtils.roundCurrency(
          value
        );
    }
  },


  /**
   * Converts a monthly allocation into the amount required
   * for the selected contribution frequency.
   *
   * @param {number} monthlyAmount
   * @param {string} frequency
   * @return {number}
   */
  convertMonthlyAmountToFrequency: function (
    monthlyAmount,
    frequency
  ) {
    const value =
      Math.max(
        Number(
          monthlyAmount
        ) || 0,
        0
      );

    switch (
      String(
        frequency || ''
      ).trim()
    ) {
      case 'Weekly':
        return PayTrackerUtils.roundCurrency(
          value *
          12 /
          52
        );

      case 'Fortnightly':
        return PayTrackerUtils.roundCurrency(
          value *
          12 /
          26
        );

      case 'Monthly':
        return PayTrackerUtils.roundCurrency(
          value
        );

      case 'Quarterly':
        return PayTrackerUtils.roundCurrency(
          value *
          3
        );

      case 'Annual':
        return PayTrackerUtils.roundCurrency(
          value *
          12
        );

      case 'One-off':
      default:
        return PayTrackerUtils.roundCurrency(
          value
        );
    }
  },


  /**
   * Calculates estimated months and completion date.
   *
   * The calculation simulates monthly deposits and estimated
   * monthly interest.
   *
   * @param {number} currentBalance
   * @param {number} goalAmount
   * @param {number} monthlyContribution
   * @param {number} aerPercentage
   * @return {Object}
   */
  calculateGoalEstimate: function (
    currentBalance,
    goalAmount,
    monthlyContribution,
    aerPercentage
  ) {
    const balance =
      Math.max(
        Number(
          currentBalance
        ) || 0,
        0
      );

    const goal =
      Math.max(
        Number(
          goalAmount
        ) || 0,
        0
      );

    const contribution =
      Math.max(
        Number(
          monthlyContribution
        ) || 0,
        0
      );

    const annualRate =
      Math.max(
        Number(
          aerPercentage
        ) || 0,
        0
      ) /
      100;

    if (
      goal <=
      0
    ) {
      return {
        monthsToGoal: '',
        completionDate: null
      };
    }

    if (
      balance >=
      goal
    ) {
      return {
        monthsToGoal: 0,

        completionDate:
          PayTrackerUtils.stripTime(
            new Date()
          )
      };
    }

    if (
      contribution <=
      0
    ) {
      return {
        monthsToGoal: '',
        completionDate: null
      };
    }

    const monthlyRate =
      annualRate /
      12;

    let projectedBalance =
      balance;

    let months =
      0;

    const maximumMonths =
      1200;

    while (
      projectedBalance <
        goal &&
      months <
        maximumMonths
    ) {
      projectedBalance =
        projectedBalance *
        (
          1 +
          monthlyRate
        );

      projectedBalance +=
        contribution;

      months++;
    }

    if (
      months >=
      maximumMonths
    ) {
      return {
        monthsToGoal: '',
        completionDate: null
      };
    }

    const completionDate =
      PayTrackerSavingsService.addMonthsPreservingDay_(
        PayTrackerUtils.stripTime(
          new Date()
        ),
        months
      );

    return {
      monthsToGoal:
        months,

      completionDate:
        completionDate
    };
  },


  /**
   * Determines whether the pot is on track.
   *
   * @param {number} currentBalance
   * @param {number} goalAmount
   * @param {*} targetDate
   * @param {*} completionDate
   * @param {number} monthlyContribution
   * @return {string}
   */
  calculateTargetStatus: function (
    currentBalance,
    goalAmount,
    targetDate,
    completionDate,
    monthlyContribution
  ) {
    const balance =
      Math.max(
        Number(
          currentBalance
        ) || 0,
        0
      );

    const goal =
      Math.max(
        Number(
          goalAmount
        ) || 0,
        0
      );

    const contribution =
      Math.max(
        Number(
          monthlyContribution
        ) || 0,
        0
      );

    if (
      goal <=
      0
    ) {
      return 'No Goal Amount';
    }

    if (
      balance >=
      goal
    ) {
      return 'Complete';
    }

    if (
      contribution <=
      0
    ) {
      return 'No Contribution';
    }

    if (
      !(targetDate instanceof Date)
    ) {
      return 'No Target Date';
    }

    if (
      !(completionDate instanceof Date)
    ) {
      return 'Behind Target';
    }

    const targetTime =
      PayTrackerUtils
        .stripTime(
          targetDate
        )
        .getTime();

    const completionTime =
      PayTrackerUtils
        .stripTime(
          completionDate
        )
        .getTime();

    const thirtyDays =
      30 *
      24 *
      60 *
      60 *
      1000;

    if (
      completionTime <
      targetTime -
      thirtyDays
    ) {
      return 'Ahead of Target';
    }

    if (
      completionTime <=
      targetTime +
      thirtyDays
    ) {
      return 'On Track';
    }

    return 'Behind Target';
  },


  /**
   * Validates active Percentage Allocation pots.
   *
   * Fixed Amount pots do not count toward the 100% total.
   *
   * @return {Object}
   */
  validateAllocation: function () {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const potsSheet =
      spreadsheet.getSheetByName(
        PayTrackerSavingsConfig.SHEETS.POTS
      );

    if (
      !potsSheet ||
      potsSheet.getLastRow() <
      PayTrackerSavingsConfig.FIRST_DATA_ROW
    ) {
      return {
        totalAllocation: 0,
        isValid: true
      };
    }

    const config =
      PayTrackerSavingsConfig.POTS;

    const columns =
      config.COLUMNS;

    PayTrackerFinanceService.ensureSheetColumns(
      potsSheet,
      config.HEADERS.length
    );

    const rows =
      potsSheet
        .getRange(
          PayTrackerSavingsConfig.FIRST_DATA_ROW,
          1,
          potsSheet.getLastRow() -
            PayTrackerSavingsConfig.FIRST_DATA_ROW +
            1,
          config.HEADERS.length
        )
        .getValues();

    let totalAllocation =
      0;

    let percentagePotCount =
      0;

    rows.forEach(
      function (row) {
        const potName =
          String(
            row[
              columns.NAME - 1
            ] || ''
          ).trim();

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

        if (
          potName !== '' &&
          active === 'Yes' &&
          method ===
            'Percentage Allocation'
        ) {
          percentagePotCount++;

          totalAllocation +=
            Math.max(
              Number(
                row[
                  columns.ALLOCATION - 1
                ]
              ) || 0,
              0
            );
        }
      }
    );

    totalAllocation =
      Math.round(
        totalAllocation *
        10000
      ) /
      10000;

    const isValid =
      percentagePotCount === 0 ||
      Math.abs(
        totalAllocation -
        1
      ) <
      0.0001;

    const headerCell =
      potsSheet.getRange(
        1,
        columns.ALLOCATION
      );

    if (
      percentagePotCount ===
      0
    ) {
      headerCell
        .setNote(
          'No active Percentage Allocation savings pots are configured.'
        )
        .setBackground(
          '#14532d'
        );
    } else if (isValid) {
      headerCell
        .setNote(
          'Active Percentage Allocation pots total 100%.'
        )
        .setBackground(
          '#14532d'
        );
    } else {
      headerCell
        .setNote(
          'Warning: active Percentage Allocation pots total ' +
          (
            totalAllocation *
            100
          ).toFixed(2) +
          '%. They should total 100%.'
        )
        .setBackground(
          '#b91c1c'
        );
    }

    return {
      totalAllocation:
        totalAllocation,

      isValid:
        isValid
    };
  },


  /**
   * Returns a suitable default deposit date.
   *
   * @return {Date}
   */
  getDefaultNextDepositDate: function () {
    const configuredDay =
      Math.min(
        Math.max(
          Number(
            PayTrackerSavingsService.getSettingValue(
              PayTrackerSavingsConfig.SETTINGS.KEYS.DEFAULT_DEPOSIT_DAY
            )
          ) || 1,
          1
        ),
        28
      );

    const today =
      PayTrackerUtils.stripTime(
        new Date()
      );

    let date =
      new Date(
        today.getFullYear(),
        today.getMonth(),
        configuredDay,
        12,
        0,
        0,
        0
      );

    if (
      date.getTime() <
      today.getTime()
    ) {
      date =
        new Date(
          today.getFullYear(),
          today.getMonth() + 1,
          configuredDay,
          12,
          0,
          0,
          0
        );
    }

    return PayTrackerUtils.stripTime(
      date
    );
  },


  /**
   * Reads one Savings Settings value.
   *
   * @param {string} settingName
   * @return {*}
   */
  getSettingValue: function (
    settingName
  ) {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const settingsSheet =
      spreadsheet.getSheetByName(
        PayTrackerSavingsConfig.SHEETS.SETTINGS
      );

    if (!settingsSheet) {
      return null;
    }

    const row =
      PayTrackerSavingsService.findSettingRow(
        settingsSheet,
        settingName
      );

    if (!row) {
      return null;
    }

    return settingsSheet
      .getRange(
        row,
        2
      )
      .getValue();
  },


  /**
   * Updates one Savings Settings value.
   *
   * @param {string} settingName
   * @param {*} value
   */
  setSettingValue: function (
    settingName,
    value
  ) {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const settingsSheet =
      spreadsheet.getSheetByName(
        PayTrackerSavingsConfig.SHEETS.SETTINGS
      );

    if (!settingsSheet) {
      return;
    }

    const row =
      PayTrackerSavingsService.findSettingRow(
        settingsSheet,
        settingName
      );

    if (!row) {
      return;
    }

    settingsSheet
      .getRange(
        row,
        2
      )
      .setValue(
        value
      );
  },


  /**
   * Finds one setting by name.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {string} settingName
   * @return {number|null}
   */
  findSettingRow: function (
    sheet,
    settingName
  ) {
    if (
      !sheet ||
      sheet.getLastRow() <
      PayTrackerSavingsConfig.FIRST_DATA_ROW
    ) {
      return null;
    }

    const values =
      sheet
        .getRange(
          PayTrackerSavingsConfig.FIRST_DATA_ROW,
          1,
          sheet.getLastRow() -
            PayTrackerSavingsConfig.FIRST_DATA_ROW +
            1,
          1
        )
        .getDisplayValues();

    const target =
      String(
        settingName || ''
      ).trim();

    for (
      let index = 0;
      index < values.length;
      index++
    ) {
      if (
        String(
          values[index][0] || ''
        ).trim() ===
        target
      ) {
        return (
          index +
          PayTrackerSavingsConfig.FIRST_DATA_ROW
        );
      }
    }

    return null;
  },


  /**
   * Finds one savings pot by Pot ID.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {string} potId
   * @return {number|null}
   */
  findPotRowById: function (
    sheet,
    potId
  ) {
    if (
      !sheet ||
      sheet.getLastRow() <
      PayTrackerSavingsConfig.FIRST_DATA_ROW
    ) {
      return null;
    }

    const targetId =
      String(
        potId || ''
      ).trim();

    if (targetId === '') {
      return null;
    }

    const idColumn =
      PayTrackerSavingsConfig.POTS.COLUMNS.ID;

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
        ).trim() ===
        targetId
      ) {
        return (
          index +
          PayTrackerSavingsConfig.FIRST_DATA_ROW
        );
      }
    }

    return null;
  },


  /**
   * Links a Savings Pot to a Monzo Pot.
   *
   * The linked Monzo Pot's balance overwrites this pot's
   * Current Balance on every future Monzo sync.
   *
   * @param {string} potId
   * @param {string} monzoPotId
   * @param {string} monzoPotName
   */
  linkPotToMonzo: function (
    potId,
    monzoPotId,
    monzoPotName
  ) {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const sheet =
      spreadsheet.getSheetByName(
        PayTrackerSavingsConfig.SHEETS.POTS
      );

    if (!sheet) {
      throw new Error(
        'Savings Pots sheet was not found.'
      );
    }

    const row =
      PayTrackerSavingsService.findPotRowById(
        sheet,
        potId
      );

    if (!row) {
      throw new Error(
        'Savings pot was not found: ' +
        potId
      );
    }

    const columns =
      PayTrackerSavingsConfig.POTS.COLUMNS;

    PayTrackerFinanceService.ensureSheetColumns(
      sheet,
      PayTrackerSavingsConfig.POTS.HEADERS.length
    );

    sheet
      .getRange(
        row,
        columns.MONZO_POT_ID
      )
      .setValue(
        String(monzoPotId || '').trim()
      );

    sheet
      .getRange(
        row,
        columns.MONZO_POT_NAME
      )
      .setValue(
        String(monzoPotName || '').trim()
      );

    PayTrackerSavingsService.updatePotRow(
      sheet,
      row
    );
  },


  /**
   * Removes a Savings Pot's link to a Monzo Pot.
   *
   * @param {string} potId
   */
  unlinkPotFromMonzo: function (
    potId
  ) {
    PayTrackerSavingsService.linkPotToMonzo(
      potId,
      '',
      ''
    );
  },


  /**
   * Finds a Savings Pot row by its linked Monzo Pot ID.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {string} monzoPotId
   * @return {number|null}
   */
  findPotRowByMonzoPotId: function (
    sheet,
    monzoPotId
  ) {
    if (
      !sheet ||
      sheet.getLastRow() <
      PayTrackerSavingsConfig.FIRST_DATA_ROW
    ) {
      return null;
    }

    const targetId =
      String(
        monzoPotId || ''
      ).trim();

    if (targetId === '') {
      return null;
    }

    const column =
      PayTrackerSavingsConfig
        .POTS
        .COLUMNS
        .MONZO_POT_ID;

    const values =
      sheet
        .getRange(
          PayTrackerSavingsConfig.FIRST_DATA_ROW,
          column,
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
        ).trim() ===
        targetId
      ) {
        return (
          index +
          PayTrackerSavingsConfig.FIRST_DATA_ROW
        );
      }
    }

    return null;
  },


  /**
   * Applies live Monzo Pot balances to every linked Savings
   * Pot.
   *
   * Pots without a matching link are left untouched. This
   * never creates or deletes Savings Pots - linking must be
   * done explicitly first.
   *
   * @param {Array<{id: string, name: string, balance: number}>} monzoPots
   * @return {number} Number of Savings Pots updated.
   */
  applyMonzoPotBalances: function (
    monzoPots
  ) {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const sheet =
      spreadsheet.getSheetByName(
        PayTrackerSavingsConfig.SHEETS.POTS
      );

    if (
      !sheet ||
      sheet.getLastRow() <
      PayTrackerSavingsConfig.FIRST_DATA_ROW ||
      !Array.isArray(monzoPots) ||
      monzoPots.length === 0
    ) {
      return 0;
    }

    PayTrackerFinanceService.ensureSheetColumns(
      sheet,
      PayTrackerSavingsConfig.POTS.HEADERS.length
    );

    const columns =
      PayTrackerSavingsConfig.POTS.COLUMNS;

    let updatedCount =
      0;

    monzoPots.forEach(function (monzoPot) {
      const monzoPotId =
        String(
          monzoPot.id || ''
        ).trim();

      if (monzoPotId === '') {
        return;
      }

      const row =
        PayTrackerSavingsService.findPotRowByMonzoPotId(
          sheet,
          monzoPotId
        );

      if (!row) {
        return;
      }

      sheet
        .getRange(
          row,
          columns.CURRENT_BALANCE
        )
        .setValue(
          PayTrackerUtils.roundCurrency(
            Number(monzoPot.balance) || 0
          )
        )
        .setNumberFormat(
          PayTrackerSavingsConfig.FORMATS.CURRENCY
        );

      if (monzoPot.name) {
        sheet
          .getRange(
            row,
            columns.MONZO_POT_NAME
          )
          .setValue(
            String(monzoPot.name).trim()
          );
      }

      PayTrackerSavingsService.updatePotRow(
        sheet,
        row
      );

      updatedCount++;
    });

    return updatedCount;
  },


  /**
   * Updates Last Recalculated in Savings Settings.
   */
  updateLastRecalculatedSetting: function () {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const settingsSheet =
      spreadsheet.getSheetByName(
        PayTrackerSavingsConfig.SHEETS.SETTINGS
      );

    if (!settingsSheet) {
      return;
    }

    const row =
      PayTrackerSavingsService.findSettingRow(
        settingsSheet,
        PayTrackerSavingsConfig.SETTINGS.KEYS.LAST_RECALCULATED
      );

    if (!row) {
      return;
    }

    settingsSheet
      .getRange(
        row,
        2
      )
      .setValue(
        new Date()
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.DATE_TIME
      );
  },


  /**
   * Adds months while preserving the intended day where
   * possible.
   *
   * @param {Date} date
   * @param {number} monthsToAdd
   * @return {Date}
   * @private
   */
  addMonthsPreservingDay_: function (
    date,
    monthsToAdd
  ) {
    PayTrackerUtils.validateDate(
      date,
      'date'
    );

    const originalDay =
      date.getDate();

    const result =
      PayTrackerUtils.stripTime(
        date
      );

    result.setDate(
      1
    );

    result.setMonth(
      result.getMonth() +
      monthsToAdd
    );

    const finalDay =
      new Date(
        result.getFullYear(),
        result.getMonth() + 1,
        0
      ).getDate();

    result.setDate(
      Math.min(
        originalDay,
        finalDay
      )
    );

    return PayTrackerUtils.stripTime(
      result
    );
  }
});