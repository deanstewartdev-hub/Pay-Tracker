/*******************************************************
 * PAY TRACKER V3.0 - Transaction Matching Rules repository.
 *******************************************************/

const PayTrackerTransactionRulesRepository = Object.freeze({
  getAll: function() {
    const sheet = this.getSheet();
    if (sheet.getLastRow() <= 1) return [];
    const headers = PayTrackerTransactionRulesConfig.SHEETS.RULES.HEADERS;
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length)
      .getValues().map(function(row, index) {
        const record = {};
        headers.forEach(function(header, column) {
          record[PayTrackerJobRegistryRepository.toKey(header)] = row[column];
        });
        record.rowNumber = index + 2;
        return record;
      });
  },

  getActive: function() {
    return this.getAll().filter(function(rule) {
      return Boolean(rule.ruleId) && rule.active === true;
    }).sort(function(left, right) {
      return (Number(right.priority) || 0) - (Number(left.priority) || 0);
    });
  },

  create: function(value) {
    const sheet = this.getSheet();
    const now = new Date();
    const id = 'TXRULE-' + Utilities.getUuid().toUpperCase();
    sheet.appendRow([
      id, value.ruleName || '', value.merchantContains || '',
      value.descriptionContains || '', value.monzoCategory || '',
      value.amountMinimum === undefined || value.amountMinimum === '' ? '' : Number(value.amountMinimum),
      value.amountMaximum === undefined || value.amountMaximum === '' ? '' : Number(value.amountMaximum),
      value.direction || '', value.payTrackerCategory || '', value.financeType || '',
      value.financeId || '', value.jobId || '', value.autoConfirm === true,
      value.priority || 0, value.active === false ? false : true, value.notes || '',
      now, now
    ]);
    return this.getById(id);
  },

  getById: function(ruleId) {
    const id = String(ruleId || '').toLowerCase();
    return this.getAll().filter(function(record) {
      return String(record.ruleId || '').toLowerCase() === id;
    })[0] || null;
  },

  getSheet: function() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const definition = PayTrackerTransactionRulesConfig.SHEETS.RULES;
    let sheet = spreadsheet && spreadsheet.getSheetByName(definition.NAME);
    if (!sheet) {
      PayTrackerTransactionRulesSetupService.setup();
      sheet = spreadsheet.getSheetByName(definition.NAME);
    }
    return sheet;
  }
});
