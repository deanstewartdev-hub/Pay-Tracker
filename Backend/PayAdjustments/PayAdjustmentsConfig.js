/*******************************************************
 * PAY TRACKER V3.0
 * Pay Adjustments ledger data definitions.
 *
 * Tracks a specific missing/incorrect amount from a specific
 * payslip through to recovery on a later one. The existing
 * Payroll Comparison engine (PayrollComparisonEngine.gs) only
 * compares a whole payslip's predicted vs actual gross/net -- it
 * has no per-job, per-category breakdown to auto-detect "this
 * job's 4 missing Basic hours" from. This ledger is deliberately a
 * manual-entry system the user (or an Action Centre item) populates
 * when they notice a specific discrepancy, not an automatic
 * extension of the whole-payslip comparison.
 *******************************************************/

const PayTrackerPayAdjustmentsConfig = Object.freeze({
  VERSION: '3.0.6',

  SHEETS: Object.freeze({
    ADJUSTMENTS: Object.freeze({
      NAME: 'Pay Adjustments',
      HEADERS: Object.freeze([
        'Adjustment ID', 'Job ID', 'Original Shift ID', 'Original Pay Period',
        'Original Payslip ID', 'Adjustment Type', 'Missing Hours',
        'Missing Amount', 'Expected Rate', 'Expected Pay Category',
        'Reported Date', 'Expected Recovery Pay Period',
        'Expected Recovery Payslip', 'Recovered Hours', 'Recovered Amount',
        'Adjustment Status', 'Previous Discrepancy Status', 'Notes',
        'Created At', 'Updated At'
      ])
    })
  }),

  ADJUSTMENT_TYPES: Object.freeze([
    'Missing Basic Hours', 'Missing Enhanced Hours', 'Missing Overtime Hours',
    'Missing Unsocial Hours', 'Missing Holiday Hours', 'Incorrect Rate',
    'Incorrect Deduction', 'Overpayment', 'Manual Correction'
  ]),

  // Never delete/reuse an adjustment on the next payslip -- a new
  // status is appended to this record's own history; the original
  // discrepancy is always preserved (roadmap Section 8, rule 1 and 7).
  ADJUSTMENT_STATUSES: Object.freeze([
    'Identified', 'Needs Review', 'Reported', 'Expected Next Payslip',
    'Partially Recovered', 'Recovered', 'Rejected', 'Written Off'
  ]),

  // Statuses that still count as an active, unresolved discrepancy.
  // Recovered/Rejected/Written Off are terminal -- once an adjustment
  // reaches one of these, the original discrepancy is explained and
  // should stop appearing in any "unresolved" count.
  UNRESOLVED_STATUSES: Object.freeze([
    'Identified', 'Needs Review', 'Reported', 'Expected Next Payslip', 'Partially Recovered'
  ]),

  TERMINAL_STATUSES: Object.freeze([
    'Recovered', 'Rejected', 'Written Off'
  ]),

  getDefinitions: function() {
    return Object.keys(this.SHEETS).map(function(key) {
      return PayTrackerPayAdjustmentsConfig.SHEETS[key];
    });
  }
});
