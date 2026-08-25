/*******************************************************
 * PAY TRACKER V3.0
 * Idempotent Money Movements ledger setup.
 *******************************************************/

const PayTrackerMoneyMovementsSetupService = Object.freeze({
  setup: function() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) throw new Error('No active spreadsheet is available.');

    const result = { success: true, created: [], updated: [] };
    PayTrackerMoneyMovementsConfig.getDefinitions().forEach(function(definition) {
      const state = PayTrackerReconciliationSetupService.ensureSheet(spreadsheet, definition);
      result[state.created ? 'created' : 'updated'].push(definition.NAME);
    });
    SpreadsheetApp.flush();
    return result;
  }
});

function setupPayTrackerMoneyMovements() {
  return PayTrackerMoneyMovementsSetupService.setup();
}
