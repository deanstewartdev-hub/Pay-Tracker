/*******************************************************
 * PAY TRACKER V3.0
 * Idempotent Staffline reconciliation setup.
 *
 * Additive only:
 * - Creates the two new sheets (never touches existing sheets'
 *   columns or data).
 * - Backfills each known job's stafflineReferences ONLY when it
 *   is still blank -- a manually-edited value is never touched.
 *******************************************************/

const PayTrackerStafflineSetupService = Object.freeze({
  // Lowercase substring patterns, mirroring the existing
  // calendarMatchingRules convention on the same Job Registry row.
  // Confirmed against 5 real "Timesheet Approved" emails (Aug 2026).
  KNOWN_PLACEMENT_PATTERNS: Object.freeze({
    'JOB-NHS': 'car parking assistant',
    'JOB-RELIEF-WARDEN': 'relief assistant warden',
    'JOB-NIGHT-SECURITY': 'night security'
  }),

  // Columns holding bare-digit Timesheet ID values (e.g. "621093").
  // Sheets auto-converts a purely-numeric string to a number cell on
  // write, which would silently turn every stored/returned
  // Timesheet ID from a string into a number -- every other ID in
  // this codebase avoids this by using a non-numeric prefix
  // (ACTION-, ADJ-, PAYSLIP-...); Timesheet IDs cannot, since they
  // must match the bare digits Staffline and Gmail both use. Forcing
  // the column to plain-text format is the standard fix.
  TEXT_FORMAT_COLUMNS: Object.freeze({
    'Staffline Timesheets': ['Timesheet ID'],
    'Staffline Payment Lines': ['Normalized Timesheet ID']
  }),

  setup: function() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) throw new Error('No active spreadsheet is available.');

    const result = { success: true, created: [], updated: [], stafflineReferencesBackfilled: [] };
    const self = this;
    PayTrackerStafflineConfig.getDefinitions().forEach(function(definition) {
      const state = PayTrackerReconciliationSetupService.ensureSheet(spreadsheet, definition);
      result[state.created ? 'created' : 'updated'].push(definition.NAME);

      const sheet = spreadsheet.getSheetByName(definition.NAME);
      (self.TEXT_FORMAT_COLUMNS[definition.NAME] || []).forEach(function(header) {
        const columnIndex = definition.HEADERS.indexOf(header) + 1;
        if (columnIndex > 0) {
          sheet.getRange(1, columnIndex, Math.max(sheet.getMaxRows(), 1000), 1).setNumberFormat('@');
        }
      });
    });

    Object.keys(this.KNOWN_PLACEMENT_PATTERNS).forEach(function(jobId) {
      const job = PayTrackerJobRegistryRepository.getById(jobId);
      if (!job) return;
      if (String(job.stafflineReferences || '').trim()) return;
      PayTrackerJobRegistryRepository.updateFields(jobId, {
        stafflineReferences: self.KNOWN_PLACEMENT_PATTERNS[jobId]
      });
      result.stafflineReferencesBackfilled.push(jobId);
    });

    SpreadsheetApp.flush();
    return result;
  }
});

function setupPayTrackerStaffline() {
  const result = PayTrackerStafflineSetupService.setup();
  console.log(JSON.stringify(result, null, 2));
  return result;
}
