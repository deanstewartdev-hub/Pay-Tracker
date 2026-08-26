/*******************************************************
 * PAY TRACKER V3.0
 * Tests/RunAllTests.js
 *
 * Runs every v3-era safe test suite in one call and returns a single
 * consolidated pass/fail report (roadmap Phase 10: "all major
 * workflows pass end-to-end testing").
 *
 * Deliberately limited to the v3 run<Domain>Tests() suites -- these
 * all share one convention (check()/throw-on-first-failure,
 * {success, passed, results}) and are all pure/mocked, safe to run
 * against a live spreadsheet at any time. The older, pre-v3
 * test<Domain>() functions scattered through Backend/Finance and
 * Backend/Payroll are a different, older convention: manual debug
 * helpers that log output for a human to read (no assertions, no
 * pass/fail signal), not automated checks -- they are intentionally
 * NOT included here. Run them individually from the Apps Script
 * editor if you need to inspect that output.
 *******************************************************/

function runAllPayTrackerTests() {
  const suites = [
    { name: 'Reconciliation Foundation', run: runReconciliationFoundationTests },
    { name: 'Calendar Reconciliation', run: runCalendarReconciliationTests },
    { name: 'Annual Leave Engine', run: runAnnualLeaveEngineTests },
    { name: 'Pay Adjustments', run: runPayAdjustmentsTests },
    { name: 'Money Movements', run: runMoneyMovementsTests },
    { name: 'Transaction Rules', run: runTransactionRulesTests },
    { name: 'Analytics', run: runAnalyticsTests }
  ];

  const suiteResults = suites.map(function(suite) {
    try {
      const result = suite.run();
      return {
        suite: suite.name,
        success: true,
        checksPassed: result.passed,
        error: null
      };
    } catch (error) {
      return {
        suite: suite.name,
        success: false,
        checksPassed: 0,
        error: error && error.message ? error.message : String(error)
      };
    }
  });

  const failedSuites = suiteResults.filter(function(result) { return result.success === false; });
  const totalChecksPassed = suiteResults.reduce(function(sum, result) { return sum + result.checksPassed; }, 0);

  return {
    success: failedSuites.length === 0,
    suiteCount: suites.length,
    suitesPassed: suites.length - failedSuites.length,
    totalChecksPassed: totalChecksPassed,
    failedSuites: failedSuites,
    suiteResults: suiteResults
  };
}
