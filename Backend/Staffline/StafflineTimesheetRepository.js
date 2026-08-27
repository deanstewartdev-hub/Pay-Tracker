/*******************************************************
 * PAY TRACKER V3.0 - Staffline Timesheets ledger.
 *
 * One row per Gmail "Timesheet Approved" email. Metadata only --
 * this repository never talks to Gmail or the Staffline portal
 * itself; StafflineGmailImportService owns that.
 *******************************************************/

const PayTrackerStafflineTimesheetRepository = Object.freeze({
  getAll: function() {
    const sheet = this.getSheet();
    const headers = PayTrackerStafflineConfig.SHEETS.STAFFLINE_TIMESHEETS.HEADERS;
    if (sheet.getLastRow() <= 1) return [];
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length)
      .getValues().map(function(row, index) {
        const record = { rowNumber: index + 2 };
        headers.forEach(function(header, column) {
          record[PayTrackerJobRegistryRepository.toKey(header)] = row[column];
        });
        return record;
      }).filter(function(record) { return Boolean(record.timesheetId); });
  },

  getByTimesheetId: function(timesheetId) {
    const target = PayTrackerStafflineConfig.normalizeReference(timesheetId);
    if (!target) return null;
    return this.getAll().filter(function(record) {
      return PayTrackerStafflineConfig.normalizeReference(record.timesheetId) === target;
    })[0] || null;
  },

  getByGmailMessageId: function(gmailMessageId) {
    const target = String(gmailMessageId || '').trim();
    if (!target) return null;
    return this.getAll().filter(function(record) {
      return String(record.gmailMessageId || '').trim() === target;
    })[0] || null;
  },

  /**
   * Creates or updates one timesheet by Timesheet ID. Safe to call
   * repeatedly for the same email (idempotent rescans) -- an
   * existing row is refreshed in place, not duplicated.
   *
   * @param {Object} input Timesheet fields.
   * @return {Object} Saved record.
   */
  upsert: function(input) {
    const value = input || {};
    const timesheetId = PayTrackerStafflineConfig.normalizeReference(value.timesheetId);
    if (!timesheetId) throw new Error('Staffline timesheets require a Timesheet ID.');
    if (!value.gmailMessageId) throw new Error('Staffline timesheets require a Gmail Message ID.');

    const sheet = this.getSheet();
    const existing = this.getByTimesheetId(timesheetId);
    const now = new Date();
    const row = [
      timesheetId, value.gmailMessageId, value.gmailThreadId || '', value.approvedBy || '',
      value.approvedDate || '', value.placementDescription || '', value.clientName || '',
      value.jobId || '', value.timesheetStart || '', value.timesheetEnd || '',
      value.workAddress || '', value.portalUrl || '',
      value.classificationStatus || 'Needs Review', value.actionItemId || '', value.notes || '',
      existing ? existing.createdAt : now, now
    ];

    if (existing) {
      sheet.getRange(existing.rowNumber, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
    return this.getByTimesheetId(timesheetId);
  },

  getSheet: function() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const definition = PayTrackerStafflineConfig.SHEETS.STAFFLINE_TIMESHEETS;
    let sheet = spreadsheet && spreadsheet.getSheetByName(definition.NAME);
    if (!sheet) {
      PayTrackerStafflineSetupService.setup();
      sheet = spreadsheet.getSheetByName(definition.NAME);
    }
    return sheet;
  }
});
