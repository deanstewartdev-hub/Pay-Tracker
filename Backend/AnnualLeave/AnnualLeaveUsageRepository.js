/*******************************************************
 * PAY TRACKER V3.0 - Annual Leave usage ledger repository.
 *******************************************************/

const PayTrackerAnnualLeaveUsageRepository = Object.freeze({
  getAll: function(jobId) {
    const sheet = this.getSheet();
    if (sheet.getLastRow() <= 1) return [];
    const headers = PayTrackerAnnualLeaveConfig.SHEETS.USAGE.HEADERS;
    const records = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length)
      .getValues().map(function(row, index) {
        const record = {};
        headers.forEach(function(header, column) {
          record[PayTrackerJobRegistryRepository.toKey(header)] = row[column];
        });
        record.rowNumber = index + 2;
        return record;
      });
    if (!jobId) return records;
    const id = String(jobId).toLowerCase();
    return records.filter(function(record) {
      return String(record.jobId || '').toLowerCase() === id;
    });
  },

  /**
   * Records one leave period for a job. Not written to
   * automatically from Calendar/Gmail yet -- see
   * docs/v3-Roadmap-Detail.md Phase 5 and the Phase 4 PR notes for
   * why automatic sourcing needs an additive schema change to
   * Calendar Sync Records first, kept out of this change.
   */
  create: function(value) {
    const sheet = this.getSheet();
    const now = new Date();
    const id = 'AL-USE-' + Utilities.getUuid().toUpperCase();
    sheet.appendRow([
      id, value.jobId, value.leaveStart || '', value.leaveEnd || '',
      value.hoursRequested || 0, value.hoursApproved || 0,
      value.hoursTaken || 0, value.hoursPaid || 0,
      value.leaveStatus || 'Taken', value.sourceType || 'Manual Entry',
      value.gmailMessageId || '', value.gmailThreadId || '',
      value.calendarEventId || '', value.payslipId || '',
      value.approvalConfidence || '', value.manualReviewStatus || 'Not Needed',
      value.notes || '', now, now
    ]);
    return this.getById(id);
  },

  update: function(usageId, changes) {
    const record = this.getById(usageId);
    if (!record) throw new Error('Unknown Annual Leave usage record: ' + usageId);
    const sheet = this.getSheet();
    const headers = PayTrackerAnnualLeaveConfig.SHEETS.USAGE.HEADERS;
    Object.keys(changes || {}).forEach(function(key) {
      const columnIndex = headers.findIndex(function(header) {
        return PayTrackerJobRegistryRepository.toKey(header) === key;
      });
      if (columnIndex === -1) return;
      sheet.getRange(record.rowNumber, columnIndex + 1).setValue(changes[key]);
    });
    const updatedAtColumn = headers.indexOf('Updated At');
    sheet.getRange(record.rowNumber, updatedAtColumn + 1).setValue(new Date());
    return this.getById(usageId);
  },

  getById: function(usageId) {
    const id = String(usageId || '').toLowerCase();
    return this.getAll().filter(function(record) {
      return String(record.alUsageId || '').toLowerCase() === id;
    })[0] || null;
  },

  getSheet: function() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const definition = PayTrackerAnnualLeaveConfig.SHEETS.USAGE;
    let sheet = spreadsheet && spreadsheet.getSheetByName(definition.NAME);
    if (!sheet) {
      PayTrackerAnnualLeaveSetupService.setup();
      sheet = spreadsheet.getSheetByName(definition.NAME);
    }
    return sheet;
  }
});
