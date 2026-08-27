/*******************************************************
 * PAY TRACKER V3.0 - safe Pay Adjustments ledger unit checks.
 *******************************************************/

function runPayAdjustmentsTests() {
  const results = [];
  function check(name, condition) {
    if (!condition) throw new Error('Failed: ' + name);
    results.push({ name: name, passed: true });
  }

  const definitions = PayTrackerPayAdjustmentsConfig.getDefinitions();
  check('one additive Pay Adjustments sheet definition', definitions.length === 1);

  check('Recovered/Rejected/Written Off are the only terminal statuses',
    PayTrackerPayAdjustmentsConfig.TERMINAL_STATUSES.length === 3 &&
    PayTrackerPayAdjustmentsConfig.TERMINAL_STATUSES.indexOf('Recovered') !== -1 &&
    PayTrackerPayAdjustmentsConfig.TERMINAL_STATUSES.indexOf('Rejected') !== -1 &&
    PayTrackerPayAdjustmentsConfig.TERMINAL_STATUSES.indexOf('Written Off') !== -1
  );
  check('every terminal status is excluded from Unresolved',
    PayTrackerPayAdjustmentsConfig.TERMINAL_STATUSES.every(function(status) {
      return PayTrackerPayAdjustmentsConfig.UNRESOLVED_STATUSES.indexOf(status) === -1;
    })
  );
  check('every unresolved status is a real, valid adjustment status',
    PayTrackerPayAdjustmentsConfig.UNRESOLVED_STATUSES.every(function(status) {
      return PayTrackerPayAdjustmentsConfig.ADJUSTMENT_STATUSES.indexOf(status) !== -1;
    })
  );

  // create() always appends a new permanent row (no upsert/dedup --
  // this is a deliberate audit-trail ledger, see README) and
  // getUnresolved()/getSummaryForJob() are correctly scoped by
  // jobId but not by test run. A fixed 'JOB-TEST' id would
  // accumulate one more permanently-unresolved row every time this
  // suite runs against the same live spreadsheet, so a later run's
  // getUnresolved('JOB-TEST') would find a *previous* run's leftover
  // row and fail even though nothing is actually wrong. A fresh,
  // real Utilities.getUuid()-suffixed id per run keeps every run's
  // data -- and its assertions -- fully self-contained.
  const testJobId = 'JOB-TEST-' + Utilities.getUuid();

  const adjustment = PayTrackerPayAdjustmentsRepository.create({
    jobId: testJobId, adjustmentType: 'Missing Basic Hours',
    missingHours: 4, missingAmount: 50.84, expectedRate: 12.71
  });
  check('a new adjustment starts as Identified', adjustment.adjustmentStatus === 'Identified');

  const partial = PayTrackerPayAdjustmentsRepository.carryForward(adjustment.adjustmentId, {
    recoveredHours: 2, recoveredAmount: 25.42
  });
  check('partial recovery moves to Partially Recovered, not Recovered',
    partial.adjustmentStatus === 'Partially Recovered'
  );
  check('carrying forward never rewrites the original missing amount',
    partial.missingHours === 4 && partial.missingAmount === 50.84
  );

  const full = PayTrackerPayAdjustmentsRepository.carryForward(adjustment.adjustmentId, {
    recoveredHours: 2, recoveredAmount: 25.42
  });
  check('fully recovering the missing hours reaches Recovered',
    full.adjustmentStatus === 'Recovered' && full.recoveredHours === 4
  );

  const rejected = PayTrackerPayAdjustmentsRepository.create({ jobId: testJobId, missingAmount: 10 });
  PayTrackerPayAdjustmentsRepository.update(rejected.adjustmentId, { adjustmentStatus: 'Rejected' });
  const unresolvedAfterBoth = PayTrackerPayAdjustmentsRepository.getUnresolved(testJobId);
  check('Recovered and Rejected adjustments never count as unresolved',
    unresolvedAfterBoth.length === 0
  );

  PayTrackerPayAdjustmentsRepository.create({ jobId: testJobId, missingAmount: 30 });
  const summary = PayTrackerPayAdjustmentsSummaryService.getSummaryForJob(testJobId);
  check('summary outstanding total excludes terminal-status adjustments',
    summary.outstandingAmount === 30
  );
  check('summary recovered total reflects the fully-recovered adjustment',
    Math.abs(summary.recoveredAmount - 50.84) < 0.01
  );

  return { success: true, passed: results.length, results: results };
}
