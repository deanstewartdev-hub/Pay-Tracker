/*******************************************************
 * PAY TRACKER V2.6
 * SavingsContributionService.gs
 *
 * Handles:
 * - Savings contribution queue
 * - Weekly, fortnightly, monthly, quarterly,
 *   annual and one-off schedules
 * - Deposit checkboxes
 * - Savings-pot balance updates
 * - Savings history
 * - Automatic next contribution generation
 * - Undo Last Savings Deposit
 *******************************************************/

const PayTrackerSavingsContributionService = Object.freeze({
  /**
   * Builds or upgrades the Savings Contributions sheet.
   *
   * Existing contribution rows are preserved.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  buildContributionsSheet: function (
    sheet
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const config =
      PayTrackerSavingsConfig.CONTRIBUTIONS;

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
      .setBackground('#0f766e')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');

    sheet.setFrozenRows(1);
    sheet.setTabColor('#14b8a6');

    const rowCount =
      Math.max(
        sheet.getMaxRows() - 1,
        1
      );

    sheet
      .getRange(
        2,
        config.COLUMNS.DEPOSITED,
        rowCount,
        1
      )
      .insertCheckboxes();

    sheet
      .getRange(
        2,
        config.COLUMNS.DUE_DATE,
        rowCount,
        1
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.DATE
      );

    sheet
      .getRange(
        2,
        config.COLUMNS.AMOUNT,
        rowCount,
        1
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.CURRENCY
      );

    const methodValidation =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          PayTrackerSavingsConfig.CONTRIBUTION_METHODS,
          true
        )
        .setAllowInvalid(false)
        .build();

    const frequencyValidation =
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
        2,
        config.COLUMNS.METHOD,
        rowCount,
        1
      )
      .setDataValidation(
        methodValidation
      );

    sheet
      .getRange(
        2,
        config.COLUMNS.FREQUENCY,
        rowCount,
        1
      )
      .setDataValidation(
        frequencyValidation
      );

    const widths = [
      155,
      120,
      145,
      210,
      135,
      90,
      115,
      280,
      165,
      155
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
   * Builds or upgrades the Savings History sheet.
   *
   * Existing history remains in its original columns.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  buildHistorySheet: function (
    sheet
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    const config =
      PayTrackerSavingsConfig.HISTORY;

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
      .setBackground('#4c1d95')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');

    sheet.setFrozenRows(1);
    sheet.setTabColor('#7c3aed');

    const rowCount =
      Math.max(
        sheet.getMaxRows() - 1,
        1
      );

    sheet
      .getRange(
        2,
        config.COLUMNS.ORIGINAL_DUE_DATE,
        rowCount,
        2
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.DATE
      );

    [
      config.COLUMNS.AMOUNT,
      config.COLUMNS.PREVIOUS_BALANCE,
      config.COLUMNS.BALANCE_AFTER
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
        config.COLUMNS.PROCESSED_AT,
        rowCount,
        1
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.DATE_TIME
      );

    const methodValidation =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          PayTrackerSavingsConfig.CONTRIBUTION_METHODS,
          true
        )
        .setAllowInvalid(true)
        .build();

    const frequencyValidation =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          PayTrackerSavingsConfig.CONTRIBUTION_FREQUENCIES,
          true
        )
        .setAllowInvalid(true)
        .build();

    sheet
      .getRange(
        2,
        config.COLUMNS.METHOD,
        rowCount,
        1
      )
      .setDataValidation(
        methodValidation
      );

    sheet
      .getRange(
        2,
        config.COLUMNS.FREQUENCY,
        rowCount,
        1
      )
      .setDataValidation(
        frequencyValidation
      );

    const widths = [
      155,
      120,
      120,
      145,
      210,
      135,
      135,
      150,
      155,
      110,
      280,
      165,
      155
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
   * Generates missing upcoming contributions for all
   * active savings pots.
   *
   * A pot receives only one queue row for each due date.
   */
  syncUpcomingContributions: function () {
  /*
   * Apply all pending spreadsheet changes before retrieving
   * sheet objects. This prevents stale references after setup,
   * sheet deletion, sheet creation or sheet renaming.
   */
  SpreadsheetApp.flush();

  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error(
      'No active spreadsheet is available.'
    );
  }

  const potsSheetName =
    String(
      PayTrackerSavingsConfig.SHEETS.POTS || ''
    ).trim();

  const contributionsSheetName =
    String(
      PayTrackerSavingsConfig.SHEETS.CONTRIBUTIONS || ''
    ).trim();

  if (potsSheetName === '') {
    throw new Error(
      'Savings Pots sheet name is missing from SavingsConfig.gs.'
    );
  }

  if (contributionsSheetName === '') {
    throw new Error(
      'Savings Contributions sheet name is missing from SavingsConfig.gs.'
    );
  }

  /*
   * Retrieve new sheet objects every time this function runs.
   * Never reuse sheet objects passed through the setup process.
   */
  const potsSheet =
    spreadsheet.getSheetByName(
      potsSheetName
    );

  const contributionsSheet =
    spreadsheet.getSheetByName(
      contributionsSheetName
    );

  if (!potsSheet) {
    throw new Error(
      'Required sheet not found: ' +
      potsSheetName
    );
  }

  if (!contributionsSheet) {
    throw new Error(
      'Required sheet not found: ' +
      contributionsSheetName
    );
  }

  /*
   * Access both IDs now so a deleted or invalid sheet is caught
   * here with a meaningful error rather than later in the loop.
   */
  const potsSheetId =
    potsSheet.getSheetId();

  const contributionsSheetId =
    contributionsSheet.getSheetId();

  if (
    typeof potsSheetId !== 'number' ||
    typeof contributionsSheetId !== 'number'
  ) {
    throw new Error(
      'Savings sheet references could not be validated.'
    );
  }

  if (
    potsSheet.getLastRow() <
    PayTrackerSavingsConfig.FIRST_DATA_ROW
  ) {
    return {
      created: 0,
      updated: 0,
      skipped: 0
    };
  }

  const config =
    PayTrackerSavingsConfig.POTS;

  const columns =
    config.COLUMNS;

  const numberOfRows =
    potsSheet.getLastRow() -
    PayTrackerSavingsConfig.FIRST_DATA_ROW +
    1;

  const rows =
    potsSheet
      .getRange(
        PayTrackerSavingsConfig.FIRST_DATA_ROW,
        1,
        numberOfRows,
        config.HEADERS.length
      )
      .getValues();

  let created =
    0;

  let updated =
    0;

  let skipped =
    0;

  rows.forEach(
    function (row) {
      const potId =
        String(
          row[
            columns.ID - 1
          ] || ''
        ).trim();

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

      const dueDate =
        row[
          columns.NEXT_DEPOSIT_DATE - 1
        ];

      const contributionAmount =
        Math.max(
          Number(
            row[
              columns.CONTRIBUTION_AMOUNT - 1
            ]
          ) || 0,
          0
        );

      const contributionMethod =
        String(
          row[
            columns.CONTRIBUTION_METHOD - 1
          ] || ''
        ).trim();

      const contributionFrequency =
        String(
          row[
            columns.CONTRIBUTION_FREQUENCY - 1
          ] || ''
        ).trim();

      if (
        active !== 'Yes' ||
        potId === '' ||
        potName === '' ||
        !(dueDate instanceof Date) ||
        contributionAmount <= 0 ||
        contributionMethod === '' ||
        contributionFrequency === ''
      ) {
        skipped++;
        return;
      }

      const existingContribution =
        PayTrackerSavingsContributionService.findContribution(
          contributionsSheet,
          potId,
          PayTrackerUtils.stripTime(
            dueDate
          )
        );

      PayTrackerSavingsContributionService.ensureContribution(
        contributionsSheet,
        {
          dueDate:
            PayTrackerUtils.stripTime(
              dueDate
            ),

          potId:
            potId,

          potName:
            potName,

          amount:
            contributionAmount,

          method:
            contributionMethod,

          frequency:
            contributionFrequency
        }
      );

      if (existingContribution) {
        updated++;
      } else {
        created++;
      }
    }
  );

  SpreadsheetApp.flush();

  /*
   * Retrieve the queue sheet again before sorting. This prevents
   * the sort operation from using an invalid sheet reference.
   */
  const refreshedContributionsSheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        contributionsSheetName
      );

  if (!refreshedContributionsSheet) {
    throw new Error(
      'Savings Contributions disappeared before sorting.'
    );
  }

  PayTrackerSavingsContributionService.sortContributions(
    refreshedContributionsSheet
  );

  SpreadsheetApp.flush();

  return {
    created:
      created,

    updated:
      updated,

    skipped:
      skipped
  };
},


  /**
   * Adds or updates one upcoming contribution.
   *
   * Existing checked or processing rows are not overwritten.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object} contribution
   * @return {string}
   */
  ensureContribution: function (
    sheet,
    contribution
  ) {
    const existing =
      PayTrackerSavingsContributionService.findContribution(
        sheet,
        contribution.potId,
        contribution.dueDate
      );

    if (existing) {
      const config =
        PayTrackerSavingsConfig.CONTRIBUTIONS;

      const isChecked =
        sheet
          .getRange(
            existing.row,
            config.COLUMNS.DEPOSITED
          )
          .getValue() === true;

      const status =
        String(
          sheet
            .getRange(
              existing.row,
              config.COLUMNS.STATUS
            )
            .getValue() || ''
        ).trim();

      if (
        !isChecked &&
        status !==
          PayTrackerSavingsConfig
            .CONTRIBUTION_STATUSES
            .PROCESSING
      ) {
        sheet
          .getRange(
            existing.row,
            config.COLUMNS.AMOUNT
          )
          .setValue(
            PayTrackerUtils.roundCurrency(
              contribution.amount
            )
          )
          .setNumberFormat(
            PayTrackerSavingsConfig.FORMATS.CURRENCY
          );

        sheet
          .getRange(
            existing.row,
            config.COLUMNS.POT_NAME
          )
          .setValue(
            contribution.potName
          );

        sheet
          .getRange(
            existing.row,
            config.COLUMNS.METHOD
          )
          .setValue(
            contribution.method
          );

        sheet
          .getRange(
            existing.row,
            config.COLUMNS.FREQUENCY
          )
          .setValue(
            contribution.frequency
          );

        sheet
          .getRange(
            existing.row,
            config.COLUMNS.STATUS
          )
          .setValue(
            PayTrackerSavingsConfig
              .CONTRIBUTION_STATUSES
              .UPCOMING
          );
      }

      return existing.contributionId;
    }

    const targetRow =
      Math.max(
        sheet.getLastRow() + 1,
        PayTrackerSavingsConfig.FIRST_DATA_ROW
      );

    const contributionId =
      PayTrackerFinanceService.createFinanceId(
        'SAVE'
      );

    sheet
      .getRange(
        targetRow,
        1,
        1,
        PayTrackerSavingsConfig.CONTRIBUTIONS.HEADERS.length
      )
      .setValues([[
        contributionId,
        contribution.dueDate,
        contribution.potId,
        contribution.potName,
        PayTrackerUtils.roundCurrency(
          contribution.amount
        ),
        false,
        PayTrackerSavingsConfig
          .CONTRIBUTION_STATUSES
          .UPCOMING,
        '',
        contribution.method,
        contribution.frequency
      ]]);

    sheet
      .getRange(
        targetRow,
        PayTrackerSavingsConfig.CONTRIBUTIONS.COLUMNS.DEPOSITED
      )
      .insertCheckboxes()
      .setValue(false);

    sheet
      .getRange(
        targetRow,
        PayTrackerSavingsConfig.CONTRIBUTIONS.COLUMNS.DUE_DATE
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.DATE
      );

    sheet
      .getRange(
        targetRow,
        PayTrackerSavingsConfig.CONTRIBUTIONS.COLUMNS.AMOUNT
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.CURRENCY
      );

    return contributionId;
  },


  /**
   * Finds one contribution by pot ID and due date.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {string} potId
   * @param {Date} dueDate
   * @return {Object|null}
   */
  findContribution: function (
    sheet,
    potId,
    dueDate
  ) {
    if (
      !sheet ||
      sheet.getLastRow() <
        PayTrackerSavingsConfig.FIRST_DATA_ROW
    ) {
      return null;
    }

    const config =
      PayTrackerSavingsConfig.CONTRIBUTIONS;

    const rows =
      sheet
        .getRange(
          2,
          1,
          sheet.getLastRow() - 1,
          config.HEADERS.length
        )
        .getValues();

    const targetTime =
      PayTrackerUtils
        .stripTime(
          dueDate
        )
        .getTime();

    for (
      let index = 0;
      index < rows.length;
      index++
    ) {
      const row =
        rows[index];

      const existingPotId =
        String(
          row[
            config.COLUMNS.POT_ID - 1
          ] || ''
        ).trim();

      const existingDate =
        row[
          config.COLUMNS.DUE_DATE - 1
        ];

      if (
        existingPotId !== potId ||
        !(existingDate instanceof Date)
      ) {
        continue;
      }

      const existingTime =
        PayTrackerUtils
          .stripTime(
            existingDate
          )
          .getTime();

      if (
        existingTime ===
        targetTime
      ) {
        return {
          row:
            index + 2,

          contributionId:
            String(
              row[
                config.COLUMNS.ID - 1
              ] || ''
            ).trim()
        };
      }
    }

    return null;
  },


  /**
   * Handles Deposited? checkbox edits.
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
      PayTrackerSavingsConfig.SHEETS.CONTRIBUTIONS
    ) {
      return;
    }

    const depositedColumn =
      PayTrackerSavingsConfig
        .CONTRIBUTIONS
        .COLUMNS
        .DEPOSITED;

    if (
      event.range.getColumn() >
        depositedColumn ||
      event.range.getLastColumn() <
        depositedColumn
    ) {
      return;
    }

    const rowsToProcess =
      [];

    for (
      let row = event.range.getRow();
      row <= event.range.getLastRow();
      row++
    ) {
      if (
        row <
        PayTrackerSavingsConfig.FIRST_DATA_ROW
      ) {
        continue;
      }

      const isChecked =
        sheet
          .getRange(
            row,
            depositedColumn
          )
          .getValue() === true;

      if (isChecked) {
        rowsToProcess.push(
          row
        );
      }
    }

    rowsToProcess
      .sort(
        function (
          firstRow,
          secondRow
        ) {
          return secondRow - firstRow;
        }
      )
      .forEach(
        function (row) {
          PayTrackerSavingsContributionService.processContributionRow(
            sheet,
            row
          );
        }
      );

    PayTrackerSavingsContributionService.syncUpcomingContributions();

    PayTrackerLifeGoalsService.recalculateAllGoals();

    PayTrackerFinanceDashboard.refresh();
  },


  /**
   * Processes one checked contribution queue row.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} row
   */
  processContributionRow: function (
    sheet,
    row
  ) {
    const config =
      PayTrackerSavingsConfig.CONTRIBUTIONS;

    const values =
      sheet
        .getRange(
          row,
          1,
          1,
          config.HEADERS.length
        )
        .getValues()[0];

    const contribution = {
      contributionId:
        String(
          values[
            config.COLUMNS.ID - 1
          ] || ''
        ).trim(),

      dueDate:
        values[
          config.COLUMNS.DUE_DATE - 1
        ],

      potId:
        String(
          values[
            config.COLUMNS.POT_ID - 1
          ] || ''
        ).trim(),

      potName:
        String(
          values[
            config.COLUMNS.POT_NAME - 1
          ] || ''
        ).trim(),

      amount:
        Math.max(
          Number(
            values[
              config.COLUMNS.AMOUNT - 1
            ]
          ) || 0,
          0
        ),

      notes:
        String(
          values[
            config.COLUMNS.NOTES - 1
          ] || ''
        ).trim(),

      method:
        String(
          values[
            config.COLUMNS.METHOD - 1
          ] || ''
        ).trim(),

      frequency:
        String(
          values[
            config.COLUMNS.FREQUENCY - 1
          ] || ''
        ).trim()
    };

    sheet
      .getRange(
        row,
        config.COLUMNS.STATUS
      )
      .setValue(
        PayTrackerSavingsConfig
          .CONTRIBUTION_STATUSES
          .PROCESSING
      );

    try {
      const historyRecord =
        PayTrackerSavingsContributionService.processContribution(
          contribution
        );

      PayTrackerSavingsContributionService.appendHistory(
        historyRecord
      );

      sheet.deleteRow(
        row
      );
    } catch (error) {
      sheet
        .getRange(
          row,
          config.COLUMNS.STATUS
        )
        .setValue(
          PayTrackerSavingsConfig
            .CONTRIBUTION_STATUSES
            .ERROR
        );

      sheet
        .getRange(
          row,
          config.COLUMNS.NOTES
        )
        .setValue(
          error.message
        );

      sheet
        .getRange(
          row,
          config.COLUMNS.DEPOSITED
        )
        .setValue(false);

      throw error;
    }
  },


  /**
   * Applies one contribution to its savings pot.
   *
   * @param {Object} contribution
   * @return {Object}
   */
  processContribution: function (
    contribution
  ) {
    if (
      !(contribution.dueDate instanceof Date)
    ) {
      throw new Error(
        'The contribution due date is invalid.'
      );
    }

    if (
      contribution.amount <=
      0
    ) {
      throw new Error(
        'The contribution amount must be greater than zero.'
      );
    }

    if (
      contribution.potId ===
      ''
    ) {
      throw new Error(
        'The contribution does not contain a Pot ID.'
      );
    }

    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const potsSheet =
      spreadsheet.getSheetByName(
        PayTrackerSavingsConfig.SHEETS.POTS
      );

    if (!potsSheet) {
      throw new Error(
        'Savings Pots sheet was not found.'
      );
    }

    const potRow =
      PayTrackerSavingsService.findPotRowById(
        potsSheet,
        contribution.potId
      );

    if (!potRow) {
      throw new Error(
        'Savings pot was not found: ' +
        contribution.potId
      );
    }

    const columns =
      PayTrackerSavingsConfig.POTS.COLUMNS;

    const values =
      potsSheet
        .getRange(
          potRow,
          1,
          1,
          PayTrackerSavingsConfig.POTS.HEADERS.length
        )
        .getValues()[0];

    const previousBalance =
      Math.max(
        Number(
          values[
            columns.CURRENT_BALANCE - 1
          ]
        ) || 0,
        0
      );

    const active =
      String(
        values[
          columns.ACTIVE - 1
        ] || ''
      ).trim();

    if (
      active !==
      'Yes'
    ) {
      throw new Error(
        'This savings pot is not active.'
      );
    }

    const newBalance =
      PayTrackerUtils.roundCurrency(
        previousBalance +
        contribution.amount
      );

    potsSheet
      .getRange(
        potRow,
        columns.CURRENT_BALANCE
      )
      .setValue(
        newBalance
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.CURRENCY
      );

    let nextDepositDate =
      null;

    if (
      contribution.frequency ===
      'One-off'
    ) {
      potsSheet
        .getRange(
          potRow,
          columns.NEXT_DEPOSIT_DATE
        )
        .clearContent();
    } else {
      nextDepositDate =
        PayTrackerSavingsContributionService.advanceDateByFrequency(
          contribution.dueDate,
          contribution.frequency
        );

      potsSheet
        .getRange(
          potRow,
          columns.NEXT_DEPOSIT_DATE
        )
        .setValue(
          nextDepositDate
        )
        .setNumberFormat(
          PayTrackerSavingsConfig.FORMATS.DATE
        );
    }

    PayTrackerSavingsService.updatePotRow(
      potsSheet,
      potRow
    );

    return {
      contributionId:
        contribution.contributionId,

      originalDueDate:
        contribution.dueDate,

      depositedDate:
        PayTrackerUtils.stripTime(
          new Date()
        ),

      potId:
        contribution.potId,

      potName:
        contribution.potName,

      amount:
        PayTrackerUtils.roundCurrency(
          contribution.amount
        ),

      previousBalance:
        previousBalance,

      balanceAfter:
        newBalance,

      processedAt:
        new Date(),

      undoStatus:
        PayTrackerSavingsConfig
          .UNDO_STATUSES
          .AVAILABLE,

      notes:
        contribution.notes,

      method:
        contribution.method,

      frequency:
        contribution.frequency,

      nextDepositDate:
        nextDepositDate
    };
  },


  /**
   * Appends one completed contribution to Savings History.
   *
   * @param {Object} record
   */
  appendHistory: function (
    record
  ) {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const historySheet =
      spreadsheet.getSheetByName(
        PayTrackerSavingsConfig.SHEETS.HISTORY
      );

    if (!historySheet) {
      throw new Error(
        'Savings History sheet was not found.'
      );
    }

    const targetRow =
      Math.max(
        historySheet.getLastRow() + 1,
        PayTrackerSavingsConfig.FIRST_DATA_ROW
      );

    const config =
      PayTrackerSavingsConfig.HISTORY;

    historySheet
      .getRange(
        targetRow,
        1,
        1,
        config.HEADERS.length
      )
      .setValues([[
        record.contributionId,
        record.originalDueDate,
        record.depositedDate,
        record.potId,
        record.potName,
        record.amount,
        record.previousBalance,
        record.balanceAfter,
        record.processedAt,
        record.undoStatus,
        record.notes,
        record.method,
        record.frequency
      ]]);

    historySheet
      .getRange(
        targetRow,
        config.COLUMNS.ORIGINAL_DUE_DATE,
        1,
        2
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.DATE
      );

    historySheet
      .getRange(
        targetRow,
        config.COLUMNS.AMOUNT,
        1,
        3
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.CURRENCY
      );

    historySheet
      .getRange(
        targetRow,
        config.COLUMNS.PROCESSED_AT
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.DATE_TIME
      );
  },


  /**
   * Undoes the latest savings deposit that has not already
   * been undone.
   *
   * @return {Object}
   */
  undoLastContribution: function () {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    const historySheet =
      spreadsheet.getSheetByName(
        PayTrackerSavingsConfig.SHEETS.HISTORY
      );

    const contributionsSheet =
      spreadsheet.getSheetByName(
        PayTrackerSavingsConfig.SHEETS.CONTRIBUTIONS
      );

    const potsSheet =
      spreadsheet.getSheetByName(
        PayTrackerSavingsConfig.SHEETS.POTS
      );

    if (
      !historySheet ||
      historySheet.getLastRow() <
        PayTrackerSavingsConfig.FIRST_DATA_ROW
    ) {
      throw new Error(
        'There are no savings deposits to undo.'
      );
    }

    if (
      !contributionsSheet ||
      !potsSheet
    ) {
      throw new Error(
        'Savings Contributions or Savings Pots could not be found.'
      );
    }

    const historyRow =
      PayTrackerSavingsContributionService.findLatestUndoableHistoryRow(
        historySheet
      );

    if (!historyRow) {
      throw new Error(
        'There are no savings deposits available to undo.'
      );
    }

    const config =
      PayTrackerSavingsConfig.HISTORY;

    const values =
      historySheet
        .getRange(
          historyRow,
          1,
          1,
          config.HEADERS.length
        )
        .getValues()[0];

    const record = {
      contributionId:
        String(
          values[
            config.COLUMNS.ID - 1
          ] || ''
        ).trim(),

      originalDueDate:
        values[
          config.COLUMNS.ORIGINAL_DUE_DATE - 1
        ],

      potId:
        String(
          values[
            config.COLUMNS.POT_ID - 1
          ] || ''
        ).trim(),

      potName:
        String(
          values[
            config.COLUMNS.POT_NAME - 1
          ] || ''
        ).trim(),

      amount:
        Number(
          values[
            config.COLUMNS.AMOUNT - 1
          ]
        ) || 0,

      previousBalance:
        Number(
          values[
            config.COLUMNS.PREVIOUS_BALANCE - 1
          ]
        ) || 0,

      notes:
        String(
          values[
            config.COLUMNS.NOTES - 1
          ] || ''
        ).trim(),

      method:
        String(
          values[
            config.COLUMNS.METHOD - 1
          ] || ''
        ).trim(),

      frequency:
        String(
          values[
            config.COLUMNS.FREQUENCY - 1
          ] || ''
        ).trim()
    };

    if (
      !(record.originalDueDate instanceof Date)
    ) {
      throw new Error(
        'The original savings due date is invalid.'
      );
    }

    const potRow =
      PayTrackerSavingsService.findPotRowById(
        potsSheet,
        record.potId
      );

    if (!potRow) {
      throw new Error(
        'The original savings pot could not be found.'
      );
    }

    const potColumns =
      PayTrackerSavingsConfig.POTS.COLUMNS;

    potsSheet
      .getRange(
        potRow,
        potColumns.CURRENT_BALANCE
      )
      .setValue(
        record.previousBalance
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.CURRENCY
      );

    potsSheet
      .getRange(
        potRow,
        potColumns.NEXT_DEPOSIT_DATE
      )
      .setValue(
        record.originalDueDate
      )
      .setNumberFormat(
        PayTrackerSavingsConfig.FORMATS.DATE
      );

    if (
      record.method !==
      ''
    ) {
      potsSheet
        .getRange(
          potRow,
          potColumns.CONTRIBUTION_METHOD
        )
        .setValue(
          record.method
        );
    }

    if (
      record.frequency !==
      ''
    ) {
      potsSheet
        .getRange(
          potRow,
          potColumns.CONTRIBUTION_FREQUENCY
        )
        .setValue(
          record.frequency
        );
    }

    PayTrackerSavingsService.updatePotRow(
      potsSheet,
      potRow
    );

    const restoredMethod =
      record.method ||
      String(
        potsSheet
          .getRange(
            potRow,
            potColumns.CONTRIBUTION_METHOD
          )
          .getValue() || ''
      ).trim();

    const restoredFrequency =
      record.frequency ||
      String(
        potsSheet
          .getRange(
            potRow,
            potColumns.CONTRIBUTION_FREQUENCY
          )
          .getValue() || ''
      ).trim();

    const existingContribution =
      PayTrackerSavingsContributionService.findContribution(
        contributionsSheet,
        record.potId,
        record.originalDueDate
      );

    if (!existingContribution) {
      PayTrackerSavingsContributionService.ensureContribution(
        contributionsSheet,
        {
          dueDate:
            record.originalDueDate,

          potId:
            record.potId,

          potName:
            record.potName,

          amount:
            record.amount,

          method:
            restoredMethod,

          frequency:
            restoredFrequency
        }
      );
    }

    historySheet
      .getRange(
        historyRow,
        config.COLUMNS.UNDO_STATUS
      )
      .setValue(
        PayTrackerSavingsConfig
          .UNDO_STATUSES
          .UNDONE
      );

    PayTrackerSavingsContributionService.sortContributions(
      contributionsSheet
    );

    PayTrackerSavingsService.recalculateAll();

    PayTrackerLifeGoalsService.recalculateAllGoals();

    PayTrackerFinanceDashboard.refresh();

    return {
      potName:
        record.potName,

      amount:
        record.amount
    };
  },


  /**
   * Finds the newest history row still available for undo.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} historySheet
   * @return {number|null}
   */
  findLatestUndoableHistoryRow: function (
    historySheet
  ) {
    const columns =
      PayTrackerSavingsConfig.HISTORY.COLUMNS;

    for (
      let row = historySheet.getLastRow();
      row >= PayTrackerSavingsConfig.FIRST_DATA_ROW;
      row--
    ) {
      const status =
        String(
          historySheet
            .getRange(
              row,
              columns.UNDO_STATUS
            )
            .getValue() || ''
        ).trim();

      if (
        status !==
        PayTrackerSavingsConfig
          .UNDO_STATUSES
          .UNDONE
      ) {
        return row;
      }
    }

    return null;
  },


  /**
   * Advances a date using the selected contribution
   * frequency.
   *
   * Month-based schedules preserve the original day where
   * possible and use the final day for shorter months.
   *
   * @param {Date} date
   * @param {string} frequency
   * @return {Date}
   */
  advanceDateByFrequency: function (
    date,
    frequency
  ) {
    PayTrackerUtils.validateDate(
      date,
      'date'
    );

    const value =
      String(
        frequency || ''
      ).trim();

    const result =
      PayTrackerUtils.stripTime(
        date
      );

    switch (value) {
      case 'Weekly':
        result.setDate(
          result.getDate() + 7
        );
        break;

      case 'Fortnightly':
        result.setDate(
          result.getDate() + 14
        );
        break;

      case 'Monthly':
        return PayTrackerSavingsContributionService.addMonthsPreservingDay(
          result,
          1
        );

      case 'Quarterly':
        return PayTrackerSavingsContributionService.addMonthsPreservingDay(
          result,
          3
        );

      case 'Annual':
        return PayTrackerSavingsContributionService.addMonthsPreservingDay(
          result,
          12
        );

      case 'One-off':
        throw new Error(
          'A one-off contribution does not have a next due date.'
        );

      default:
        throw new Error(
          'Unsupported savings contribution frequency: ' +
          value
        );
    }

    return PayTrackerUtils.stripTime(
      result
    );
  },


  /**
   * Adds months while preserving the original day where
   * possible.
   *
   * Example:
   * 31 January + 1 month becomes the final day of February.
   *
   * @param {Date} date
   * @param {number} monthsToAdd
   * @return {Date}
   */
  addMonthsPreservingDay: function (
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

    const finalDayOfTargetMonth =
      new Date(
        result.getFullYear(),
        result.getMonth() + 1,
        0
      ).getDate();

    result.setDate(
      Math.min(
        originalDay,
        finalDayOfTargetMonth
      )
    );

    return PayTrackerUtils.stripTime(
      result
    );
  },


  /**
   * Sorts the contribution queue by due date.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  sortContributions: function (
    sheet
  ) {
    if (
      !sheet ||
      sheet.getLastRow() <
      3
    ) {
      return;
    }

    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        PayTrackerSavingsConfig.CONTRIBUTIONS.HEADERS.length
      )
      .sort([
        {
          column:
            PayTrackerSavingsConfig
              .CONTRIBUTIONS
              .COLUMNS
              .DUE_DATE,

          ascending:
            true
        }
      ]);
  }
});