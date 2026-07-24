/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Payroll/PayrollConfig.js
 *
 * Purpose:
 * - Define the Payroll Centre data model
 * - Define Payroll Group configuration
 * - Define Payslip Register columns
 * - Define Gmail matching-rule columns
 * - Define payroll scan-history columns
 * - Define supported statuses and source types
 * - Provide default Payroll Group records
 *
 * Important:
 * - This file does not create or modify sheets
 * - This file does not access Gmail
 * - This file does not access Google Drive
 * - This file does not modify existing Pay Tracker data
 *******************************************************/

const PayTrackerPayrollConfig = Object.freeze({
  VERSION: '2.8.0',

  /**
   * Payroll Centre sheet definitions.
   */
  SHEETS: Object.freeze({
    PAYROLL_GROUPS: Object.freeze({
      NAME: 'Payroll Groups',

      HEADERS: Object.freeze([
        'Payroll Group ID',
        'Payroll Group Name',
        'Description',
        'Primary Employer Key',
        'Pay Frequency',
        'Expected Sender Rules',
        'Expected Subject Rules',
        'Storage Folder ID',
        'Active',
        'Created At',
        'Updated At'
      ]),

      COLUMNS: Object.freeze({
        PAYROLL_GROUP_ID: 1,
        PAYROLL_GROUP_NAME: 2,
        DESCRIPTION: 3,
        PRIMARY_EMPLOYER_KEY: 4,
        PAY_FREQUENCY: 5,
        EXPECTED_SENDER_RULES: 6,
        EXPECTED_SUBJECT_RULES: 7,
        STORAGE_FOLDER_ID: 8,
        ACTIVE: 9,
        CREATED_AT: 10,
        UPDATED_AT: 11
      })
    }),

    PAYROLL_GROUP_EMPLOYERS: Object.freeze({
      NAME: 'Payroll Group Employers',

      HEADERS: Object.freeze([
        'Assignment ID',
        'Payroll Group ID',
        'Employer Key',
        'Employer Display Name',
        'Included In Taxable Payroll',
        'Active',
        'Created At',
        'Updated At'
      ]),

      COLUMNS: Object.freeze({
        ASSIGNMENT_ID: 1,
        PAYROLL_GROUP_ID: 2,
        EMPLOYER_KEY: 3,
        EMPLOYER_DISPLAY_NAME: 4,
        INCLUDED_IN_TAXABLE_PAYROLL: 5,
        ACTIVE: 6,
        CREATED_AT: 7,
        UPDATED_AT: 8
      })
    }),

    PAYSLIP_REGISTER: Object.freeze({
      NAME: 'Payslip Register',

      HEADERS: Object.freeze([
        'Payslip ID',
        'Payroll Group ID',
        'Pay Period Start',
        'Pay Period End',
        'Pay Date',
        'Source Type',
        'Source Message ID',
        'Source Attachment ID',
        'Original Filename',
        'Drive File ID',
        'File MIME Type',
        'File Size',
        'File Hash',
        'Email Sender',
        'Email Subject',
        'Email Date',
        'Import Status',
        'Match Confidence',
        'Match Reason',
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
        'Net Difference',
        'Difference Percentage',
        'Comparison Status',
        'Notes',
        'Created At',
        'Updated At'
      ]),

      COLUMNS: Object.freeze({
        PAYSLIP_ID: 1,
        PAYROLL_GROUP_ID: 2,
        PAY_PERIOD_START: 3,
        PAY_PERIOD_END: 4,
        PAY_DATE: 5,
        SOURCE_TYPE: 6,
        SOURCE_MESSAGE_ID: 7,
        SOURCE_ATTACHMENT_ID: 8,
        ORIGINAL_FILENAME: 9,
        DRIVE_FILE_ID: 10,
        FILE_MIME_TYPE: 11,
        FILE_SIZE: 12,
        FILE_HASH: 13,
        EMAIL_SENDER: 14,
        EMAIL_SUBJECT: 15,
        EMAIL_DATE: 16,
        IMPORT_STATUS: 17,
        MATCH_CONFIDENCE: 18,
        MATCH_REASON: 19,
        GROSS_PAY_ACTUAL: 20,
        NET_PAY_ACTUAL: 21,
        TAX_ACTUAL: 22,
        NATIONAL_INSURANCE_ACTUAL: 23,
        PENSION_ACTUAL: 24,
        STUDENT_LOAN_ACTUAL: 25,
        OTHER_DEDUCTIONS_ACTUAL: 26,
        PREDICTED_GROSS: 27,
        PREDICTED_TAKE_HOME: 28,
        GROSS_DIFFERENCE: 29,
        NET_DIFFERENCE: 30,
        DIFFERENCE_PERCENTAGE: 31,
        COMPARISON_STATUS: 32,
        NOTES: 33,
        CREATED_AT: 34,
        UPDATED_AT: 35
      })
    }),

    PAYSLIP_EMAIL_RULES: Object.freeze({
      NAME: 'Payslip Email Rules',

      HEADERS: Object.freeze([
        'Rule ID',
        'Payroll Group ID',
        'Rule Name',
        'Sender Contains',
        'Sender Equals',
        'Subject Contains',
        'Filename Contains',
        'Requires PDF',
        'Priority',
        'Active',
        'Created At',
        'Updated At'
      ]),

      COLUMNS: Object.freeze({
        RULE_ID: 1,
        PAYROLL_GROUP_ID: 2,
        RULE_NAME: 3,
        SENDER_CONTAINS: 4,
        SENDER_EQUALS: 5,
        SUBJECT_CONTAINS: 6,
        FILENAME_CONTAINS: 7,
        REQUIRES_PDF: 8,
        PRIORITY: 9,
        ACTIVE: 10,
        CREATED_AT: 11,
        UPDATED_AT: 12
      })
    }),

    PAYROLL_SCAN_HISTORY: Object.freeze({
      NAME: 'Payroll Scan History',

      HEADERS: Object.freeze([
        'Scan ID',
        'Scan Started At',
        'Scan Completed At',
        'Search Start Date',
        'Search End Date',
        'Messages Checked',
        'Recognised Emails',
        'PDFs Found',
        'Payslips Registered',
        'Duplicates Skipped',
        'Review Items',
        'Errors',
        'Status',
        'Summary'
      ]),

      COLUMNS: Object.freeze({
        SCAN_ID: 1,
        SCAN_STARTED_AT: 2,
        SCAN_COMPLETED_AT: 3,
        SEARCH_START_DATE: 4,
        SEARCH_END_DATE: 5,
        MESSAGES_CHECKED: 6,
        RECOGNISED_EMAILS: 7,
        PDFS_FOUND: 8,
        PAYSLIPS_REGISTERED: 9,
        DUPLICATES_SKIPPED: 10,
        REVIEW_ITEMS: 11,
        ERRORS: 12,
        STATUS: 13,
        SUMMARY: 14
      })
    })
  }),

  /**
   * Stable employer keys used by the existing Pay Workspace.
   */
  EMPLOYERS: Object.freeze({
    NHS: Object.freeze({
      KEY: 'nhs',
      DISPLAY_NAME: 'NHS',
      TAXABLE: true
    }),

    RELIEF_WARDEN: Object.freeze({
      KEY: 'relief',
      DISPLAY_NAME: 'Relief Warden',
      TAXABLE: true
    }),

    NIGHT_SECURITY: Object.freeze({
      KEY: 'security',
      DISPLAY_NAME: 'Night Security',
      TAXABLE: true
    }),

    LOGGING_CASH: Object.freeze({
      KEY: 'logging',
      DISPLAY_NAME: 'Logging Cash',
      TAXABLE: false
    })
  }),

  /**
   * Supported payslip source types.
   */
  SOURCE_TYPES: Object.freeze({
    GMAIL: 'Gmail',
    MANUAL_UPLOAD: 'Manual Upload'
  }),

  /**
   * Supported payroll frequencies.
   */
  PAY_FREQUENCIES: Object.freeze({
    WEEKLY: 'Weekly',
    FORTNIGHTLY: 'Fortnightly',
    FOUR_WEEKLY: 'Four Weekly',
    MONTHLY: 'Monthly',
    IRREGULAR: 'Irregular'
  }),

  /**
   * Payslip import lifecycle statuses.
   */
  IMPORT_STATUSES: Object.freeze({
    REGISTERED: 'Registered',
    NEEDS_REVIEW: 'Needs Review',
    COMPLETE: 'Complete',
    DUPLICATE: 'Duplicate',
    ERROR: 'Error'
  }),

  /**
   * Predicted-versus-actual comparison statuses.
   */
  COMPARISON_STATUSES: Object.freeze({
    NOT_READY: 'Not Ready',
    MATCHED: 'Matched',
    MINOR_VARIANCE: 'Minor Variance',
    REVIEW: 'Review',
    MAJOR_DISCREPANCY: 'Major Discrepancy',
    INCOMPLETE: 'Incomplete'
  }),

  /**
   * Gmail scan lifecycle statuses.
   */
  SCAN_STATUSES: Object.freeze({
    RUNNING: 'Running',
    COMPLETE: 'Complete',
    COMPLETE_WITH_WARNINGS: 'Complete With Warnings',
    ERROR: 'Error'
  }),

  /**
   * Supported PDF MIME type.
   */
  FILE_TYPES: Object.freeze({
    PDF_MIME_TYPE: 'application/pdf'
  }),

  /**
   * Matching confidence values.
   */
  MATCH_CONFIDENCE: Object.freeze({
    NONE: 0,
    LOW: 25,
    MEDIUM: 50,
    HIGH: 75,
    EXACT: 100
  }),

  /**
   * Default discrepancy thresholds.
   *
   * These values will later be used by the comparison
   * service and can be moved into user settings.
   */
  DISCREPANCY_THRESHOLDS: Object.freeze({
    MATCHED_MAX_AMOUNT: 2,
    MINOR_VARIANCE_MAX_AMOUNT: 10,
    REVIEW_MAX_AMOUNT: 25,
    REVIEW_PERCENTAGE: 2,
    MAJOR_PERCENTAGE: 5
  }),

  /**
   * Initial default Payroll Group.
   *
   * NHS, Relief Warden and Night Security are currently
   * paid together on one payslip.
   *
   * Logging Cash is deliberately excluded because it is
   * separate and non-taxable.
   */
  DEFAULT_PAYROLL_GROUPS: Object.freeze([
    Object.freeze({
      payrollGroupId:
        'PAYROLL-GROUP-COMBINED-001',

      payrollGroupName:
        'Combined Payroll',

      description:
        'Combined payslip containing NHS, Relief Warden and Night Security earnings.',

      primaryEmployerKey:
        'nhs',

      payFrequency:
        'Monthly',

      expectedSenderRules:
        '',

      expectedSubjectRules:
        'payslip',

      storageFolderId:
        '',

      active:
        true
    })
  ]),

  /**
   * Initial employer-to-group assignments.
   */
  DEFAULT_PAYROLL_GROUP_EMPLOYERS: Object.freeze([
    Object.freeze({
      assignmentId:
        'PAYROLL-ASSIGNMENT-001',

      payrollGroupId:
        'PAYROLL-GROUP-COMBINED-001',

      employerKey:
        'nhs',

      employerDisplayName:
        'NHS',

      includedInTaxablePayroll:
        true,

      active:
        true
    }),

    Object.freeze({
      assignmentId:
        'PAYROLL-ASSIGNMENT-002',

      payrollGroupId:
        'PAYROLL-GROUP-COMBINED-001',

      employerKey:
        'relief',

      employerDisplayName:
        'Relief Warden',

      includedInTaxablePayroll:
        true,

      active:
        true
    }),

    Object.freeze({
      assignmentId:
        'PAYROLL-ASSIGNMENT-003',

      payrollGroupId:
        'PAYROLL-GROUP-COMBINED-001',

      employerKey:
        'security',

      employerDisplayName:
        'Night Security',

      includedInTaxablePayroll:
        true,

      active:
        true
    })
  ]),

  /**
   * Initial matching rule.
   *
   * The sender and filename values remain blank until the
   * genuine payslip email format has been confirmed.
   */
  DEFAULT_EMAIL_RULES: Object.freeze([
    Object.freeze({
      ruleId:
        'PAYSLIP-RULE-COMBINED-001',

      payrollGroupId:
        'PAYROLL-GROUP-COMBINED-001',

      ruleName:
        'Combined payroll payslip',

      senderContains:
        '',

      senderEquals:
        '',

      subjectContains:
        'payslip',

      filenameContains:
        '',

      requiresPdf:
        true,

      priority:
        100,

      active:
        true
    })
  ]),

  /**
   * Returns all Payroll Centre sheet definitions.
   *
   * @return {Array<Object>} Sheet definitions.
   */
  getSheetDefinitions: function() {
    return [
      PayTrackerPayrollConfig
        .SHEETS
        .PAYROLL_GROUPS,

      PayTrackerPayrollConfig
        .SHEETS
        .PAYROLL_GROUP_EMPLOYERS,

      PayTrackerPayrollConfig
        .SHEETS
        .PAYSLIP_REGISTER,

      PayTrackerPayrollConfig
        .SHEETS
        .PAYSLIP_EMAIL_RULES,

      PayTrackerPayrollConfig
        .SHEETS
        .PAYROLL_SCAN_HISTORY
    ];
  },

  /**
   * Returns a sheet definition by sheet name.
   *
   * @param {string} sheetName Sheet name.
   * @return {Object|null} Matching definition.
   */
  getSheetDefinition: function(sheetName) {
    const normalizedSheetName =
      PayTrackerPayrollConfig
        .normalizeText(sheetName);

    const definitions =
      PayTrackerPayrollConfig
        .getSheetDefinitions();

    for (
      let index = 0;
      index !== definitions.length;
      index += 1
    ) {
      const definition =
        definitions[index];

      if (
        PayTrackerPayrollConfig
          .normalizeText(
            definition.NAME
          ) === normalizedSheetName
      ) {
        return definition;
      }
    }

    return null;
  },

  /**
   * Returns an employer definition by employer key.
   *
   * @param {string} employerKey Employer key.
   * @return {Object|null} Employer definition.
   */
  getEmployer: function(employerKey) {
    const normalizedEmployerKey =
      PayTrackerPayrollConfig
        .normalizeKey(employerKey);

    const employers =
      PayTrackerPayrollConfig
        .EMPLOYERS;

    const employerNames =
      Object.keys(employers);

    for (
      let index = 0;
      index !== employerNames.length;
      index += 1
    ) {
      const employer =
        employers[
          employerNames[index]
        ];

      if (
        PayTrackerPayrollConfig
          .normalizeKey(
            employer.KEY
          ) === normalizedEmployerKey
      ) {
        return employer;
      }
    }

    return null;
  },

  /**
   * Checks whether an employer is taxable.
   *
   * @param {string} employerKey Employer key.
   * @return {boolean} True when taxable.
   */
  isTaxableEmployer: function(employerKey) {
    const employer =
      PayTrackerPayrollConfig
        .getEmployer(employerKey);

    return Boolean(
      employer &&
      employer.TAXABLE === true
    );
  },

  /**
   * Checks whether a source type is supported.
   *
   * @param {string} sourceType Source type.
   * @return {boolean} True when valid.
   */
  isValidSourceType: function(sourceType) {
    const normalizedSourceType =
      PayTrackerPayrollConfig
        .normalizeText(sourceType);

    return Object
      .keys(
        PayTrackerPayrollConfig
          .SOURCE_TYPES
      )
      .some(function(key) {
        return (
          PayTrackerPayrollConfig
            .normalizeText(
              PayTrackerPayrollConfig
                .SOURCE_TYPES[key]
            ) === normalizedSourceType
        );
      });
  },

  /**
   * Checks whether a pay frequency is supported.
   *
   * @param {string} payFrequency Pay frequency.
   * @return {boolean} True when valid.
   */
  isValidPayFrequency: function(payFrequency) {
    const normalizedFrequency =
      PayTrackerPayrollConfig
        .normalizeText(payFrequency);

    return Object
      .keys(
        PayTrackerPayrollConfig
          .PAY_FREQUENCIES
      )
      .some(function(key) {
        return (
          PayTrackerPayrollConfig
            .normalizeText(
              PayTrackerPayrollConfig
                .PAY_FREQUENCIES[key]
            ) === normalizedFrequency
        );
      });
  },

  /**
   * Checks whether an import status is supported.
   *
   * @param {string} importStatus Import status.
   * @return {boolean} True when valid.
   */
  isValidImportStatus: function(importStatus) {
    const normalizedStatus =
      PayTrackerPayrollConfig
        .normalizeText(importStatus);

    return Object
      .keys(
        PayTrackerPayrollConfig
          .IMPORT_STATUSES
      )
      .some(function(key) {
        return (
          PayTrackerPayrollConfig
            .normalizeText(
              PayTrackerPayrollConfig
                .IMPORT_STATUSES[key]
            ) === normalizedStatus
        );
      });
  },

  /**
   * Checks whether a comparison status is supported.
   *
   * @param {string} comparisonStatus Comparison status.
   * @return {boolean} True when valid.
   */
  isValidComparisonStatus: function(
    comparisonStatus
  ) {
    const normalizedStatus =
      PayTrackerPayrollConfig
        .normalizeText(
          comparisonStatus
        );

    return Object
      .keys(
        PayTrackerPayrollConfig
          .COMPARISON_STATUSES
      )
      .some(function(key) {
        return (
          PayTrackerPayrollConfig
            .normalizeText(
              PayTrackerPayrollConfig
                .COMPARISON_STATUSES[key]
            ) === normalizedStatus
        );
      });
  },

  /**
   * Creates a normalized blank payslip model.
   *
   * @return {Object} Blank payslip model.
   */
  createBlankPayslip: function() {
    return {
      payslipId: '',
      payrollGroupId: '',
      payPeriodStart: null,
      payPeriodEnd: null,
      payDate: null,
      sourceType: '',
      sourceMessageId: '',
      sourceAttachmentId: '',
      originalFilename: '',
      driveFileId: '',
      fileMimeType:
        PayTrackerPayrollConfig
          .FILE_TYPES
          .PDF_MIME_TYPE,
      fileSize: 0,
      fileHash: '',
      emailSender: '',
      emailSubject: '',
      emailDate: null,
      importStatus:
        PayTrackerPayrollConfig
          .IMPORT_STATUSES
          .REGISTERED,
      matchConfidence:
        PayTrackerPayrollConfig
          .MATCH_CONFIDENCE
          .NONE,
      matchReason: '',
      grossPayActual: null,
      netPayActual: null,
      taxActual: null,
      nationalInsuranceActual: null,
      pensionActual: null,
      studentLoanActual: null,
      otherDeductionsActual: null,
      predictedGross: null,
      predictedTakeHome: null,
      grossDifference: null,
      netDifference: null,
      differencePercentage: null,
      comparisonStatus:
        PayTrackerPayrollConfig
          .COMPARISON_STATUSES
          .NOT_READY,
      notes: '',
      createdAt: null,
      updatedAt: null
    };
  },

  /**
   * Normalizes general text for comparisons.
   *
   * @param {*} value Value to normalize.
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
  },

  /**
   * Normalizes stable identifiers and keys.
   *
   * @param {*} value Value to normalize.
   * @return {string} Normalized key.
   */
  normalizeKey: function(value) {
    return PayTrackerPayrollConfig
      .normalizeText(value)
      .replace(
        /[^a-z0-9]+/g,
        '-'
      )
      .replace(
        /^-+|-+$/g,
        ''
      );
  }
});