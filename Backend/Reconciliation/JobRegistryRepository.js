/*******************************************************
 * PAY TRACKER V3.0 - Job Registry repository.
 *******************************************************/

const PayTrackerJobRegistryRepository = Object.freeze({
  getAll: function(includeInactive) {
    const sheet = this.getSheet();
    if (sheet.getLastRow() <= 1) return [];
    const headers = PayTrackerReconciliationConfig.SHEETS.JOBS.HEADERS;
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length)
      .getValues().map(function(row, index) {
        const record = {};
        headers.forEach(function(header, column) {
          record[PayTrackerJobRegistryRepository.toKey(header)] = row[column];
        });
        record.rowNumber = index + 2;
        return record;
      }).filter(function(job) {
        return includeInactive === true || job.active === true;
      });
  },

  getById: function(jobId) {
    const id = String(jobId || '').trim().toLowerCase();
    return this.getAll(true).filter(function(job) {
      return String(job.jobId || '').toLowerCase() === id;
    })[0] || null;
  },

  getSheet: function() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = spreadsheet && spreadsheet.getSheetByName(
      PayTrackerReconciliationConfig.SHEETS.JOBS.NAME
    );
    if (!sheet) {
      PayTrackerReconciliationSetupService.setup();
      sheet = spreadsheet.getSheetByName(
        PayTrackerReconciliationConfig.SHEETS.JOBS.NAME
      );
    }
    return sheet;
  },

  toKey: function(header) {
    return String(header || '').trim().toLowerCase()
      .replace(/\s+([a-z0-9])/g, function(match, character) {
        return character.toUpperCase();
      });
  }
});
