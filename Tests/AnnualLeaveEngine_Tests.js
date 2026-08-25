/*******************************************************
 * PAY TRACKER V3.0 - safe Annual Leave engine unit checks.
 *******************************************************/

function runAnnualLeaveEngineTests() {
  const results = [];
  function check(name, condition) {
    if (!condition) throw new Error('Failed: ' + name);
    results.push({ name: name, passed: true });
  }

  const definitions = PayTrackerAnnualLeaveConfig.getDefinitions();
  check('two additive ledger sheet definitions', definitions.length === 2);
  check('Jobs sheet carries the AL setting columns',
    PayTrackerReconciliationConfig.SHEETS.JOBS.HEADERS.indexOf('Annual Leave Accrual Rate') !== -1 &&
    PayTrackerReconciliationConfig.SHEETS.JOBS.HEADERS.indexOf('Annual Leave Opening Balance Hours') !== -1
  );
  check('header mapping produces the expected camelCase keys',
    PayTrackerJobRegistryRepository.toKey('Annual Leave Accrual Rate') === 'annualLeaveAccrualRate' &&
    PayTrackerJobRegistryRepository.toKey('AL Earnings ID') === 'alEarningsId' &&
    PayTrackerJobRegistryRepository.toKey('AL Usage ID') === 'alUsageId'
  );

  const takenStatuses = PayTrackerAnnualLeaveBalanceService.TAKEN_STATUSES;
  const futureStatuses = PayTrackerAnnualLeaveBalanceService.FUTURE_COMMITMENT_STATUSES;
  check('Taken/Paid/Partially Paid all reduce balance',
    takenStatuses.indexOf('Taken') !== -1 &&
    takenStatuses.indexOf('Paid') !== -1 &&
    takenStatuses.indexOf('Partially Paid') !== -1
  );
  check('Cancelled and Rejected never reduce balance',
    takenStatuses.indexOf('Cancelled') === -1 && takenStatuses.indexOf('Rejected') === -1 &&
    futureStatuses.indexOf('Cancelled') === -1 && futureStatuses.indexOf('Rejected') === -1
  );

  const balance = PayTrackerAnnualLeaveBalanceService.getBalanceForJob({
    jobId: 'JOB-TEST', jobName: 'Test Job', annualLeaveEnabled: true,
    annualLeaveOpeningBalanceHours: '', basicHourlyRate: '', annualLeaveAccrualRate: '',
    annualLeaveAccrualMethod: ''
  });
  check('a job with no ledger rows and blank settings returns clean zeros, not NaN/blank',
    balance.accruedBalanceHours === 0 &&
    balance.availableToBookHours === 0 &&
    balance.outstandingHolidayPayHours === 0 &&
    balance.accrualRate === null
  );

  check('rounding stops floating-point drift from ever surfacing',
    PayTrackerAnnualLeaveBalanceService.round(10.1 + 0.2) === 10.3
  );

  const defaults = PayTrackerAnnualLeaveConfig.DEFAULT_JOB_SETTINGS;
  check('seeded accrual rate default is a fraction, not a whole-number percentage',
    defaults.annualLeaveAccrualRate > 0 && defaults.annualLeaveAccrualRate < 1
  );

  return { success: true, passed: results.length, results: results };
}
