/*******************************************************
 * PAY TRACKER V3.0 - Annual Leave earnings ledger repository.
 *******************************************************/

const PayTrackerAnnualLeaveEarningsRepository = Object.freeze({
  getAll: function(jobId) {
    const sheet = this.getSheet();
    if (sheet.getLastRow() <= 1) return [];
    const headers = PayTrackerAnnualLeaveConfig.SHEETS.EARNINGS.HEADERS;
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
   * Records one week's earned hours for a job. Not written to
   * automatically anywhere yet -- source is Manual Entry until a
   * later phase wires it to a trusted worked-hours source.
   */
  create: function(value) {
    const sheet = this.getSheet();
    const now = new Date();
    const id = 'AL-EARN-' + Utilities.getUuid().toUpperCase();
    sheet.appendRow([
      id, value.jobId, value.workWeekStart || '', value.workWeekEnd || '',
      value.eligibleHoursWorked || 0, value.accrualRate || 0,
      value.hoursEarned || 0, value.basicHourlyRate || 0,
      value.estimatedValue || 0, value.sourceType || 'Manual Entry',
      value.sourceShiftIds || '', value.sourcePayslipId || '',
      value.calculationStatus || 'Calculated', value.notes || '', now, now
    ]);
    return this.getById(id);
  },

  getById: function(earningsId) {
    const id = String(earningsId || '').toLowerCase();
    return this.getAll().filter(function(record) {
      return String(record.alEarningsId || '').toLowerCase() === id;
    })[0] || null;
  },

  getSheet: function() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const definition = PayTrackerAnnualLeaveConfig.SHEETS.EARNINGS;
    let sheet = spreadsheet && spreadsheet.getSheetByName(definition.NAME);
    if (!sheet) {
      PayTrackerAnnualLeaveSetupService.setup();
      sheet = spreadsheet.getSheetByName(definition.NAME);
    }
    return sheet;
  }
});
