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
  check('four additive Annual Leave sheet definitions', definitions.length === 4);
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

  const gmailService = PayTrackerAnnualLeaveGmailImportService;
  const rangeA = gmailService.extractDateRange('Leave from 27 Jul 2026 to 29 Jul 2026 approved.');
  check('date extraction reads a textual range',
    rangeA.start === '2026-07-27' && rangeA.end === '2026-07-29'
  );
  const rangeB = gmailService.extractDateRange('Confirmed for 27/07/2026.');
  check('date extraction reads a numeric dd/mm/yyyy date',
    rangeB.start === '2026-07-27' && rangeB.end === '2026-07-27'
  );
  check('date extraction returns nothing rather than guessing',
    Object.keys(gmailService.extractDateRange('no dates mentioned here')).length === 0
  );
  check('an invalid calendar date (month 13) is rejected, not silently accepted',
    Object.keys(gmailService.extractDateRange('on 35/13/2026')).length === 0
  );

  check('a cancellation mention outranks an earlier approval mention in the same text',
    gmailService.detectLeaveStatus('Leave approved -- actually now cancelled, sorry.') === 'Cancelled'
  );
  check('vague wording with no status keyword defaults to Requested, not Approved',
    gmailService.detectLeaveStatus('Just checking in about your leave.') === 'Requested'
  );

  check('confidence is High only with a known job, a found date, and clear status wording',
    gmailService.computeConfidence({
      rule: { jobId: 'JOB-NHS' }, dateRange: { start: '2026-07-27' }, status: 'Approved'
    }) === PayTrackerAnnualLeaveConfig.CONFIDENCE_LEVELS.HIGH
  );
  check('confidence is never High when the rule has no Job ID -- never guess the job',
    gmailService.computeConfidence({
      rule: { jobId: '' }, dateRange: { start: '2026-07-27' }, status: 'Approved'
    }) !== PayTrackerAnnualLeaveConfig.CONFIDENCE_LEVELS.HIGH
  );
  check('confidence is never High without a found date',
    gmailService.computeConfidence({
      rule: { jobId: 'JOB-NHS' }, dateRange: {}, status: 'Approved'
    }) !== PayTrackerAnnualLeaveConfig.CONFIDENCE_LEVELS.HIGH
  );

  return { success: true, passed: results.length, results: results };
}
