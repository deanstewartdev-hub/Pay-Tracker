/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Payroll/PayslipImportService.gs
 *
 * Purpose:
 * - Perform manual read-only Gmail searches
 * - Match emails against Payslip Email Rules
 * - Identify PDF payslip attachments
 * - Skip attachments already registered
 * - Save new PDFs through PayrollDriveService
 * - Register payslip metadata
 * - Record every Gmail scan in Payroll Scan History
 *
 * Important:
 * - Gmail is scanned only when explicitly requested
 * - Emails are never modified, moved, labelled or deleted
 * - Attachments are saved to Google Drive
 * - PDF contents are not extracted in this step
 *******************************************************/

const PayTrackerPayslipImportService = Object.freeze({
  VERSION: '2.8.0',

  DEFAULT_LOOKBACK_DAYS: 365,

  DEFAULT_MAX_THREADS: 100,

  MAX_LOOKBACK_DAYS: 3650,

  MAX_THREADS: 500,

  /**
   * Runs a real Gmail payslip scan.
   *
   * @param {Object=} options Scan options.
   * @return {Object} Scan result.
   */
  scanGmail: function(options) {
    const request =
      PayTrackerPayslipImportService
        .normalizeScanOptions(
          options
        );

    const scanId =
      PayTrackerPayslipImportService
        .createScanId();

    const startedAt =
      new Date();

    const result = {
      success: false,

      scanId:
        scanId,

      dryRun:
        false,

      query:
        '',

      startedAt:
        startedAt,

      completedAt:
        null,

      threadsFound:
        0,

      messagesChecked:
        0,

      messagesMatched:
        0,

      attachmentsChecked:
        0,

      pdfAttachmentsFound:
        0,

      payslipsImported:
        0,

      duplicatesSkipped:
        0,

      emailsSkipped:
        0,

      attachmentsSkipped:
        0,

      errors:
        [],

      importedPayslips:
        []
    };

    PayTrackerPayslipImportService
      .createScanHistoryRecord({
        scanId:
          scanId,

        startedAt:
          startedAt,

        status:
          PayTrackerPayrollConfig
            .SCAN_STATUSES
            .RUNNING,

        searchStartDate:
          request.searchStartDate,

        searchEndDate:
          request.searchEndDate,

        gmailQuery:
          ''
      });

    try {
      const rules =
        PayTrackerPayslipImportService
          .getActiveEmailRules();

      if (!rules.length) {
        throw new Error(
          'No active Payslip Email Rules were found.'
        );
      }

      const query =
        PayTrackerPayslipImportService
          .buildGmailQuery(
            request
          );

      result.query =
        query;

      PayTrackerPayslipImportService
        .updateScanHistoryRecord(
          scanId,
          {
            gmailQuery:
              query
          }
        );

      const threads =
        GmailApp.search(
          query,
          0,
          request.maxThreads
        );

      result.threadsFound =
        threads.length;

      for (
        let threadIndex = 0;
        threadIndex < threads.length;
        threadIndex += 1
      ) {
        const thread =
          threads[threadIndex];

        const messages =
          thread.getMessages();

        for (
          let messageIndex = 0;
          messageIndex < messages.length;
          messageIndex += 1
        ) {
          const message =
            messages[messageIndex];

          result.messagesChecked += 1;

          const messageResult =
            PayTrackerPayslipImportService
              .processMessage({
                message:
                  message,

                rules:
                  rules,

                request:
                  request,

                dryRun:
                  false
              });

          if (messageResult.matched) {
            result.messagesMatched += 1;
          } else {
            result.emailsSkipped += 1;
          }

          result.attachmentsChecked +=
            messageResult.attachmentsChecked;

          result.pdfAttachmentsFound +=
            messageResult.pdfAttachmentsFound;

          result.payslipsImported +=
            messageResult.payslipsImported;

          result.duplicatesSkipped +=
            messageResult.duplicatesSkipped;

          result.attachmentsSkipped +=
            messageResult.attachmentsSkipped;

          if (
            messageResult.importedPayslips &&
            messageResult.importedPayslips.length
          ) {
            result.importedPayslips =
              result.importedPayslips.concat(
                messageResult.importedPayslips
              );
          }

          if (
            messageResult.errors &&
            messageResult.errors.length
          ) {
            result.errors =
              result.errors.concat(
                messageResult.errors
              );
          }
        }
      }

      result.success =
        result.errors.length === 0;

      result.completedAt =
        new Date();

      PayTrackerPayslipImportService
        .completeScanHistoryRecord(
          result
        );

      console.log(
        JSON.stringify(
          result,
          null,
          2
        )
      );

      return result;
    } catch (error) {
      result.success =
        false;

      result.completedAt =
        new Date();

      result.errors.push(
        PayTrackerPayslipImportService
          .getErrorMessage(
            error
          )
      );

      PayTrackerPayslipImportService
        .completeScanHistoryRecord(
          result
        );

      console.error(
        JSON.stringify(
          result,
          null,
          2
        )
      );

      throw error;
    }
  },

  /**
   * Performs a dry-run Gmail scan.
   *
   * This searches Gmail and identifies matches but does
   * not save PDFs or create Payslip Register records.
   *
   * A scan history record is still created.
   *
   * @param {Object=} options Scan options.
   * @return {Object} Scan result.
   */
  previewGmailScan: function(options) {
    const request =
      PayTrackerPayslipImportService
        .normalizeScanOptions(
          options
        );

    const scanId =
      PayTrackerPayslipImportService
        .createScanId();

    const startedAt =
      new Date();

    const result = {
      success: false,

      scanId:
        scanId,

      dryRun:
        true,

      query:
        '',

      startedAt:
        startedAt,

      completedAt:
        null,

      threadsFound:
        0,

      messagesChecked:
        0,

      messagesMatched:
        0,

      attachmentsChecked:
        0,

      pdfAttachmentsFound:
        0,

      potentialImports:
        0,

      duplicatesSkipped:
        0,

      emailsSkipped:
        0,

      attachmentsSkipped:
        0,

      errors:
        [],

      matches:
        []
    };

    PayTrackerPayslipImportService
      .createScanHistoryRecord({
        scanId:
          scanId,

        startedAt:
          startedAt,

        status:
          PayTrackerPayrollConfig
            .SCAN_STATUSES
            .RUNNING,

        searchStartDate:
          request.searchStartDate,

        searchEndDate:
          request.searchEndDate,

        gmailQuery:
          ''
      });

    try {
      const rules =
        PayTrackerPayslipImportService
          .getActiveEmailRules();

      if (!rules.length) {
        throw new Error(
          'No active Payslip Email Rules were found.'
        );
      }

      const query =
        PayTrackerPayslipImportService
          .buildGmailQuery(
            request
          );

      result.query =
        query;

      PayTrackerPayslipImportService
        .updateScanHistoryRecord(
          scanId,
          {
            gmailQuery:
              query
          }
        );

      const threads =
        GmailApp.search(
          query,
          0,
          request.maxThreads
        );

      result.threadsFound =
        threads.length;

      for (
        let threadIndex = 0;
        threadIndex < threads.length;
        threadIndex += 1
      ) {
        const messages =
          threads[threadIndex]
            .getMessages();

        for (
          let messageIndex = 0;
          messageIndex < messages.length;
          messageIndex += 1
        ) {
          const message =
            messages[messageIndex];

          result.messagesChecked += 1;

          const messageResult =
            PayTrackerPayslipImportService
              .processMessage({
                message:
                  message,

                rules:
                  rules,

                request:
                  request,

                dryRun:
                  true
              });

          if (messageResult.matched) {
            result.messagesMatched += 1;
          } else {
            result.emailsSkipped += 1;
          }

          result.attachmentsChecked +=
            messageResult.attachmentsChecked;

          result.pdfAttachmentsFound +=
            messageResult.pdfAttachmentsFound;

          result.potentialImports +=
            messageResult.payslipsImported;

          result.duplicatesSkipped +=
            messageResult.duplicatesSkipped;

          result.attachmentsSkipped +=
            messageResult.attachmentsSkipped;

          if (
            messageResult.importedPayslips &&
            messageResult.importedPayslips.length
          ) {
            result.matches =
              result.matches.concat(
                messageResult.importedPayslips
              );
          }

          if (
            messageResult.errors &&
            messageResult.errors.length
          ) {
            result.errors =
              result.errors.concat(
                messageResult.errors
              );
          }
        }
      }

      result.success =
        result.errors.length === 0;

      result.completedAt =
        new Date();

      PayTrackerPayslipImportService
        .completeScanHistoryRecord({
          scanId:
            result.scanId,

          success:
            result.success,

          completedAt:
            result.completedAt,

          threadsFound:
            result.threadsFound,

          messagesChecked:
            result.messagesChecked,

          messagesMatched:
            result.messagesMatched,

          pdfAttachmentsFound:
            result.pdfAttachmentsFound,

          payslipsImported:
            0,

          duplicatesSkipped:
            result.duplicatesSkipped,

          errors:
            result.errors,

          dryRun:
            true
        });

      console.log(
        JSON.stringify(
          result,
          null,
          2
        )
      );

      return result;
    } catch (error) {
      result.success =
        false;

      result.completedAt =
        new Date();

      result.errors.push(
        PayTrackerPayslipImportService
          .getErrorMessage(
            error
          )
      );

      PayTrackerPayslipImportService
        .completeScanHistoryRecord({
          scanId:
            result.scanId,

          success:
            false,

          completedAt:
            result.completedAt,

          threadsFound:
            result.threadsFound,

          messagesChecked:
            result.messagesChecked,

          messagesMatched:
            result.messagesMatched,

          pdfAttachmentsFound:
            result.pdfAttachmentsFound,

          payslipsImported:
            0,

          duplicatesSkipped:
            result.duplicatesSkipped,

          errors:
            result.errors,

          dryRun:
            true
        });

      console.error(
        JSON.stringify(
          result,
          null,
          2
        )
      );

      throw error;
    }
  },

  /**
   * Processes one Gmail message.
   *
   * @param {Object} input Processing input.
   * @return {Object} Message result.
   */
  processMessage: function(input) {
    const request =
      input || {};

    const message =
      request.message;

    const rules =
      request.rules || [];

    const dryRun =
      request.dryRun === true;

    const result = {
      matched:
        false,

      attachmentsChecked:
        0,

      pdfAttachmentsFound:
        0,

      payslipsImported:
        0,

      duplicatesSkipped:
        0,

      attachmentsSkipped:
        0,

      importedPayslips:
        [],

      errors:
        []
    };

    if (!message) {
      result.errors.push(
        'A Gmail message was not supplied.'
      );

      return result;
    }

    const messageDate =
      message.getDate();

    if (
      !PayTrackerPayslipImportService
        .isDateWithinRange(
          messageDate,
          request.request
        )
    ) {
      return result;
    }

    const metadata =
      PayTrackerPayslipImportService
        .getMessageMetadata(
          message
        );

    const attachments =
      message.getAttachments({
        includeInlineImages:
          false,

        includeAttachments:
          true
      });

    if (!attachments.length) {
      return result;
    }

    const matchedRules =
      PayTrackerPayslipImportService
        .findMatchingRules({
          metadata:
            metadata,

          attachments:
            attachments,

          rules:
            rules
        });

    if (!matchedRules.length) {
      return result;
    }

    result.matched =
      true;

    for (
      let attachmentIndex = 0;
      attachmentIndex < attachments.length;
      attachmentIndex += 1
    ) {
      const attachment =
        attachments[attachmentIndex];

      result.attachmentsChecked += 1;

      try {
        const attachmentMetadata =
          PayTrackerPayslipImportService
            .getAttachmentMetadata({
              message:
                message,

              attachment:
                attachment,

              attachmentIndex:
                attachmentIndex
            });

        if (
          !PayTrackerPayslipImportService
            .isPdfAttachment(
              attachmentMetadata
            )
        ) {
          result.attachmentsSkipped += 1;
          continue;
        }

        result.pdfAttachmentsFound += 1;

        const matchingRule =
          PayTrackerPayslipImportService
            .selectRuleForAttachment({
              matchedRules:
                matchedRules,

              attachmentMetadata:
                attachmentMetadata
            });

        if (!matchingRule) {
          result.attachmentsSkipped += 1;
          continue;
        }

        const existing =
          PayTrackerPayslipRepository
            .findDuplicate({
              gmailMessageId:
                metadata.gmailMessageId,

              attachmentId:
                attachmentMetadata
                  .attachmentId,

              originalFilename:
                attachmentMetadata
                  .originalFilename,

              fileHash:
                attachmentMetadata
                  .fileHash
            });

        if (existing) {
          result.duplicatesSkipped += 1;
          continue;
        }

        const importResult =
          PayTrackerPayslipImportService
            .importAttachment({
              messageMetadata:
                metadata,

              attachmentMetadata:
                attachmentMetadata,

              attachment:
                attachment,

              rule:
                matchingRule,

              dryRun:
                dryRun
            });

        result.payslipsImported += 1;

        result.importedPayslips.push(
          importResult
        );
      } catch (error) {
        result.errors.push(
          PayTrackerPayslipImportService
            .getErrorMessage(
              error
            )
        );
      }
    }

    return result;
  },

  /**
   * Imports or previews one payslip attachment.
   *
   * @param {Object} input Import input.
   * @return {Object} Import result.
   */
  importAttachment: function(input) {
    const request =
      input || {};

    const messageMetadata =
      request.messageMetadata;

    const attachmentMetadata =
      request.attachmentMetadata;

    const rule =
      request.rule;

    const payslipId =
      PayTrackerPayslipRepository
        .createPayslipId();

    const basePayslip = {
      payslipId:
        payslipId,

      payrollGroupId:
        rule.payrollGroupId,

      sourceType:
        PayTrackerPayrollConfig
          .SOURCE_TYPES
          .GMAIL,

      gmailMessageId:
        messageMetadata
          .gmailMessageId,

      gmailThreadId:
        messageMetadata
          .gmailThreadId,

      emailSender:
        messageMetadata
          .emailSender,

      emailSubject:
        messageMetadata
          .emailSubject,

      emailDate:
        messageMetadata
          .emailDate,

      attachmentId:
        attachmentMetadata
          .attachmentId,

      originalFilename:
        attachmentMetadata
          .originalFilename,

      mimeType:
        attachmentMetadata
          .mimeType,

      fileSize:
        attachmentMetadata
          .fileSize,

      fileHash:
        attachmentMetadata
          .fileHash,

      importStatus:
        PayTrackerPayrollConfig
          .IMPORT_STATUSES
          .PENDING,

      comparisonStatus:
        PayTrackerPayrollConfig
          .COMPARISON_STATUSES
          .NOT_COMPARED,

      matchConfidence:
        rule.matchConfidence,

      matchReason:
        [
          'Matched email rule:',
          rule.ruleName
        ].join(' '),

      notes:
        request.dryRun === true
          ? 'Dry-run preview only.'
          : 'Imported from Gmail.'
    };

    if (request.dryRun === true) {
      return Object.assign(
        {},
        basePayslip,
        {
          preview:
            true,

          ruleId:
            rule.ruleId,

          ruleName:
            rule.ruleName
        }
      );
    }

    const driveResult =
      PayTrackerPayrollDriveService
        .savePayslipPdf({
          payrollGroupId:
            rule.payrollGroupId,

          blob:
            request.attachment,

          originalFilename:
            attachmentMetadata
              .originalFilename,

          emailDate:
            messageMetadata
              .emailDate,

          payslipId:
            payslipId,

          fileHash:
            attachmentMetadata
              .fileHash
        });

    basePayslip.driveFileId =
      driveResult.driveFileId;

    basePayslip.driveFileUrl =
      driveResult.driveFileUrl;

    basePayslip.importStatus =
      PayTrackerPayrollConfig
        .IMPORT_STATUSES
        .IMPORTED;

    const repositoryResult =
      PayTrackerPayslipRepository
        .createOrReturnExisting(
          basePayslip
        );

    return Object.assign(
      {},
      repositoryResult.payslip,
      {
        created:
          repositoryResult.created,

        duplicate:
          repositoryResult.duplicate,

        driveCreated:
          driveResult.created,

        driveDuplicate:
          driveResult.duplicate,

        ruleId:
          rule.ruleId,

        ruleName:
          rule.ruleName
      }
    );
  },

  /**
   * Returns active email rules.
   *
   * @return {Array<Object>} Email rules.
   */
  getActiveEmailRules: function() {
    const spreadsheet =
      SpreadsheetApp
        .getActiveSpreadsheet();

    if (!spreadsheet) {
      throw new Error(
        'Pay Tracker could not access the active spreadsheet.'
      );
    }

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
        'Required Payroll Centre sheet "' +
        definition.NAME +
        '" was not found.'
      );
    }

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

    const rules =
      rows
        .map(function(row, index) {
          return PayTrackerPayslipImportService
            .rowToEmailRule(
              row,
              index + 2
            );
        })
        .filter(function(rule) {
          return (
            Boolean(rule.ruleId) &&
            rule.active === true
          );
        });

    rules.sort(function(left, right) {
      return (
        right.priority -
        left.priority
      );
    });

    return rules;
  },

  /**
   * Converts a sheet row to an email rule.
   *
   * @param {Array<*>} row Row.
   * @param {number} rowNumber Row number.
   * @return {Object} Rule.
   */
  rowToEmailRule: function(
    row,
    rowNumber
  ) {
    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYSLIP_EMAIL_RULES;

    const read =
      function(header) {
        const index =
          definition.HEADERS
            .indexOf(
              header
            );

        return index === -1
          ? ''
          : row[index];
      };

    const priority =
      PayTrackerPayslipImportService
        .toNumber(
          read('Priority')
        );

    return {
      ruleId:
        PayTrackerPayslipImportService
          .cleanText(
            read('Rule ID')
          ),

      payrollGroupId:
        PayTrackerPayslipImportService
          .cleanText(
            read('Payroll Group ID')
          ),

      ruleName:
        PayTrackerPayslipImportService
          .cleanText(
            read('Rule Name')
          ),

      senderContains:
        PayTrackerPayslipImportService
          .cleanText(
            read('Sender Contains')
          ),

      senderEquals:
        PayTrackerPayslipImportService
          .cleanText(
            read('Sender Equals')
          ),

      subjectContains:
        PayTrackerPayslipImportService
          .cleanText(
            read('Subject Contains')
          ),

      filenameContains:
        PayTrackerPayslipImportService
          .cleanText(
            read('Filename Contains')
          ),

      requiresPdf:
        PayTrackerPayslipImportService
          .toBoolean(
            read('Requires PDF')
          ),

      priority:
        priority,

      active:
        PayTrackerPayslipImportService
          .toBoolean(
            read('Active')
          ),

      matchConfidence:
        PayTrackerPayslipImportService
          .calculateRuleConfidence({
            senderContains:
              read('Sender Contains'),

            senderEquals:
              read('Sender Equals'),

            subjectContains:
              read('Subject Contains'),

            filenameContains:
              read('Filename Contains')
          }),

      rowNumber:
        rowNumber
    };
  },

  /**
   * Finds rules matching one Gmail message.
   *
   * @param {Object} input Match input.
   * @return {Array<Object>} Matching rules.
   */
  findMatchingRules: function(input) {
    const request =
      input || {};

    const metadata =
      request.metadata || {};

    const attachments =
      request.attachments || [];

    const rules =
      request.rules || [];

    return rules.filter(function(rule) {
      return PayTrackerPayslipImportService
        .doesRuleMatch({
          rule:
            rule,

          metadata:
            metadata,

          attachments:
            attachments
        });
    });
  },

  /**
   * Tests whether an email rule matches.
   *
   * @param {Object} input Rule input.
   * @return {boolean} True when matched.
   */
  doesRuleMatch: function(input) {
    const request =
      input || {};

    const rule =
      request.rule || {};

    const metadata =
      request.metadata || {};

    const attachments =
      request.attachments || [];

    const sender =
      PayTrackerPayslipImportService
        .normalizeText(
          metadata.emailSender
        );

    const subject =
      PayTrackerPayslipImportService
        .normalizeText(
          metadata.emailSubject
        );

    const senderEquals =
      PayTrackerPayslipImportService
        .normalizeText(
          rule.senderEquals
        );

    const senderContains =
      PayTrackerPayslipImportService
        .normalizeText(
          rule.senderContains
        );

    const subjectContains =
      PayTrackerPayslipImportService
        .normalizeText(
          rule.subjectContains
        );

    const filenameContains =
      PayTrackerPayslipImportService
        .normalizeText(
          rule.filenameContains
        );

    if (
      senderEquals &&
      sender !== senderEquals
    ) {
      return false;
    }

    if (
      senderContains &&
      sender.indexOf(
        senderContains
      ) === -1
    ) {
      return false;
    }

    if (
      subjectContains &&
      subject.indexOf(
        subjectContains
      ) === -1
    ) {
      return false;
    }

    if (
      rule.requiresPdf === true
    ) {
      const hasPdf =
        attachments.some(function(
          attachment
        ) {
          return PayTrackerPayslipImportService
            .isPdfAttachment({
              mimeType:
                attachment
                  .getContentType(),

              originalFilename:
                attachment
                  .getName()
            });
        });

      if (!hasPdf) {
        return false;
      }
    }

    if (filenameContains) {
      const hasFilenameMatch =
        attachments.some(function(
          attachment
        ) {
          return (
            PayTrackerPayslipImportService
              .normalizeText(
                attachment.getName()
              )
              .indexOf(
                filenameContains
              ) !== -1
          );
        });

      if (!hasFilenameMatch) {
        return false;
      }
    }

    const hasAnyCondition =
      Boolean(
        senderEquals ||
        senderContains ||
        subjectContains ||
        filenameContains ||
        rule.requiresPdf
      );

    return hasAnyCondition;
  },

  /**
   * Selects the best rule for an attachment.
   *
   * @param {Object} input Selection input.
   * @return {Object|null} Rule.
   */
  selectRuleForAttachment: function(input) {
    const request =
      input || {};

    const attachmentMetadata =
      request.attachmentMetadata || {};

    const matchedRules =
      request.matchedRules || [];

    const filename =
      PayTrackerPayslipImportService
        .normalizeText(
          attachmentMetadata
            .originalFilename
        );

    for (
      let index = 0;
      index < matchedRules.length;
      index += 1
    ) {
      const rule =
        matchedRules[index];

      const filenameCondition =
        PayTrackerPayslipImportService
          .normalizeText(
            rule.filenameContains
          );

      if (
        filenameCondition &&
        filename.indexOf(
          filenameCondition
        ) === -1
      ) {
        continue;
      }

      return rule;
    }

    return null;
  },

  /**
   * Returns Gmail message metadata.
   *
   * @param {GoogleAppsScript.Gmail.GmailMessage} message Message.
   * @return {Object} Metadata.
   */
  getMessageMetadata: function(message) {
    return {
      gmailMessageId:
        message.getId(),

      gmailThreadId:
        message.getThread()
          .getId(),

      emailSender:
        message.getFrom(),

      emailSubject:
        message.getSubject(),

      emailDate:
        message.getDate()
    };
  },

  /**
   * Returns stable attachment metadata.
   *
   * GmailApp does not expose the Gmail API attachment ID,
   * so Pay Tracker creates a stable attachment key using
   * message ID, index, filename and file size.
   *
   * @param {Object} input Attachment input.
   * @return {Object} Metadata.
   */
  getAttachmentMetadata: function(input) {
    const request =
      input || {};

    const message =
      request.message;

    const attachment =
      request.attachment;

    const attachmentIndex =
      PayTrackerPayslipImportService
        .toNumber(
          request.attachmentIndex
        );

    const originalFilename =
      attachment.getName() ||
      'Payslip.pdf';

    const fileSize =
      attachment.getBytes()
        .length;

    const attachmentId =
      PayTrackerPayslipImportService
        .createAttachmentId({
          gmailMessageId:
            message.getId(),

          attachmentIndex:
            attachmentIndex,

          originalFilename:
            originalFilename,

          fileSize:
            fileSize
        });

    return {
      attachmentId:
        attachmentId,

      originalFilename:
        originalFilename,

      mimeType:
        attachment.getContentType(),

      fileSize:
        fileSize,

      fileHash:
        PayTrackerPayslipRepository
          .createFileHash(
            attachment
          )
    };
  },

  /**
   * Creates a stable synthetic attachment identifier.
   *
   * @param {Object} input Attachment identity.
   * @return {string} Attachment ID.
   */
  createAttachmentId: function(input) {
    const request =
      input || {};

    const identity =
      [
        request.gmailMessageId,
        request.attachmentIndex,
        request.originalFilename,
        request.fileSize
      ].join('|');

    const digest =
      Utilities.computeDigest(
        Utilities.DigestAlgorithm
          .SHA_256,
        identity,
        Utilities.Charset.UTF_8
      );

    const hex =
      digest
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

    return (
      'GMAIL-ATTACHMENT-' +
      hex.substring(
        0,
        24
      ).toUpperCase()
    );
  },

  /**
   * Tests whether an attachment is a PDF.
   *
   * @param {Object} attachmentMetadata Metadata.
   * @return {boolean} True for PDF.
   */
  isPdfAttachment: function(
    attachmentMetadata
  ) {
    const metadata =
      attachmentMetadata || {};

    const mimeType =
      PayTrackerPayslipImportService
        .normalizeText(
          metadata.mimeType
        );

    const filename =
      PayTrackerPayslipImportService
        .normalizeText(
          metadata.originalFilename
        );

    return (
      mimeType ===
        'application/pdf' ||
      filename.slice(-4) ===
        '.pdf'
    );
  },

  /**
   * Creates the Gmail search query.
   *
   * @param {Object} options Scan options.
   * @return {string} Gmail query.
   */
  buildGmailQuery: function(options) {
    const request =
      options || {};

    const parts = [
      'has:attachment',
      'filename:pdf'
    ];

    if (request.searchStartDate) {
      parts.push(
        'after:' +
        PayTrackerPayslipImportService
          .formatGmailDate(
            request.searchStartDate
          )
      );
    }

    if (request.searchEndDate) {
      const exclusiveEnd =
        new Date(
          request.searchEndDate
            .getTime()
        );

      exclusiveEnd.setDate(
        exclusiveEnd.getDate() + 1
      );

      parts.push(
        'before:' +
        PayTrackerPayslipImportService
          .formatGmailDate(
            exclusiveEnd
          )
      );
    }

    if (request.additionalQuery) {
      parts.push(
        request.additionalQuery
      );
    }

    return parts.join(' ');
  },

  /**
   * Normalizes Gmail scan options.
   *
   * @param {Object=} options Options.
   * @return {Object} Normalized options.
   */
  normalizeScanOptions: function(options) {
    const input =
      options || {};

    let lookbackDays =
      PayTrackerPayslipImportService
        .toNumber(
          input.lookbackDays
        );

    if (!lookbackDays) {
      lookbackDays =
        PayTrackerPayslipImportService
          .DEFAULT_LOOKBACK_DAYS;
    }

    lookbackDays =
      Math.max(
        1,
        Math.min(
          lookbackDays,
          PayTrackerPayslipImportService
            .MAX_LOOKBACK_DAYS
        )
      );

    let maxThreads =
      PayTrackerPayslipImportService
        .toNumber(
          input.maxThreads
        );

    if (!maxThreads) {
      maxThreads =
        PayTrackerPayslipImportService
          .DEFAULT_MAX_THREADS;
    }

    maxThreads =
      Math.max(
        1,
        Math.min(
          maxThreads,
          PayTrackerPayslipImportService
            .MAX_THREADS
        )
      );

    const today =
      PayTrackerPayslipImportService
        .startOfDay(
          new Date()
        );

    let searchEndDate =
      PayTrackerPayslipImportService
        .toDateOrNull(
          input.searchEndDate
        ) ||
      today;

    searchEndDate =
      PayTrackerPayslipImportService
        .startOfDay(
          searchEndDate
        );

    let searchStartDate =
      PayTrackerPayslipImportService
        .toDateOrNull(
          input.searchStartDate
        );

    if (!searchStartDate) {
      searchStartDate =
        new Date(
          searchEndDate.getTime()
        );

      searchStartDate.setDate(
        searchStartDate.getDate() -
        lookbackDays
      );
    }

    searchStartDate =
      PayTrackerPayslipImportService
        .startOfDay(
          searchStartDate
        );

    if (
      searchStartDate.getTime() >
      searchEndDate.getTime()
    ) {
      throw new Error(
        'Gmail scan start date cannot be after the end date.'
      );
    }

    return {
      lookbackDays:
        lookbackDays,

      maxThreads:
        maxThreads,

      searchStartDate:
        searchStartDate,

      searchEndDate:
        searchEndDate,

      additionalQuery:
        PayTrackerPayslipImportService
          .cleanText(
            input.additionalQuery
          )
    };
  },

  /**
   * Tests whether a date is within scan bounds.
   *
   * @param {Date} value Date.
   * @param {Object} options Scan options.
   * @return {boolean} True when in range.
   */
  isDateWithinRange: function(
    value,
    options
  ) {
    const date =
      PayTrackerPayslipImportService
        .toDateOrNull(
          value
        );

    if (!date) {
      return false;
    }

    const request =
      options || {};

    if (
      request.searchStartDate &&
      date.getTime() <
      request.searchStartDate.getTime()
    ) {
      return false;
    }

    if (request.searchEndDate) {
      const endOfDay =
        new Date(
          request.searchEndDate
            .getTime()
        );

      endOfDay.setHours(
        23,
        59,
        59,
        999
      );

      if (
        date.getTime() >
        endOfDay.getTime()
      ) {
        return false;
      }
    }

    return true;
  },

  /**
   * Creates a Payroll Scan History record.
   *
   * @param {Object} scan Scan data.
   */
  createScanHistoryRecord: function(scan) {
    const spreadsheet =
      SpreadsheetApp
        .getActiveSpreadsheet();

    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYROLL_SCAN_HISTORY;

    const sheet =
      spreadsheet.getSheetByName(
        definition.NAME
      );

    if (!sheet) {
      throw new Error(
        'Payroll Scan History sheet was not found.'
      );
    }

    const values =
      PayTrackerPayslipImportService
        .scanHistoryToRow(
          Object.assign(
            {},
            scan,
            {
              completedAt:
                '',

              threadsFound:
                0,

              messagesChecked:
                0,

              messagesMatched:
                0,

              pdfAttachmentsFound:
                0,

              payslipsImported:
                0,

              duplicatesSkipped:
                0,

              errors:
                '',

              summary:
                'Gmail scan started.'
            }
          )
        );

    sheet.appendRow(
      values
    );

    SpreadsheetApp.flush();
  },

  /**
   * Updates an existing scan-history record.
   *
   * @param {string} scanId Scan ID.
   * @param {Object} changes Changes.
   */
  updateScanHistoryRecord: function(
    scanId,
    changes
  ) {
    const location =
      PayTrackerPayslipImportService
        .findScanHistoryRow(
          scanId
        );

    if (!location) {
      return;
    }

    const current =
      PayTrackerPayslipImportService
        .rowToScanHistory(
          location.sheet
            .getRange(
              location.rowNumber,
              1,
              1,
              location.definition
                .HEADERS.length
            )
            .getValues()[0]
        );

    const updated =
      Object.assign(
        {},
        current,
        changes || {}
      );

    location.sheet
      .getRange(
        location.rowNumber,
        1,
        1,
        location.definition
          .HEADERS.length
      )
      .setValues([
        PayTrackerPayslipImportService
          .scanHistoryToRow(
            updated
          )
      ]);

    SpreadsheetApp.flush();
  },

  /**
   * Completes a scan-history record.
   *
   * @param {Object} result Scan result.
   */
  completeScanHistoryRecord: function(
    result
  ) {
    const status =
      result.success
        ? PayTrackerPayrollConfig
            .SCAN_STATUSES
            .COMPLETED
        : PayTrackerPayrollConfig
            .SCAN_STATUSES
            .FAILED;

    const errorText =
      (result.errors || [])
        .join(' | ');

    const summary = [
      result.dryRun
        ? 'Preview scan'
        : 'Gmail scan',

      'checked ' +
        (
          result.messagesChecked ||
          0
        ) +
        ' messages;',

      'matched ' +
        (
          result.messagesMatched ||
          0
        ) +
        ';',

      'found ' +
        (
          result.pdfAttachmentsFound ||
          0
        ) +
        ' PDF attachments;',

      'imported ' +
        (
          result.payslipsImported ||
          0
        ) +
        ';',

      'skipped ' +
        (
          result.duplicatesSkipped ||
          0
        ) +
        ' duplicates.'
    ].join(' ');

    PayTrackerPayslipImportService
      .updateScanHistoryRecord(
        result.scanId,
        {
          status:
            status,

          completedAt:
            result.completedAt ||
            new Date(),

          threadsFound:
            result.threadsFound || 0,

          messagesChecked:
            result.messagesChecked || 0,

          messagesMatched:
            result.messagesMatched || 0,

          pdfAttachmentsFound:
            result.pdfAttachmentsFound || 0,

          payslipsImported:
            result.payslipsImported || 0,

          duplicatesSkipped:
            result.duplicatesSkipped || 0,

          errors:
            errorText,

          summary:
            summary
        }
      );
  },

  /**
   * Finds one scan-history row.
   *
   * @param {string} scanId Scan ID.
   * @return {Object|null} Location.
   */
  findScanHistoryRow: function(scanId) {
    const spreadsheet =
      SpreadsheetApp
        .getActiveSpreadsheet();

    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYROLL_SCAN_HISTORY;

    const sheet =
      spreadsheet.getSheetByName(
        definition.NAME
      );

    if (!sheet) {
      return null;
    }

    const idColumn =
      definition.COLUMNS
        .SCAN_ID;

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
      PayTrackerPayslipImportService
        .normalizeText(
          scanId
        );

    for (
      let index = 0;
      index < values.length;
      index += 1
    ) {
      if (
        PayTrackerPayslipImportService
          .normalizeText(
            values[index][0]
          ) === target
      ) {
        return {
          sheet:
            sheet,

          definition:
            definition,

          rowNumber:
            index + 2
        };
      }
    }

    return null;
  },

  /**
   * Converts scan data into the configured sheet row.
   *
   * @param {Object} scan Scan data.
   * @return {Array<*>} Row.
   */
  scanHistoryToRow: function(scan) {
    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYROLL_SCAN_HISTORY;

    const values = {
      'Scan ID':
        scan.scanId || '',

      'Scan Started At':
        scan.startedAt || '',

      'Scan Completed At':
        scan.completedAt || '',

      'Status':
        scan.status || '',

      'Search Start Date':
        scan.searchStartDate || '',

      'Search End Date':
        scan.searchEndDate || '',

      'Gmail Query':
        scan.gmailQuery || '',

      'Threads Found':
        scan.threadsFound || 0,

      'Messages Checked':
        scan.messagesChecked || 0,

      'Messages Matched':
        scan.messagesMatched || 0,

      'PDF Attachments Found':
        scan.pdfAttachmentsFound || 0,

      'Payslips Imported':
        scan.payslipsImported || 0,

      'Duplicates Skipped':
        scan.duplicatesSkipped || 0,

      'Errors':
        scan.errors || '',

      'Summary':
        scan.summary || ''
    };

    return definition.HEADERS.map(
      function(header) {
        return Object.prototype
          .hasOwnProperty.call(
            values,
            header
          )
          ? values[header]
          : '';
      }
    );
  },

  /**
   * Converts one scan-history row into an object.
   *
   * @param {Array<*>} row Row.
   * @return {Object} Scan record.
   */
  rowToScanHistory: function(row) {
    const definition =
      PayTrackerPayrollConfig
        .SHEETS
        .PAYROLL_SCAN_HISTORY;

    const read =
      function(header) {
        const index =
          definition.HEADERS
            .indexOf(
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
        read('Status'),

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
        read('Messages Matched'),

      pdfAttachmentsFound:
        read('PDF Attachments Found'),

      payslipsImported:
        read('Payslips Imported'),

      duplicatesSkipped:
        read('Duplicates Skipped'),

      errors:
        read('Errors'),

      summary:
        read('Summary')
    };
  },

  /**
   * Calculates a rule confidence score.
   *
   * @param {Object} rule Rule conditions.
   * @return {number} Score from 0 to 100.
   */
  calculateRuleConfidence: function(rule) {
    const value =
      rule || {};

    let score = 40;

    if (
      PayTrackerPayslipImportService
        .cleanText(
          value.senderEquals
        )
    ) {
      score += 30;
    } else if (
      PayTrackerPayslipImportService
        .cleanText(
          value.senderContains
        )
    ) {
      score += 20;
    }

    if (
      PayTrackerPayslipImportService
        .cleanText(
          value.subjectContains
        )
    ) {
      score += 20;
    }

    if (
      PayTrackerPayslipImportService
        .cleanText(
          value.filenameContains
        )
    ) {
      score += 10;
    }

    return Math.min(
      score,
      100
    );
  },

  /**
   * Creates a scan ID.
   *
   * @return {string} Scan ID.
   */
  createScanId: function() {
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
      'PAYROLL-SCAN-' +
      timestamp +
      '-' +
      random
    );
  },

  /**
   * Formats a Gmail date query value.
   *
   * @param {Date} date Date.
   * @return {string} yyyy/MM/dd.
   */
  formatGmailDate: function(date) {
    return Utilities.formatDate(
      date,
      Session.getScriptTimeZone(),
      'yyyy/MM/dd'
    );
  },

  /**
   * Returns start of day.
   *
   * @param {Date} date Date.
   * @return {Date} Start of day.
   */
  startOfDay: function(date) {
    const value =
      new Date(
        date.getTime()
      );

    value.setHours(
      0,
      0,
      0,
      0
    );

    return value;
  },

  /**
   * Converts a value to Date or null.
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
   * Converts value to a number.
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
   * Converts checkbox-like values to boolean.
   *
   * @param {*} value Value.
   * @return {boolean} Boolean.
   */
  toBoolean: function(value) {
    if (value === true) {
      return true;
    }

    const normalized =
      PayTrackerPayslipImportService
        .normalizeText(
          value
        );

    return (
      normalized === 'true' ||
      normalized === 'yes' ||
      normalized === '1' ||
      normalized === 'active'
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
    return PayTrackerPayslipImportService
      .cleanText(
        value
      )
      .toLowerCase();
  },

  /**
   * Returns a safe error message.
   *
   * @param {*} error Error.
   * @return {string} Error message.
   */
  getErrorMessage: function(error) {
    if (!error) {
      return 'Unknown Payroll Centre error.';
    }

    return error.message
      ? String(error.message)
      : String(error);
  }
});

/**
 * Runs a safe Gmail preview.
 *
 * This searches the last 365 days but does not save PDFs
 * or add Payslip Register records.
 *
 * @return {Object} Preview result.
 */
function testPayTrackerPayslipGmailPreview() {
  return PayTrackerPayslipImportService
    .previewGmailScan({
      lookbackDays:
        365,

      maxThreads:
        100
    });
}

/**
 * Performs the real manual Gmail import.
 *
 * This saves new PDFs to Drive and creates Payslip
 * Register records.
 *
 * @return {Object} Import result.
 */
function scanPayTrackerPayslipsFromGmail() {
  return PayTrackerPayslipImportService
    .scanGmail({
      lookbackDays:
        365,

      maxThreads:
        100
    });
}