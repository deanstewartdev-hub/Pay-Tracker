/*******************************************************
 * PAY TRACKER V3.0
 * Idempotent Annual Leave ledger setup.
 *******************************************************/

const PayTrackerAnnualLeaveSetupService = Object.freeze({
  setup: function() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) throw new Error('No active spreadsheet is available.');

    PayTrackerReconciliationSetupService.setup();

    const result = { success: true, created: [], updated: [], jobSettingsBackfilled: 0 };
    PayTrackerAnnualLeaveConfig.getDefinitions().forEach(function(definition) {
      const state = PayTrackerReconciliationSetupService.ensureSheet(
        spreadsheet, definition
      );
      result[state.created ? 'created' : 'updated'].push(definition.NAME);
    });
    result.jobSettingsBackfilled = PayTrackerAnnualLeaveSetupService.backfillJobSettings();
    SpreadsheetApp.flush();
    return result;
  },

  /**
   * Fills the Jobs sheet's Annual Leave setting columns with safe
   * defaults, but only where a cell is genuinely blank -- a manually
   * edited rate/opening-balance/carryover is never overwritten.
   * Never touches Annual Leave Accrual Method / Year Start / Year End.
   */
  backfillJobSettings: function() {
    const defaults = PayTrackerAnnualLeaveConfig.DEFAULT_JOB_SETTINGS;
    const jobs = PayTrackerJobRegistryRepository.getAll(true);
    let backfilled = 0;
    jobs.forEach(function(job) {
      if (job.annualLeaveEnabled !== true) return;
      const fields = {};
      Object.keys(defaults).forEach(function(key) {
        const current = job[key];
        const isBlank = current === '' || current === null || current === undefined;
        if (isBlank) fields[key] = defaults[key];
      });
      if (Object.keys(fields).length === 0) return;
      PayTrackerJobRegistryRepository.updateFields(job.jobId, fields);
      backfilled += 1;
    });
    return backfilled;
  }
});

function setupPayTrackerAnnualLeave() {
  return PayTrackerAnnualLeaveSetupService.setup();
}
