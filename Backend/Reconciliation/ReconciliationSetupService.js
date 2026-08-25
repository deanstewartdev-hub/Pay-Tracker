/*******************************************************
 * PAY TRACKER V3.0
 * Idempotent Job Registry and Action Centre setup.
 *******************************************************/

const PayTrackerReconciliationSetupService = Object.freeze({
  setup: function() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) throw new Error('No active spreadsheet is available.');

    const result = { success: true, created: [], updated: [], jobsAdded: 0 };
    PayTrackerReconciliationConfig.getDefinitions().forEach(function(definition) {
      const state = PayTrackerReconciliationSetupService.ensureSheet(
        spreadsheet, definition
      );
      result[state.created ? 'created' : 'updated'].push(definition.NAME);
    });
    result.jobsAdded = PayTrackerReconciliationSetupService.seedJobs(spreadsheet);
    SpreadsheetApp.flush();
    return result;
  },

  ensureSheet: function(spreadsheet, definition) {
    let sheet = spreadsheet.getSheetByName(definition.NAME);
    const created = !sheet;
    if (!sheet) sheet = spreadsheet.insertSheet(definition.NAME);
    const missing = definition.HEADERS.length - sheet.getMaxColumns();
    if (missing > 0) sheet.insertColumnsAfter(sheet.getMaxColumns(), missing);

    const range = sheet.getRange(1, 1, 1, definition.HEADERS.length);
    const existing = range.getDisplayValues()[0];
    const next = definition.HEADERS.map(function(header, index) {
      const current = String(existing[index] || '').trim();
      if (!current) return header;
      if (current !== header) {
        throw new Error(
          definition.NAME + ' header mismatch at column ' + (index + 1) +
          '. Existing data was not changed.'
        );
      }
      return current;
    });
    range.setValues([next]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, definition.HEADERS.length)
      .setFontWeight('bold').setBackground('#172554').setFontColor('#ffffff');
    return { created: created };
  },

  seedJobs: function(spreadsheet) {
    const definition = PayTrackerReconciliationConfig.SHEETS.JOBS;
    const sheet = spreadsheet.getSheetByName(definition.NAME);
    const ids = sheet.getLastRow() > 1
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues()
          .map(function(row) { return String(row[0]).toLowerCase(); })
      : [];
    let added = 0;
    PayTrackerReconciliationConfig.DEFAULT_JOBS.forEach(function(job) {
      if (ids.indexOf(job.jobId.toLowerCase()) !== -1) return;
      const now = new Date();
      sheet.appendRow([
        job.jobId, job.jobName, job.employer, job.employerKey,
        job.payrollGroupId, job.stafflineReferences,
        job.calendarMatchingRules, job.basicHourlyRate, job.enhancementRules, job.taxable,
        job.annualLeaveEnabled, '', '', '', true, false, '', now, now
      ]);
      added += 1;
    });
    return added;
  }
});

function setupPayTrackerReconciliationFoundation() {
  return PayTrackerReconciliationSetupService.setup();
}
