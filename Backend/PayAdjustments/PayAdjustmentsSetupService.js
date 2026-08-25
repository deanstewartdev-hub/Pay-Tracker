/*******************************************************
 * PAY TRACKER V3.0
 * Idempotent Pay Adjustments ledger setup.
 *******************************************************/

const PayTrackerPayAdjustmentsSetupService = Object.freeze({
  setup: function() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) throw new Error('No active spreadsheet is available.');

    const result = { success: true, created: [], updated: [] };
    PayTrackerPayAdjustmentsConfig.getDefinitions().forEach(function(definition) {
      const state = PayTrackerReconciliationSetupService.ensureSheet(spreadsheet, definition);
      result[state.created ? 'created' : 'updated'].push(definition.NAME);
    });
    SpreadsheetApp.flush();
    return result;
  }
});

function setupPayTrackerPayAdjustments() {
  return PayTrackerPayAdjustmentsSetupService.setup();
}
