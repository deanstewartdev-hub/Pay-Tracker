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
