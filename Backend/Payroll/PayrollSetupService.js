/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Payroll/PayrollSetupService.js
 *
 * Purpose:
 * - Create the Payroll Centre database sheets
 * - Validate existing Payroll Centre sheet headers
 * - Preserve all existing rows and user data
 * - Add initial Payroll Group records
 * - Add default employer assignments
 * - Add the initial payslip email matching rule
 * - Apply safe formatting and data validation
 *
 * Important:
 * - This service is idempotent
 * - Existing sheets are never deleted
 * - Existing rows are never cleared
 * - Existing payroll records are never overwritten
 * - Gmail is not accessed by this service
 * - Google Drive is not accessed by this service
 *******************************************************/

const PayTrackerPayrollSetupService = Object.freeze({
  VERSION: '2.8.0',

  /**
   * Creates and prepares all Payroll Centre sheets.
   *
   * This is the main setup function that should be run
   * manually from the Apps Script editor during setup.
   *
   * @return {Object} Setup result.
   */
  setupPayrollCentre: function() {
    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    if (!spreadsheet) {
      throw new Error(
        'Pay Tracker could not access the active spreadsheet.'
      );
    }

    const result = {
      success: true,
      sheetsCreated: [],
      sheetsUpdated: [],
      sheetsUnchanged: [],
      defaultsAdded: {
        payrollGroups: 0,
        employerAssignments: 0,
        emailRules: 0
      },
      warnings: [],
      timestamp: new Date()
    };

    const definitions =
      PayTrackerPayrollConfig.getSheetDefinitions();

    definitions.forEach(function(definition) {
      const sheetResult =
        PayTrackerPayrollSetupService.ensureSheet(
          spreadsheet,
          definition
        );

      if (sheetResult.created) {
        result.sheetsCreated.push(
          definition.NAME
        );
      } else if (sheetResult.updated) {
        result.sheetsUpdated.push(
          definition.NAME
        );
      } else {
        result.sheetsUnchanged.push(
          definition.NAME
        );
      }

      if (
        sheetResult.warnings &&
        sheetResult.warnings.length
      ) {
        result.warnings =
          result.warnings.concat(
            sheetResult.warnings
          );
      }
    });

    result.defaultsAdded.payrollGroups =
      PayTrackerPayrollSetupService
        .seedPayrollGroups(
          spreadsheet
        );

    result.defaultsAdded.employerAssignments =
      PayTrackerPayrollSetupService
        .seedPayrollGroupEmployers(
          spreadsheet
        );

    result.defaultsAdded.emailRules =
      PayTrackerPayrollSetupService
        .seedEmailRules(
          spreadsheet
        );

    PayTrackerPayrollSetupService
      .applyPayrollGroupValidation(
        spreadsheet
      );

    PayTrackerPayrollSetupService
      .applyPayrollGroupEmployerValidation(
        spreadsheet
      );

    PayTrackerPayrollSetupService
      .applyPayslipRegisterValidation(
        spreadsheet
      );

    PayTrackerPayrollSetupService
      .applyEmailRuleValidation(
        spreadsheet
      );

    PayTrackerPayrollSetupService
      .applyScanHistoryValidation(
        spreadsheet
      );

    SpreadsheetApp.flush();

    console.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );

    return result;
  },

  /**
   * Creates a sheet when missing and ensures its headers.
   *
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet}
   *   spreadsheet Active spreadsheet.
   * @param {Object} definition Sheet definition.
   * @return {Object} Sheet setup result.
   */
  ensureSheet: function(
    spreadsheet,
    definition
  ) {
    if (
      !definition ||
      !definition.NAME ||
      !Array.isArray(definition.HEADERS)
    ) {
      throw new Error(
        'Invalid Payroll Centre sheet definition.'
      );
    }

    let sheet =
      spreadsheet.getSheetByName(
        definition.NAME
      );

    let created = false;
    let updated = false;
    const warnings = [];

    if (!sheet) {
      sheet =
        spreadsheet.insertSheet(
          definition.NAME
        );

      created = true;
    }

    const requiredColumnCount =
      definition.HEADERS.length;

    PayTrackerPayrollSetupService
      .ensureColumnCapacity(
        sheet,
        requiredColumnCount
      );

    const existingHeaders =
      PayTrackerPayrollSetupService
        .readHeaders(
          sheet,
          requiredColumnCount
        );

    if (
      PayTrackerPayrollSetupService
        .isBlankHeaderRow(
          existingHeaders
        )
    ) {
      sheet
        .getRange(
          1,
          1,
          1,
          requiredColumnCount
        )
        .setValues([
          definition.HEADERS.slice()
        ]);

      updated = true;
    } else {
      const headerResult =
        PayTrackerPayrollSetupService
          .mergeMissingHeaders(
            sheet,
            definition.HEADERS,
            existingHeaders
          );

      updated =
        updated ||
        headerResult.updated;

      warnings.push.apply(
        warnings,
        headerResult.warnings
      );
    }

    PayTrackerPayrollSetupService
      .formatSheet(
        sheet,
        definition
      );

    return {
      sheet: sheet,
      created: created,
      updated: updated,
      warnings: warnings
    };
  },

  /**
   * Ensures that a sheet has enough columns.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
   * @param {number} requiredColumnCount Required columns.
   */
  ensureColumnCapacity: function(
    sheet,
    requiredColumnCount
  ) {
    const currentColumnCount =
      sheet.getMaxColumns();

    if (
      currentColumnCount >=
      requiredColumnCount
    ) {
      return;
    }

    sheet.insertColumnsAfter(
      currentColumnCount,
      requiredColumnCount -
        currentColumnCount
    );
  },

  /**
   * Reads the first row of a sheet.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
   * @param {number} columnCount Number of columns.
   * @return {Array<*>} Header values.
   */
  readHeaders: function(
    sheet,
    columnCount
  ) {
    return sheet
      .getRange(
        1,
        1,
        1,
        columnCount
      )
      .getValues()[0];
  },

  /**
   * Checks whether every header cell is blank.
   *
   * @param {Array<*>} headers Header values.
   * @return {boolean} True when blank.
   */
  isBlankHeaderRow: function(headers) {
    return headers.every(function(header) {
      return (
        String(
          header === null ||
          header === undefined
            ? ''
            : header
        ).trim() === ''
      );
    });
  },

  /**
   * Adds missing headers without clearing existing columns.
   *
   * Existing non-empty mismatched headers are retained and
   * reported as warnings to prevent accidental data damage.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
   * @param {Array<string>} requiredHeaders Required headers.
   * @param {Array<*>} existingHeaders Existing headers.
   * @return {Object} Merge result.
   */
  mergeMissingHeaders: function(
    sheet,
    requiredHeaders,
    existingHeaders
  ) {
    const finalHeaders =
      existingHeaders.slice();

    const warnings = [];
    let updated = false;

    requiredHeaders.forEach(function(
      requiredHeader,
      index
    ) {
      const existingHeader =
        String(
          finalHeaders[index] === null ||
          finalHeaders[index] === undefined
            ? ''
            : finalHeaders[index]
        ).trim();

      if (!existingHeader) {
        finalHeaders[index] =
          requiredHeader;

        updated = true;
        return;
      }

      if (
        PayTrackerPayrollSetupService
          .normalizeText(
            existingHeader
          ) !==
        PayTrackerPayrollSetupService
          .normalizeText(
            requiredHeader
          )
      ) {
        warnings.push(
          [
            'Header mismatch in',
            sheet.getName() + ',',
            'column',
            index + 1 + '.',
            'Expected "' +
              requiredHeader +
              '" but found "' +
              existingHeader +
              '".',
            'The existing header was preserved.'
          ].join(' ')
        );
      }
    });

    if (updated) {
      sheet
        .getRange(
          1,
          1,
          1,
          requiredHeaders.length
        )
        .setValues([
          finalHeaders
        ]);
    }

    return {
      updated: updated,
      warnings: warnings
    };
  },

  /**
   * Applies standard Payroll Centre formatting.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
   * @param {Object} definition Sheet definition.
   */
  formatSheet: function(
    sheet,
    definition
  ) {
    const columnCount =
      definition.HEADERS.length;

    const headerRange =
      sheet.getRange(
        1,
        1,
        1,
        columnCount
      );

    headerRange
      .setFontWeight('bold')
      .setBackground('#0f172a')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setWrap(true);

    sheet.setFrozenRows(1);

    sheet.setRowHeight(
      1,
      38
    );

    sheet
      .getRange(
        1,
        1,
        Math.max(
          sheet.getMaxRows(),
          1
        ),
        columnCount
      )
      .setVerticalAlignment(
        'middle'
      );

    PayTrackerPayrollSetupService
      .setDefaultColumnWidths(
        sheet,
        definition.NAME
      );

    PayTrackerPayrollSetupService
      .applyDateFormats(
        sheet,
        definition.NAME
      );

    PayTrackerPayrollSetupService
      .applyCurrencyFormats(
        sheet,
        definition.NAME
      );

    PayTrackerPayrollSetupService
      .applyNumberFormats(
        sheet,
        definition.NAME
      );

    const filter =
      sheet.getFilter();

    if (
      !filter &&
      sheet.getLastRow() >= 1
    ) {
      sheet
        .getRange(
          1,
          1,
          Math.max(
            sheet.getLastRow(),
            1
          ),
          columnCount
        )
        .createFilter();
    }
  },

  /**
   * Applies practical default column widths.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
   * @param {string} sheetName Sheet name.
   */
  setDefaultColumnWidths: function(
    sheet,
    sheetName
  ) {
    const definition =
      PayTrackerPayrollConfig
        .getSheetDefinition(
          sheetName
        );

    if (!definition) {
      return;
    }

    definition.HEADERS.forEach(function(
      header,
      index
    ) {
      let width = 145;

      if (
        header.indexOf('Description') !== -1 ||
        header.indexOf('Reason') !== -1 ||
        header.indexOf('Notes') !== -1 ||
        header.indexOf('Summary') !== -1
      ) {
        width = 280;
      } else if (
        header.indexOf('Subject') !== -1 ||
        header.indexOf('Filename') !== -1 ||
        header.indexOf('Sender') !== -1
      ) {
        width = 220;
      } else if (
        header.indexOf('ID') !== -1 ||
        header.indexOf('Hash') !== -1
      ) {
        width = 190;
      } else if (
        header.indexOf('Date') !== -1 ||
        header.indexOf('At') !== -1
      ) {
        width = 155;
      } else if (
        header.indexOf('Active') !== -1 ||
        header.indexOf('Priority') !== -1
      ) {
        width = 95;
      }

      sheet.setColumnWidth(
        index + 1,
        width
      );
    });
  },

  /**
   * Applies date and date-time formats.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
   * @param {string} sheetName Sheet name.
   */
  applyDateFormats: function(
    sheet,
    sheetName
  ) {
    const dateOnlyHeaders = [
      'Pay Period Start',
      'Pay Period End',
      'Pay Date',
      'Search Start Date',
      'Search End Date'
    ];

    const dateTimeHeaders = [
      'Email Date',
      'Created At',
      'Updated At',
      'Scan Started At',
      'Scan Completed At'
    ];

    dateOnlyHeaders.forEach(function(header) {
      PayTrackerPayrollSetupService
        .formatColumnByHeader(
          sheet,
          sheetName,
          header,
          'dd mmm yyyy'
        );
    });

    dateTimeHeaders.forEach(function(header) {
      PayTrackerPayrollSetupService
        .formatColumnByHeader(
          sheet,
          sheetName,
          header,
          'dd mmm yyyy hh:mm'
        );
    });
  },

  /**
   * Applies currency formats.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
   * @param {string} sheetName Sheet name.
   */
  applyCurrencyFormats: function(
    sheet,
    sheetName
  ) {
    const currencyHeaders = [
      'Gross Pay Actual',
      'Net Pay Actual',
      'Tax Actual',
      'National Insurance Actual',
      'Pension Actual',
      'Student Loan Actual',
      'Other Deductions Actual',
      'Predicted Gross',
      'Predicted Take Home',
      'Gross Difference',
      'Net Difference'
    ];

    currencyHeaders.forEach(function(header) {
      PayTrackerPayrollSetupService
        .formatColumnByHeader(
          sheet,
          sheetName,
          header,
          '£#,##0.00;[Red]-£#,##0.00'
        );
    });
  },

  /**
   * Applies percentage and numeric formats.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
   * @param {string} sheetName Sheet name.
   */
  applyNumberFormats: function(
    sheet,
    sheetName
  ) {
    PayTrackerPayrollSetupService
      .formatColumnByHeader(
        sheet,
        sheetName,
        'Difference Percentage',
        '0.00%'
      );

    PayTrackerPayrollSetupService
      .formatColumnByHeader(
        sheet,
        sheetName,
        'Match Confidence',
        '0'
      );

    PayTrackerPayrollSetupService
      .formatColumnByHeader(
        sheet,
        sheetName,
        'File Size',
        '#,##0'
      );

    PayTrackerPayrollSetupService
      .formatColumnByHeader(
        sheet,
        sheetName,
        'Priority',
        '0'
      );
  },

  /**
   * Formats an entire data column based on its header.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
   * @param {string} sheetName Sheet name.
   * @param {string} header Header name.
   * @param {string} format Number format.
   */
  formatColumnByHeader: function(
    sheet,
    sheetName,
    header,
    format
  ) {
    const definition =
      PayTrackerPayrollConfig
        .getSheetDefinition(
          sheetName
        );

    if (!definition) {
      return;
    }

    const columnIndex =
      definition.HEADERS.indexOf(
        header
      );

    if (columnIndex === -1) {
      return;
    }

    const dataRowCount =
      Math.max(
        sheet.getMaxRows() - 1,
        1
      );

    sheet
      .getRange(
        2,
        columnIndex + 1,
        dataRowCount,
        1
      )
      .setNumberFormat(
        format
      );
  },

  /**
   * Adds the initial Payroll Group.
   *
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet}
   *   spreadsheet Spreadsheet.
   * @return {number} Number of records inserted.
   */
  seedPayrollGroups: function(spreadsheet) {
    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYROLL_GROUPS;

    const sheet =
      spreadsheet.getSheetByName(
        definition.NAME
      );

    if (!sheet) {
      throw new Error(
        definition.NAME +
        ' is unavailable.'
      );
    }

    let insertedCount = 0;

    PayTrackerPayrollConfig
      .DEFAULT_PAYROLL_GROUPS
      .forEach(function(group) {
        const exists =
          PayTrackerPayrollSetupService
            .recordExists(
              sheet,
              definition.COLUMNS
                .PAYROLL_GROUP_ID,
              group.payrollGroupId
            );

        if (exists) {
          return;
        }

        const timestamp =
          new Date();

        sheet.appendRow([
          group.payrollGroupId,
          group.payrollGroupName,
          group.description,
          group.primaryEmployerKey,
          group.payFrequency,
          group.expectedSenderRules,
          group.expectedSubjectRules,
          group.storageFolderId,
          group.active,
          timestamp,
          timestamp
        ]);

        insertedCount += 1;
      });

    return insertedCount;
  },

  /**
   * Adds the initial employer assignments.
   *
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet}
   *   spreadsheet Spreadsheet.
   * @return {number} Number of records inserted.
   */
  seedPayrollGroupEmployers: function(
    spreadsheet
  ) {
    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYROLL_GROUP_EMPLOYERS;

    const sheet =
      spreadsheet.getSheetByName(
        definition.NAME
      );

    if (!sheet) {
      throw new Error(
        definition.NAME +
        ' is unavailable.'
      );
    }

    let insertedCount = 0;

    PayTrackerPayrollConfig
      .DEFAULT_PAYROLL_GROUP_EMPLOYERS
      .forEach(function(assignment) {
        const exists =
          PayTrackerPayrollSetupService
            .recordExists(
              sheet,
              definition.COLUMNS
                .ASSIGNMENT_ID,
              assignment.assignmentId
            );

        if (exists) {
          return;
        }

        const timestamp =
          new Date();

        sheet.appendRow([
          assignment.assignmentId,
          assignment.payrollGroupId,
          assignment.employerKey,
          assignment.employerDisplayName,
          assignment.includedInTaxablePayroll,
          assignment.active,
          timestamp,
          timestamp
        ]);

        insertedCount += 1;
      });

    return insertedCount;
  },

  /**
   * Adds the initial email matching rule.
   *
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet}
   *   spreadsheet Spreadsheet.
   * @return {number} Number of records inserted.
   */
  seedEmailRules: function(spreadsheet) {
    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYSLIP_EMAIL_RULES;

    const sheet =
      spreadsheet.getSheetByName(
        definition.NAME
      );

    if (!sheet) {
      throw new Error(
        definition.NAME +
        ' is unavailable.'
      );
    }

    let insertedCount = 0;

    PayTrackerPayrollConfig
      .DEFAULT_EMAIL_RULES
      .forEach(function(rule) {
        const exists =
          PayTrackerPayrollSetupService
            .recordExists(
              sheet,
              definition.COLUMNS
                .RULE_ID,
              rule.ruleId
            );

        if (exists) {
          return;
        }

        const timestamp =
          new Date();

        sheet.appendRow([
          rule.ruleId,
          rule.payrollGroupId,
          rule.ruleName,
          rule.senderContains,
          rule.senderEquals,
          rule.subjectContains,
          rule.filenameContains,
          rule.requiresPdf,
          rule.priority,
          rule.active,
          timestamp,
          timestamp
        ]);

        insertedCount += 1;
      });

    return insertedCount;
  },

  /**
   * Checks whether a record identifier already exists.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
   * @param {number} idColumn One-based ID column.
   * @param {string} recordId Identifier.
   * @return {boolean} True when found.
   */
  recordExists: function(
    sheet,
    idColumn,
    recordId
  ) {
    const lastRow =
      sheet.getLastRow();

    if (lastRow <= 1) {
      return false;
    }

    const values =
      sheet
        .getRange(
          2,
          idColumn,
          lastRow - 1,
          1
        )
        .getDisplayValues();

    const target =
      PayTrackerPayrollSetupService
        .normalizeText(
          recordId
        );

    return values.some(function(row) {
      return (
        PayTrackerPayrollSetupService
          .normalizeText(
            row[0]
          ) === target
      );
    });
  },

  /**
   * Adds validation to Payroll Groups.
   *
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet}
   *   spreadsheet Spreadsheet.
   */
  applyPayrollGroupValidation: function(
    spreadsheet
  ) {
    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYROLL_GROUPS;

    const sheet =
      spreadsheet.getSheetByName(
        definition.NAME
      );

    if (!sheet) {
      return;
    }

    PayTrackerPayrollSetupService
      .applyListValidation(
        sheet,
        definition.COLUMNS
          .PAY_FREQUENCY,
        Object.keys(
          PayTrackerPayrollConfig
            .PAY_FREQUENCIES
        ).map(function(key) {
          return PayTrackerPayrollConfig
            .PAY_FREQUENCIES[key];
        })
      );

    PayTrackerPayrollSetupService
      .applyCheckboxValidation(
        sheet,
        definition.COLUMNS.ACTIVE
      );
  },

  /**
   * Adds validation to group-employer assignments.
   *
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet}
   *   spreadsheet Spreadsheet.
   */
  applyPayrollGroupEmployerValidation:
    function(spreadsheet) {
      const definition =
        PayTrackerPayrollConfig
          .SHEETS
          .PAYROLL_GROUP_EMPLOYERS;

      const sheet =
        spreadsheet.getSheetByName(
          definition.NAME
        );

      if (!sheet) {
        return;
      }

      PayTrackerPayrollSetupService
        .applyCheckboxValidation(
          sheet,
          definition.COLUMNS
            .INCLUDED_IN_TAXABLE_PAYROLL
        );

      PayTrackerPayrollSetupService
        .applyCheckboxValidation(
          sheet,
          definition.COLUMNS.ACTIVE
        );
    },

  /**
   * Adds validation to the Payslip Register.
   *
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet}
   *   spreadsheet Spreadsheet.
   */
  applyPayslipRegisterValidation: function(
    spreadsheet
  ) {
    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYSLIP_REGISTER;

    const sheet =
      spreadsheet.getSheetByName(
        definition.NAME
      );

    if (!sheet) {
      return;
    }

    PayTrackerPayrollSetupService
      .applyListValidation(
        sheet,
        definition.COLUMNS
          .SOURCE_TYPE,
        Object.keys(
          PayTrackerPayrollConfig
            .SOURCE_TYPES
        ).map(function(key) {
          return PayTrackerPayrollConfig
            .SOURCE_TYPES[key];
        })
      );

    PayTrackerPayrollSetupService
      .applyListValidation(
        sheet,
        definition.COLUMNS
          .IMPORT_STATUS,
        Object.keys(
          PayTrackerPayrollConfig
            .IMPORT_STATUSES
        ).map(function(key) {
          return PayTrackerPayrollConfig
            .IMPORT_STATUSES[key];
        })
      );

    PayTrackerPayrollSetupService
      .applyListValidation(
        sheet,
        definition.COLUMNS
          .COMPARISON_STATUS,
        Object.keys(
          PayTrackerPayrollConfig
            .COMPARISON_STATUSES
        ).map(function(key) {
          return PayTrackerPayrollConfig
            .COMPARISON_STATUSES[key];
        })
      );
  },

  /**
   * Adds validation to email matching rules.
   *
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet}
   *   spreadsheet Spreadsheet.
   */
  applyEmailRuleValidation: function(
    spreadsheet
  ) {
    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYSLIP_EMAIL_RULES;

    const sheet =
      spreadsheet.getSheetByName(
        definition.NAME
      );

    if (!sheet) {
      return;
    }

    PayTrackerPayrollSetupService
      .applyCheckboxValidation(
        sheet,
        definition.COLUMNS
          .REQUIRES_PDF
      );

    PayTrackerPayrollSetupService
      .applyCheckboxValidation(
        sheet,
        definition.COLUMNS.ACTIVE
      );
  },

  /**
   * Adds validation to scan history.
   *
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet}
   *   spreadsheet Spreadsheet.
   */
  applyScanHistoryValidation: function(
    spreadsheet
  ) {
    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYROLL_SCAN_HISTORY;

    const sheet =
      spreadsheet.getSheetByName(
        definition.NAME
      );

    if (!sheet) {
      return;
    }

    PayTrackerPayrollSetupService
      .applyListValidation(
        sheet,
        definition.COLUMNS.STATUS,
        Object.keys(
          PayTrackerPayrollConfig
            .SCAN_STATUSES
        ).map(function(key) {
          return PayTrackerPayrollConfig
            .SCAN_STATUSES[key];
        })
      );
  },

  /**
   * Applies list validation to a data column.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
   * @param {number} column One-based column.
   * @param {Array<string>} values Allowed values.
   */
  applyListValidation: function(
    sheet,
    column,
    values
  ) {
    const rowCount =
      Math.max(
        sheet.getMaxRows() - 1,
        1
      );

    const validation =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          values,
          true
        )
        .setAllowInvalid(false)
        .build();

    sheet
      .getRange(
        2,
        column,
        rowCount,
        1
      )
      .setDataValidation(
        validation
      );
  },

  /**
   * Applies checkbox validation to a data column.
   *
   * Existing values are not replaced.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
   * @param {number} column One-based column.
   */
  applyCheckboxValidation: function(
    sheet,
    column
  ) {
    const rowCount =
      Math.max(
        sheet.getMaxRows() - 1,
        1
      );

    const validation =
      SpreadsheetApp
        .newDataValidation()
        .requireCheckbox()
        .setAllowInvalid(false)
        .build();

    sheet
      .getRange(
        2,
        column,
        rowCount,
        1
      )
      .setDataValidation(
        validation
      );
  },

  /**
   * Normalizes text for comparisons.
   *
   * @param {*} value Value.
   * @return {string} Normalized text.
   */
  normalizeText: function(value) {
    return String(
      value === null ||
      value === undefined
        ? ''
        : value
    )
      .trim()
      .toLowerCase();
  }
});

/**
 * Manual Apps Script setup entrypoint.
 *
 * Run this function once after both Payroll files have
 * been saved and pushed into Apps Script.
 *
 * @return {Object} Setup result.
 */
function setupPayTrackerPayrollCentre() {
  return PayTrackerPayrollSetupService
    .setupPayrollCentre();
}