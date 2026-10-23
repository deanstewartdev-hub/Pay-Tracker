/*******************************************************
 * PAY TRACKER V3.0 - Money Movements browser API.
 *******************************************************/

function getPayTrackerMoneyMovements() {
  return {
    success: true,
    generatedAt: new Date().toISOString(),
    summary: PayTrackerMoneyMovementsSummaryService.getSummary(),
    movements: PayTrackerMoneyMovementsRepository.getAll()
      .map(serializePayTrackerReconciliationRecord_)
      .sort(function(a, b) { return String(b.date).localeCompare(String(a.date)); })
  };
}

function createPayTrackerMoneyMovement(input) {
  return {
    success: true,
    record: serializePayTrackerReconciliationRecord_(
      PayTrackerMoneyMovementsRepository.create(input || {})
    )
  };
}

/**
 * Read-only cash-flow preview of imported bank transactions
 * (Step 2A). Writes nothing; see CashFlowPreviewService.js.
 */
function getPayTrackerCashFlowPreview(input) {
  const options = input || {};
  const preview = PayTrackerCashFlowPreviewService.getPreview({
    from: options.from || '', to: options.to || ''
  });
  return {
    success: true,
    generatedAt: new Date().toISOString(),
    from: preview.from ? preview.from.toISOString() : '',
    to: preview.to ? preview.to.toISOString() : '',
    summary: preview.summary,
    proposals: preview.proposals
      .map(serializePayTrackerReconciliationRecord_)
      .sort(function(a, b) { return String(b.date).localeCompare(String(a.date)); })
  };
}
