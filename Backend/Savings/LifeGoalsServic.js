/*******************************************************
 * PAY TRACKER V2.6
 * LifeGoalsService.gs
 *
 * Handles:
 * - Life Goals sheet setup
 * - Savings pots linked to goals
 * - Current linked savings
 * - Combined monthly contributions
 * - Estimated months remaining
 * - Estimated completion dates
 * - Target status
 * - Goal progress bars
 *******************************************************/

const PayTrackerLifeGoalsService = Object.freeze({
  /**
   * Builds or upgrades the Life Goals sheet.
   *
   * Existing v2.5 goal data remains in columns 1–13.
   * New v2.6 forecast columns are appended.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  buildGoalsSheet: function (
    sheet
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const config =
      PayTrackerSavingsConfig.GOALS;

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
      .setBackground('#7c2d12')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');

    sheet.setFrozenRows(1);
    sheet.setTabColor('#ea580c');

    const rowCount =
      Math.max(
        sheet.getMaxRows() - 1,
        1
      );

    const columns =
      config.COLUMNS;

    const categoryValidation =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          PayTrackerSavingsConfig.GOAL_CATEGORIES,
          true
        )
        .setAllowInvalid(false)
        .build();

    const priorityValidation =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          PayTrackerSavingsConfig.PRIORITIES,
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

    sheet
      .getRange(
        2,
        columns.CATEGORY,
        rowCount,
        1
      )
      .setDataValidation(
        categoryValidation
      );

    sheet
      .getRange(
        2,
        columns.PRIORITY,
        rowCount,
        1
      )
      .setDataValidation(
        priorityValidation
      );

    sheet
      .getRange(
        2,
        columns.ACTIVE,
        rowCount,
        1
      )
      .setDataValidation(
        activeValidation
      );

    [
      columns.TARGET_AMOUNT,
      columns.CURRENT_SAVINGS,
      columns.AMOUNT_REMAINING
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
            PayTrackerSavingsConfig.FORMATS.CURRENCY
          );
      }
    );

    sheet
      .getRange(
        2,
        columns.PROGRESS,
        rowCount,
        1
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.PERCENTAGE
      );

    [
      columns.TARGET_DATE,
      columns.COMPLETION_DATE
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
            PayTrackerSavingsConfig.FORMATS.DATE
          );
      }
    );

    sheet
      .getRange(
        2,
        columns.MONTHS_REMAINING,
        rowCount,
        1
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.INTEGER
      );

    const widths = [
      135,
      210,
      145,
      125,
      145,
      120,
      100,
      85,
      135,
      105,
      150,
      190,
      280,
      155,
      135
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
   * Handles edits made in the Life Goals sheet.
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
      PayTrackerSavingsConfig.SHEETS.GOALS
    ) {
      return;
    }

    const firstRow =
      Math.max(
        event.range.getRow(),
        PayTrackerSavingsConfig.FIRST_DATA_ROW
      );

    const lastRow =
      event.range.getLastRow();

    for (
      let row = firstRow;
      row <= lastRow;
      row++
    ) {
      PayTrackerLifeGoalsService.updateGoalRow(
        sheet,
        row
      );
    }

    PayTrackerFinanceDashboard.refresh();
  },


  /**
   * Recalculates every Life Goal row.
   */
  recalculateAllGoals: function () {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const goalsSheet =
      spreadsheet.getSheetByName(
        PayTrackerSavingsConfig.SHEETS.GOALS
      );

    if (!goalsSheet) {
      return;
    }

    for (
      let row = 2;
      row <= goalsSheet.getLastRow();
      row++
    ) {
      PayTrackerLifeGoalsService.updateGoalRow(
        goalsSheet,
        row
      );
    }

    SpreadsheetApp.flush();
  },


  /**
   * Recalculates one Life Goal row.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} row
   */
  updateGoalRow: function (
    sheet,
    row
  ) {
    if (
      row <
      PayTrackerSavingsConfig.FIRST_DATA_ROW
    ) {
      return;
    }

    const config =
      PayTrackerSavingsConfig.GOALS;

    const columns =
      config.COLUMNS;

    const values =
      sheet
        .getRange(
          row,
          1,
          1,
          config.HEADERS.length
        )
        .getValues()[0];

    const goalName =
      String(
        values[
          columns.NAME - 1
        ] || ''
      ).trim();

    if (goalName === '') {
      return;
    }

    let goalId =
      String(
        values[
          columns.ID - 1
        ] || ''
      ).trim();

    if (goalId === '') {
      goalId =
        PayTrackerFinanceService.createFinanceId(
          'GOAL'
        );

      sheet
        .getRange(
          row,
          columns.ID
        )
        .setValue(
          goalId
        );
    }

    const targetAmount =
      Math.max(
        Number(
          values[
            columns.TARGET_AMOUNT - 1
          ]
        ) || 0,
        0
      );

    const targetDate =
      values[
        columns.TARGET_DATE - 1
      ];

    const linkedSavings =
      PayTrackerLifeGoalsService.calculateLinkedSavings(
        goalId
      );

    const linkedMonthlyContribution =
      PayTrackerLifeGoalsService.calculateLinkedMonthlyContribution(
        goalId
      );

    const linkedWeightedInterestRate =
      PayTrackerLifeGoalsService.calculateLinkedWeightedInterestRate(
        goalId
      );

    const amountRemaining =
      PayTrackerUtils.roundCurrency(
        Math.max(
          targetAmount -
          linkedSavings,
          0
        )
      );

    const progress =
      targetAmount > 0
        ? Math.min(
            linkedSavings /
            targetAmount,
            1
          )
        : 0;

    const estimate =
      PayTrackerSavingsService.calculateGoalEstimate(
        linkedSavings,
        targetAmount,
        linkedMonthlyContribution,
        linkedWeightedInterestRate
      );

    const targetStatus =
      PayTrackerSavingsService.calculateTargetStatus(
        linkedSavings,
        targetAmount,
        targetDate,
        estimate.completionDate,
        linkedMonthlyContribution
      );

    sheet
      .getRange(
        row,
        columns.CURRENT_SAVINGS
      )
      .setValue(
        linkedSavings
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
        columns.MONTHS_REMAINING
      )
      .setValue(
        estimate.monthsToGoal
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.INTEGER
      );

    sheet
      .getRange(
        row,
        columns.TARGET_STATUS
      )
      .setValue(
        targetStatus
      );

    if (
      estimate.completionDate
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
        '"color1","#f97316"}))'
      );
  },


  /**
   * Returns the total current balance of all pots linked
   * to one Life Goal.
   *
   * @param {string} goalId
   * @return {number}
   */
  calculateLinkedSavings: function (
    goalId
  ) {
    const potRows =
      PayTrackerLifeGoalsService.getLinkedPotRows(
        goalId
      );

    const columns =
      PayTrackerSavingsConfig.POTS.COLUMNS;

    const total =
      potRows.reduce(
        function (
          runningTotal,
          row
        ) {
          return (
            runningTotal +
            (
              Number(
                row[
                  columns.CURRENT_BALANCE - 1
                ]
              ) || 0
            )
          );
        },
        0
      );

    return PayTrackerUtils.roundCurrency(
      total
    );
  },


  /**
   * Returns the combined monthly equivalent of all active
   * savings pots linked to one Life Goal.
   *
   * @param {string} goalId
   * @return {number}
   */
  calculateLinkedMonthlyContribution: function (
    goalId
  ) {
    const potRows =
      PayTrackerLifeGoalsService.getLinkedPotRows(
        goalId
      );

    const columns =
      PayTrackerSavingsConfig.POTS.COLUMNS;

    const total =
      potRows.reduce(
        function (
          runningTotal,
          row
        ) {
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
            return runningTotal;
          }

          return (
            runningTotal +
            (
              Number(
                row[
                  columns.MONTHLY_EQUIVALENT - 1
                ]
              ) || 0
            )
          );
        },
        0
      );

    return PayTrackerUtils.roundCurrency(
      total
    );
  },


  /**
   * Calculates a weighted average AER for all linked pots.
   *
   * Pot balances are used as the weighting. When all linked
   * pot balances are zero, a simple average is used.
   *
   * @param {string} goalId
   * @return {number}
   */
  calculateLinkedWeightedInterestRate: function (
    goalId
  ) {
    const potRows =
      PayTrackerLifeGoalsService.getLinkedPotRows(
        goalId
      );

    if (
      potRows.length ===
      0
    ) {
      return 0;
    }

    const columns =
      PayTrackerSavingsConfig.POTS.COLUMNS;

    let totalBalance =
      0;

    let weightedRateTotal =
      0;

    let simpleRateTotal =
      0;

    let rateCount =
      0;

    potRows.forEach(
      function (row) {
        const balance =
          Math.max(
            Number(
              row[
                columns.CURRENT_BALANCE - 1
              ]
            ) || 0,
            0
          );

        const interestRate =
          Math.max(
            Number(
              row[
                columns.INTEREST_RATE - 1
              ]
            ) || 0,
            0
          );

        totalBalance +=
          balance;

        weightedRateTotal +=
          balance *
          interestRate;

        simpleRateTotal +=
          interestRate;

        rateCount++;
      }
    );

    if (
      totalBalance >
      0
    ) {
      return (
        weightedRateTotal /
        totalBalance
      );
    }

    return rateCount > 0
      ? simpleRateTotal /
        rateCount
      : 0;
  },


  /**
   * Returns all savings-pot rows linked to one goal.
   *
   * @param {string} goalId
   * @return {Array<Array<*>>}
   */
  getLinkedPotRows: function (
    goalId
  ) {
    const targetGoalId =
      String(
        goalId || ''
      ).trim();

    if (
      targetGoalId ===
      ''
    ) {
      return [];
    }

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
      return [];
    }

    const config =
      PayTrackerSavingsConfig.POTS;

    const columns =
      config.COLUMNS;

    PayTrackerFinanceService.ensureSheetColumns(
      potsSheet,
      config.HEADERS.length
    );

    return potsSheet
      .getRange(
        2,
        1,
        potsSheet.getLastRow() - 1,
        config.HEADERS.length
      )
      .getValues()
      .filter(
        function (row) {
          const linkedGoalId =
            String(
              row[
                columns.LINKED_GOAL_ID - 1
              ] || ''
            ).trim();

          return (
            linkedGoalId ===
            targetGoalId
          );
        }
      );
  },


  /**
   * Returns structured Life Goal rows for dashboards.
   *
   * @return {Object[]}
   */
  getGoalRows: function () {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const goalsSheet =
      spreadsheet.getSheetByName(
        PayTrackerSavingsConfig.SHEETS.GOALS
      );

    if (
      !goalsSheet ||
      goalsSheet.getLastRow() <
        PayTrackerSavingsConfig.FIRST_DATA_ROW
    ) {
      return [];
    }

    const config =
      PayTrackerSavingsConfig.GOALS;

    const columns =
      config.COLUMNS;

    return goalsSheet
      .getRange(
        2,
        1,
        goalsSheet.getLastRow() - 1,
        config.HEADERS.length
      )
      .getValues()
      .filter(
        function (row) {
          return (
            String(
              row[
                columns.NAME - 1
              ] || ''
            ).trim() !==
            ''
          );
        }
      )
      .map(
        function (row) {
          return {
            id:
              String(
                row[
                  columns.ID - 1
                ] || ''
              ).trim(),

            name:
              String(
                row[
                  columns.NAME - 1
                ] || ''
              ).trim(),

            category:
              String(
                row[
                  columns.CATEGORY - 1
                ] || ''
              ).trim(),

            targetAmount:
              Number(
                row[
                  columns.TARGET_AMOUNT - 1
                ]
              ) || 0,

            currentSavings:
              Number(
                row[
                  columns.CURRENT_SAVINGS - 1
                ]
              ) || 0,

            remaining:
              Number(
                row[
                  columns.AMOUNT_REMAINING - 1
                ]
              ) || 0,

            progress:
              Number(
                row[
                  columns.PROGRESS - 1
                ]
              ) || 0,

            monthsRemaining:
              row[
                columns.MONTHS_REMAINING - 1
              ],

            completionDate:
              row[
                columns.COMPLETION_DATE - 1
              ],

            targetStatus:
              String(
                row[
                  columns.TARGET_STATUS - 1
                ] || ''
              ).trim(),

            priority:
              String(
                row[
                  columns.PRIORITY - 1
                ] || ''
              ).trim(),

            active:
              String(
                row[
                  columns.ACTIVE - 1
                ] || ''
              ).trim()
          };
        }
      );
  }
});