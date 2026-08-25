/*******************************************************
 * PAY TRACKER V3.0 - Money Movements ledger repository.
 *******************************************************/

const PayTrackerMoneyMovementsRepository = Object.freeze({
  getAll: function() {
    const sheet = this.getSheet();
    if (sheet.getLastRow() <= 1) return [];
    const headers = PayTrackerMoneyMovementsConfig.SHEETS.MOVEMENTS.HEADERS;
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

  create: function(value) {
    const sheet = this.getSheet();
    const now = new Date();
    const id = 'MOVE-' + Utilities.getUuid().toUpperCase();
    const isInternal = PayTrackerMoneyMovementsConfig.INTERNAL_TRANSFER_TYPES
      .indexOf(value.movementType) !== -1;
    sheet.appendRow([
      id, value.date || now, value.movementType || 'Manual Adjustment',
      value.sourceAccount || '', value.sourcePot || '',
      value.destinationAccount || '', value.destinationPot || '',
      Number(value.amount) || 0, value.relatedTransactionId || '',
      value.relatedPayslipId || '', value.relatedSavingsContributionId || '',
      value.internalTransfer === true || value.internalTransfer === false
        ? value.internalTransfer : isInternal,
      value.notes || '', now
    ]);
    return this.getById(id);
  },

  getById: function(movementId) {
    const id = String(movementId || '').toLowerCase();
    return this.getAll().filter(function(record) {
      return String(record.movementId || '').toLowerCase() === id;
    })[0] || null;
  },

  getSheet: function() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const definition = PayTrackerMoneyMovementsConfig.SHEETS.MOVEMENTS;
    let sheet = spreadsheet && spreadsheet.getSheetByName(definition.NAME);
    if (!sheet) {
      PayTrackerMoneyMovementsSetupService.setup();
      sheet = spreadsheet.getSheetByName(definition.NAME);
    }
    return sheet;
  }
});
