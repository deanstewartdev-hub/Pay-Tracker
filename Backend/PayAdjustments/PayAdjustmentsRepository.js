/*******************************************************
 * PAY TRACKER V3.0 - Pay Adjustments ledger repository.
 *******************************************************/

const PayTrackerPayAdjustmentsRepository = Object.freeze({
  getAll: function(jobId) {
    const sheet = this.getSheet();
    if (sheet.getLastRow() <= 1) return [];
    const headers = PayTrackerPayAdjustmentsConfig.SHEETS.ADJUSTMENTS.HEADERS;
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

  getById: function(adjustmentId) {
    const id = String(adjustmentId || '').toLowerCase();
    return this.getAll().filter(function(record) {
      return String(record.adjustmentId || '').toLowerCase() === id;
    })[0] || null;
  },

  create: function(value) {
    const sheet = this.getSheet();
    const now = new Date();
    const id = 'ADJ-' + Utilities.getUuid().toUpperCase();
    sheet.appendRow([
      id, value.jobId, value.originalShiftId || '', value.originalPayPeriod || '',
      value.originalPayslipId || '', value.adjustmentType || 'Manual Correction',
      value.missingHours || 0, value.missingAmount || 0, value.expectedRate || 0,
      value.expectedPayCategory || '', value.reportedDate || now,
      value.expectedRecoveryPayPeriod || '', value.expectedRecoveryPayslip || '',
      0, 0, value.adjustmentStatus || 'Identified', value.previousDiscrepancyStatus || '',
      value.notes || '', now, now
    ]);
    return this.getById(id);
  },

  update: function(adjustmentId, changes) {
    const record = this.getById(adjustmentId);
    if (!record) throw new Error('Unknown Pay Adjustment: ' + adjustmentId);
    const sheet = this.getSheet();
    const headers = PayTrackerPayAdjustmentsConfig.SHEETS.ADJUSTMENTS.HEADERS;
    Object.keys(changes || {}).forEach(function(key) {
      const columnIndex = headers.findIndex(function(header) {
        return PayTrackerJobRegistryRepository.toKey(header) === key;
      });
      if (columnIndex === -1) return;
      sheet.getRange(record.rowNumber, columnIndex + 1).setValue(changes[key]);
    });
    const updatedAtColumn = headers.indexOf('Updated At');
    sheet.getRange(record.rowNumber, updatedAtColumn + 1).setValue(new Date());
    return this.getById(adjustmentId);
  },

  /**
   * Carries an adjustment forward onto a later payslip, per roadmap
   * Section 8's carry-forward behaviour: the original row (and its
   * Missing Hours/Amount) is never touched, only its status and
   * recovery fields -- the full history stays on one auditable row
   * rather than being deleted and recreated.
   */
  carryForward: function(adjustmentId, input) {
    const record = this.getById(adjustmentId);
    if (!record) throw new Error('Unknown Pay Adjustment: ' + adjustmentId);

    const recoveredHours = (Number(record.recoveredHours) || 0) + (Number(input.recoveredHours) || 0);
    const recoveredAmount = (Number(record.recoveredAmount) || 0) + (Number(input.recoveredAmount) || 0);
    const missingHours = Number(record.missingHours) || 0;
    const missingAmount = Number(record.missingAmount) || 0;

    const fullyRecovered =
      (missingHours > 0 && recoveredHours >= missingHours) ||
      (missingHours === 0 && missingAmount > 0 && recoveredAmount >= missingAmount);

    const status = fullyRecovered
      ? 'Recovered'
      : (recoveredHours > 0 || recoveredAmount > 0) ? 'Partially Recovered' : 'Expected Next Payslip';

    return this.update(adjustmentId, {
      recoveredHours: recoveredHours,
      recoveredAmount: recoveredAmount,
      expectedRecoveryPayPeriod: input.expectedRecoveryPayPeriod || record.expectedRecoveryPayPeriod,
      expectedRecoveryPayslip: input.expectedRecoveryPayslip || record.expectedRecoveryPayslip,
      adjustmentStatus: status
    });
  },

  /**
   * Adjustments still counted as an active, unresolved discrepancy.
   * Recovered/Rejected/Written Off are terminal and excluded --
   * this is the "old weeks no longer falsely unresolved" check.
   */
  getUnresolved: function(jobId) {
    const unresolvedStatuses = PayTrackerPayAdjustmentsConfig.UNRESOLVED_STATUSES;
    return this.getAll(jobId).filter(function(record) {
      return unresolvedStatuses.indexOf(record.adjustmentStatus) !== -1;
    });
  },

  getSheet: function() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const definition = PayTrackerPayAdjustmentsConfig.SHEETS.ADJUSTMENTS;
    let sheet = spreadsheet && spreadsheet.getSheetByName(definition.NAME);
    if (!sheet) {
      PayTrackerPayAdjustmentsSetupService.setup();
      sheet = spreadsheet.getSheetByName(definition.NAME);
    }
    return sheet;
  }
});
