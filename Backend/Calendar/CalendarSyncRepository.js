/*******************************************************
 * PAY TRACKER V3.0 - Calendar-owned PaySheet records.
 *******************************************************/

const PayTrackerCalendarSyncRepository = Object.freeze({
  getAll: function() {
    const sheet = this.getSheet();
    const headers = PayTrackerReconciliationConfig.SHEETS.CALENDAR_SYNC_RECORDS.HEADERS;
    if (sheet.getLastRow() <= 1) return [];
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length)
      .getValues().map(function(row, index) {
        const record = { rowNumber: index + 2 };
        headers.forEach(function(header, column) {
          record[PayTrackerJobRegistryRepository.toKey(header)] = row[column];
        });
        return record;
      });
  },

  getActive: function() {
    return this.getAll().filter(function(record) {
      return record.status === 'Active';
    });
  },

  getByEventKey: function(eventKey) {
    const key = String(eventKey || '');
    return this.getActive().filter(function(record) {
      return record.eventKey === key;
    })[0] || null;
  },

  findOwner: function(tableName, sheetDate) {
    const target = this.dateKey(sheetDate);
    return this.getActive().filter(function(record) {
      return record.tableName === tableName &&
        PayTrackerCalendarSyncRepository.dateKey(record.sheetDate) === target;
    })[0] || null;
  },

  upsert: function(input) {
    const value = input || {};
    const sheet = this.getSheet();
    const existing = this.getByEventKey(value.eventKey);
    const now = new Date();
    const row = [
      existing ? existing.syncRecordId : 'CALSYNC-' + Utilities.getUuid().toUpperCase(),
      value.eventKey, value.eventId || '', value.eventTitle || '',
      value.calendarId || '', value.eventStart || '', value.eventEnd || '',
      value.jobId || '', value.tableName || '', value.sheetDate || '',
      value.sheetRow || '', value.shiftType || '', value.hours === '' ? '' : value.hours,
      value.pay === '' ? '' : value.pay, 'Active', now,
      existing ? existing.createdAt : now, now
    ];
    if (existing) sheet.getRange(existing.rowNumber, 1, 1, row.length).setValues([row]);
    else sheet.appendRow(row);
    return this.getByEventKey(value.eventKey);
  },

  setStatus: function(record, status) {
    if (!record || !record.rowNumber) return;
    const sheet = this.getSheet();
    sheet.getRange(record.rowNumber, 15).setValue(status);
    sheet.getRange(record.rowNumber, 18).setValue(new Date());
  },

  getSheet: function() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const definition = PayTrackerReconciliationConfig.SHEETS.CALENDAR_SYNC_RECORDS;
    let sheet = spreadsheet && spreadsheet.getSheetByName(definition.NAME);
    if (!sheet) {
      PayTrackerReconciliationSetupService.setup();
      sheet = spreadsheet.getSheetByName(definition.NAME);
    }
    return sheet;
  },

  dateKey: function(value) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? '' : [
      date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }
});
