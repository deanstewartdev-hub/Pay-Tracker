/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Payroll/PayslipRepository.gs
 *
 * Purpose:
 * - Store payslip metadata in the Payslip Register
 * - Read individual and grouped payslip records
 * - Detect duplicate Gmail messages, attachments and files
 * - Track import and comparison statuses
 * - Store predicted and actual pay values
 * - Preserve existing spreadsheet data
 *
 * Important:
 * - PDF files are not stored inside Google Sheets
 * - This repository does not access Gmail directly
 * - This repository does not access Google Drive directly
 * - Records are deactivated or updated, never silently deleted
 *******************************************************/

const PayTrackerPayslipRepository = Object.freeze({
  VERSION: '2.8.0',

  /**
   * Returns all payslip records.
   *
   * @param {Object=} options Filter options.
   * @return {Array<Object>} Payslip records.
   */
  getAll: function(options) {
    const settings =
      options || {};

    const spreadsheet =
      PayTrackerPayslipRepository
        .getSpreadsheet();

    const sheet =
      PayTrackerPayslipRepository
        .getPayslipSheet(
          spreadsheet
        );

    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYSLIP_REGISTER;

    const lastRow =
      sheet.getLastRow();

    if (lastRow <= 1) {
      return [];
    }

    const rows =
      sheet
        .getRange(
          2,
          1,
          lastRow - 1,
          definition.HEADERS.length
        )
        .getValues();

    let records =
      rows
        .map(function(row, index) {
          return PayTrackerPayslipRepository
            .rowToPayslip(
              row,
              index + 2
            );
        })
        .filter(function(record) {
          return Boolean(
            record.payslipId
          );
        });

    records =
      PayTrackerPayslipRepository
        .applyFilters(
          records,
          settings
        );

    records.sort(function(left, right) {
      return (
        PayTrackerPayslipRepository
          .dateToTime(
            right.emailDate ||
            right.payDate ||
            right.createdAt
          ) -
        PayTrackerPayslipRepository
          .dateToTime(
            left.emailDate ||
            left.payDate ||
            left.createdAt
          )
      );
    });

    return records;
  },

  /**
   * Returns one payslip by ID.
   *
   * @param {string} payslipId Payslip ID.
   * @return {Object|null} Payslip or null.
   */
  getById: function(payslipId) {
    return PayTrackerPayslipRepository
      .findFirst(
        PayTrackerPayslipRepository
          .getAll(),
        'payslipId',
        payslipId
      );
  },

  /**
   * Returns payslips for one Payroll Group.
   *
   * @param {string} payrollGroupId Payroll Group ID.
   * @return {Array<Object>} Payslips.
   */
  getByPayrollGroup: function(
    payrollGroupId
  ) {
    return PayTrackerPayslipRepository
      .getAll({
        payrollGroupId:
          payrollGroupId
      });
  },

  /**
   * Returns payslips with a specific import status.
   *
   * @param {string} importStatus Import status.
   * @return {Array<Object>} Payslips.
   */
  getByImportStatus: function(
    importStatus
  ) {
    return PayTrackerPayslipRepository
      .getAll({
        importStatus:
          importStatus
      });
  },

  /**
   * Returns payslips with a comparison status.
   *
   * @param {string} comparisonStatus Comparison status.
   * @return {Array<Object>} Payslips.
   */
  getByComparisonStatus: function(
    comparisonStatus
  ) {
    return PayTrackerPayslipRepository
      .getAll({
        comparisonStatus:
          comparisonStatus
      });
  },

  /**
   * Returns the most recent payslip.
   *
   * @param {string=} payrollGroupId Optional group.
   * @return {Object|null} Latest payslip.
   */
  getLatest: function(payrollGroupId) {
    const records =
      PayTrackerPayslipRepository
        .getAll({
          payrollGroupId:
            payrollGroupId || ''
        });

    return records.length
      ? records[0]
      : null;
  },

  /**
   * Creates a new payslip record.
   *
   * @param {Object} payslip Payslip metadata.
   * @return {Object} Created record.
   */
  create: function(payslip) {
    const normalized =
      PayTrackerPayslipRepository
        .normalizePayslip(
          payslip
        );

    if (!normalized.payslipId) {
      normalized.payslipId =
        PayTrackerPayslipRepository
          .createPayslipId();
    }

    PayTrackerPayslipRepository
      .validatePayslip(
        normalized
      );

    const duplicate =
      PayTrackerPayslipRepository
        .findDuplicate(
          normalized
        );

    if (duplicate) {
      throw new Error(
        'This payslip already appears to have been imported. ' +
        'Existing Payslip ID: ' +
        duplicate.payslipId
      );
    }

    if (
      PayTrackerPayslipRepository
        .getById(
          normalized.payslipId
        )
    ) {
      throw new Error(
        'A payslip already exists with ID "' +
        normalized.payslipId +
        '".'
      );
    }

    const spreadsheet =
      PayTrackerPayslipRepository
        .getSpreadsheet();

    const sheet =
      PayTrackerPayslipRepository
        .getPayslipSheet(
          spreadsheet
        );

    const timestamp =
      new Date();

    normalized.createdAt =
      normalized.createdAt ||
      timestamp;

    normalized.updatedAt =
      timestamp;

    sheet.appendRow(
      PayTrackerPayslipRepository
        .payslipToRow(
          normalized
        )
    );

    SpreadsheetApp.flush();

    return PayTrackerPayslipRepository
      .getById(
        normalized.payslipId
      );
  },

  /**
   * Creates a record unless a duplicate already exists.
   *
   * @param {Object} payslip Payslip data.
   * @return {Object} Result.
   */
  createOrReturnExisting: function(
    payslip
  ) {
    const normalized =
      PayTrackerPayslipRepository
        .normalizePayslip(
          payslip
        );

    const duplicate =
      PayTrackerPayslipRepository
        .findDuplicate(
          normalized
        );

    if (duplicate) {
      return {
        created: false,
        duplicate: true,
        payslip: duplicate
      };
    }

    return {
      created: true,
      duplicate: false,
      payslip:
        PayTrackerPayslipRepository
          .create(
            normalized
          )
    };
  },

  /**
   * Updates an existing payslip.
   *
   * @param {string} payslipId Payslip ID.
   * @param {Object} changes Fields to update.
   * @return {Object} Updated record.
   */
  update: function(
    payslipId,
    changes
  ) {
    const existing =
      PayTrackerPayslipRepository
        .getById(
          payslipId
        );

    if (!existing) {
      throw new Error(
        'Payslip "' +
        payslipId +
        '" was not found.'
      );
    }

    const merged =
      PayTrackerPayslipRepository
        .normalizePayslip(
          Object.assign(
            {},
            existing,
            changes || {},
            {
              payslipId:
                existing.payslipId,

              createdAt:
                existing.createdAt,

              updatedAt:
                new Date()
            }
          )
        );

    PayTrackerPayslipRepository
      .validatePayslip(
        merged
      );

    const spreadsheet =
      PayTrackerPayslipRepository
        .getSpreadsheet();

    const sheet =
      PayTrackerPayslipRepository
        .getPayslipSheet(
          spreadsheet
        );

    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYSLIP_REGISTER;

    const rowNumber =
      PayTrackerPayslipRepository
        .findRowByPayslipId(
          sheet,
          payslipId
        );

    if (!rowNumber) {
      throw new Error(
        'The spreadsheet row for payslip "' +
        payslipId +
        '" could not be found.'
      );
    }

    sheet
      .getRange(
        rowNumber,
        1,
        1,
        definition.HEADERS.length
      )
      .setValues([
        PayTrackerPayslipRepository
          .payslipToRow(
            merged
          )
      ]);

    SpreadsheetApp.flush();

    return PayTrackerPayslipRepository
      .getById(
        payslipId
      );
  },

  /**
   * Updates import status.
   *
   * @param {string} payslipId Payslip ID.
   * @param {string} importStatus Status.
   * @param {string=} notes Optional notes.
   * @return {Object} Updated record.
   */
  setImportStatus: function(
    payslipId,
    importStatus,
    notes
  ) {
    if (
      !PayTrackerPayrollConfig
        .isValidImportStatus(
          importStatus
        )
    ) {
      throw new Error(
        'Unsupported import status "' +
        importStatus +
        '".'
      );
    }

    const changes = {
      importStatus:
        importStatus
    };

    if (
      notes !== undefined &&
      notes !== null
    ) {
      changes.notes =
        PayTrackerPayslipRepository
          .cleanText(
            notes
          );
    }

    return PayTrackerPayslipRepository
      .update(
        payslipId,
        changes
      );
  },

  /**
   * Updates comparison results.
   *
   * @param {string} payslipId Payslip ID.
   * @param {Object} comparison Comparison result.
   * @return {Object} Updated record.
   */
  setComparisonResult: function(
    payslipId,
    comparison
  ) {
    const value =
      comparison || {};

    const comparisonStatus =
      PayTrackerPayslipRepository
        .cleanText(
          value.comparisonStatus
        );

    if (
      comparisonStatus &&
      !PayTrackerPayrollConfig
        .isValidComparisonStatus(
          comparisonStatus
        )
    ) {
      throw new Error(
        'Unsupported comparison status "' +
        comparisonStatus +
        '".'
      );
    }

    return PayTrackerPayslipRepository
      .update(
        payslipId,
        {
          predictedGross:
            PayTrackerPayslipRepository
              .toNumber(
                value.predictedGross
              ),

          predictedTakeHome:
            PayTrackerPayslipRepository
              .toNumber(
                value.predictedTakeHome
              ),

          grossDifference:
            PayTrackerPayslipRepository
              .toNumber(
                value.grossDifference
              ),

          netDifference:
            PayTrackerPayslipRepository
              .toNumber(
                value.netDifference
              ),

          differencePercentage:
            PayTrackerPayslipRepository
              .toNumber(
                value.differencePercentage
              ),

          comparisonStatus:
            comparisonStatus,

          matchConfidence:
            PayTrackerPayslipRepository
              .toNumber(
                value.matchConfidence
              ),

          matchReason:
            PayTrackerPayslipRepository
              .cleanText(
                value.matchReason
              )
        }
      );
  },

  /**
   * Stores Drive file metadata.
   *
   * @param {string} payslipId Payslip ID.
   * @param {Object} driveFile Drive file metadata.
   * @return {Object} Updated record.
   */
  setDriveFile: function(
    payslipId,
    driveFile
  ) {
    const value =
      driveFile || {};

    return PayTrackerPayslipRepository
      .update(
        payslipId,
        {
          driveFileId:
            PayTrackerPayslipRepository
              .cleanText(
                value.driveFileId ||
                value.fileId
              ),

          driveFileUrl:
            PayTrackerPayslipRepository
              .cleanText(
                value.driveFileUrl ||
                value.fileUrl
              )
        }
      );
  },

  /**
   * Finds a duplicate payslip.
   *
   * Detection order:
   * 1. Gmail message ID + attachment ID
   * 2. File hash
   * 3. Drive file ID
   * 4. Gmail message ID + filename
   *
   * @param {Object} payslip Payslip candidate.
   * @return {Object|null} Existing duplicate or null.
   */
  findDuplicate: function(payslip) {
    const candidate =
      PayTrackerPayslipRepository
        .normalizePayslip(
          payslip
        );

    const records =
      PayTrackerPayslipRepository
        .getAll();

    for (
      let index = 0;
      index < records.length;
      index += 1
    ) {
      const existing =
        records[index];

      if (
        candidate.gmailMessageId &&
        candidate.attachmentId &&
        PayTrackerPayslipRepository
          .sameText(
            candidate.gmailMessageId,
            existing.gmailMessageId
          ) &&
        PayTrackerPayslipRepository
          .sameText(
            candidate.attachmentId,
            existing.attachmentId
          )
      ) {
        return existing;
      }

      if (
        candidate.fileHash &&
        PayTrackerPayslipRepository
          .sameText(
            candidate.fileHash,
            existing.fileHash
          )
      ) {
        return existing;
      }

      if (
        candidate.driveFileId &&
        PayTrackerPayslipRepository
          .sameText(
            candidate.driveFileId,
            existing.driveFileId
          )
      ) {
        return existing;
      }

      if (
        candidate.gmailMessageId &&
        candidate.originalFilename &&
        PayTrackerPayslipRepository
          .sameText(
            candidate.gmailMessageId,
            existing.gmailMessageId
          ) &&
        PayTrackerPayslipRepository
          .sameText(
            candidate.originalFilename,
            existing.originalFilename
          )
      ) {
        return existing;
      }
    }

    return null;
  },

  /**
   * Tests whether a Gmail attachment is already registered.
   *
   * @param {string} gmailMessageId Gmail message ID.
   * @param {string} attachmentId Attachment ID.
   * @return {boolean} True when registered.
   */
  existsByGmailAttachment: function(
    gmailMessageId,
    attachmentId
  ) {
    return Boolean(
      PayTrackerPayslipRepository
        .findDuplicate({
          gmailMessageId:
            gmailMessageId,

          attachmentId:
            attachmentId
        })
    );
  },

  /**
   * Tests whether a file hash is already registered.
   *
   * @param {string} fileHash File hash.
   * @return {boolean} True when registered.
   */
  existsByFileHash: function(fileHash) {
    return Boolean(
      PayTrackerPayslipRepository
        .findDuplicate({
          fileHash:
            fileHash
        })
    );
  },

  /**
   * Applies repository filters.
   *
   * @param {Array<Object>} records Records.
   * @param {Object} options Filter options.
   * @return {Array<Object>} Filtered records.
   */
  applyFilters: function(
    records,
    options
  ) {
    const payrollGroupId =
      PayTrackerPayslipRepository
        .normalizeText(
          options.payrollGroupId
        );

    const importStatus =
      PayTrackerPayslipRepository
        .normalizeText(
          options.importStatus
        );

    const comparisonStatus =
      PayTrackerPayslipRepository
        .normalizeText(
          options.comparisonStatus
        );

    const sourceType =
      PayTrackerPayslipRepository
        .normalizeText(
          options.sourceType
        );

    return records.filter(function(record) {
      if (
        payrollGroupId &&
        PayTrackerPayslipRepository
          .normalizeText(
            record.payrollGroupId
          ) !== payrollGroupId
      ) {
        return false;
      }

      if (
        importStatus &&
        PayTrackerPayslipRepository
          .normalizeText(
            record.importStatus
          ) !== importStatus
      ) {
        return false;
      }

      if (
        comparisonStatus &&
        PayTrackerPayslipRepository
          .normalizeText(
            record.comparisonStatus
          ) !== comparisonStatus
      ) {
        return false;
      }

      if (
        sourceType &&
        PayTrackerPayslipRepository
          .normalizeText(
            record.sourceType
          ) !== sourceType
      ) {
        return false;
      }

      return true;
    });
  },

  /**
   * Converts a sheet row into a payslip object.
   *
   * Header names are used so the repository remains safe
   * if column indexes are extended in later versions.
   *
   * @param {Array<*>} row Sheet row.
   * @param {number} rowNumber Spreadsheet row.
   * @return {Object} Payslip.
   */
  rowToPayslip: function(
    row,
    rowNumber
  ) {
    const read =
      PayTrackerPayslipRepository
        .createHeaderReader(
          row
        );

    return {
      payslipId:
        read('Payslip ID'),

      payrollGroupId:
        read('Payroll Group ID'),

      sourceType:
        read('Source Type'),

      gmailMessageId:
        read('Gmail Message ID'),

      gmailThreadId:
        read('Gmail Thread ID'),

      emailSender:
        read('Email Sender'),

      emailSubject:
        read('Email Subject'),

      emailDate:
        read('Email Date') || null,

      attachmentId:
        read('Attachment ID'),

      originalFilename:
        read('Original Filename'),

      mimeType:
        read('MIME Type'),

      fileSize:
        PayTrackerPayslipRepository
          .toNumber(
            read('File Size')
          ),

      fileHash:
        read('File Hash'),

      driveFileId:
        read('Drive File ID'),

      driveFileUrl:
        read('Drive File URL'),

      payPeriodStart:
        read('Pay Period Start') || null,

      payPeriodEnd:
        read('Pay Period End') || null,

      payDate:
        read('Pay Date') || null,

      grossPayActual:
        PayTrackerPayslipRepository
          .toNumber(
            read('Gross Pay Actual')
          ),

      netPayActual:
        PayTrackerPayslipRepository
          .toNumber(
            read('Net Pay Actual')
          ),

      taxActual:
        PayTrackerPayslipRepository
          .toNumber(
            read('Tax Actual')
          ),

      nationalInsuranceActual:
        PayTrackerPayslipRepository
          .toNumber(
            read(
              'National Insurance Actual'
            )
          ),

      pensionActual:
        PayTrackerPayslipRepository
          .toNumber(
            read('Pension Actual')
          ),

      studentLoanActual:
        PayTrackerPayslipRepository
          .toNumber(
            read('Student Loan Actual')
          ),

      otherDeductionsActual:
        PayTrackerPayslipRepository
          .toNumber(
            read(
              'Other Deductions Actual'
            )
          ),

      predictedGross:
        PayTrackerPayslipRepository
          .toNumber(
            read('Predicted Gross')
          ),

      predictedTakeHome:
        PayTrackerPayslipRepository
          .toNumber(
            read('Predicted Take Home')
          ),

      grossDifference:
        PayTrackerPayslipRepository
          .toNumber(
            read('Gross Difference')
          ),

      netDifference:
        PayTrackerPayslipRepository
          .toNumber(
            read('Net Difference')
          ),

      differencePercentage:
        PayTrackerPayslipRepository
          .toNumber(
            read(
              'Difference Percentage'
            )
          ),

      importStatus:
        read('Import Status'),

      comparisonStatus:
        read('Comparison Status'),

      matchConfidence:
        PayTrackerPayslipRepository
          .toNumber(
            read('Match Confidence')
          ),

      matchReason:
        read('Match Reason'),

      notes:
        read('Notes'),

      createdAt:
        read('Created At') || null,

      updatedAt:
        read('Updated At') || null,

      rowNumber:
        rowNumber
    };
  },

  /**
   * Converts a payslip object into a sheet row.
   *
   * @param {Object} payslip Payslip.
   * @return {Array<*>} Sheet row.
   */
  payslipToRow: function(payslip) {
    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYSLIP_REGISTER;

    const valuesByHeader = {
      'Payslip ID':
        payslip.payslipId,

      'Payroll Group ID':
        payslip.payrollGroupId,

      'Source Type':
        payslip.sourceType,

      'Gmail Message ID':
        payslip.gmailMessageId,

      'Gmail Thread ID':
        payslip.gmailThreadId,

      'Email Sender':
        payslip.emailSender,

      'Email Subject':
        payslip.emailSubject,

      'Email Date':
        payslip.emailDate || '',

      'Attachment ID':
        payslip.attachmentId,

      'Original Filename':
        payslip.originalFilename,

      'MIME Type':
        payslip.mimeType,

      'File Size':
        payslip.fileSize,

      'File Hash':
        payslip.fileHash,

      'Drive File ID':
        payslip.driveFileId,

      'Drive File URL':
        payslip.driveFileUrl,

      'Pay Period Start':
        payslip.payPeriodStart || '',

      'Pay Period End':
        payslip.payPeriodEnd || '',

      'Pay Date':
        payslip.payDate || '',

      'Gross Pay Actual':
        payslip.grossPayActual,

      'Net Pay Actual':
        payslip.netPayActual,

      'Tax Actual':
        payslip.taxActual,

      'National Insurance Actual':
        payslip.nationalInsuranceActual,

      'Pension Actual':
        payslip.pensionActual,

      'Student Loan Actual':
        payslip.studentLoanActual,

      'Other Deductions Actual':
        payslip.otherDeductionsActual,

      'Predicted Gross':
        payslip.predictedGross,

      'Predicted Take Home':
        payslip.predictedTakeHome,

      'Gross Difference':
        payslip.grossDifference,

      'Net Difference':
        payslip.netDifference,

      'Difference Percentage':
        payslip.differencePercentage,

      'Import Status':
        payslip.importStatus,

      'Comparison Status':
        payslip.comparisonStatus,

      'Match Confidence':
        payslip.matchConfidence,

      'Match Reason':
        payslip.matchReason,

      'Notes':
        payslip.notes,

      'Created At':
        payslip.createdAt || new Date(),

      'Updated At':
        payslip.updatedAt || new Date()
    };

    return definition.HEADERS.map(
      function(header) {
        return Object.prototype
          .hasOwnProperty.call(
            valuesByHeader,
            header
          )
          ? valuesByHeader[header]
          : '';
      }
    );
  },

  /**
   * Normalizes a payslip object.
   *
   * @param {Object} payslip Input.
   * @return {Object} Normalized payslip.
   */
  normalizePayslip: function(payslip) {
    const value =
      payslip || {};

    return {
      payslipId:
        PayTrackerPayslipRepository
          .cleanText(
            value.payslipId
          ),

      payrollGroupId:
        PayTrackerPayslipRepository
          .cleanText(
            value.payrollGroupId
          ),

      sourceType:
        PayTrackerPayslipRepository
          .cleanText(
            value.sourceType
          ),

      gmailMessageId:
        PayTrackerPayslipRepository
          .cleanText(
            value.gmailMessageId
          ),

      gmailThreadId:
        PayTrackerPayslipRepository
          .cleanText(
            value.gmailThreadId
          ),

      emailSender:
        PayTrackerPayslipRepository
          .cleanText(
            value.emailSender
          ),

      emailSubject:
        PayTrackerPayslipRepository
          .cleanText(
            value.emailSubject
          ),

      emailDate:
        PayTrackerPayslipRepository
          .toDateOrNull(
            value.emailDate
          ),

      attachmentId:
        PayTrackerPayslipRepository
          .cleanText(
            value.attachmentId
          ),

      originalFilename:
        PayTrackerPayslipRepository
          .cleanText(
            value.originalFilename
          ),

      mimeType:
        PayTrackerPayslipRepository
          .cleanText(
            value.mimeType
          ),

      fileSize:
        PayTrackerPayslipRepository
          .toNumber(
            value.fileSize
          ),

      fileHash:
        PayTrackerPayslipRepository
          .cleanText(
            value.fileHash
          ),

      driveFileId:
        PayTrackerPayslipRepository
          .cleanText(
            value.driveFileId
          ),

      driveFileUrl:
        PayTrackerPayslipRepository
          .cleanText(
            value.driveFileUrl
          ),

      payPeriodStart:
        PayTrackerPayslipRepository
          .toDateOrNull(
            value.payPeriodStart
          ),

      payPeriodEnd:
        PayTrackerPayslipRepository
          .toDateOrNull(
            value.payPeriodEnd
          ),

      payDate:
        PayTrackerPayslipRepository
          .toDateOrNull(
            value.payDate
          ),

      grossPayActual:
        PayTrackerPayslipRepository
          .toNumber(
            value.grossPayActual
          ),

      netPayActual:
        PayTrackerPayslipRepository
          .toNumber(
            value.netPayActual
          ),

      taxActual:
        PayTrackerPayslipRepository
          .toNumber(
            value.taxActual
          ),

      nationalInsuranceActual:
        PayTrackerPayslipRepository
          .toNumber(
            value.nationalInsuranceActual
          ),

      pensionActual:
        PayTrackerPayslipRepository
          .toNumber(
            value.pensionActual
          ),

      studentLoanActual:
        PayTrackerPayslipRepository
          .toNumber(
            value.studentLoanActual
          ),

      otherDeductionsActual:
        PayTrackerPayslipRepository
          .toNumber(
            value.otherDeductionsActual
          ),

      predictedGross:
        PayTrackerPayslipRepository
          .toNumber(
            value.predictedGross
          ),

      predictedTakeHome:
        PayTrackerPayslipRepository
          .toNumber(
            value.predictedTakeHome
          ),

      grossDifference:
        PayTrackerPayslipRepository
          .toNumber(
            value.grossDifference
          ),

      netDifference:
        PayTrackerPayslipRepository
          .toNumber(
            value.netDifference
          ),

      differencePercentage:
        PayTrackerPayslipRepository
          .toNumber(
            value.differencePercentage
          ),

      importStatus:
        PayTrackerPayslipRepository
          .cleanText(
            value.importStatus
          ) ||
        PayTrackerPayrollConfig
          .IMPORT_STATUSES
          .PENDING,

      comparisonStatus:
        PayTrackerPayslipRepository
          .cleanText(
            value.comparisonStatus
          ) ||
        PayTrackerPayrollConfig
          .COMPARISON_STATUSES
          .NOT_COMPARED,

      matchConfidence:
        PayTrackerPayslipRepository
          .toNumber(
            value.matchConfidence
          ),

      matchReason:
        PayTrackerPayslipRepository
          .cleanText(
            value.matchReason
          ),

      notes:
        PayTrackerPayslipRepository
          .cleanText(
            value.notes
          ),

      createdAt:
        PayTrackerPayslipRepository
          .toDateOrNull(
            value.createdAt
          ),

      updatedAt:
        PayTrackerPayslipRepository
          .toDateOrNull(
            value.updatedAt
          )
    };
  },

  /**
   * Validates a payslip record.
   *
   * @param {Object} payslip Payslip.
   */
  validatePayslip: function(payslip) {
    if (!payslip.payslipId) {
      throw new Error(
        'Payslip ID is required.'
      );
    }

    if (!payslip.payrollGroupId) {
      throw new Error(
        'Payroll Group ID is required.'
      );
    }

    const payrollGroup =
      PayTrackerPayrollGroupRepository
        .getById(
          payslip.payrollGroupId,
          true
        );

    if (!payrollGroup) {
      throw new Error(
        'Payroll Group "' +
        payslip.payrollGroupId +
        '" does not exist.'
      );
    }

    if (
      payslip.sourceType &&
      !PayTrackerPayrollConfig
        .isValidSourceType(
          payslip.sourceType
        )
    ) {
      throw new Error(
        'Unsupported payslip source type "' +
        payslip.sourceType +
        '".'
      );
    }

    if (
      payslip.importStatus &&
      !PayTrackerPayrollConfig
        .isValidImportStatus(
          payslip.importStatus
        )
    ) {
      throw new Error(
        'Unsupported import status "' +
        payslip.importStatus +
        '".'
      );
    }

    if (
      payslip.comparisonStatus &&
      !PayTrackerPayrollConfig
        .isValidComparisonStatus(
          payslip.comparisonStatus
        )
    ) {
      throw new Error(
        'Unsupported comparison status "' +
        payslip.comparisonStatus +
        '".'
      );
    }

    if (
      payslip.payPeriodStart &&
      payslip.payPeriodEnd &&
      payslip.payPeriodStart.getTime() >
      payslip.payPeriodEnd.getTime()
    ) {
      throw new Error(
        'Pay Period Start cannot be after Pay Period End.'
      );
    }
  },

  /**
   * Creates a header-based row reader.
   *
   * @param {Array<*>} row Row.
   * @return {Function} Reader.
   */
  createHeaderReader: function(row) {
    const headers =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYSLIP_REGISTER
        .HEADERS;

    return function(header) {
      const index =
        headers.indexOf(
          header
        );

      return index === -1
        ? ''
        : row[index];
    };
  },

  /**
   * Finds a payslip row.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Sheet.
   * @param {string} payslipId Payslip ID.
   * @return {number|null} Row number.
   */
  findRowByPayslipId: function(
    sheet,
    payslipId
  ) {
    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYSLIP_REGISTER;

    const idColumn =
      definition.COLUMNS
        .PAYSLIP_ID;

    const lastRow =
      sheet.getLastRow();

    if (lastRow <= 1) {
      return null;
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
      PayTrackerPayslipRepository
        .normalizeText(
          payslipId
        );

    for (
      let index = 0;
      index < values.length;
      index += 1
    ) {
      if (
        PayTrackerPayslipRepository
          .normalizeText(
            values[index][0]
          ) === target
      ) {
        return index + 2;
      }
    }

    return null;
  },

  /**
   * Finds first object matching a field.
   *
   * @param {Array<Object>} records Records.
   * @param {string} property Property.
   * @param {*} value Target.
   * @return {Object|null} Match.
   */
  findFirst: function(
    records,
    property,
    value
  ) {
    const target =
      PayTrackerPayslipRepository
        .normalizeText(
          value
        );

    for (
      let index = 0;
      index < records.length;
      index += 1
    ) {
      if (
        PayTrackerPayslipRepository
          .normalizeText(
            records[index][property]
          ) === target
      ) {
        return records[index];
      }
    }

    return null;
  },

  /**
   * Returns the Payslip Register sheet.
   *
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet}
   *   spreadsheet Spreadsheet.
   * @return {GoogleAppsScript.Spreadsheet.Sheet} Sheet.
   */
  getPayslipSheet: function(spreadsheet) {
    const sheetName =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYSLIP_REGISTER
        .NAME;

    const sheet =
      spreadsheet.getSheetByName(
        sheetName
      );

    if (!sheet) {
      throw new Error(
        'Required Payroll Centre sheet "' +
        sheetName +
        '" was not found. Run ' +
        'setupPayTrackerPayrollCentre() first.'
      );
    }

    return sheet;
  },

  /**
   * Returns the active spreadsheet.
   *
   * @return {GoogleAppsScript.Spreadsheet.Spreadsheet}
   *   Spreadsheet.
   */
  getSpreadsheet: function() {
    const spreadsheet =
      SpreadsheetApp
        .getActiveSpreadsheet();

    if (!spreadsheet) {
      throw new Error(
        'Pay Tracker could not access the active spreadsheet.'
      );
    }

    return spreadsheet;
  },

  /**
   * Creates a payslip identifier.
   *
   * @return {string} Payslip ID.
   */
  createPayslipId: function() {
    const timestamp =
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        'yyyyMMddHHmmss'
      );

    const random =
      Utilities
        .getUuid()
        .replace(
          /-/g,
          ''
        )
        .substring(
          0,
          8
        )
        .toUpperCase();

    return (
      'PAYSLIP-' +
      timestamp +
      '-' +
      random
    );
  },

  /**
   * Creates a SHA-256 file hash.
   *
   * This method will later be used by the import service.
   *
   * @param {GoogleAppsScript.Base.Blob} blob File blob.
   * @return {string} Hex hash.
   */
  createFileHash: function(blob) {
    if (!blob) {
      return '';
    }

    const digest =
      Utilities.computeDigest(
        Utilities.DigestAlgorithm.SHA_256,
        blob.getBytes()
      );

    return digest
      .map(function(byte) {
        const normalized =
          byte < 0
            ? byte + 256
            : byte;

        return (
          '0' +
          normalized.toString(16)
        ).slice(-2);
      })
      .join('');
  },

  /**
   * Compares normalized text.
   *
   * @param {*} left Left.
   * @param {*} right Right.
   * @return {boolean} Equal.
   */
  sameText: function(left, right) {
    const normalizedLeft =
      PayTrackerPayslipRepository
        .normalizeText(
          left
        );

    const normalizedRight =
      PayTrackerPayslipRepository
        .normalizeText(
          right
        );

    return Boolean(
      normalizedLeft &&
      normalizedRight &&
      normalizedLeft ===
      normalizedRight
    );
  },

  /**
   * Cleans text.
   *
   * @param {*} value Value.
   * @return {string} Text.
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
   * Normalizes text.
   *
   * @param {*} value Value.
   * @return {string} Normalized text.
   */
  normalizeText: function(value) {
    return PayTrackerPayslipRepository
      .cleanText(
        value
      )
      .toLowerCase();
  },

  /**
   * Converts a value to a number.
   *
   * @param {*} value Value.
   * @return {number} Number.
   */
  toNumber: function(value) {
    if (
      value === null ||
      value === undefined ||
      value === ''
    ) {
      return 0;
    }

    if (
      typeof value === 'number'
    ) {
      return isFinite(value)
        ? value
        : 0;
    }

    const cleaned =
      String(value)
        .replace(
          /£/g,
          ''
        )
        .replace(
          /,/g,
          ''
        )
        .replace(
          /%/g,
          ''
        )
        .trim();

    const parsed =
      Number(cleaned);

    return isFinite(parsed)
      ? parsed
      : 0;
  },

  /**
   * Converts a value to a valid Date or null.
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

    const date =
      new Date(value);

    return isNaN(
      date.getTime()
    )
      ? null
      : date;
  },

  /**
   * Converts date to sortable timestamp.
   *
   * @param {*} value Date value.
   * @return {number} Timestamp.
   */
  dateToTime: function(value) {
    const date =
      PayTrackerPayslipRepository
        .toDateOrNull(
          value
        );

    return date
      ? date.getTime()
      : 0;
  }
});

/**
 * Read-only Payslip Repository test.
 *
 * @return {Object} Test result.
 */
function testPayTrackerPayslipRepository() {
  const groups =
    PayTrackerPayrollGroupRepository
      .getActive();

  const records =
    PayTrackerPayslipRepository
      .getAll();

  const result = {
    success:
      groups.length > 0,

    payrollGroupCount:
      groups.length,

    payslipCount:
      records.length,

    latestPayslip:
      records.length
        ? records[0]
        : null,

    duplicateDetectionAvailable:
      typeof PayTrackerPayslipRepository
        .findDuplicate ===
      'function',

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