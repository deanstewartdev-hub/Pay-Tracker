/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Payroll/PayrollCentreController.gs
 *
 * Purpose:
 * - Provide the Payroll Centre frontend API
 * - Return payslip dashboard summaries
 * - Return searchable payslip records
 * - Return individual payslip details
 * - Run a manual Gmail scan from the web application
 * - Return recent Gmail scan history
 * - Convert Apps Script values into browser-safe objects
 *
 * Important:
 * - The frontend never accesses Sheets directly
 * - The frontend never accesses Gmail directly
 * - The frontend never accesses Drive directly
 * - PDF binary data is never sent to the browser
 *******************************************************/

const PayTrackerPayrollCentreController = Object.freeze({
  VERSION: '2.8.0',

  DEFAULT_RECORD_LIMIT: 100,

  MAX_RECORD_LIMIT: 500,

  /**
   * Returns the complete initial Payroll Centre model.
   *
   * @param {Object=} options Optional filters.
   * @return {Object} Payroll Centre model.
   */
  getWorkspace: function(options) {
    const request =
      PayTrackerPayrollCentreController
        .normalizeListOptions(
          options
        );

    const allPayslips =
      PayTrackerPayslipRepository
        .getAll();

    const filteredPayslips =
      PayTrackerPayrollCentreController
        .filterPayslips(
          allPayslips,
          request
        );

    const limitedPayslips =
      filteredPayslips.slice(
        0,
        request.limit
      );

    const groups =
      PayTrackerPayrollGroupRepository
        .getActive();

    const recentScans =
      PayTrackerPayrollCentreController
        .getRecentScans(
          5
        );

    return {
      success:
        true,

      version:
        PayTrackerPayrollCentreController
          .VERSION,

      generatedAt:
        PayTrackerPayrollCentreController
          .serializeDate(
            new Date()
          ),

      summary:
        PayTrackerPayrollCentreController
          .buildSummary(
            allPayslips
          ),

      filters:
        PayTrackerPayrollCentreController
          .buildFilterOptions(
            allPayslips,
            groups
          ),

      appliedFilters:
        request,

      payrollGroups:
        groups.map(function(group) {
          return PayTrackerPayrollCentreController
            .serializePayrollGroup(
              group
            );
        }),

      payslips:
        limitedPayslips.map(function(
          payslip
        ) {
          return PayTrackerPayrollCentreController
            .serializePayslip(
              payslip
            );
        }),

      totalFilteredRecords:
        filteredPayslips.length,

      displayedRecords:
        limitedPayslips.length,

      recentScans:
        recentScans,

      empty:
        allPayslips.length === 0
    };
  },

  /**
   * Returns a filtered payslip list.
   *
   * @param {Object=} options List filters.
   * @return {Object} Payslip-list response.
   */
  getPayslips: function(options) {
    const request =
      PayTrackerPayrollCentreController
        .normalizeListOptions(
          options
        );

    const records =
      PayTrackerPayrollCentreController
        .filterPayslips(
          PayTrackerPayslipRepository
            .getAll(),
          request
        );

    const limitedRecords =
      records.slice(
        0,
        request.limit
      );

    return {
      success:
        true,

      generatedAt:
        PayTrackerPayrollCentreController
          .serializeDate(
            new Date()
          ),

      appliedFilters:
        request,

      totalRecords:
        records.length,

      displayedRecords:
        limitedRecords.length,

      payslips:
        limitedRecords.map(function(
          payslip
        ) {
          return PayTrackerPayrollCentreController
            .serializePayslip(
              payslip
            );
        })
    };
  },

  /**
   * Returns one payslip with related Payroll Group data.
   *
   * @param {string} payslipId Payslip ID.
   * @return {Object} Payslip detail response.
   */
  getPayslip: function(payslipId) {
    const normalizedId =
      PayTrackerPayrollCentreController
        .cleanText(
          payslipId
        );

    if (!normalizedId) {
      throw new Error(
        'Payslip ID is required.'
      );
    }

    const payslip =
      PayTrackerPayslipRepository
        .getById(
          normalizedId
        );

    if (!payslip) {
      throw new Error(
        'Payslip "' +
        normalizedId +
        '" was not found.'
      );
    }

    const group =
      PayTrackerPayrollGroupRepository
        .getById(
          payslip.payrollGroupId,
          true
        );

    const driveMetadata =
      payslip.driveFileId
        ? PayTrackerPayrollDriveService
            .getFileMetadata(
              payslip.driveFileId
            )
        : null;

    const comparison = {
      success:
        true,

      status:
        payslip.comparisonStatus ||
        PayTrackerPayrollConfig
          .COMPARISON_STATUSES
          .NOT_READY,

      score:
        PayTrackerPayrollCentreController
          .toNumber(
            payslip.matchConfidence
          ),

      totals:
        {
          expectedGross:
            PayTrackerPayrollCentreController
              .roundCurrency(
                payslip.predictedGross
              ),

          actualGross:
            PayTrackerPayrollCentreController
              .roundCurrency(
                payslip.grossPayActual
              ),

          grossDifference:
            PayTrackerPayrollCentreController
              .roundCurrency(
                payslip.grossDifference
              ),

          expectedNet:
            PayTrackerPayrollCentreController
              .roundCurrency(
                payslip.predictedTakeHome
              ),

          actualNet:
            PayTrackerPayrollCentreController
              .roundCurrency(
                payslip.netPayActual
              ),

          netDifference:
            PayTrackerPayrollCentreController
              .roundCurrency(
                payslip.netDifference
              )
        },

      comparisonMessage:
        payslip.matchReason ||
        'This payslip has not been compared yet.'
    };

    return {
      success:
        true,

      generatedAt:
        PayTrackerPayrollCentreController
          .serializeDate(
            new Date()
          ),

      payslip:
        PayTrackerPayrollCentreController
          .serializePayslip(
            payslip
          ),

      extraction:
        PayTrackerPayrollCentreController
          .getPayslipExtraction(
            payslip
          ),

      comparison:
        comparison,

      payrollGroup:
        group
          ? PayTrackerPayrollCentreController
              .serializePayrollGroup(
                group
              )
          : null,

      driveFile:
        driveMetadata
          ? PayTrackerPayrollCentreController
              .serializeDriveFile(
                driveMetadata
              )
          : null
    };
  },

  /**
   * Returns the extracted payroll values stored beside a
   * registered payslip.
   *
   * The processing service appends these fields by header
   * name. Reading by header keeps this controller compatible
   * with existing registers and future column additions.
   *
   * @param {Object} payslip Payslip register record.
   * @return {Object|null} Browser-safe extraction details.
   */
  getPayslipExtraction: function(payslip) {
    const value =
      payslip || {};

    const spreadsheet =
      SpreadsheetApp
        .getActiveSpreadsheet();

    if (!spreadsheet) {
      return null;
    }

    const sheet =
      spreadsheet.getSheetByName(
        PayTrackerPayrollConfig
          .SHEETS
          .PAYSLIP_REGISTER
          .NAME
      );

    if (
      !sheet ||
      sheet.getLastRow() <= 1
    ) {
      return null;
    }

    const lastColumn =
      sheet.getLastColumn();

    const headers =
      sheet
        .getRange(
          1,
          1,
          1,
          lastColumn
        )
        .getDisplayValues()[0];

    const headerMap = {};

    headers.forEach(function(
      header,
      index
    ) {
      const normalizedHeader =
        PayTrackerPayrollCentreController
          .normalizeText(
            header
          );

      if (normalizedHeader) {
        headerMap[normalizedHeader] =
          index;
      }
    });

    let rowNumber =
      PayTrackerPayrollCentreController
        .toNumber(
          value.rowNumber
        );

    if (
      rowNumber <= 1 ||
      rowNumber > sheet.getLastRow()
    ) {
      const payslipIdColumn =
        headerMap[
          PayTrackerPayrollCentreController
            .normalizeText(
              'Payslip ID'
            )
        ];

      if (
        payslipIdColumn === undefined
      ) {
        return null;
      }

      const identifiers =
        sheet
          .getRange(
            2,
            payslipIdColumn + 1,
            sheet.getLastRow() - 1,
            1
          )
          .getDisplayValues();

      const normalizedPayslipId =
        PayTrackerPayrollCentreController
          .normalizeText(
            value.payslipId
          );

      for (
        let index = 0;
        index !== identifiers.length;
        index += 1
      ) {
        if (
          PayTrackerPayrollCentreController
            .normalizeText(
              identifiers[index][0]
            ) === normalizedPayslipId
        ) {
          rowNumber =
            index + 2;
          break;
        }
      }
    }

    if (
      rowNumber <= 1 ||
      rowNumber > sheet.getLastRow()
    ) {
      return null;
    }

    const row =
      sheet
        .getRange(
          rowNumber,
          1,
          1,
          lastColumn
        )
        .getValues()[0];

    const read = function(header) {
      const index =
        headerMap[
          PayTrackerPayrollCentreController
            .normalizeText(
              header
            )
        ];

      return index === undefined
        ? ''
        : row[index];
    };

    const status =
      PayTrackerPayrollCentreController
        .cleanText(
          read(
            'Extraction Status'
          )
        );

    if (!status) {
      return null;
    }

    return {
      status:
        status,

      error:
        PayTrackerPayrollCentreController
          .cleanText(
            read(
              'Extraction Error'
            )
          ),

      extractedAt:
        PayTrackerPayrollCentreController
          .serializeDate(
            read(
              'Extracted At'
            )
          ),

      provider:
        PayTrackerPayrollCentreController
          .cleanText(
            read(
              'Provider'
            )
          ),

      employerName:
        PayTrackerPayrollCentreController
          .cleanText(
            read(
              'Employer Name'
            )
          ),

      employeeName:
        PayTrackerPayrollCentreController
          .cleanText(
            read(
              'Employee Name'
            )
          ),

      payrollNumber:
        PayTrackerPayrollCentreController
          .cleanText(
            read(
              'Payroll Number'
            )
          ),

      nationalInsuranceNumber:
        PayTrackerPayrollCentreController
          .cleanText(
            read(
              'NI Number'
            )
          ),

      taxCode:
        PayTrackerPayrollCentreController
          .cleanText(
            read(
              'Tax Code'
            )
          ),

      payPeriod:
        PayTrackerPayrollCentreController
          .cleanText(
            read(
              'Pay Period'
            )
          ),

      payDate:
        PayTrackerPayrollCentreController
          .serializeDate(
            read(
              'Actual Pay Date'
            )
          ),

      grossPay:
        PayTrackerPayrollCentreController
          .roundCurrency(
            read(
              'Actual Gross Pay'
            )
          ),

      taxablePay:
        PayTrackerPayrollCentreController
          .roundCurrency(
            read(
              'Actual Taxable Pay'
            )
          ),

      incomeTax:
        PayTrackerPayrollCentreController
          .roundCurrency(
            read(
              'Actual Income Tax'
            )
          ),

      nationalInsurance:
        PayTrackerPayrollCentreController
          .roundCurrency(
            read(
              'Actual National Insurance'
            )
          ),

      pension:
        PayTrackerPayrollCentreController
          .roundCurrency(
            read(
              'Actual Pension'
            )
          ),

      studentLoan:
        PayTrackerPayrollCentreController
          .roundCurrency(
            read(
              'Actual Student Loan'
            )
          ),

      totalDeductions:
        PayTrackerPayrollCentreController
          .roundCurrency(
            read(
              'Actual Total Deductions'
            )
          ),

      netPay:
        PayTrackerPayrollCentreController
          .roundCurrency(
            read(
              'Actual Net Pay'
            )
          ),

      totalHours:
        PayTrackerPayrollCentreController
          .toNumber(
            read(
              'Actual Total Hours'
            )
          ),

      basicHours:
        PayTrackerPayrollCentreController
          .toNumber(
            read(
              'Actual Basic Hours'
            )
          ),

      enhancedHours:
        PayTrackerPayrollCentreController
          .toNumber(
            read(
              'Actual Enhanced Hours'
            )
          ),

      unsocialHours:
        PayTrackerPayrollCentreController
          .toNumber(
            read(
              'Actual Unsocial Hours'
            )
          ),

      overtimeHours:
        PayTrackerPayrollCentreController
          .toNumber(
            read(
              'Actual Overtime Hours'
            )
          ),

      holidayHours:
        PayTrackerPayrollCentreController
          .toNumber(
            read(
              'Actual Holiday Hours'
            )
          ),

      timesheetEntryCount:
        PayTrackerPayrollCentreController
          .toNumber(
            read(
              'Timesheet Entry Count'
            )
          ),

      timesheetReferences:
        PayTrackerPayrollCentreController
          .cleanText(
            read(
              'Timesheet References'
            )
          ),

      classificationStatus:
        PayTrackerPayrollCentreController
          .cleanText(
            read(
              'Timesheet Classification Status'
            )
          ),

      parserType:
        PayTrackerPayrollCentreController
          .cleanText(
            read(
              'Parser Type'
            )
          ),

      parserConfidence:
        PayTrackerPayrollCentreController
          .toNumber(
            read(
              'Parser Confidence'
            )
          )
    };
  },

  /**
   * Runs a manual Gmail scan from the web application.
   *
   * @param {Object=} options Scan options.
   * @return {Object} Safe scan response.
   */
  scanGmail: function(options) {
    const input =
      options || {};

    const result =
      PayTrackerPayslipImportService
        .scanGmail({
          lookbackDays:
            PayTrackerPayrollCentreController
              .toPositiveNumber(
                input.lookbackDays,
                365
              ),

          maxThreads:
            PayTrackerPayrollCentreController
              .toPositiveNumber(
                input.maxThreads,
                100
              ),

          searchStartDate:
            input.searchStartDate || '',

          searchEndDate:
            input.searchEndDate || '',

          additionalQuery:
            PayTrackerPayrollCentreController
              .cleanText(
                input.additionalQuery
              )
        });

    return {
      success:
        result.success === true,

      scanId:
        result.scanId || '',

      startedAt:
        PayTrackerPayrollCentreController
          .serializeDate(
            result.startedAt
          ),

      completedAt:
        PayTrackerPayrollCentreController
          .serializeDate(
            result.completedAt
          ),

      query:
        result.query || '',

      threadsFound:
        PayTrackerPayrollCentreController
          .toNumber(
            result.threadsFound
          ),

      messagesChecked:
        PayTrackerPayrollCentreController
          .toNumber(
            result.messagesChecked
          ),

      messagesMatched:
        PayTrackerPayrollCentreController
          .toNumber(
            result.messagesMatched
          ),

      pdfAttachmentsFound:
        PayTrackerPayrollCentreController
          .toNumber(
            result.pdfAttachmentsFound
          ),

      payslipsImported:
        PayTrackerPayrollCentreController
          .toNumber(
            result.payslipsImported
          ),

      duplicatesSkipped:
        PayTrackerPayrollCentreController
          .toNumber(
            result.duplicatesSkipped
          ),

      errors:
        Array.isArray(result.errors)
          ? result.errors.slice()
          : [],

      importedPayslips:
        Array.isArray(
          result.importedPayslips
        )
          ? result.importedPayslips.map(
              function(payslip) {
                return PayTrackerPayrollCentreController
                  .serializePayslip(
                    payslip
                  );
              }
            )
          : []
    };
  },

  /**
   * Returns recent Payroll Scan History records.
   *
   * @param {number=} limit Number of records.
   * @return {Array<Object>} Recent scans.
   */
  getRecentScans: function(limit) {
    const requestedLimit =
      Math.min(
        PayTrackerPayrollCentreController
          .toPositiveNumber(
            limit,
            5
          ),
        50
      );

    const spreadsheet =
      SpreadsheetApp
        .getActiveSpreadsheet();

    if (!spreadsheet) {
      return [];
    }

    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYROLL_SCAN_HISTORY;

    const sheet =
      spreadsheet.getSheetByName(
        definition.NAME
      );

    if (
      !sheet ||
      sheet.getLastRow() <= 1
    ) {
      return [];
    }

    const rows =
      sheet
        .getRange(
          2,
          1,
          sheet.getLastRow() - 1,
          definition.HEADERS.length
        )
        .getValues();

    const scans =
      rows
        .map(function(row) {
          return PayTrackerPayrollCentreController
            .rowToScan(
              row,
              definition.HEADERS
            );
        })
        .filter(function(scan) {
          return Boolean(
            scan.scanId
          );
        });

    scans.sort(function(left, right) {
      return (
        PayTrackerPayrollCentreController
          .dateToTime(
            right.startedAt
          ) -
        PayTrackerPayrollCentreController
          .dateToTime(
            left.startedAt
          )
      );
    });

    return scans
      .slice(
        0,
        requestedLimit
      )
      .map(function(scan) {
        return PayTrackerPayrollCentreController
          .serializeScan(
            scan
          );
      });
  },

  /**
   * Builds summary cards from all imported payslips.
   *
   * @param {Array<Object>} payslips Payslips.
   * @return {Object} Summary.
   */
  buildSummary: function(payslips) {
    const records =
      Array.isArray(payslips)
        ? payslips
        : [];

    const totalGross =
      records.reduce(function(
        total,
        record
      ) {
        return (
          total +
          PayTrackerPayrollCentreController
            .toNumber(
              record.grossPayActual
            )
        );
      }, 0);

    const totalNet =
      records.reduce(function(
        total,
        record
      ) {
        return (
          total +
          PayTrackerPayrollCentreController
            .toNumber(
              record.netPayActual
            )
        );
      }, 0);

    const comparisonCounts = {
      matched: 0,
      minor: 0,
      review: 0,
      major: 0,
      notCompared: 0
    };

    records.forEach(function(record) {
      const normalizedStatus =
        PayTrackerPayrollCentreController
          .normalizeText(
            record.comparisonStatus
          );

      if (
        normalizedStatus ===
        PayTrackerPayrollCentreController
          .normalizeText(
            PayTrackerPayrollConfig
              .COMPARISON_STATUSES
              .MATCHED
          )
      ) {
        comparisonCounts.matched += 1;
      } else if (
        normalizedStatus ===
        PayTrackerPayrollCentreController
          .normalizeText(
            PayTrackerPayrollConfig
              .COMPARISON_STATUSES
              .MINOR
          )
      ) {
        comparisonCounts.minor += 1;
      } else if (
        normalizedStatus ===
        PayTrackerPayrollCentreController
          .normalizeText(
            PayTrackerPayrollConfig
              .COMPARISON_STATUSES
              .REVIEW
          )
      ) {
        comparisonCounts.review += 1;
      } else if (
        normalizedStatus ===
        PayTrackerPayrollCentreController
          .normalizeText(
            PayTrackerPayrollConfig
              .COMPARISON_STATUSES
              .MAJOR
          )
      ) {
        comparisonCounts.major += 1;
      } else {
        comparisonCounts.notCompared += 1;
      }
    });

    const latestPayslip =
      records.length
        ? records[0]
        : null;

    const payslipsWithGross =
      records.filter(function(record) {
        return (
          PayTrackerPayrollCentreController
            .toNumber(
              record.grossPayActual
            ) !== 0
        );
      });

    const payslipsWithNet =
      records.filter(function(record) {
        return (
          PayTrackerPayrollCentreController
            .toNumber(
              record.netPayActual
            ) !== 0
        );
      });

    return {
      totalPayslips:
        records.length,

      totalGross:
        PayTrackerPayrollCentreController
          .roundCurrency(
            totalGross
          ),

      totalNet:
        PayTrackerPayrollCentreController
          .roundCurrency(
            totalNet
          ),

      averageGross:
        payslipsWithGross.length
          ? PayTrackerPayrollCentreController
              .roundCurrency(
                totalGross /
                payslipsWithGross.length
              )
          : 0,

      averageNet:
        payslipsWithNet.length
          ? PayTrackerPayrollCentreController
              .roundCurrency(
                totalNet /
                payslipsWithNet.length
              )
          : 0,

      latestPayslip:
        latestPayslip
          ? PayTrackerPayrollCentreController
              .serializePayslip(
                latestPayslip
              )
          : null,

      comparisonCounts:
        comparisonCounts,

      requiresReview:
        comparisonCounts.review +
        comparisonCounts.major,

      importedCount:
        records.filter(function(record) {
          const normalizedStatus =
            PayTrackerPayrollCentreController
              .normalizeText(
                record.importStatus
              );

          return Boolean(
            record.driveFileId ||
            normalizedStatus ===
              PayTrackerPayrollCentreController
                .normalizeText(
                  PayTrackerPayrollConfig
                    .IMPORT_STATUSES
                    .REGISTERED
                ) ||
            normalizedStatus ===
              PayTrackerPayrollCentreController
                .normalizeText(
                  PayTrackerPayrollConfig
                    .IMPORT_STATUSES
                    .COMPLETE
                )
          );
        }).length
    };
  },

  /**
   * Builds frontend filter choices.
   *
   * @param {Array<Object>} payslips Payslips.
   * @param {Array<Object>} groups Payroll Groups.
   * @return {Object} Filter choices.
   */
  buildFilterOptions: function(
    payslips,
    groups
  ) {
    return {
      payrollGroups:
        groups.map(function(group) {
          return {
            value:
              group.payrollGroupId,

            label:
              group.payrollGroupName
          };
        }),

      importStatuses:
        PayTrackerPayrollCentreController
          .objectValues(
            PayTrackerPayrollConfig
              .IMPORT_STATUSES
          ),

      comparisonStatuses:
        PayTrackerPayrollCentreController
          .objectValues(
            PayTrackerPayrollConfig
              .COMPARISON_STATUSES
          ),

      sourceTypes:
        PayTrackerPayrollCentreController
          .uniqueTextValues(
            payslips.map(function(
              payslip
            ) {
              return payslip.sourceType;
            })
          )
    };
  },

  /**
   * Applies frontend search and filter options.
   *
   * @param {Array<Object>} payslips Payslips.
   * @param {Object} options Filters.
   * @return {Array<Object>} Filtered payslips.
   */
  filterPayslips: function(
    payslips,
    options
  ) {
    const request =
      options || {};

    return payslips.filter(function(
      payslip
    ) {
      if (
        request.payrollGroupId &&
        PayTrackerPayrollCentreController
          .normalizeText(
            payslip.payrollGroupId
          ) !==
        PayTrackerPayrollCentreController
          .normalizeText(
            request.payrollGroupId
          )
      ) {
        return false;
      }

      if (
        request.importStatus &&
        PayTrackerPayrollCentreController
          .normalizeText(
            payslip.importStatus
          ) !==
        PayTrackerPayrollCentreController
          .normalizeText(
            request.importStatus
          )
      ) {
        return false;
      }

      if (
        request.comparisonStatus &&
        PayTrackerPayrollCentreController
          .normalizeText(
            payslip.comparisonStatus
          ) !==
        PayTrackerPayrollCentreController
          .normalizeText(
            request.comparisonStatus
          )
      ) {
        return false;
      }

      if (
        request.sourceType &&
        PayTrackerPayrollCentreController
          .normalizeText(
            payslip.sourceType
          ) !==
        PayTrackerPayrollCentreController
          .normalizeText(
            request.sourceType
          )
      ) {
        return false;
      }

      if (
        request.search &&
        !PayTrackerPayrollCentreController
          .payslipMatchesSearch(
            payslip,
            request.search
          )
      ) {
        return false;
      }

      if (
        request.dateFrom &&
        PayTrackerPayrollCentreController
          .getEffectivePayslipTime(
            payslip
          ) <
        request.dateFrom.getTime()
      ) {
        return false;
      }

      if (request.dateTo) {
        const endOfDay =
          new Date(
            request.dateTo.getTime()
          );

        endOfDay.setHours(
          23,
          59,
          59,
          999
        );

        if (
          PayTrackerPayrollCentreController
            .getEffectivePayslipTime(
              payslip
            ) >
          endOfDay.getTime()
        ) {
          return false;
        }
      }

      return true;
    });
  },

  /**
   * Searches useful payslip text fields.
   *
   * @param {Object} payslip Payslip.
   * @param {string} search Search value.
   * @return {boolean} True when matched.
   */
  payslipMatchesSearch: function(
    payslip,
    search
  ) {
    const target =
      PayTrackerPayrollCentreController
        .normalizeText(
          search
        );

    const searchableText = [
      payslip.payslipId,
      payslip.emailSender,
      payslip.emailSubject,
      payslip.originalFilename,
      payslip.importStatus,
      payslip.comparisonStatus,
      payslip.matchReason,
      payslip.notes
    ]
      .join(' ')
      .toLowerCase();

    return (
      searchableText.indexOf(
        target
      ) !== -1
    );
  },

  /**
   * Normalizes list options.
   *
   * @param {Object=} options Input options.
   * @return {Object} Normalized options.
   */
  normalizeListOptions: function(options) {
    const input =
      options || {};

    let limit =
      PayTrackerPayrollCentreController
        .toPositiveNumber(
          input.limit,
          PayTrackerPayrollCentreController
            .DEFAULT_RECORD_LIMIT
        );

    limit =
      Math.min(
        limit,
        PayTrackerPayrollCentreController
          .MAX_RECORD_LIMIT
      );

    return {
      search:
        PayTrackerPayrollCentreController
          .cleanText(
            input.search
          ),

      payrollGroupId:
        PayTrackerPayrollCentreController
          .cleanText(
            input.payrollGroupId
          ),

      importStatus:
        PayTrackerPayrollCentreController
          .cleanText(
            input.importStatus
          ),

      comparisonStatus:
        PayTrackerPayrollCentreController
          .cleanText(
            input.comparisonStatus
          ),

      sourceType:
        PayTrackerPayrollCentreController
          .cleanText(
            input.sourceType
          ),

      dateFrom:
        PayTrackerPayrollCentreController
          .toDateOrNull(
            input.dateFrom
          ),

      dateTo:
        PayTrackerPayrollCentreController
          .toDateOrNull(
            input.dateTo
          ),

      limit:
        limit
    };
  },

  /**
   * Serializes a payslip for the browser.
   *
   * @param {Object} payslip Payslip.
   * @return {Object} Browser-safe payslip.
   */
  serializePayslip: function(payslip) {
    const value =
      payslip || {};

    return {
      payslipId:
        value.payslipId || '',

      payrollGroupId:
        value.payrollGroupId || '',

      sourceType:
        value.sourceType || '',

      emailSender:
        value.emailSender || '',

      emailSubject:
        value.emailSubject || '',

      emailDate:
        PayTrackerPayrollCentreController
          .serializeDate(
            value.emailDate
          ),

      originalFilename:
        value.originalFilename || '',

      mimeType:
        value.mimeType || '',

      fileSize:
        PayTrackerPayrollCentreController
          .toNumber(
            value.fileSize
          ),

      driveFileId:
        value.driveFileId || '',

      driveFileUrl:
        value.driveFileUrl || '',

      payPeriodStart:
        PayTrackerPayrollCentreController
          .serializeDate(
            value.payPeriodStart
          ),

      payPeriodEnd:
        PayTrackerPayrollCentreController
          .serializeDate(
            value.payPeriodEnd
          ),

      payDate:
        PayTrackerPayrollCentreController
          .serializeDate(
            value.payDate
          ),

      grossPayActual:
        PayTrackerPayrollCentreController
          .roundCurrency(
            value.grossPayActual
          ),

      netPayActual:
        PayTrackerPayrollCentreController
          .roundCurrency(
            value.netPayActual
          ),

      taxActual:
        PayTrackerPayrollCentreController
          .roundCurrency(
            value.taxActual
          ),

      nationalInsuranceActual:
        PayTrackerPayrollCentreController
          .roundCurrency(
            value.nationalInsuranceActual
          ),

      pensionActual:
        PayTrackerPayrollCentreController
          .roundCurrency(
            value.pensionActual
          ),

      studentLoanActual:
        PayTrackerPayrollCentreController
          .roundCurrency(
            value.studentLoanActual
          ),

      otherDeductionsActual:
        PayTrackerPayrollCentreController
          .roundCurrency(
            value.otherDeductionsActual
          ),

      predictedGross:
        PayTrackerPayrollCentreController
          .roundCurrency(
            value.predictedGross
          ),

      predictedTakeHome:
        PayTrackerPayrollCentreController
          .roundCurrency(
            value.predictedTakeHome
          ),

      grossDifference:
        PayTrackerPayrollCentreController
          .roundCurrency(
            value.grossDifference
          ),

      netDifference:
        PayTrackerPayrollCentreController
          .roundCurrency(
            value.netDifference
          ),

      differencePercentage:
        PayTrackerPayrollCentreController
          .toNumber(
            value.differencePercentage
          ),

      importStatus:
        value.importStatus || '',

      comparisonStatus:
        value.comparisonStatus || '',

      matchConfidence:
        PayTrackerPayrollCentreController
          .toNumber(
            value.matchConfidence
          ),

      matchReason:
        value.matchReason || '',

      notes:
        value.notes || '',

      createdAt:
        PayTrackerPayrollCentreController
          .serializeDate(
            value.createdAt
          ),

      updatedAt:
        PayTrackerPayrollCentreController
          .serializeDate(
            value.updatedAt
          )
    };
  },

  /**
   * Serializes a Payroll Group.
   *
   * @param {Object} group Payroll Group.
   * @return {Object} Browser-safe group.
   */
  serializePayrollGroup: function(group) {
    const value =
      group || {};

    return {
      payrollGroupId:
        value.payrollGroupId || '',

      payrollGroupName:
        value.payrollGroupName || '',

      description:
        value.description || '',

      primaryEmployerKey:
        value.primaryEmployerKey || '',

      payFrequency:
        value.payFrequency || '',

      storageFolderId:
        value.storageFolderId || '',

      active:
        value.active === true,

      employers:
        Array.isArray(value.employers)
          ? value.employers.map(function(
              employer
            ) {
              return {
                assignmentId:
                  employer.assignmentId || '',

                employerKey:
                  employer.employerKey || '',

                employerDisplayName:
                  employer.employerDisplayName || '',

                includedInTaxablePayroll:
                  employer
                    .includedInTaxablePayroll ===
                  true,

                active:
                  employer.active === true
              };
            })
          : []
    };
  },

  /**
   * Serializes Drive file metadata.
   *
   * @param {Object} file Drive metadata.
   * @return {Object} Browser-safe metadata.
   */
  serializeDriveFile: function(file) {
    const value =
      file || {};

    return {
      driveFileId:
        value.driveFileId || '',

      driveFileUrl:
        value.driveFileUrl || '',

      filename:
        value.filename || '',

      mimeType:
        value.mimeType || '',

      fileSize:
        PayTrackerPayrollCentreController
          .toNumber(
            value.fileSize
          ),

      createdAt:
        PayTrackerPayrollCentreController
          .serializeDate(
            value.createdAt
          ),

      updatedAt:
        PayTrackerPayrollCentreController
          .serializeDate(
            value.updatedAt
          ),

      driveFolderId:
        value.driveFolderId || '',

      driveFolderUrl:
        value.driveFolderUrl || ''
    };
  },

  /**
   * Converts a scan-history row.
   *
   * @param {Array<*>} row Row.
   * @param {Array<string>} headers Headers.
   * @return {Object} Scan.
   */
  rowToScan: function(
    row,
    headers
  ) {
    const read =
      function(header) {
        const index =
          headers.indexOf(
            header
          );

        return index === -1
          ? ''
          : row[index];
      };

    return {
      scanId:
        read('Scan ID'),

      startedAt:
        read('Scan Started At'),

      completedAt:
        read('Scan Completed At'),

      status:
        read('Status') ||
        (
          read('Errors')
            ? PayTrackerPayrollConfig
                .SCAN_STATUSES
                .ERROR
            : PayTrackerPayrollConfig
                .SCAN_STATUSES
                .COMPLETE
        ),

      searchStartDate:
        read('Search Start Date'),

      searchEndDate:
        read('Search End Date'),

      gmailQuery:
        read('Gmail Query'),

      threadsFound:
        read('Threads Found'),

      messagesChecked:
        read('Messages Checked'),

      messagesMatched:
        read('Messages Matched') ||
        read('Recognised Emails'),

      pdfAttachmentsFound:
        read('PDF Attachments Found') ||
        read('PDFs Found'),

      payslipsImported:
        read('Payslips Imported') ||
        read('Payslips Registered'),

      duplicatesSkipped:
        read('Duplicates Skipped'),

      errors:
        read('Errors'),

      summary:
        read('Summary')
    };
  },

  /**
   * Serializes a scan result.
   *
   * @param {Object} scan Scan.
   * @return {Object} Browser-safe scan.
   */
  serializeScan: function(scan) {
    const value =
      scan || {};

    return {
      scanId:
        value.scanId || '',

      startedAt:
        PayTrackerPayrollCentreController
          .serializeDate(
            value.startedAt
          ),

      completedAt:
        PayTrackerPayrollCentreController
          .serializeDate(
            value.completedAt
          ),

      status:
        value.status || '',

      searchStartDate:
        PayTrackerPayrollCentreController
          .serializeDate(
            value.searchStartDate
          ),

      searchEndDate:
        PayTrackerPayrollCentreController
          .serializeDate(
            value.searchEndDate
          ),

      gmailQuery:
        value.gmailQuery || '',

      threadsFound:
        PayTrackerPayrollCentreController
          .toNumber(
            value.threadsFound
          ),

      messagesChecked:
        PayTrackerPayrollCentreController
          .toNumber(
            value.messagesChecked
          ),

      messagesMatched:
        PayTrackerPayrollCentreController
          .toNumber(
            value.messagesMatched
          ),

      pdfAttachmentsFound:
        PayTrackerPayrollCentreController
          .toNumber(
            value.pdfAttachmentsFound
          ),

      payslipsImported:
        PayTrackerPayrollCentreController
          .toNumber(
            value.payslipsImported
          ),

      duplicatesSkipped:
        PayTrackerPayrollCentreController
          .toNumber(
            value.duplicatesSkipped
          ),

      errors:
        value.errors || '',

      summary:
        value.summary || ''
    };
  },

  /**
   * Returns the best date available for a payslip.
   *
   * @param {Object} payslip Payslip.
   * @return {number} Timestamp.
   */
  getEffectivePayslipTime: function(
    payslip
  ) {
    return PayTrackerPayrollCentreController
      .dateToTime(
        payslip.payDate ||
        payslip.emailDate ||
        payslip.createdAt
      );
  },

  /**
   * Converts an object to a list of values.
   *
   * @param {Object} object Object.
   * @return {Array<*>} Values.
   */
  objectValues: function(object) {
    return Object.keys(
      object || {}
    ).map(function(key) {
      return object[key];
    });
  },

  /**
   * Returns unique non-empty text values.
   *
   * @param {Array<*>} values Values.
   * @return {Array<string>} Unique values.
   */
  uniqueTextValues: function(values) {
    const seen = {};

    return values.filter(function(value) {
      const text =
        PayTrackerPayrollCentreController
          .cleanText(
            value
          );

      const normalized =
        PayTrackerPayrollCentreController
          .normalizeText(
            text
          );

      if (
        !normalized ||
        seen[normalized]
      ) {
        return false;
      }

      seen[normalized] =
        true;

      return true;
    });
  },

  /**
   * Converts a date into an ISO string.
   *
   * @param {*} value Date value.
   * @return {string} ISO date or blank.
   */
  serializeDate: function(value) {
    const date =
      PayTrackerPayrollCentreController
        .toDateOrNull(
          value
        );

    return date
      ? date.toISOString()
      : '';
  },

  /**
   * Converts a value to a Date or null.
   *
   * @param {*} value Value.
   * @return {Date|null} Date.
   */
  toDateOrNull: function(value) {
    if (!value) {
      return null;
    }

    if (
      Object.prototype.toString.call(
        value
      ) === '[object Date]'
    ) {
      return isNaN(
        value.getTime()
      )
        ? null
        : value;
    }

    const parsed =
      new Date(value);

    return isNaN(
      parsed.getTime()
    )
      ? null
      : parsed;
  },

  /**
   * Converts a date to a timestamp.
   *
   * @param {*} value Date value.
   * @return {number} Timestamp.
   */
  dateToTime: function(value) {
    const date =
      PayTrackerPayrollCentreController
        .toDateOrNull(
          value
        );

    return date
      ? date.getTime()
      : 0;
  },

  /**
   * Converts a value to a number.
   *
   * @param {*} value Value.
   * @return {number} Number.
   */
  toNumber: function(value) {
    const parsed =
      Number(value);

    return isFinite(parsed)
      ? parsed
      : 0;
  },

  /**
   * Converts a value to a positive number.
   *
   * @param {*} value Value.
   * @param {number} fallback Fallback.
   * @return {number} Positive number.
   */
  toPositiveNumber: function(
    value,
    fallback
  ) {
    const parsed =
      Math.floor(
        PayTrackerPayrollCentreController
          .toNumber(
            value
          )
      );

    return parsed > 0
      ? parsed
      : fallback;
  },

  /**
   * Rounds monetary values.
   *
   * @param {*} value Value.
   * @return {number} Rounded amount.
   */
  roundCurrency: function(value) {
    return (
      Math.round(
        PayTrackerPayrollCentreController
          .toNumber(
            value
          ) *
        100
      ) /
      100
    );
  },

  /**
   * Cleans text.
   *
   * @param {*} value Value.
   * @return {string} Clean text.
   */
  cleanText: function(value) {
    return String(
      value === null ||
      value === undefined
        ? ''
        : value
    ).trim();
  },

  /**
   * Normalizes comparison text.
   *
   * @param {*} value Value.
   * @return {string} Normalized text.
   */
  normalizeText: function(value) {
    return PayTrackerPayrollCentreController
      .cleanText(
        value
      )
      .toLowerCase();
  }
});

