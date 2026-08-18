/*******************************************************
 * PAY TRACKER V3.0 - safe reconciliation unit checks.
 *******************************************************/

function runReconciliationFoundationTests() {
  const results = [];
  function check(name, condition) {
    if (!condition) throw new Error('Failed: ' + name);
    results.push({ name: name, passed: true });
  }

  const definitions = PayTrackerReconciliationConfig.getDefinitions();
  check('three additive sheet definitions', definitions.length === 3);
  check('four stable default jobs', PayTrackerReconciliationConfig.DEFAULT_JOBS.length === 4);
  check('job IDs are unique', new Set(
    PayTrackerReconciliationConfig.DEFAULT_JOBS.map(function(job) { return job.jobId; })
  ).size === 4);
  check('every job has an existing employer key',
    PayTrackerReconciliationConfig.DEFAULT_JOBS.every(function(job) {
      return PayTrackerPayrollConfig.getEmployer(job.employerKey) !== null;
    })
  );
  check('header mapping preserves ID camel case',
    PayTrackerJobRegistryRepository.toKey('Job ID') === 'jobId'
  );
  check('terminal statuses are explicit',
    PayTrackerReconciliationConfig.ACTION_STATUSES.indexOf('Resolved') !== -1 &&
    PayTrackerReconciliationConfig.ACTION_STATUSES.indexOf('Dismissed') !== -1
  );

  return { success: true, passed: results.length, results: results };
}
