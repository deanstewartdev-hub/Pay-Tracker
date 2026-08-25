/*******************************************************
 * PAY TRACKER V3.0 - Action Centre repository.
 * Manual decisions are immutable history entries.
 *******************************************************/

const PayTrackerActionCentreRepository = Object.freeze({
  getAll: function(options) {
    const request = options || {};
    const sheet = this.getSheet('ACTION_ITEMS');
    if (sheet.getLastRow() <= 1) return [];
    const headers = PayTrackerReconciliationConfig.SHEETS.ACTION_ITEMS.HEADERS;
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length)
      .getValues().map(function(row, index) {
        const item = { rowNumber: index + 2 };
        headers.forEach(function(header, column) {
          item[PayTrackerJobRegistryRepository.toKey(header)] = row[column];
        });
        return item;
      }).filter(function(item) {
        return (!request.status || item.status === request.status) &&
          (!request.jobId || item.jobId === request.jobId);
      }).sort(function(left, right) {
        const rank = { Urgent: 4, High: 3, Normal: 2, Low: 1 };
        return (rank[right.priority] || 0) - (rank[left.priority] || 0) ||
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      });
  },

  create: function(input) {
    const value = input || {};
    if (!String(value.sourceType || '').trim() || !String(value.sourceId || '').trim()) {
      throw new Error('Action items require a source type and source ID.');
    }
    const sheet = this.getSheet('ACTION_ITEMS');
    const duplicate = this.getAll({}).filter(function(item) {
      return item.sourceType === value.sourceType && item.sourceId === value.sourceId &&
        item.actionType === value.actionType &&
        item.status !== 'Resolved' && item.status !== 'Dismissed';
    })[0];
    if (duplicate) return duplicate;
    const now = new Date();
    const id = 'ACTION-' + Utilities.getUuid().toUpperCase();
    sheet.appendRow([
      id, value.actionType || 'Manual Review', value.title || 'Review item',
      value.description || '', value.priority || 'Normal', 'Open',
      value.jobId || '', value.sourceType, value.sourceId,
      value.sourceSheet || '', value.sourceRow || '', value.confidence || '',
      value.suggestedResolution || '', '', '', value.assignedTo || '',
      value.dueDate || '', now, now, '', ''
    ]);
    return this.getById(id);
  },

  getById: function(actionId) {
    const id = String(actionId || '').trim().toLowerCase();
    return this.getAll({}).filter(function(item) {
      return String(item.actionId).toLowerCase() === id;
    })[0] || null;
  },

  decide: function(actionId, decision) {
    const item = this.getById(actionId);
    if (!item) throw new Error('Action item was not found.');
    const value = decision || {};
    const status = String(value.status || '').trim();
    if (PayTrackerReconciliationConfig.ACTION_STATUSES.indexOf(status) === -1) {
      throw new Error('Choose a valid Action Centre status.');
    }
    const sheet = this.getSheet('ACTION_ITEMS');
    const now = new Date();
    const changedBy = String(value.changedBy || Session.getActiveUser().getEmail() || 'User');
    sheet.getRange(item.rowNumber, 6).setValue(status);
    sheet.getRange(item.rowNumber, 14).setValue(value.manualDecision || '');
    sheet.getRange(item.rowNumber, 15).setValue(value.notes || '');
    sheet.getRange(item.rowNumber, 19).setValue(now);
    if (status === 'Resolved' || status === 'Dismissed') {
      sheet.getRange(item.rowNumber, 20, 1, 2).setValues([[now, changedBy]]);
    }
    this.getSheet('ACTION_HISTORY').appendRow([
      'HISTORY-' + Utilities.getUuid().toUpperCase(), item.actionId,
      item.status, status, item.manualDecision || '', value.manualDecision || '',
      value.notes || '', changedBy, now
    ]);
    return this.getById(item.actionId);
  },

  getSheet: function(key) {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const definition = PayTrackerReconciliationConfig.SHEETS[key];
    let sheet = spreadsheet && spreadsheet.getSheetByName(definition.NAME);
    if (!sheet) {
      PayTrackerReconciliationSetupService.setup();
      sheet = spreadsheet.getSheetByName(definition.NAME);
    }
    return sheet;
  }
});