/**
 * Frontend API: loads the Payroll Centre workspace.
 *
 * @param {Object=} options Optional filters.
 * @return {Object} Workspace model.
 */
function getPayTrackerPayrollCentre(
  options
) {
  return PayTrackerPayrollCentreController
    .getWorkspace(
      options || {}
    );
}

/**
 * Frontend API: returns a filtered payslip list.
 *
 * @param {Object=} options List filters.
 * @return {Object} Payslip list.
 */
function getPayTrackerPayslips(options) {
  return PayTrackerPayrollCentreController
    .getPayslips(
      options || {}
    );
}

/**
 * Frontend API: returns one payslip.
 *
 * @param {string} payslipId Payslip ID.
 * @return {Object} Payslip details.
 */
function getPayTrackerPayslip(payslipId) {
  return PayTrackerPayrollCentreController
    .getPayslip(
      payslipId
    );
}

/**
 * Frontend API: performs a manual Gmail scan.
 *
 * @param {Object=} options Scan options.
 * @return {Object} Scan result.
 */
function scanPayTrackerPayrollCentreGmail(
  options
) {
  return PayTrackerPayrollCentreController
    .scanGmail(
      options || {}
    );
}

/**
 * Read-only controller test.
 *
 * @return {Object} Test result.
 */
function testPayTrackerPayrollCentreController() {
  const workspace =
    PayTrackerPayrollCentreController
      .getWorkspace({
        limit:
          10
      });

  const result = {
    success:
      workspace.success === true,

    totalPayslips:
      workspace.summary
        .totalPayslips,

    displayedPayslips:
      workspace.payslips.length,

    payrollGroupCount:
      workspace.payrollGroups.length,

    recentScanCount:
      workspace.recentScans.length,

    latestPayslip:
      workspace.summary
        .latestPayslip,

    timestamp:
      new Date()
  };

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}
