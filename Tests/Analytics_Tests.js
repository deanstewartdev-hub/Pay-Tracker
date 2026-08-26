/*******************************************************
 * PAY TRACKER V3.0 - safe Analytics unit checks.
 *
 * Deliberately limited to PayTrackerAnalyticsService's pure functions
 * (top half of the file -- no SpreadsheetApp calls) plus config
 * sanity checks. The orchestration functions at the bottom of
 * AnalyticsService.js only read existing, already-tested repositories
 * and services, so they are not re-exercised here.
 *******************************************************/

function runAnalyticsTests() {
  const results = [];
  function check(name, condition) {
    if (!condition) throw new Error('Failed: ' + name);
    results.push({ name: name, passed: true });
  }

  const service = PayTrackerAnalyticsService;

  check('excluded metrics are named with a reason, not just dropped',
    PayTrackerAnalyticsConfig.EXCLUDED_METRICS.length > 0 &&
    PayTrackerAnalyticsConfig.EXCLUDED_METRICS.every(function(item) {
      return Boolean(item.key) && Boolean(item.label) && Boolean(item.reason);
    })
  );

  // ---- isWithinRange ----
  const from = new Date(2026, 0, 1);
  const to = new Date(2026, 0, 31);
  check('a date inside the range passes',
    service.isWithinRange(new Date(2026, 0, 15), from, to) === true
  );
  check('a date before the range is excluded',
    service.isWithinRange(new Date(2025, 11, 31), from, to) === false
  );
  check('a date after the range is excluded',
    service.isWithinRange(new Date(2026, 1, 1), from, to) === false
  );
  check('a missing date is never excluded by a date filter',
    service.isWithinRange(null, from, to) === true
  );
  check('no filter bounds means everything passes',
    service.isWithinRange(new Date(2020, 0, 1), null, null) === true
  );

  // ---- groupSum ----
  const grouped = service.groupSum(
    [{ type: 'Basic', hours: 8 }, { type: 'Overtime', hours: 4 }, { type: 'Basic', hours: 2 }],
    function(item) { return item.type; },
    function(item) { return item.hours; }
  );
  check('groupSum sums by key and sorts descending by total',
    grouped.length === 2 && grouped[0].key === 'Basic' && grouped[0].total === 10 && grouped[1].key === 'Overtime' && grouped[1].total === 4
  );
  check('groupSum falls back to "Uncategorised" for a blank key',
    service.groupSum([{ amount: 5 }], function() { return ''; }, function(item) { return item.amount; })[0].key === 'Uncategorised'
  );

  // ---- buildWorkAndPayForJob ----
  const job = { jobId: 'JOB-NHS', jobName: 'NHS', employerKey: 'nhs' };
  const weeks = [
    {
      weekStart: new Date(2026, 0, 5),
      employers: { nhs: { entries: [
        { enhancement: 'Basic', hours: 8, pay: 95.33 },
        { enhancement: 'Overtime', hours: 4, pay: 60 }
      ] } }
    },
    {
      weekStart: new Date(2026, 2, 1), // outside the Jan date range below
      employers: { nhs: { entries: [
        { enhancement: 'Basic', hours: 8, pay: 95.33 }
      ] } }
    },
    {
      weekStart: new Date(2026, 0, 12),
      employers: { relief: { entries: [ // a different job's data -- must not leak into NHS totals
        { enhancement: 'Basic', hours: 20, pay: 200 }
      ] } }
    }
  ];
  const workAndPay = service.buildWorkAndPayForJob(job, weeks, new Date(2026, 0, 1), new Date(2026, 0, 31));
  check('buildWorkAndPayForJob only counts weeks inside the date range',
    workAndPay.totalHours === 12
  );
  check('buildWorkAndPayForJob only counts the requested job\'s employer entries',
    workAndPay.shiftCount === 2
  );
  check('buildWorkAndPayForJob groups hours by enhancement type',
    workAndPay.hoursByType.filter(function(g) { return g.key === 'Basic'; })[0].total === 8 &&
    workAndPay.hoursByType.filter(function(g) { return g.key === 'Overtime'; })[0].total === 4
  );

  // ---- buildPayslipTrend ----
  const payslips = [
    { payslipId: 'P2', payDate: new Date(2026, 1, 1), predictedGross: 500, grossPayActual: 480, comparisonStatus: 'Minor Variance' },
    { payslipId: 'P1', payDate: new Date(2026, 0, 1), predictedGross: 500, grossPayActual: 500, comparisonStatus: 'Matched' }
  ];
  const trend = service.buildPayslipTrend(payslips, null, null);
  check('buildPayslipTrend sorts oldest to newest',
    trend[0].payslipId === 'P1' && trend[1].payslipId === 'P2'
  );

  // ---- buildReconciliationSummary ----
  const reconciliation = service.buildReconciliationSummary(
    [
      { comparisonStatus: 'Matched' },
      { comparisonStatus: 'Matched' },
      { comparisonStatus: 'Minor Variance' },
      { comparisonStatus: 'Not Ready' } // must be excluded from the rate -- hasn't actually been compared yet
    ],
    [{ recoveredAmount: 100, outstandingAmount: 20 }, { recoveredAmount: 0, outstandingAmount: 50 }],
    7
  );
  check('buildReconciliationSummary excludes Not Ready payslips from the compared count',
    reconciliation.payslipsComparedCount === 3
  );
  check('buildReconciliationSummary computes the match rate from compared payslips only',
    reconciliation.payslipMatchRatePercent === service.round((2 / 3) * 100)
  );
  check('buildReconciliationSummary sums recovered/outstanding across jobs',
    reconciliation.adjustmentsRecoveredAmount === 100 && reconciliation.adjustmentsOutstandingAmount === 70
  );
  check('buildReconciliationSummary passes through the uncategorised transaction count',
    reconciliation.uncategorisedTransactionCount === 7
  );

  const emptyReconciliation = service.buildReconciliationSummary([], [], 0);
  check('buildReconciliationSummary returns null (not a divide-by-zero) when nothing has been compared yet',
    emptyReconciliation.payslipMatchRatePercent === null
  );

  // ---- buildCashFlowTrend ----
  const referenceDate = new Date(2026, 2, 15); // March 2026
  const movements = [
    { date: new Date(2026, 2, 1), movementType: 'Salary Income', amount: 1000, internalTransfer: false },
    { date: new Date(2026, 2, 3), movementType: 'Bill Payment', amount: 200, internalTransfer: false },
    { date: new Date(2026, 2, 4), movementType: 'Savings Allocation', amount: 300, internalTransfer: true },
    { date: new Date(2026, 1, 1), movementType: 'Salary Income', amount: 900, internalTransfer: false }
  ];
  const cashFlow = service.buildCashFlowTrend(
    movements, 3, ['Savings Allocation'], ['Salary Income'], ['Bill Payment'], referenceDate
  );
  check('buildCashFlowTrend returns exactly monthCount buckets ending at the reference month',
    cashFlow.length === 3 && cashFlow[2].monthLabel === 'Mar 26'
  );
  check('buildCashFlowTrend excludes internal transfers from both income and spending',
    cashFlow[2].income === 1000 && cashFlow[2].spending === 200
  );
  check('buildCashFlowTrend assigns a prior month\'s movement to its own bucket',
    cashFlow[1].income === 900
  );
  check('buildCashFlowTrend computes net as income minus spending',
    cashFlow[2].net === 800
  );

  // ---- buildSpendingByCategory ----
  const transactions = [
    { direction: 'Debit', payTrackerCategory: 'Groceries', amount: -40, settledAt: new Date(2026, 0, 10) },
    { direction: 'Debit', payTrackerCategory: 'Groceries', amount: -10, settledAt: new Date(2026, 0, 20) },
    { direction: 'Debit', payTrackerCategory: 'Fuel', amount: -30, settledAt: new Date(2026, 0, 15) },
    { direction: 'Credit', payTrackerCategory: 'Groceries', amount: 40, settledAt: new Date(2026, 0, 10) }, // a refund -- must not count as spending
    { direction: 'Debit', payTrackerCategory: '', amount: -5, settledAt: new Date(2026, 0, 10) }, // uncategorised -- must be excluded, not lumped into "Uncategorised"
    { direction: 'Debit', payTrackerCategory: 'Fuel', amount: -99, settledAt: new Date(2026, 5, 1) } // outside the range below
  ];
  const spending = service.buildSpendingByCategory(transactions, new Date(2026, 0, 1), new Date(2026, 0, 31));
  check('buildSpendingByCategory only counts debits with a category set',
    spending.reduce(function(sum, g) { return sum + g.total; }, 0) === 80
  );
  check('buildSpendingByCategory groups Groceries correctly',
    spending.filter(function(g) { return g.key === 'Groceries'; })[0].total === 50
  );
  check('buildSpendingByCategory respects the date range',
    spending.filter(function(g) { return g.key === 'Fuel'; })[0].total === 30
  );

  return { success: true, passed: results.length, results: results };
}
