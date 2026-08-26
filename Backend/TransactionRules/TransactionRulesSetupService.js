/*******************************************************
 * PAY TRACKER V3.0
 * Idempotent Transaction Matching Rules setup.
 *******************************************************/

const PayTrackerTransactionRulesSetupService = Object.freeze({
  setup: function() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) throw new Error('No active spreadsheet is available.');

    const result = { success: true, created: [], updated: [] };
    PayTrackerTransactionRulesConfig.getDefinitions().forEach(function(definition) {
      const state = PayTrackerReconciliationSetupService.ensureSheet(spreadsheet, definition);
      result[state.created ? 'created' : 'updated'].push(definition.NAME);
    });
    SpreadsheetApp.flush();
    return result;
  }
});

function setupPayTrackerTransactionRules() {
  return PayTrackerTransactionRulesSetupService.setup();
}
