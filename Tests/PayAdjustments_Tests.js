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

  const adjustment = PayTrackerPayAdjustmentsRepository.create({
    jobId: 'JOB-TEST', adjustmentType: 'Missing Basic Hours',
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

  const rejected = PayTrackerPayAdjustmentsRepository.create({ jobId: 'JOB-TEST', missingAmount: 10 });
  PayTrackerPayAdjustmentsRepository.update(rejected.adjustmentId, { adjustmentStatus: 'Rejected' });
  const unresolvedAfterBoth = PayTrackerPayAdjustmentsRepository.getUnresolved('JOB-TEST');
  check('Recovered and Rejected adjustments never count as unresolved',
    unresolvedAfterBoth.length === 0
  );

  PayTrackerPayAdjustmentsRepository.create({ jobId: 'JOB-TEST', missingAmount: 30 });
  const summary = PayTrackerPayAdjustmentsSummaryService.getSummaryForJob('JOB-TEST');
  check('summary outstanding total excludes terminal-status adjustments',
    summary.outstandingAmount === 30
  );
  check('summary recovered total reflects the fully-recovered adjustment',
    Math.abs(summary.recoveredAmount - 50.84) < 0.01
  );

  return { success: true, passed: results.length, results: results };
}
