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
