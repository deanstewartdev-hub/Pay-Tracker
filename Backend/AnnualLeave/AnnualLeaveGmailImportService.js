/*******************************************************
 * PAY TRACKER V3.0
 * Backend/AnnualLeave/AnnualLeaveGmailImportService.js
 *
 * Purpose:
 * - Perform manual read-only Gmail searches for Annual Leave emails
 * - Match against Annual Leave Email Rules (one rule = one Job ID)
 * - Extract leave dates/hours/status from a PDF or DOCX attachment
 *   (never from the email's own sent date, and never from quoted
 *   reply-chain text -- see extractAttachmentText/stripQuotedReplyText)
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

  // Causeway Coast and Glens Borough Council's warden contact handles
  // paperwork for two separate jobs (Relief Warden day shifts AND
  // Night Security) from the same sender/subject pattern, so the Job
  // ID can never be inferred from sender/subject alone for this
  // domain -- it must come from positive wording inside the
  // attachment. Absence of a Night Security marker is NOT evidence of
  // Relief Warden; both markers, or neither, mean the job is unclear.
  CAUSEWAY_COUNCIL_SENDER_DOMAIN: 'causewaycoastandglens.gov.uk',

  CAUSEWAY_NIGHT_SECURITY_MARKERS: Object.freeze(['night shift', 'night security']),

  CAUSEWAY_RELIEF_WARDEN_MARKERS: Object.freeze([
    'caravan park', 'caravan site', 'relief warden', 'assistant warden'
  ]),

  TEMPORARY_ATTACHMENT_FOLDER_NAME: 'Pay Tracker Temporary Annual Leave Attachment Extraction',

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
   * Processes one Gmail message: matches rules, extracts dates/hours
   * and status, scores confidence, then either creates/updates an
   * Annual Leave Usage record (High confidence) or a source-linked
   * Action Centre review item (Medium/Low). Never both.
   *
   * Dates/hours are read only from a PDF/DOCX attachment when one is
   * present, or from the email body with quoted reply-chain text
   * stripped out when it is not -- never from the raw body (which can
   * contain a quoted prior message's own date/timestamp) and never
   * from the email's sent date. A message from an attachment-required
   * ambiguous sender (see CAUSEWAY_COUNCIL_SENDER_DOMAIN) only gets a
   * Job ID when the attachment contains unambiguous wording for
   * exactly one job; otherwise it is routed to Needs Review rather
   * than guessed.
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

    const strippedBody = PayTrackerAnnualLeaveGmailImportService.stripQuotedReplyText(metadata.bodyText);

    const existing = PayTrackerAnnualLeaveGmailImportService.findByGmailMessageId(metadata.gmailMessageId);
    if (existing) {
      const cheapStatus = PayTrackerAnnualLeaveGmailImportService.detectLeaveStatus(
        [metadata.emailSubject, strippedBody].join(' ')
      );
      return { matched: true, duplicate: true, status: cheapStatus };
    }

    const attachmentExtraction = PayTrackerAnnualLeaveGmailImportService.extractAttachmentText(message);
    const hasAttachmentText = Boolean(attachmentExtraction.text);
    const scopedText = [
      metadata.emailSubject,
      hasAttachmentText ? attachmentExtraction.text : strippedBody
    ].join(' ');

    const dateRange = PayTrackerAnnualLeaveGmailImportService.extractDateRange(scopedText);
    const status = PayTrackerAnnualLeaveGmailImportService.detectLeaveStatus(scopedText);
    const hoursRequested = PayTrackerAnnualLeaveGmailImportService.extractHours(scopedText);

    let effectiveJobId = matchedRule.jobId;
    let jobEvidence = '';
    if (PayTrackerAnnualLeaveGmailImportService.isFromCausewayCouncil(metadata.emailSender)) {
      const classification = PayTrackerAnnualLeaveGmailImportService.classifyCausewayJobFromAttachment(
        hasAttachmentText ? attachmentExtraction.text : ''
      );
      effectiveJobId = classification.jobId;
      jobEvidence = classification.reason;
    }

    const confidence = PayTrackerAnnualLeaveGmailImportService.computeConfidence({
      rule: { jobId: effectiveJobId }, dateRange: dateRange, status: status
    });

    const attachmentSummary = attachmentExtraction.attachmentNames.length
      ? 'Attachments read: ' + attachmentExtraction.attachmentNames.join(', ') + '.'
      : 'No usable attachment text was available.';
    const extractionErrorSummary = attachmentExtraction.errors.length
      ? ' Extraction errors: ' + attachmentExtraction.errors.join('; ') + '.'
      : '';

    if (dryRun) {
      return {
        matched: true, preview: true, jobId: effectiveJobId, status: status,
        dateRange: dateRange, hoursRequested: hoursRequested, confidence: confidence,
        emailSubject: metadata.emailSubject, emailSender: metadata.emailSender,
        jobEvidence: jobEvidence, attachmentNames: attachmentExtraction.attachmentNames,
        attachmentErrors: attachmentExtraction.errors
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
        jobId: effectiveJobId,
        leaveStart: dateRange.start || '',
        leaveEnd: dateRange.end || dateRange.start || '',
        hoursRequested: hoursRequested || 0,
        leaveStatus: status,
        sourceType: 'Gmail',
        gmailMessageId: metadata.gmailMessageId,
        gmailThreadId: metadata.gmailThreadId,
        approvalConfidence: confidence,
        manualReviewStatus: 'Not Needed',
        notes: 'Imported from Gmail: "' + metadata.emailSubject + '". ' + attachmentSummary +
          (jobEvidence ? ' Job evidence: ' + jobEvidence : '')
      });
      return { matched: true, created: true, status: status, jobId: effectiveJobId, alUsageId: record.alUsageId };
    }

    PayTrackerActionCentreRepository.create({
      actionType: 'Annual Leave Email Needs Review',
      title: 'Confirm Annual Leave email for ' + (effectiveJobId || 'an unclear job'),
      description: [
        'Subject: ' + metadata.emailSubject,
        'Sender: ' + metadata.emailSender,
        dateRange.start
          ? 'Detected dates: ' + dateRange.start + ' to ' + (dateRange.end || dateRange.start)
          : 'No confident leave dates were found.',
        hoursRequested ? 'Detected hours: ' + hoursRequested : 'No explicit hours found.',
        'Detected status: ' + (status || 'Unclear'),
        jobEvidence ? 'Job evidence: ' + jobEvidence : '',
        attachmentSummary + extractionErrorSummary
      ].filter(Boolean).join(' | '),
      priority: 'Normal',
      jobId: effectiveJobId || '',
      sourceType: 'Gmail',
      sourceId: metadata.gmailMessageId,
      confidence: confidence,
      suggestedResolution: 'Review the email' +
        (attachmentExtraction.attachmentNames.length ? ' and its attachment(s)' : '') +
        ' and, if correct, add an Annual Leave usage record manually.'
    });

    return {
      matched: true, created: false, needsReview: true, status: status,
      jobId: effectiveJobId, confidence: confidence, jobEvidence: jobEvidence
    };
  },

  /**
   * Removes quoted reply-chain text from a plain-text email body so
   * date/status extraction never reads a prior message's own
   * date/timestamp as if it were the current email's content. Drops
   * everything from the first "On ... wrote:" / "-----Original
   * Message-----" / Outlook "From:"+"Sent:" header onward, plus any
   * line already prefixed with "&gt;".
   */
  stripQuotedReplyText: function(text) {
    const lines = String(text || '').split(/\r?\n/);
    const kept = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const trimmed = line.trim();
      if (/^>/.test(trimmed)) continue;
      if (/^on\s.{0,120}wrote:\s*$/i.test(trimmed)) break;
      if (/^-{2,}\s*original message\s*-{2,}$/i.test(trimmed)) break;
      if (/^from:\s/i.test(trimmed) && /^sent:\s/i.test((lines[index + 1] || '').trim())) break;
      kept.push(line);
    }
    return kept.join(' ').replace(/\s+/g, ' ').trim();
  },

  /**
   * Best-effort "N hours"/"N.N hours" extraction. Returns a number
   * only when that exact wording is present -- never inferred from
   * date ranges or day counts.
   */
  extractHours: function(text) {
    const match = String(text || '').match(/(\d+(?:\.\d+)?)\s*hours?\b/i);
    if (!match) return null;
    const hours = Number(match[1]);
    return Number.isFinite(hours) && hours > 0 ? hours : null;
  },

  isFromCausewayCouncil: function(sender) {
    return String(sender || '').toLowerCase().indexOf(
      PayTrackerAnnualLeaveGmailImportService.CAUSEWAY_COUNCIL_SENDER_DOMAIN
    ) !== -1;
  },

  /**
   * Resolves the real Job ID for a Causeway Coast and Glens Borough
   * Council email using only positive wording found in the
   * attachment. Absence of a Night Security marker is never treated
   * as proof of Relief Warden (and vice versa) -- both markers, or
   * neither, return a null jobId so the caller routes to Needs Review.
   */
  classifyCausewayJobFromAttachment: function(attachmentText) {
    const text = String(attachmentText || '').toLowerCase();
    const service = PayTrackerAnnualLeaveGmailImportService;
    const hasNight = service.CAUSEWAY_NIGHT_SECURITY_MARKERS.some(function(marker) {
      return text.indexOf(marker) !== -1;
    });
    const hasRelief = service.CAUSEWAY_RELIEF_WARDEN_MARKERS.some(function(marker) {
      return text.indexOf(marker) !== -1;
    });

    if (hasNight && hasRelief) {
      return {
        jobId: null,
        reason: 'Both Night Security and Relief Warden wording were found in the attachment -- cannot determine the job automatically.'
      };
    }
    if (hasNight) {
      return { jobId: 'JOB-NIGHT-SECURITY', reason: 'Attachment text contains Night Security wording.' };
    }
    if (hasRelief) {
      return { jobId: 'JOB-RELIEF-WARDEN', reason: 'Attachment text contains Relief Warden / Caravan Park wording.' };
    }
    return {
      jobId: null,
      reason: 'No identifiable Relief Warden or Night Security wording was found in the attachment text.'
    };
  },

  /**
   * Extracts text from every PDF/DOCX/image attachment on a message
   * by round-tripping each through a temporary Google Doc conversion
   * (same technique as PayTrackerPayrollPdfTextService, adapted for a
   * Gmail attachment Blob instead of a stored Drive file). One
   * attachment failing to convert/read does not stop the others --
   * its filename is recorded in `errors` so the caller can flag the
   * message for manual review instead of silently ignoring it.
   */
  extractAttachmentText: function(message) {
    const attachments = message.getAttachments();
    const texts = [];
    const attachmentNames = [];
    const errors = [];

    for (let index = 0; index < attachments.length; index += 1) {
      const attachment = attachments[index];
      const name = attachment.getName() || ('attachment-' + (index + 1));
      try {
        const text = PayTrackerAnnualLeaveGmailImportService.extractTextFromAttachmentBlob(
          attachment.copyBlob(), name
        );
        if (text) {
          texts.push(text);
          attachmentNames.push(name);
        } else {
          errors.push(name + ': no readable text after conversion');
        }
      } catch (attachmentError) {
        errors.push(name + ': ' + PayTrackerAnnualLeaveGmailImportService.getErrorMessage(attachmentError));
      }
    }

    return {
      text: texts.join('\n\n'),
      attachmentNames: attachmentNames,
      errors: errors,
      attachmentCount: attachments.length
    };
  },

  extractTextFromAttachmentBlob: function(blob, filename) {
    let temporaryDocumentId = '';
    try {
      const folder = PayTrackerAnnualLeaveGmailImportService.getOrCreateTemporaryAttachmentFolder_();
      const converted = Drive.Files.create(
        {
          name: 'TEMP - AL ATTACHMENT - ' + (filename || 'attachment') + ' - ' + Utilities.getUuid(),
          mimeType: 'application/vnd.google-apps.document',
          parents: [folder.getId()]
        },
        blob,
        { fields: 'id,name,mimeType' }
      );
      if (!converted || !converted.id) {
        throw new Error('Drive did not return a converted document ID.');
      }
      temporaryDocumentId = String(converted.id);
      return PayTrackerAnnualLeaveGmailImportService.readConvertedAttachmentText_(temporaryDocumentId);
    } finally {
      if (temporaryDocumentId) {
        try {
          DriveApp.getFileById(temporaryDocumentId).setTrashed(true);
        } catch (cleanupError) {
          console.warn('Temporary Annual Leave attachment extraction document could not be trashed.', cleanupError);
        }
      }
    }
  },

  readConvertedAttachmentText_: function(documentId) {
    const maximumAttempts = 8;
    const retryDelayMilliseconds = 750;

    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      try {
        const body = DocumentApp.openById(documentId).getBody();
        const text = body ? String(body.getText() || '').trim() : '';
        if (text) return text;
      } catch (readError) {
        // Drive conversion may not be immediately readable -- retry below.
      }
      if (attempt < maximumAttempts) Utilities.sleep(retryDelayMilliseconds);
    }
    return '';
  },

  getOrCreateTemporaryAttachmentFolder_: function() {
    const name = PayTrackerAnnualLeaveGmailImportService.TEMPORARY_ATTACHMENT_FOLDER_NAME;
    const folders = DriveApp.getFoldersByName(name);
    if (folders.hasNext()) return folders.next();
    return DriveApp.createFolder(name);
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
