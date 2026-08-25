/*******************************************************
 * PAY TRACKER V3.0 - Annual Leave Gmail rules repository.
 *******************************************************/

const PayTrackerAnnualLeaveEmailRulesRepository = Object.freeze({
  getActive: function() {
    const sheet = this.getSheet();
    if (sheet.getLastRow() <= 1) return [];
    const headers = PayTrackerAnnualLeaveConfig.SHEETS.EMAIL_RULES.HEADERS;
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length)
      .getValues().map(function(row, index) {
        const record = {};
        headers.forEach(function(header, column) {
          record[PayTrackerJobRegistryRepository.toKey(header)] = row[column];
        });
        record.rowNumber = index + 2;
        return record;
      }).filter(function(rule) {
        return Boolean(rule.ruleId) && rule.active === true;
      }).sort(function(left, right) {
        return (Number(right.priority) || 0) - (Number(left.priority) || 0);
      });
  },

  getSheet: function() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const definition = PayTrackerAnnualLeaveConfig.SHEETS.EMAIL_RULES;
    let sheet = spreadsheet && spreadsheet.getSheetByName(definition.NAME);
    if (!sheet) {
      PayTrackerAnnualLeaveSetupService.setup();
      sheet = spreadsheet.getSheetByName(definition.NAME);
    }
    return sheet;
  },

  /**
   * Tests whether one rule matches a Gmail message's metadata/body.
   * Every rule condition present must match (AND, not OR) -- an
   * empty condition is skipped, matching the Payslip Email Rules
   * convention in PayslipImportService.gs.
   */
  matches: function(rule, metadata) {
    const sender = String(metadata.emailSender || '').toLowerCase();
    const subject = String(metadata.emailSubject || '').toLowerCase();
    const body = String(metadata.bodyText || '').toLowerCase();

    const senderEquals = String(rule.senderEquals || '').toLowerCase().trim();
    const senderContains = String(rule.senderContains || '').toLowerCase().trim();
    const subjectContains = String(rule.subjectContains || '').toLowerCase().trim();
    const bodyContains = String(rule.bodyContains || '').toLowerCase().trim();

    if (senderEquals && sender !== senderEquals) return false;
    if (senderContains && sender.indexOf(senderContains) === -1) return false;
    if (subjectContains && subject.indexOf(subjectContains) === -1) return false;
    if (bodyContains && body.indexOf(bodyContains) === -1) return false;

    return Boolean(senderEquals || senderContains || subjectContains || bodyContains);
  }
});
