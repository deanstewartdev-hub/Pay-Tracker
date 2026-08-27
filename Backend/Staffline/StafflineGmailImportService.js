/*******************************************************
 * PAY TRACKER V3.0
 * Backend/Staffline/StafflineGmailImportService.js
 *
 * Purpose:
 * - Read-only Gmail search for Staffline "Timesheet Approved" emails
 * - Extract the structured field block Staffline always sends
 * - Map Placement Description -> Job ID via each job's
 *   stafflineReferences (lowercase substring patterns, same
 *   convention as the existing calendarMatchingRules field)
 * - Store one row per timesheet in Staffline Timesheets
 *   (idempotent -- rescans update the same row, never duplicate)
 * - Unknown/ambiguous placements are never guessed: they are saved
 *   with Classification Status "Needs Review" and sent to the
 *   Action Centre instead
 *
 * Reuses PayTrackerPayslipImportService's generic scan-option
 * normalisation, message-metadata extraction and date helpers --
 * the same shared helpers AnnualLeaveGmailImportService uses.
 *
 * Important: Gmail is scanned only when explicitly requested.
 * Emails are never modified, moved, labelled or deleted. This
 * service never accesses the Staffline portal.
 *******************************************************/

const PayTrackerStafflineGmailImportService = Object.freeze({
  // Real sender confirmed from 5 known approval emails (Aug 2026).
  // Filtering by sender is far more reliable than a subject guess.
  SENDER: 'ithelpdeskire@stafflinerecruit.com',

  scanGmail: function(options) {
    return PayTrackerStafflineGmailImportService.runScan(options, false);
  },

  previewGmailScan: function(options) {
    return PayTrackerStafflineGmailImportService.runScan(options, true);
  },

  runScan: function(options, dryRun) {
    const request = PayTrackerPayslipImportService.normalizeScanOptions(options);
    const startedAt = new Date();

    const result = {
      success: false, dryRun: dryRun === true, query: '',
      startedAt: startedAt, completedAt: null, threadsFound: 0,
      messagesChecked: 0, messagesMatched: 0, recordsCreated: 0,
      recordsUpdated: 0, needsReview: 0, errors: [], records: []
    };

    try {
      const query = PayTrackerStafflineGmailImportService.buildGmailQuery(request);
      result.query = query;

      const threads = GmailApp.search(query, 0, request.maxThreads);
      result.threadsFound = threads.length;

      for (let threadIndex = 0; threadIndex < threads.length; threadIndex += 1) {
        const messages = threads[threadIndex].getMessages();

        for (let messageIndex = 0; messageIndex < messages.length; messageIndex += 1) {
          const message = messages[messageIndex];
          if (!PayTrackerPayslipImportService.isDateWithinRange(message.getDate(), request)) continue;

          result.messagesChecked += 1;

          try {
            const messageResult = PayTrackerStafflineGmailImportService.processMessage({
              message: message, dryRun: dryRun === true
            });

            if (messageResult.matched) {
              result.messagesMatched += 1;
              if (messageResult.created) result.recordsCreated += 1;
              if (messageResult.updated) result.recordsUpdated += 1;
              if (messageResult.needsReview) result.needsReview += 1;
              result.records.push(messageResult);
            }
          } catch (messageError) {
            result.errors.push(PayTrackerStafflineGmailImportService.getErrorMessage(messageError));
          }
        }
      }

      result.success = true;
      result.completedAt = new Date();
      return result;
    } catch (error) {
      result.success = false;
      result.completedAt = new Date();
      result.errors.push(PayTrackerStafflineGmailImportService.getErrorMessage(error));
      throw error;
    }
  },

  /**
   * Processes one Gmail message: extracts the structured field
   * block, classifies the placement against every job's
   * stafflineReferences, then either previews, or saves/refreshes
   * the Staffline Timesheets row (always) plus an Action Centre
   * item when the placement could not be classified.
   */
  processMessage: function(input) {
    const message = input.message;
    const dryRun = input.dryRun === true;

    const metadata = PayTrackerPayslipImportService.getMessageMetadata(message);
    const fields = PayTrackerStafflineGmailImportService.extractFields(
      message.getPlainBody(), message.getBody()
    );

    if (!fields.timesheetId) return { matched: false };

    const classification = PayTrackerStafflineGmailImportService.classifyPlacement(
      fields.placementDescription
    );

    if (dryRun) {
      return {
        matched: true, preview: true, timesheetId: fields.timesheetId,
        placementDescription: fields.placementDescription, jobId: classification.jobId,
        classificationStatus: classification.status, emailSubject: metadata.emailSubject
      };
    }

    const existed = Boolean(
      PayTrackerStafflineTimesheetRepository.getByTimesheetId(fields.timesheetId)
    );

    const saved = PayTrackerStafflineTimesheetRepository.upsert({
      timesheetId: fields.timesheetId,
      gmailMessageId: metadata.gmailMessageId,
      gmailThreadId: metadata.gmailThreadId,
      approvedBy: fields.approvedBy,
      approvedDate: metadata.emailDate,
      placementDescription: fields.placementDescription,
      clientName: fields.clientName,
      jobId: classification.jobId,
      timesheetStart: fields.timesheetStart,
      timesheetEnd: fields.timesheetEnd,
      workAddress: fields.workAddress,
      portalUrl: fields.portalUrl,
      classificationStatus: classification.status
    });

    if (classification.status === 'Needs Review') {
      const action = PayTrackerActionCentreRepository.create({
        actionType: 'Staffline Placement Needs Review',
        title: 'Confirm job for Staffline placement "' + (fields.placementDescription || 'unknown') + '"',
        description: [
          'Timesheet ' + fields.timesheetId + ' (' + (fields.timesheetStart || '?') + ' to ' + (fields.timesheetEnd || '?') + ')',
          classification.candidateJobIds.length > 1
            ? 'Matched more than one job: ' + classification.candidateJobIds.join(', ')
            : 'No job\'s Staffline References matched this placement text.'
        ].join(' | '),
        priority: 'Normal',
        sourceType: 'Gmail',
        sourceId: metadata.gmailMessageId,
        suggestedResolution: 'Add this placement wording to the correct job\'s Staffline ' +
          'References (Jobs sheet), then re-run the Staffline scan.'
      });
      if (action && action.actionId) {
        PayTrackerStafflineTimesheetRepository.upsert(
          Object.assign({}, saved, { actionItemId: action.actionId })
        );
      }
    }

    return {
      matched: true, created: !existed, updated: existed, timesheetId: fields.timesheetId,
      jobId: classification.jobId, needsReview: classification.status === 'Needs Review'
    };
  },

  /**
   * Extracts the fixed field block Staffline always sends, plus the
   * portal link. Confirmed against 5 real approval emails -- field
   * order and wording do not vary.
   */
  extractFields: function(plainBody, htmlBody) {
    const text = String(plainBody || '');

    function field(label) {
      const match = text.match(new RegExp('^' + label + ':\\s*(.+)$', 'mi'));
      return match ? match[1].trim() : '';
    }

    const approvedByMatch = text.match(/approved by ([^,]+),/i);

    return {
      timesheetId: PayTrackerStafflineConfig.normalizeReference(field('Timesheet Id')),
      placementDescription: field('Placement Description'),
      applicantName: field('Applicant Name'),
      clientName: field('Client Name'),
      timesheetStart: PayTrackerStafflineGmailImportService.toIsoDate(field('Timesheet Start')),
      timesheetEnd: PayTrackerStafflineGmailImportService.toIsoDate(field('Timesheet End')),
      workAddress: field('Work Address'),
      approvedBy: approvedByMatch ? approvedByMatch[1].trim() : '',
      portalUrl: PayTrackerStafflineGmailImportService.extractPortalUrl_(htmlBody)
    };
  },

  /**
   * The plain-text body only has "Click here to view the
   * timesheet" with no URL -- the link itself is HTML-only, so the
   * real portal URL has to come from the raw HTML body's anchor
   * href. Confirmed format from a real email:
   * https://portalni.stafflineni.co.uk/Secure/Candidates/Jobs/
   * Placements/Timesheets/ViewList.aspx#/ApplicantTimesheetList
   * ?timesheetId=<opaque-encrypted-token> -- the token is per-email
   * and cannot be derived from the plain Timesheet ID.
   * @private
   */
  extractPortalUrl_: function(htmlBody) {
    const html = String(htmlBody || '');
    const match = html.match(/<a[^>]+href=(?:"([^"]+)"|'([^']+)')[^>]*>\s*here\s*<\/a>/i);
    return match ? (match[1] || match[2] || '') : '';
  },

  /**
   * Matches a placement description against every job's
   * stafflineReferences (pipe-delimited lowercase substrings,
   * mirroring calendarMatchingRules). Exactly one match ->
   * Classified. Zero or more than one -> Needs Review; never guess.
   */
  classifyPlacement: function(placementDescription) {
    const value = String(placementDescription || '').toLowerCase().trim();

    if (!value) {
      return { status: 'Needs Review', jobId: '', candidateJobIds: [] };
    }

    const candidateJobIds = PayTrackerJobRegistryRepository.getAll().filter(function(job) {
      const patterns = String(job.stafflineReferences || '').toLowerCase().split('|')
        .map(function(pattern) { return pattern.trim(); })
        .filter(Boolean);
      return patterns.some(function(pattern) { return value.indexOf(pattern) !== -1; });
    }).map(function(job) { return job.jobId; });

    if (candidateJobIds.length === 1) {
      return { status: 'Classified', jobId: candidateJobIds[0], candidateJobIds: candidateJobIds };
    }
    return { status: 'Needs Review', jobId: '', candidateJobIds: candidateJobIds };
  },

  toIsoDate: function(ukDate) {
    const match = String(ukDate || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return '';
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getMonth() !== month - 1) return '';
    const pad = function(value) { return value < 10 ? '0' + value : String(value); };
    return year + '-' + pad(month) + '-' + pad(day);
  },

  buildGmailQuery: function(request) {
    const parts = ['from:(' + PayTrackerStafflineGmailImportService.SENDER + ')', 'subject:(Timesheet Approved)'];
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

  getErrorMessage: function(error) {
    if (!error) return 'Unknown Staffline Gmail import error.';
    return error.message ? String(error.message) : String(error);
  }
});
