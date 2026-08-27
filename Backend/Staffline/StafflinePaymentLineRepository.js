/*******************************************************
 * PAY TRACKER V3.0 - Staffline Payment Lines.
 *
 * Extends the existing Payroll Centre (Payslip Register) with the
 * per-line detail it never captured: a single combined Staffline
 * payslip can carry several Timesheet IDs across different jobs,
 * and the whole-payslip aggregate fields on Payslip Register
 * (Backend/Payroll/PayslipRepository.gs) cannot represent that.
 *
 * Purely derived data -- extracted fresh from parsed payslip text,
 * never hand-edited, so re-importing a payslip safely replaces its
 * lines rather than needing per-line upsert-by-key.
 *******************************************************/

const PayTrackerStafflinePaymentLineRepository = Object.freeze({
  getAll: function() {
    const sheet = this.getSheet();
    const headers = PayTrackerStafflineConfig.SHEETS.STAFFLINE_PAYMENT_LINES.HEADERS;
    if (sheet.getLastRow() <= 1) return [];
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length)
      .getValues().map(function(row, index) {
        const record = { rowNumber: index + 2 };
        headers.forEach(function(header, column) {
          record[PayTrackerJobRegistryRepository.toKey(header)] = row[column];
        });
        return record;
      }).filter(function(record) { return Boolean(record.paymentLineId); });
  },

  getByPayslipId: function(payslipId) {
    const target = String(payslipId || '').trim();
    if (!target) return [];
    return this.getAll().filter(function(record) {
      return String(record.payslipId || '').trim() === target;
    });
  },

  getByTimesheetReference: function(reference) {
    const target = PayTrackerStafflineConfig.normalizeReference(reference);
    if (!target) return [];
    return this.getAll().filter(function(record) {
      return record.normalizedTimesheetId === target;
    });
  },

  /**
   * Replaces every payment line previously stored for one payslip.
   * Safe to call repeatedly for the same payslip (re-parsing a
   * payslip should not accumulate duplicate lines).
   *
   * @param {string} payslipId Payslip Register ID.
   * @param {Array<Object>} lines Parsed payment lines.
   * @return {Array<Object>} Saved lines.
   */
  replaceForPayslip: function(payslipId, lines) {
    const target = String(payslipId || '').trim();
    if (!target) throw new Error('Payment lines require a Payslip ID.');

    const sheet = this.getSheet();
    const existing = this.getByPayslipId(target);
    // Delete bottom-up so earlier row numbers stay valid mid-loop.
    existing.sort(function(a, b) { return b.rowNumber - a.rowNumber; })
      .forEach(function(record) { sheet.deleteRow(record.rowNumber); });

    const now = new Date();
    const rows = (lines || []).map(function(line) {
      const reference = String(line.reference || '').trim();
      return [
        'PAYLINE-' + Utilities.getUuid().toUpperCase(), target, reference,
        PayTrackerStafflineConfig.normalizeReference(reference), line.workDate || '',
        line.description || '', line.units, line.rate, line.amount,
        line.payCategory || '', line.jobId || '', line.validationStatus || '', now
      ];
    });
    if (rows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }
    return this.getByPayslipId(target);
  },

  getSheet: function() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const definition = PayTrackerStafflineConfig.SHEETS.STAFFLINE_PAYMENT_LINES;
    let sheet = spreadsheet && spreadsheet.getSheetByName(definition.NAME);
    if (!sheet) {
      PayTrackerStafflineSetupService.setup();
      sheet = spreadsheet.getSheetByName(definition.NAME);
    }
    return sheet;
  }
});
