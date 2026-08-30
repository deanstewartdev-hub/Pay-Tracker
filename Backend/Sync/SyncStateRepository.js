/*******************************************************
 * PAY TRACKER V3.2
 * Persisted sync health -- one row per task ID, upserted in
 * place (never appended-and-left, so this sheet never grows
 * unbounded). Google Sheets remains the source of truth, same
 * as every other ledger in this app.
 *******************************************************/

const PayTrackerSyncStateRepository = Object.freeze({
  getAll: function() {
    const sheet = this.getSheet();
    const headers = PayTrackerSyncConfig.SHEET.HEADERS;
    if (sheet.getLastRow() <= 1) return [];
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length)
      .getValues().map(function(row, index) {
        const record = { rowNumber: index + 2 };
        headers.forEach(function(header, column) {
          record[PayTrackerJobRegistryRepository.toKey(header)] = row[column];
        });
        return record;
      });
  },

  getByTaskId: function(taskId) {
    const id = String(taskId || '');
    return this.getAll().filter(function(record) {
      return record.taskId === id;
    })[0] || null;
  },

  /**
   * Upserts one task's latest result. Only overwrites lastSuccess
   * when this attempt actually succeeded (or was already-current),
   * so a failed attempt never erases the last known-good timestamp
   * -- that timestamp is exactly what the Failure Experience UI
   * shows ("Monzo data last successfully updated: 4 hours ago").
   */
  recordResult: function(input) {
    const value = input || {};
    const sheet = this.getSheet();
    const existing = this.getByTaskId(value.taskId);
    const now = new Date();
    const succeeded = value.status === PayTrackerSyncConfig.TASK_STATUSES.UPDATED ||
      value.status === PayTrackerSyncConfig.TASK_STATUSES.ALREADY_CURRENT;

    const lastSuccess = succeeded ? now
      : (existing && existing.lastSuccess ? existing.lastSuccess : '');

    const row = [
      value.taskId, value.taskName || '', now, lastSuccess,
      value.status || '', value.durationMs === undefined ? '' : value.durationMs,
      value.runId || '', value.triggerSource || '',
      value.created === undefined ? '' : value.created,
      value.updated === undefined ? '' : value.updated,
      value.skipped === undefined ? '' : value.skipped,
      value.message || '', value.error || '', now
    ];

    if (existing) sheet.getRange(existing.rowNumber, 1, 1, row.length).setValues([row]);
    else sheet.appendRow(row);
    return this.getByTaskId(value.taskId);
  },

  getSheet: function() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) throw new Error('No active Pay Tracker spreadsheet is available.');
    let sheet = spreadsheet.getSheetByName(PayTrackerSyncConfig.SHEET.NAME);
    if (!sheet) {
      PayTrackerSyncSetupService.setup();
      sheet = spreadsheet.getSheetByName(PayTrackerSyncConfig.SHEET.NAME);
    }
    return sheet;
  }
});
