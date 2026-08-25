/*******************************************************
 * PAY TRACKER V3.0
 * Pay Adjustments summary -- "recovered pay visible in analytics".
 *******************************************************/

const PayTrackerPayAdjustmentsSummaryService = Object.freeze({
  getSummaryForJob: function(jobId) {
    const all = PayTrackerPayAdjustmentsRepository.getAll(jobId);
    const terminal = PayTrackerPayAdjustmentsConfig.TERMINAL_STATUSES;

    const totals = all.reduce(function(sum, record) {
      const missingAmount = Number(record.missingAmount) || 0;
      const recoveredAmount = Number(record.recoveredAmount) || 0;
      const isUnresolved = terminal.indexOf(record.adjustmentStatus) === -1;

      sum.missingAmount += missingAmount;
      sum.recoveredAmount += recoveredAmount;
      if (isUnresolved) sum.outstandingAmount += Math.max(0, missingAmount - recoveredAmount);
      if (record.adjustmentStatus === 'Recovered') sum.recoveredCount += 1;
      if (isUnresolved) sum.unresolvedCount += 1;
      return sum;
    }, { missingAmount: 0, recoveredAmount: 0, outstandingAmount: 0, recoveredCount: 0, unresolvedCount: 0 });

    return Object.assign({ jobId: jobId, adjustmentCount: all.length }, totals);
  },

  getAllSummaries: function() {
    return PayTrackerJobRegistryRepository.getAll(false).map(function(job) {
      return PayTrackerPayAdjustmentsSummaryService.getSummaryForJob(job.jobId);
    });
  }
});
