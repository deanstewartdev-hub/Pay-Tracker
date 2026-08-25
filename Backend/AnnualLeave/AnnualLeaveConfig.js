/*******************************************************
 * PAY TRACKER V3.0
 * Annual Leave ledger data definitions.
 *
 * Per-job settings (accrual method/rate, opening balance,
 * carryover, rounding) live as extra columns on the existing
 * `Jobs` sheet (see ReconciliationConfig.js) rather than a
 * separate settings sheet, since Jobs already carries most of
 * the fields the roadmap's "Annual Leave Job Settings" wants
 * (Job ID, Job Name, Basic Hourly Rate, Annual Leave Enabled,
 * Annual Leave Accrual Method, Annual Leave Year Start/End) and
 * duplicating job identity in a second sheet is exactly the
 * anti-pattern the v3 Phase 0 audit flagged. Only the two ledgers
 * below (Earnings, Usage) are genuinely new sheets.
 *******************************************************/

const PayTrackerAnnualLeaveConfig = Object.freeze({
  VERSION: '3.0.2',

  SHEETS: Object.freeze({
    EARNINGS: Object.freeze({
      NAME: 'Annual Leave Earnings',
      HEADERS: Object.freeze([
        'AL Earnings ID', 'Job ID', 'Work Week Start', 'Work Week End',
        'Eligible Hours Worked', 'Accrual Rate', 'Hours Earned',
        'Basic Hourly Rate', 'Estimated Value', 'Source Type',
        'Source Shift IDs', 'Source Payslip ID', 'Calculation Status',
        'Notes', 'Created At', 'Updated At'
      ])
    }),
    USAGE: Object.freeze({
      NAME: 'Annual Leave Usage',
      HEADERS: Object.freeze([
        'AL Usage ID', 'Job ID', 'Leave Start', 'Leave End',
        'Hours Requested', 'Hours Approved', 'Hours Taken', 'Hours Paid',
        'Leave Status', 'Source Type', 'Gmail Message ID',
        'Gmail Thread ID', 'Calendar Event ID', 'Payslip ID',
        'Approval Confidence', 'Manual Review Status', 'Notes',
        'Created At', 'Updated At'
      ])
    })
  }),

  SOURCE_TYPES: Object.freeze([
    'Manual Entry', 'Calendar', 'Gmail', 'Payslip'
  ]),

  CALCULATION_STATUSES: Object.freeze([
    'Calculated', 'Needs Review', 'Manual Override'
  ]),

  LEAVE_STATUSES: Object.freeze([
    'Requested', 'Approved', 'Rejected', 'Cancelled',
    'Booked', 'Taken', 'Paid', 'Partially Paid', 'Needs Review'
  ]),

  MANUAL_REVIEW_STATUSES: Object.freeze([
    'Not Needed', 'Needs Review', 'Reviewed'
  ]),

  // Additive-only defaults backfilled onto the Jobs sheet's AL
  // setting columns when a cell is genuinely blank. Never applied
  // to Annual Leave Accrual Method / Year Start / Year End, which
  // stay unset until the user (or a later phase) configures them --
  // this repo has never populated those three, and guessing a leave
  // year would misrepresent the user's actual employer terms.
  DEFAULT_JOB_SETTINGS: Object.freeze({
    annualLeaveAccrualRate: 0.1207, // UK statutory-equivalent accrual for irregular hours; user-editable, not hardcoded into any calculation.
    annualLeaveOpeningBalanceHours: 0,
    annualLeaveCarryoverHours: 0,
    annualLeaveMaximumCarryoverHours: 0,
    annualLeaveRoundingMethod: 'Nearest hundredth'
  }),

  getDefinitions: function() {
    return Object.keys(this.SHEETS).map(function(key) {
      return PayTrackerAnnualLeaveConfig.SHEETS[key];
    });
  }
});
