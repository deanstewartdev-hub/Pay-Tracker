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
  },

  /**
   * Writes a sparse set of {camelCaseKey: value} fields onto one
   * job's row, matched by header -> toKey(). Unknown keys are
   * ignored. Always stamps Updated At. Used for additive settings
   * backfill and for user edits -- never touches Job ID/Job Name.
   */
  updateFields: function(jobId, fields) {
    const job = this.getById(jobId);
    if (!job) throw new Error('Unknown job: ' + jobId);
    const sheet = this.getSheet();
    const headers = PayTrackerReconciliationConfig.SHEETS.JOBS.HEADERS;
    const self = this;
    Object.keys(fields || {}).forEach(function(key) {
      const columnIndex = headers.findIndex(function(header) {
        return self.toKey(header) === key;
      });
      if (columnIndex === -1) return;
      sheet.getRange(job.rowNumber, columnIndex + 1).setValue(fields[key]);
    });
    const updatedAtColumn = headers.indexOf('Updated At');
    if (updatedAtColumn !== -1) {
      sheet.getRange(job.rowNumber, updatedAtColumn + 1).setValue(new Date());
    }
    return this.getById(jobId);
  }
});
