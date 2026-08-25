/*******************************************************
 * PAY TRACKER V3.0 - Annual Leave browser API.
 *******************************************************/

function getPayTrackerAnnualLeave(options) {
  const balances = PayTrackerAnnualLeaveBalanceService.getAllBalances();
  const jobId = options && options.jobId ? String(options.jobId) : '';

  const detail = jobId ? {
    earnings: PayTrackerAnnualLeaveEarningsRepository.getAll(jobId)
      .map(serializePayTrackerReconciliationRecord_),
    usage: PayTrackerAnnualLeaveUsageRepository.getAll(jobId)
      .map(serializePayTrackerReconciliationRecord_)
  } : null;

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    balances: balances,
    selectedJobId: jobId,
    detail: detail
  };
}

function createPayTrackerAnnualLeaveEarnings(input) {
  return {
    success: true,
    record: serializePayTrackerReconciliationRecord_(
      PayTrackerAnnualLeaveEarningsRepository.create(input || {})
    )
  };
}

function createPayTrackerAnnualLeaveUsage(input) {
  return {
    success: true,
    record: serializePayTrackerReconciliationRecord_(
      PayTrackerAnnualLeaveUsageRepository.create(input || {})
    )
  };
}

function updatePayTrackerAnnualLeaveUsage(usageId, changes) {
  return {
    success: true,
    record: serializePayTrackerReconciliationRecord_(
      PayTrackerAnnualLeaveUsageRepository.update(usageId, changes || {})
    )
  };
}

/**
 * Updates only the Annual Leave setting columns on a Jobs row --
 * never Job ID/Job Name/Employer/pay-rule fields.
 */
function updatePayTrackerAnnualLeaveJobSettings(jobId, settings) {
  const allowedKeys = [
    'annualLeaveAccrualMethod', 'annualLeaveYearStart', 'annualLeaveYearEnd',
    'annualLeaveAccrualRate', 'annualLeaveOpeningBalanceHours',
    'annualLeaveCarryoverHours', 'annualLeaveMaximumCarryoverHours'
  ];
  const fields = {};
  Object.keys(settings || {}).forEach(function(key) {
    if (allowedKeys.indexOf(key) !== -1) fields[key] = settings[key];
  });
  const job = PayTrackerJobRegistryRepository.updateFields(jobId, fields);
  return {
    success: true,
    balance: PayTrackerAnnualLeaveBalanceService.getBalanceForJob(job)
  };
}
