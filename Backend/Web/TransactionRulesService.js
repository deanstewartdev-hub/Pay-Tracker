/*******************************************************
 * PAY TRACKER V3.0 - Transaction Matching Rules browser API.
 *******************************************************/

function getPayTrackerTransactionRules() {
  return {
    success: true,
    generatedAt: new Date().toISOString(),
    rules: PayTrackerTransactionRulesRepository.getAll().map(serializePayTrackerReconciliationRecord_),
    previewMatches: PayTrackerTransactionCategoryService.previewMatches(),
    uncategorizedCount: PayTrackerTransactionCategoryService.getUncategorized().length
  };
}

function createPayTrackerTransactionRule(input) {
  return {
    success: true,
    record: serializePayTrackerReconciliationRecord_(
      PayTrackerTransactionRulesRepository.create(input || {})
    )
  };
}

function applyPayTrackerTransactionCategory(transactionId, category, learnRule) {
  return {
    success: true,
    result: PayTrackerTransactionCategoryService.applyCategory(
      transactionId, category, PayTrackerTransactionRulesConfig.CATEGORY_SOURCES.MANUAL, learnRule === true
    )
  };
}

function applyAllPayTrackerTransactionCategorySuggestions() {
  return {
    success: true,
    result: PayTrackerTransactionCategoryService.applyAllSuggested()
  };
}

/**
 * Maintenance-only, not wired to any web UI. Run manually from the
 * Apps Script editor if you want to tidy up the two empty, misplaced
 * category header columns left over from an early build's column-
 * placement bug (fixed in code, but the already-created columns on
 * the real sheet don't move themselves). Safe to run repeatedly --
 * a no-op once the columns are gone or were never misplaced. See
 * PayTrackerTransactionCategoryService.cleanupStrayCategoryColumnsIfSafe
 * for exactly what it checks before touching anything.
 */
function cleanupPayTrackerStrayCategoryColumns() {
  return PayTrackerTransactionCategoryService.cleanupStrayCategoryColumnsIfSafe();
}
