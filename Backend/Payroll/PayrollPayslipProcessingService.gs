/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Payroll/PayrollPayslipProcessingService.gs
 *
 * Purpose:
 * - Process imported payslips from the Payslip Register
 * - Extract actual payroll values from stored PDFs
 * - Parse and classify timesheet rows
 * - Store extraction results in the register
 *
 * Dependencies:
 * - PayrollPdfTextService.gs
 * - PayrollPayslipParser.gs
 * - PayrollTimesheetParser.gs
 * - PayrollTimesheetMappingService.gs
 *******************************************************/

const PayTrackerPayrollPayslipProcessingService =
  Object.freeze({
    VERSION: '2.8.0',

    REGISTER_SHEET_NAME:
      'Payslip Register',

    RESULT_HEADERS: Object.freeze([
      'Provider',
      'Employer Name',
      'Employee Name',
      'Payroll Number',
      'NI Number',
      'Tax Code',
      'Pay Period',
      'Actual Pay Date',
      'Actual Gross Pay',
      'Actual Taxable Pay',
      'Actual Income Tax',
      'Actual National Insurance',
      'Actual Pension',
      'Actual Student Loan',
      'Actual Total Deductions',
      'Actual Net Pay',
      'Actual Total Hours',
      'Actual Basic Hours',
      'Actual Enhanced Hours',
      'Actual Unsocial Hours',
      'Actual Overtime Hours',
      'Actual Holiday Hours',
      'Timesheet Entry Count',
      'Timesheet References',
      'Timesheet Classification Status',
      'Parser Type',
      'Parser Confidence',
      'Extraction Status',
      'Extraction Error',
      'Extracted At'
    ]),

    /**
     * Processes one registered payslip.
     *
     * @param {string} payslipId Payslip ID.
     * @return {Object} Processing result.
     */
    processPayslip: function(payslipId) {
      const normalizedPayslipId =
        PayTrackerPayrollPayslipProcessingService
          .normalizeRequiredText_(
            payslipId,
            'Payslip ID'
          );

      const sheet =
        PayTrackerPayrollPayslipProcessingService
          .getRegisterSheet_();

      const headerMap =
        PayTrackerPayrollPayslipProcessingService
          .ensureResultHeaders_(
            sheet
          );

      const rowNumber =
        PayTrackerPayrollPayslipProcessingService
          .findRowByPayslipId_(
            sheet,
            headerMap,
            normalizedPayslipId
          );

      if (!rowNumber) {
        throw new Error(
          'Payslip ID was not found in the Payslip Register: ' +
          normalizedPayslipId
        );
      }

      const driveFileId =
        PayTrackerPayrollPayslipProcessingService
          .getCellValue_(
            sheet,
            rowNumber,
            headerMap,
            [
              'Drive File ID',
              'DriveFileId'
            ]
          );

      if (!driveFileId) {
        throw new Error(
          'The payslip does not have a Drive File ID.'
        );
      }

      try {
        PayTrackerPayrollPayslipProcessingService
          .writeValues_(
            sheet,
            rowNumber,
            headerMap,
            {
              'Extraction Status':
                'PROCESSING',

              'Extraction Error':
                '',

              'Extracted At':
                new Date()
            }
          );

        const extraction =
          PayTrackerPayrollPdfTextService
            .extractTextFromPdf(
              driveFileId
            );

        if (
          !extraction ||
          extraction.success !== true
        ) {
          throw new Error(
            extraction &&
            extraction.error
              ? extraction.error
              : 'PDF text extraction failed.'
          );
        }

        const payslipParse =
          PayTrackerPayrollPayslipParser
            .parse(
              extraction.text
            );

        if (
          !payslipParse ||
          payslipParse.success !== true
        ) {
          throw new Error(
            payslipParse &&
            payslipParse.error
              ? payslipParse.error
              : 'Payslip parsing failed.'
          );
        }

        const timesheetParse =
          PayTrackerPayrollTimesheetParser
            .parse(
              extraction.text
            );

        const classification =
          PayTrackerPayrollTimesheetMappingService
            .classifyEntries(
              timesheetParse.entries || []
            );

        const fields =
          payslipParse.fields || {};

        const totals =
          timesheetParse.totals || {};

        const pensionActual =
          PayTrackerPayrollPayslipProcessingService
            .firstAvailable_(
              fields.employeePension,
              fields.pension
            );

        const otherDeductionsActual =
          PayTrackerPayrollPayslipProcessingService
            .calculateOtherDeductions_(
              fields.totalDeductions,
              fields.incomeTax,
              fields.nationalInsurance,
              pensionActual,
              fields.studentLoan
            );

        const references =
          PayTrackerPayrollPayslipProcessingService
            .getUniqueReferences_(
              classification.entries || []
            );

        const classificationStatus =
          classification.unclassifiedCount > 0
            ? 'PARTIALLY_CLASSIFIED'
            : (
                classification.totalEntries > 0
                  ? 'CLASSIFIED'
                  : 'NO_TIMESHEET_ROWS'
              );

        const values = {
          'Provider':
            fields.provider || '',

          'Employer Name':
            fields.employer || '',

          'Employee Name':
            fields.employeeName || '',

          'Payroll Number':
            fields.payrollNumber || '',

          'NI Number':
            fields.nationalInsuranceNumber || '',

          'Tax Code':
            fields.taxCode || '',

          'Pay Period':
            fields.payPeriod || '',

          'Actual Pay Date':
            PayTrackerPayrollPayslipProcessingService
              .toSheetDate_(
                fields.payDate
              ),

          'Pay Date':
            PayTrackerPayrollPayslipProcessingService
              .toSheetDate_(
                fields.payDate
              ),

          'Actual Gross Pay':
            fields.grossPay,

          'Gross Pay Actual':
            fields.grossPay,

          'Actual Taxable Pay':
            fields.taxablePay,

          'Actual Income Tax':
            fields.incomeTax,

          'Tax Actual':
            fields.incomeTax,

          'Actual National Insurance':
            fields.nationalInsurance,

          'National Insurance Actual':
            fields.nationalInsurance,

          'Actual Pension':
            pensionActual,

          'Pension Actual':
            pensionActual,

          'Actual Student Loan':
            fields.studentLoan,

          'Student Loan Actual':
            fields.studentLoan,

          'Actual Total Deductions':
            fields.totalDeductions,

          'Other Deductions Actual':
            otherDeductionsActual,

          'Actual Net Pay':
            fields.netPay,

          'Net Pay Actual':
            fields.netPay,

          'Import Status':
            'Complete',

          'Actual Total Hours':
            totals.hours,

          'Actual Basic Hours':
            totals.basicHours,

          'Actual Enhanced Hours':
            totals.enhancedHours,

          'Actual Unsocial Hours':
            totals.unsocialHours,

          'Actual Overtime Hours':
            totals.overtimeHours,

          'Actual Holiday Hours':
            totals.holidayHours,

          'Timesheet Entry Count':
            timesheetParse.entryCount || 0,

          'Timesheet References':
            references.join(', '),

          'Timesheet Classification Status':
            classificationStatus,

          'Parser Type':
            payslipParse.parserType || '',

          'Parser Confidence':
            payslipParse.confidence
              ? payslipParse.confidence.score
              : '',

          'Extraction Status':
            'COMPLETED',

          'Extraction Error':
            '',

          'Extracted At':
            new Date()
        };

        PayTrackerPayrollPayslipProcessingService
          .writeValues_(
            sheet,
            rowNumber,
            headerMap,
            values
          );

        return {
          success: true,

          payslipId:
            normalizedPayslipId,

          rowNumber:
            rowNumber,

          sourceFileId:
            driveFileId,

          fields:
            fields,

          timesheet: {
            totals:
              totals,

            entries:
              classification.entries || [],

            classifiedCount:
              classification.classifiedCount || 0,

            unclassifiedCount:
              classification.unclassifiedCount || 0,

            unclassifiedReferences:
              classification.unclassifiedReferences || []
          },

          parserType:
            payslipParse.parserType,

          parserConfidence:
            payslipParse.confidence,

          extractionStatus:
            'COMPLETED',

          processedAt:
            new Date().toISOString()
        };
      } catch (error) {
        const message =
          PayTrackerPayrollPayslipProcessingService
            .getErrorMessage_(
              error
            );

        PayTrackerPayrollPayslipProcessingService
          .writeValues_(
            sheet,
            rowNumber,
            headerMap,
            {
              'Extraction Status':
                'FAILED',

              'Extraction Error':
                message,

              'Extracted At':
                new Date()
            }
          );

        return {
          success: false,

          payslipId:
            normalizedPayslipId,

          rowNumber:
            rowNumber,

          error:
            message,

          extractionStatus:
            'FAILED',

          processedAt:
            new Date().toISOString()
        };
      }
    },

    /**
     * Processes several payslips.
     *
     * Use a small limit initially because PDF conversion
     * consumes Apps Script execution time.
     *
     * @param {Object=} options Options.
     * @return {Object} Batch result.
     */
    processBatch: function(options) {
      const config =
        Object.assign(
          {
            limit: 5,
            onlyUnprocessed: true
          },
          options || {}
        );

      const limit =
        Math.max(
          1,
          Math.min(
            Number(config.limit) || 5,
            10
          )
        );

      const sheet =
        PayTrackerPayrollPayslipProcessingService
          .getRegisterSheet_();

      const headerMap =
        PayTrackerPayrollPayslipProcessingService
          .ensureResultHeaders_(
            sheet
          );

      const payslipIdColumn =
        PayTrackerPayrollPayslipProcessingService
          .findHeaderColumn_(
            headerMap,
            [
              'Payslip ID',
              'PayslipId'
            ]
          );

      if (!payslipIdColumn) {
        throw new Error(
          'The Payslip Register does not contain a Payslip ID column.'
        );
      }

      const lastRow =
        sheet.getLastRow();

      if (lastRow <= 1) {
        return {
          success: true,
          processed: 0,
          completed: 0,
          failed: 0,
          results: []
        };
      }

      const results = [];

      for (
        let rowNumber = 2;
        rowNumber <= lastRow &&
        results.length < limit;
        rowNumber += 1
      ) {
        const payslipId =
          String(
            sheet
              .getRange(
                rowNumber,
                payslipIdColumn
              )
              .getValue() || ''
          ).trim();

        if (!payslipId) {
          continue;
        }

        if (config.onlyUnprocessed) {
          const currentStatus =
            String(
              PayTrackerPayrollPayslipProcessingService
                .getCellValue_(
                  sheet,
                  rowNumber,
                  headerMap,
                  [
                    'Extraction Status'
                  ]
                ) || ''
            )
              .trim()
              .toUpperCase();

          if (
            currentStatus ===
            'COMPLETED'
          ) {
            continue;
          }
        }

        results.push(
          PayTrackerPayrollPayslipProcessingService
            .processPayslip(
              payslipId
            )
        );
      }

      return {
        success: true,

        processed:
          results.length,

        completed:
          results.filter(
            function(result) {
              return result.success === true;
            }
          ).length,

        failed:
          results.filter(
            function(result) {
              return result.success !== true;
            }
          ).length,

        results:
          results
      };
    },

    /**
     * Copies previously extracted values into the canonical
     * Payslip Register columns used by the Payroll Centre.
     *
     * This does not read PDFs or overwrite extracted values.
     *
     * @return {Object} Backfill result.
     */
    backfillCanonicalFields: function() {
      const sheet =
        PayTrackerPayrollPayslipProcessingService
          .getRegisterSheet_();

      const headerMap =
        PayTrackerPayrollPayslipProcessingService
          .ensureResultHeaders_(
            sheet
          );

      const lastRow =
        sheet.getLastRow();

      let checked = 0;
      let updated = 0;
      let skipped = 0;

      for (
        let rowNumber = 2;
        rowNumber <= lastRow;
        rowNumber += 1
      ) {
        const extractionStatus =
          String(
            PayTrackerPayrollPayslipProcessingService
              .getCellValue_(
                sheet,
                rowNumber,
                headerMap,
                [
                  'Extraction Status'
                ]
              ) || ''
          )
            .trim()
            .toUpperCase();

        if (extractionStatus !== 'COMPLETED') {
          skipped += 1;
          continue;
        }

        checked += 1;

        const grossPay =
          PayTrackerPayrollPayslipProcessingService
            .toNullableNumber_(
              PayTrackerPayrollPayslipProcessingService
                .getCellValue_(
                  sheet,
                  rowNumber,
                  headerMap,
                  [
                    'Actual Gross Pay'
                  ]
                )
            );

        const netPay =
          PayTrackerPayrollPayslipProcessingService
            .toNullableNumber_(
              PayTrackerPayrollPayslipProcessingService
                .getCellValue_(
                  sheet,
                  rowNumber,
                  headerMap,
                  [
                    'Actual Net Pay'
                  ]
                )
            );

        if (
          grossPay === null &&
          netPay === null
        ) {
          skipped += 1;
          continue;
        }

        const incomeTax =
          PayTrackerPayrollPayslipProcessingService
            .toNullableNumber_(
              PayTrackerPayrollPayslipProcessingService
                .getCellValue_(
                  sheet,
                  rowNumber,
                  headerMap,
                  [
                    'Actual Income Tax'
                  ]
                )
            );

        const nationalInsurance =
          PayTrackerPayrollPayslipProcessingService
            .toNullableNumber_(
              PayTrackerPayrollPayslipProcessingService
                .getCellValue_(
                  sheet,
                  rowNumber,
                  headerMap,
                  [
                    'Actual National Insurance'
                  ]
                )
            );

        const pension =
          PayTrackerPayrollPayslipProcessingService
            .toNullableNumber_(
              PayTrackerPayrollPayslipProcessingService
                .getCellValue_(
                  sheet,
                  rowNumber,
                  headerMap,
                  [
                    'Actual Pension'
                  ]
                )
            );

        const studentLoan =
          PayTrackerPayrollPayslipProcessingService
            .toNullableNumber_(
              PayTrackerPayrollPayslipProcessingService
                .getCellValue_(
                  sheet,
                  rowNumber,
                  headerMap,
                  [
                    'Actual Student Loan'
                  ]
                )
            );

        const totalDeductions =
          PayTrackerPayrollPayslipProcessingService
            .toNullableNumber_(
              PayTrackerPayrollPayslipProcessingService
                .getCellValue_(
                  sheet,
                  rowNumber,
                  headerMap,
                  [
                    'Actual Total Deductions'
                  ]
                )
            );

        PayTrackerPayrollPayslipProcessingService
          .writeValues_(
            sheet,
            rowNumber,
            headerMap,
            {
              'Pay Date':
                PayTrackerPayrollPayslipProcessingService
                  .getCellValue_(
                    sheet,
                    rowNumber,
                    headerMap,
                    [
                      'Actual Pay Date'
                    ]
                  ),

              'Gross Pay Actual':
                grossPay,

              'Net Pay Actual':
                netPay,

              'Tax Actual':
                incomeTax,

              'National Insurance Actual':
                nationalInsurance,

              'Pension Actual':
                pension,

              'Student Loan Actual':
                studentLoan,

              'Other Deductions Actual':
                PayTrackerPayrollPayslipProcessingService
                  .calculateOtherDeductions_(
                    totalDeductions,
                    incomeTax,
                    nationalInsurance,
                    pension,
                    studentLoan
                  ),

              'Import Status':
                'Complete'
            }
          );

        updated += 1;
      }

      SpreadsheetApp.flush();

      return {
        success: true,
        checked: checked,
        updated: updated,
        skipped: skipped,
        totalRows:
          Math.max(
            lastRow - 1,
            0
          ),
        completedAt:
          new Date().toISOString()
      };
    },

    /**
     * Adds any result headers that do not exist.
     *
     * Existing data and columns are preserved.
     *
     * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
     * @return {Object} Header map.
     * @private
     */
    ensureResultHeaders_: function(sheet) {
      let headerMap =
        PayTrackerPayrollPayslipProcessingService
          .buildHeaderMap_(
            sheet
          );

      const missingHeaders =
        PayTrackerPayrollPayslipProcessingService
          .RESULT_HEADERS
          .filter(function(header) {
            return !headerMap[header];
          });

      if (missingHeaders.length) {
        const startColumn =
          Math.max(
            1,
            sheet.getLastColumn() + 1
          );

        sheet
          .getRange(
            1,
            startColumn,
            1,
            missingHeaders.length
          )
          .setValues([
            missingHeaders
          ])
          .setFontWeight('bold');

        headerMap =
          PayTrackerPayrollPayslipProcessingService
            .buildHeaderMap_(
              sheet
            );
      }

      PayTrackerPayrollPayslipProcessingService
        .applyResultColumnFormats_(
          sheet,
          headerMap
        );

      return headerMap;
    },

    /**
     * Applies explicit formats to extracted-result columns.
     *
     * New columns can inherit the date format of the
     * preceding Updated At column, so each result column
     * must receive its intended format.
     *
     * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
     * @param {Object} headerMap Header map.
     * @private
     */
    applyResultColumnFormats_: function(
      sheet,
      headerMap
    ) {
      const dataRowCount =
        Math.max(
          sheet.getMaxRows() - 1,
          1
        );

      const applyFormat =
        function(
          headers,
          numberFormat
        ) {
          headers.forEach(function(header) {
            const column =
              headerMap[header];

            if (!column) {
              return;
            }

            sheet
              .getRange(
                2,
                column,
                dataRowCount,
                1
              )
              .setNumberFormat(
                numberFormat
              );
          });
        };

      applyFormat(
        [
          'Gross Pay Actual',
          'Net Pay Actual',
          'Tax Actual',
          'National Insurance Actual',
          'Pension Actual',
          'Student Loan Actual',
          'Other Deductions Actual',
          'Actual Gross Pay',
          'Actual Taxable Pay',
          'Actual Income Tax',
          'Actual National Insurance',
          'Actual Pension',
          'Actual Student Loan',
          'Actual Total Deductions',
          'Actual Net Pay'
        ],
        '£#,##0.00;[Red]-£#,##0.00'
      );

      applyFormat(
        [
          'Actual Total Hours',
          'Actual Basic Hours',
          'Actual Enhanced Hours',
          'Actual Unsocial Hours',
          'Actual Overtime Hours',
          'Actual Holiday Hours'
        ],
        '0.00'
      );

      applyFormat(
        [
          'Timesheet Entry Count',
          'Parser Confidence'
        ],
        '0'
      );

      applyFormat(
        [
          'Actual Pay Date'
        ],
        'dd mmm yyyy'
      );

      applyFormat(
        [
          'Extracted At'
        ],
        'dd mmm yyyy hh:mm'
      );
    },

    /**
     * Builds header-name to column-number mapping.
     *
     * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
     * @return {Object} Header map.
     * @private
     */
    buildHeaderMap_: function(sheet) {
      const lastColumn =
        Math.max(
          sheet.getLastColumn(),
          1
        );

      const headers =
        sheet
          .getRange(
            1,
            1,
            1,
            lastColumn
          )
          .getValues()[0];

      const map = {};

      headers.forEach(
        function(header, index) {
          const name =
            String(
              header || ''
            ).trim();

          if (name) {
            map[name] =
              index + 1;
          }
        }
      );

      return map;
    },

    /**
     * Finds a registered payslip row.
     *
     * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
     * @param {Object} headerMap Header map.
     * @param {string} payslipId Payslip ID.
     * @return {number|null} Row.
     * @private
     */
    findRowByPayslipId_: function(
      sheet,
      headerMap,
      payslipId
    ) {
      const column =
        PayTrackerPayrollPayslipProcessingService
          .findHeaderColumn_(
            headerMap,
            [
              'Payslip ID',
              'PayslipId'
            ]
          );

      if (!column) {
        throw new Error(
          'The Payslip Register does not contain a Payslip ID column.'
        );
      }

      if (sheet.getLastRow() <= 1) {
        return null;
      }

      const values =
        sheet
          .getRange(
            2,
            column,
            sheet.getLastRow() - 1,
            1
          )
          .getValues();

      for (
        let index = 0;
        index < values.length;
        index += 1
      ) {
        if (
          String(
            values[index][0] || ''
          ).trim() === payslipId
        ) {
          return index + 2;
        }
      }

      return null;
    },

    /**
     * Writes values using header names.
     *
     * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
     * @param {number} rowNumber Row.
     * @param {Object} headerMap Header map.
     * @param {Object} values Values.
     * @private
     */
    writeValues_: function(
      sheet,
      rowNumber,
      headerMap,
      values
    ) {
      Object.keys(
        values || {}
      ).forEach(function(header) {
        const column =
          headerMap[header];

        if (!column) {
          return;
        }

        const value =
          values[header];

        sheet
          .getRange(
            rowNumber,
            column
          )
          .setValue(
            value === undefined ||
            value === null
              ? ''
              : value
          );
      });
    },

    /**
     * Reads a value using alternative header names.
     *
     * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
     * @param {number} rowNumber Row.
     * @param {Object} headerMap Header map.
     * @param {Array<string>} names Header names.
     * @return {*} Value.
     * @private
     */
    getCellValue_: function(
      sheet,
      rowNumber,
      headerMap,
      names
    ) {
      const column =
        PayTrackerPayrollPayslipProcessingService
          .findHeaderColumn_(
            headerMap,
            names
          );

      return column
        ? sheet
            .getRange(
              rowNumber,
              column
            )
            .getValue()
        : '';
    },

    /**
     * Finds the first matching header.
     *
     * @param {Object} headerMap Header map.
     * @param {Array<string>} names Alternatives.
     * @return {number|null} Column.
     * @private
     */
    findHeaderColumn_: function(
      headerMap,
      names
    ) {
      for (
        let index = 0;
        index < names.length;
        index += 1
      ) {
        if (headerMap[names[index]]) {
          return headerMap[names[index]];
        }
      }

      return null;
    },

    /**
     * Gets unique parsed references.
     *
     * @param {Array<Object>} entries Entries.
     * @return {Array<string>} References.
     * @private
     */
    getUniqueReferences_: function(entries) {
      return Array.from(
        new Set(
          (entries || [])
            .map(function(entry) {
              return String(
                entry.reference || ''
              ).trim();
            })
            .filter(Boolean)
        )
      );
    },

    /**
     * Gets the register sheet.
     *
     * @return {GoogleAppsScript.Spreadsheet.Sheet} Sheet.
     * @private
     */
    getRegisterSheet_: function() {
      const spreadsheet =
        SpreadsheetApp
          .getActiveSpreadsheet();

      if (!spreadsheet) {
        throw new Error(
          'No active spreadsheet is available.'
        );
      }

      const sheet =
        spreadsheet.getSheetByName(
          PayTrackerPayrollPayslipProcessingService
            .REGISTER_SHEET_NAME
        );

      if (!sheet) {
        throw new Error(
          'Payslip Register sheet was not found.'
        );
      }

      return sheet;
    },

    /**
     * Converts an ISO date to a sheet date.
     *
     * @param {*} value Value.
     * @return {Date|string} Date or blank.
     * @private
     */
    toSheetDate_: function(value) {
      if (!value) {
        return '';
      }

      const match =
        String(value)
          .match(
            /^(\d{4})-(\d{2})-(\d{2})$/
          );

      if (match) {
        return new Date(
          Number(match[1]),
          Number(match[2]) - 1,
          Number(match[3])
        );
      }

      const date =
        new Date(value);

      return Number.isNaN(
        date.getTime()
      )
        ? ''
        : date;
    },

    /**
     * Returns first available non-empty value.
     *
     * @param {...*} values Values.
     * @return {*} Value.
     * @private
     */
    firstAvailable_: function() {
      const values =
        Array.prototype.slice.call(
          arguments
        );

      for (
        let index = 0;
        index < values.length;
        index += 1
      ) {
        if (
          values[index] !== undefined &&
          values[index] !== null &&
          values[index] !== ''
        ) {
          return values[index];
        }
      }

      return null;
    },

    /**
     * Calculates deductions not represented by the
     * standard tax, NI, pension and student-loan fields.
     *
     * @param {*} totalDeductions Total deductions.
     * @param {*} incomeTax Income tax.
     * @param {*} nationalInsurance National Insurance.
     * @param {*} pension Pension.
     * @param {*} studentLoan Student loan.
     * @return {number|null} Other deductions.
     * @private
     */
    calculateOtherDeductions_: function(
      totalDeductions,
      incomeTax,
      nationalInsurance,
      pension,
      studentLoan
    ) {
      const total =
        PayTrackerPayrollPayslipProcessingService
          .toNullableNumber_(
            totalDeductions
          );

      if (total === null) {
        return null;
      }

      const knownDeductions = [
        incomeTax,
        nationalInsurance,
        pension,
        studentLoan
      ].reduce(function(sum, value) {
        const amount =
          PayTrackerPayrollPayslipProcessingService
            .toNullableNumber_(
              value
            );

        return (
          sum +
          (
            amount === null
              ? 0
              : amount
          )
        );
      }, 0);

      return Math.round(
        (
          total -
          knownDeductions
        ) *
        100
      ) / 100;
    },

    /**
     * Converts a value to a nullable number.
     *
     * @param {*} value Value.
     * @return {number|null} Number.
     * @private
     */
    toNullableNumber_: function(value) {
      if (
        value === undefined ||
        value === null ||
        value === ''
      ) {
        return null;
      }

      if (value instanceof Date) {
        return Math.round(
          (
            (
              value.getTime() /
              86400000
            ) +
            25569
          ) *
          1000000
        ) / 1000000;
      }

      const number =
        Number(
          String(value)
            .replace(/[£,\s]/g, '')
        );

      return Number.isFinite(number)
        ? number
        : null;
    },

    /**
     * Normalizes required text.
     *
     * @param {*} value Value.
     * @param {string} label Label.
     * @return {string} Text.
     * @private
     */
    normalizeRequiredText_: function(
      value,
      label
    ) {
      const text =
        String(
          value === undefined ||
          value === null
            ? ''
            : value
        ).trim();

      if (!text) {
        throw new Error(
          label +
          ' is required.'
        );
      }

      return text;
    },

    /**
     * Returns a safe error message.
     *
     * @param {*} error Error.
     * @return {string} Message.
     * @private
     */
    getErrorMessage_: function(error) {
      return (
        error &&
        error.message
      )
        ? String(error.message)
        : String(
            error ||
            'Unknown payslip processing error.'
          );
    }
  });


/**
 * Processes one real Payslip Register record.
 *
 * Replace the value with a Payslip ID from column A,
 * not the Drive File ID.
 */
function testPayTrackerProcessOnePayslip() {
  const payslipId =
    'PAYSLIP-20260722235416-E35FE249';

  const result =
    PayTrackerPayrollPayslipProcessingService
      .processPayslip(
        payslipId
      );

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


/**
 * Processes up to three unprocessed payslips.
 */
function testPayTrackerProcessPayslipBatch() {
  const result =
    PayTrackerPayrollPayslipProcessingService
      .processBatch({
        limit: 10,
        onlyUnprocessed: true
      });

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


/**
 * Backfills canonical Payroll Centre values from records
 * that have already completed PDF extraction.
 */
function backfillPayTrackerProcessedPayslips() {
  const result =
    PayTrackerPayrollPayslipProcessingService
      .backfillCanonicalFields();

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}
