/*******************************************************
 * PAY TRACKER V3.0
 * Backend/AnnualLeave/AnnualLeaveGmailImportService.js
 *
 * Purpose:
 * - Perform manual read-only Gmail searches for Annual Leave emails
 * - Match against Annual Leave Email Rules (one rule = one Job ID)
 * - Extract leave dates and status from the subject/body
 * - Auto-import only High-confidence matches into Annual Leave Usage
 * - Send Medium/Low confidence matches to the Action Centre
 * - Update (never duplicate) the same thread's record on a
 *   cancellation email
 * - Record every scan in Annual Leave Email Scan History
 *
 * Reuses PayTrackerPayslipImportService's generic scan-option
 * normalisation, message-metadata extraction and date helpers --
 * none of that is payslip-specific.
 *
 * Important: Gmail is scanned only when explicitly requested.
 * Emails are never modified, moved, labelled or deleted.
 *******************************************************/

const PayTrackerAnnualLeaveGmailImportService = Object.freeze({
  DEFAULT_LOOKBACK_DAYS: 180,

  DEFAULT_MAX_THREADS: 100,

  SEARCH_SUBJECT_TERMS: Object.freeze([
    'annual leave', 'holiday request', 'holiday approved', 'leave approved',
    'leave confirmation', 'time off', 'absence request', 'leave cancelled',
    'holiday cancelled', 'leave balance', ' AL '
  ]),

  scanGmail: function(options) {
    return PayTrackerAnnualLeaveGmailImportService.runScan(options, false);
  },

  previewGmailScan: function(options) {
    return PayTrackerAnnualLeaveGmailImportService.runScan(options, true);
  },

  runScan: function(options, dryRun) {
    const request = PayTrackerPayslipImportService.normalizeScanOptions(options);
    const scanId = PayTrackerAnnualLeaveGmailImportService.createScanId();
    const startedAt = new Date();

    const result = {
      success: false, scanId: scanId, dryRun: dryRun === true, query: '',
      startedAt: startedAt, completedAt: null, threadsFound: 0,
      messagesChecked: 0, messagesMatched: 0, approvedLeaveFound: 0,
      cancelledLeaveFound: 0, recordsCreated: 0, duplicatesSkipped: 0,
      needsReview: 0, errors: [], records: []
    };

    PayTrackerAnnualLeaveGmailImportService.createScanHistoryRecord(scanId, startedAt, request);

    try {
      const rules = PayTrackerAnnualLeaveEmailRulesRepository.getActive();
      if (!rules.length) {
        throw new Error(
          'No active Annual Leave Email Rules were found. Add a rule in the ' +
          '"Annual Leave Email Rules" sheet (Sender Contains/Equals, ' +
          'Subject Contains, or Body Contains, plus a Job ID) before scanning.'
        );
      }

      const query = PayTrackerAnnualLeaveGmailImportService.buildGmailQuery(request);
      result.query = query;

      const threads = GmailApp.search(query, 0, request.maxThreads);
      result.threadsFound = threads.length;

      for (let threadIndex = 0; threadIndex < threads.length; threadIndex += 1) {
        const thread = threads[threadIndex];
        const messages = thread.getMessages();

        for (let messageIndex = 0; messageIndex < messages.length; messageIndex += 1) {
          const message = messages[messageIndex];
          if (!PayTrackerPayslipImportService.isDateWithinRange(message.getDate(), request)) continue;

          result.messagesChecked += 1;

          try {
            const messageResult = PayTrackerAnnualLeaveGmailImportService.processMessage({
              message: message, rules: rules, dryRun: dryRun === true
            });

            if (messageResult.matched) {
              result.messagesMatched += 1;
              if (messageResult.status === 'Approved') result.approvedLeaveFound += 1;
              if (messageResult.status === 'Cancelled') result.cancelledLeaveFound += 1;
              if (messageResult.created) result.recordsCreated += 1;
              if (messageResult.duplicate) result.duplicatesSkipped += 1;
              if (messageResult.needsReview) result.needsReview += 1;
              result.records.push(messageResult);
            }
          } catch (messageError) {
            result.errors.push(PayTrackerAnnualLeaveGmailImportService.getErrorMessage(messageError));
          }
        }
      }

      result.success = true;
      result.completedAt = new Date();
      PayTrackerAnnualLeaveGmailImportService.completeScanHistoryRecord(result);
      return result;
    } catch (error) {
      result.success = false;
      result.completedAt = new Date();
      result.errors.push(PayTrackerAnnualLeaveGmailImportService.getErrorMessage(error));
      PayTrackerAnnualLeaveGmailImportService.completeScanHistoryRecord(result);
      throw error;
    }
  },

  /**
   * Processes one Gmail message: matches rules, extracts dates and
   * status, scores confidence, then either creates/updates an
   * Annual Leave Usage record (High confidence) or a source-linked
   * Action Centre review item (Medium/Low). Never both.
   */
  processMessage: function(input) {
    const message = input.message;
    const rules = input.rules || [];
    const dryRun = input.dryRun === true;

    const metadata = PayTrackerPayslipImportService.getMessageMetadata(message);
    metadata.bodyText = message.getPlainBody();

    const matchedRule = rules.filter(function(rule) {
      return PayTrackerAnnualLeaveEmailRulesRepository.matches(rule, metadata);
    })[0];

    if (!matchedRule) return { matched: false };

    const combinedText = [metadata.emailSubject, metadata.bodyText].join(' ');
    const dateRange = PayTrackerAnnualLeaveGmailImportService.extractDateRange(combinedText);
    const status = PayTrackerAnnualLeaveGmailImportService.detectLeaveStatus(combinedText);

    const confidence = PayTrackerAnnualLeaveGmailImportService.computeConfidence({
      rule: matchedRule, dateRange: dateRange, status: status
    });

    const existing = PayTrackerAnnualLeaveGmailImportService.findByGmailMessageId(metadata.gmailMessageId);
    if (existing) return { matched: true, duplicate: true, status: status };

    if (dryRun) {
      return {
        matched: true, preview: true, jobId: matchedRule.jobId, status: status,
        dateRange: dateRange, confidence: confidence,
        emailSubject: metadata.emailSubject, emailSender: metadata.emailSender
      };
    }

    if (confidence === PayTrackerAnnualLeaveConfig.CONFIDENCE_LEVELS.HIGH) {
      const threadRecord = PayTrackerAnnualLeaveGmailImportService.findOpenByThreadId(metadata.gmailThreadId);

      if (status === 'Cancelled' && threadRecord) {
        PayTrackerAnnualLeaveUsageRepository.update(threadRecord.alUsageId, {
          leaveStatus: 'Cancelled',
          notes: (threadRecord.notes ? threadRecord.notes + ' | ' : '') +
            'Cancelled by a later email in the same thread.'
        });
        return { matched: true, created: false, updated: true, status: status };
      }

      const record = PayTrackerAnnualLeaveUsageRepository.create({
        jobId: matchedRule.jobId,
        leaveStart: dateRange.start || '',
        leaveEnd: dateRange.end || dateRange.start || '',
        leaveStatus: status,
        sourceType: 'Gmail',
        gmailMessageId: metadata.gmailMessageId,
        gmailThreadId: metadata.gmailThreadId,
        approvalConfidence: confidence,
        manualReviewStatus: 'Not Needed',
        notes: 'Imported from Gmail: "' + metadata.emailSubject + '"'
      });
      return { matched: true, created: true, status: status, jobId: matchedRule.jobId, alUsageId: record.alUsageId };
    }

    PayTrackerActionCentreRepository.create({
      actionType: 'Annual Leave Email Needs Review',
      title: 'Confirm Annual Leave email for ' + (matchedRule.jobId || 'an unclear job'),
      description: [
        'Subject: ' + metadata.emailSubject,
        dateRange.start ? 'Detected dates: ' + dateRange.start + ' to ' + (dateRange.end || dateRange.start) : 'No dates detected',
        'Detected status: ' + (status || 'Unclear')
      ].join(' | '),
      priority: 'Normal',
      jobId: matchedRule.jobId || '',
      sourceType: 'Gmail',
      sourceId: metadata.gmailMessageId,
      confidence: confidence,
      suggestedResolution: 'Review the email and, if correct, add an Annual Leave usage record manually.'
    });

    return {
      matched: true, created: false, needsReview: true, status: status,
      jobId: matchedRule.jobId, confidence: confidence
    };
  },

  findByGmailMessageId: function(gmailMessageId) {
    if (!gmailMessageId) return null;
    return PayTrackerAnnualLeaveUsageRepository.getAll().filter(function(record) {
      return record.gmailMessageId === gmailMessageId;
    })[0] || null;
  },

  findOpenByThreadId: function(gmailThreadId) {
    if (!gmailThreadId) return null;
    return PayTrackerAnnualLeaveUsageRepository.getAll().filter(function(record) {
      return record.gmailThreadId === gmailThreadId &&
        record.leaveStatus !== 'Cancelled' && record.leaveStatus !== 'Rejected';
    })[0] || null;
  },

  /**
   * High: known sender/subject/body rule matched + a recognised Job
   * ID on that rule + explicit status wording + an exact date found.
   * Medium: rule matched + dates found, but status wording was vague.
   * Low: anything else -- missing dates, no clear status, or the
   * rule has no Job ID configured. Never guess the job when unclear.
   */
  computeConfidence: function(input) {
    const rule = input.rule || {};
    const dateRange = input.dateRange || {};
    const status = input.status;
    const levels = PayTrackerAnnualLeaveConfig.CONFIDENCE_LEVELS;

    const hasJobId = Boolean(String(rule.jobId || '').trim());
    const hasDate = Boolean(dateRange.start);
    const hasClearStatus = status === 'Approved' || status === 'Cancelled' || status === 'Rejected';

    if (hasJobId && hasDate && hasClearStatus) return levels.HIGH;
    if (hasJobId && hasDate) return levels.MEDIUM;
    return levels.LOW;
  },

  detectLeaveStatus: function(text) {
    const value = String(text || '').toLowerCase();
    const keywords = PayTrackerAnnualLeaveConfig.STATUS_KEYWORDS;
    const order = ['Cancelled', 'Rejected', 'Approved', 'Requested'];
    for (let index = 0; index < order.length; index += 1) {
      const status = order[index];
      const found = keywords[status].some(function(term) { return value.indexOf(term) !== -1; });
      if (found) return status;
    }
    return 'Requested';
  },

  /**
   * Best-effort date-range extraction. Supports "27 Jul 2026" /
   * "27 July 2026" and "27/07/2026" / "27-07-2026" styles, single or
   * as a range ("27 Jul 2026 - 29 Jul 2026", "27/07/2026 to
   * 29/07/2026"). Returns {start: 'yyyy-MM-dd', end: 'yyyy-MM-dd'} or
   * {} when nothing reliable was found -- callers must treat a
   * missing date as Low/Medium confidence, never guess one.
   */
  extractDateRange: function(text) {
    const value = String(text || '');
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const found = [];

    const textualPattern = /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})\b/gi;
    let match;
    while ((match = textualPattern.exec(value)) !== null) {
      const day = Number(match[1]);
      const month = monthNames.indexOf(match[2].toLowerCase()) + 1;
      const year = Number(match[3]);
      const date = PayTrackerAnnualLeaveGmailImportService.toIsoDate(year, month, day);
      if (date) found.push(date);
    }

    const numericPattern = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g;
    while ((match = numericPattern.exec(value)) !== null) {
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3]);
      const date = PayTrackerAnnualLeaveGmailImportService.toIsoDate(year, month, day);
      if (date) found.push(date);
    }

    if (!found.length) return {};
    found.sort();
    return { start: found[0], end: found[found.length - 1] };
  },

  toIsoDate: function(year, month, day) {
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(year, month - 1, day);
    if (date.getMonth() !== month - 1) return null;
    const pad = function(value) { return value < 10 ? '0' + value : String(value); };
    return year + '-' + pad(month) + '-' + pad(day);
  },

  buildGmailQuery: function(request) {
    const subjectTerms = PayTrackerAnnualLeaveGmailImportService.SEARCH_SUBJECT_TERMS.map(function(term) {
      return 'subject:"' + term.trim() + '"';
    }).join(' OR ');

    const parts = ['(' + subjectTerms + ')'];

    if (request.searchStartDate) {
      parts.push('after:' + PayTrackerPayslipImportService.formatGmailDate(request.searchStartDate));
    }
    if (request.searchEndDate) {
      const exclusiveEnd = new Date(request.searchEndDate.getTime());
      exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
      parts.push('before:' + PayTrackerPayslipImportService.formatGmailDate(exclusiveEnd));
    }

    return parts.join(' ');
  },

  createScanHistoryRecord: function(scanId, startedAt, request) {
    const sheet = PayTrackerAnnualLeaveGmailImportService.getScanHistorySheet();
    sheet.appendRow([
      scanId, startedAt, '', 'Running', request.searchStartDate || '',
      request.searchEndDate || '', '', 0, 0, 0, 0, 0, 0, 0, 0, '', 'Scan started.'
    ]);
    SpreadsheetApp.flush();
  },

  completeScanHistoryRecord: function(result) {
    const sheet = PayTrackerAnnualLeaveGmailImportService.getScanHistorySheet();
    const headers = PayTrackerAnnualLeaveConfig.SHEETS.EMAIL_SCAN_HISTORY.HEADERS;
    const idColumn = headers.indexOf('Scan ID') + 1;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;

    const ids = sheet.getRange(2, idColumn, lastRow - 1, 1).getDisplayValues();
    let rowNumber = -1;
    for (let index = 0; index < ids.length; index += 1) {
      if (ids[index][0] === result.scanId) { rowNumber = index + 2; break; }
    }
    if (rowNumber === -1) return;

    const summary = [
      result.dryRun ? 'Preview scan' : 'Gmail scan',
      'checked ' + result.messagesChecked + ' messages;',
      'matched ' + result.messagesMatched + ';',
      'created ' + (result.recordsCreated || 0) + ';',
      'needs review ' + (result.needsReview || 0) + ';',
      'skipped ' + (result.duplicatesSkipped || 0) + ' duplicates.'
    ].join(' ');

    sheet.getRange(rowNumber, 1, 1, headers.length).setValues([[
      result.scanId, sheet.getRange(rowNumber, 2).getValue(), result.completedAt,
      result.success ? 'Completed' : 'Failed',
      sheet.getRange(rowNumber, 5).getValue(), sheet.getRange(rowNumber, 6).getValue(),
      result.query || '', result.threadsFound || 0, result.messagesChecked || 0,
      result.messagesMatched || 0, result.approvedLeaveFound || 0,
      result.cancelledLeaveFound || 0, result.recordsCreated || 0,
      result.duplicatesSkipped || 0, result.needsReview || 0,
      (result.errors || []).join(' | '), summary
    ]]);
    SpreadsheetApp.flush();
  },

  getScanHistorySheet: function() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const definition = PayTrackerAnnualLeaveConfig.SHEETS.EMAIL_SCAN_HISTORY;
    let sheet = spreadsheet.getSheetByName(definition.NAME);
    if (!sheet) {
      PayTrackerAnnualLeaveSetupService.setup();
      sheet = spreadsheet.getSheetByName(definition.NAME);
    }
    return sheet;
  },

  createScanId: function() {
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss');
    const random = Utilities.getUuid().replace(/-/g, '').substring(0, 8).toUpperCase();
    return 'AL-EMAIL-SCAN-' + timestamp + '-' + random;
  },

  getErrorMessage: function(error) {
    if (!error) return 'Unknown Annual Leave Gmail import error.';
    return error.message ? String(error.message) : String(error);
  }
});

function previewPayTrackerAnnualLeaveGmailScan(options) {
  return PayTrackerAnnualLeaveGmailImportService.previewGmailScan(options);
}

function scanPayTrackerAnnualLeaveGmail(options) {
  return PayTrackerAnnualLeaveGmailImportService.scanGmail(options);
}
