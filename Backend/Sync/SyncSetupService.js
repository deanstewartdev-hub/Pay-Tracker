/*******************************************************
 * PAY TRACKER V3.2
 * Idempotent Sync Status sheet setup.
 *
 * Reuses PayTrackerReconciliationSetupService.ensureSheet -- the
 * same additive-only, header-mismatch-throws-rather-than-
 * overwrites helper every other v3 ledger uses (Job Registry,
 * Action Centre, Calendar Sync Records) -- rather than
 * duplicating that logic here.
 *
 * Note: a Finance-only 'Bank Sync History' sheet + SYNC_STATUSES
 * enum already exist (Backend/Finance/FinanceIntegrationConfig.js)
 * but were confirmed unused by any writer during the v3.2 audit
 * (docs/v3.2-unified-sync-audit.md, finding #1). This service
 * deliberately does not touch, rename, or repurpose that sheet --
 * it is a Finance-specific concept and this is a cross-cutting
 * one. Both are left in place; nothing existing is removed.
 *******************************************************/

const PayTrackerSyncSetupService = Object.freeze({
  setup: function() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) throw new Error('No active spreadsheet is available.');

    const state = PayTrackerReconciliationSetupService.ensureSheet(
      spreadsheet, PayTrackerSyncConfig.SHEET
    );
    SpreadsheetApp.flush();
    return { success: true, created: state.created ? [PayTrackerSyncConfig.SHEET.NAME] : [] };
  }
});

function setupPayTrackerSync() {
  return PayTrackerSyncSetupService.setup();
}
