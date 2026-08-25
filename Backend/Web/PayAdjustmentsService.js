/*******************************************************
 * PAY TRACKER V3.0 - Pay Adjustments browser API.
 *******************************************************/

function getPayTrackerPayAdjustments(options) {
  const jobId = options && options.jobId ? String(options.jobId) : '';
  return {
    success: true,
    generatedAt: new Date().toISOString(),
    summaries: PayTrackerPayAdjustmentsSummaryService.getAllSummaries(),
    selectedJobId: jobId,
    adjustments: jobId
      ? PayTrackerPayAdjustmentsRepository.getAll(jobId).map(serializePayTrackerReconciliationRecord_)
      : []
  };
}

function createPayTrackerPayAdjustment(input) {
  return {
    success: true,
    record: serializePayTrackerReconciliationRecord_(
      PayTrackerPayAdjustmentsRepository.create(input || {})
    )
  };
}

function carryForwardPayTrackerPayAdjustment(adjustmentId, input) {
  return {
    success: true,
    record: serializePayTrackerReconciliationRecord_(
      PayTrackerPayAdjustmentsRepository.carryForward(adjustmentId, input || {})
    )
  };
}

function updatePayTrackerPayAdjustmentStatus(adjustmentId, status, notes) {
  const changes = { adjustmentStatus: status };
  if (notes) changes.notes = notes;
  return {
    success: true,
    record: serializePayTrackerReconciliationRecord_(
      PayTrackerPayAdjustmentsRepository.update(adjustmentId, changes)
    )
  };
}
