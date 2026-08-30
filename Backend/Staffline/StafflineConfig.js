/*******************************************************
 * PAY TRACKER V3.1 - Staffline reconciliation config.
 *
 * Phase 3: Google Calendar -> Staffline approved timesheet ->
 * Payslip payment line -> predicted vs actual pay -> discrepancy.
 *
 * Three additive sheets:
 * - Staffline Timesheets: one row per Gmail "Timesheet Approved"
 *   email (metadata -- placement, client, date range, approver).
 * - Staffline Timesheet Details: one row per Timesheet ID,
 *   populated from the real Staffline portal (read-only). Apps
 *   Script itself cannot reach the authenticated portal -- there
 *   is no stored credential and none will ever be stored -- so
 *   this sheet is populated interactively (a human/assistant
 *   browses the portal with a real session and calls the import
 *   function with what was actually observed), never by an
 *   automated scan the way Gmail import works. See
 *   StafflineTimesheetDetailRepository.js for exactly which
 *   fields the real portal reliably exposes.
 * - Staffline Payment Lines: one row per payslip payment-table
 *   line, extended from the existing whole-payslip Payslip
 *   Register (Backend/Payroll/PayslipRepository.gs), which only
 *   ever stored aggregate totals.
 *
 * Reconciliation itself is never stored -- it is computed live
 * from Calendar-owned shifts (CalendarSyncRepository), the Job
 * Registry's stafflineReferences, this module's three sheets and
 * the Payslip Register, the same "nothing stored, nothing
 * estimated" approach already used by AnalyticsService.js.
 *******************************************************/

const PayTrackerStafflineConfig = Object.freeze({
  VERSION: '3.1.1',

  GMAIL: Object.freeze({
    SENDER: 'ithelpdeskire@stafflinerecruit.com',
    SUBJECT_CONTAINS: 'Timesheet',
    APPROVED_SUBJECT_PATTERN: /Timesheet\s+(\d+)\s+Approved\s+by\s+(.+)$/i
  }),

  SHEETS: Object.freeze({
    STAFFLINE_TIMESHEETS: Object.freeze({
      NAME: 'Staffline Timesheets',
      HEADERS: Object.freeze([
        'Timesheet ID', 'Gmail Message ID', 'Gmail Thread ID', 'Approved By',
        'Approved Date', 'Placement Description', 'Client Name', 'Job ID',
        'Timesheet Start', 'Timesheet End', 'Work Address', 'Portal URL',
        'Classification Status', 'Action Item ID', 'Notes',
        'Created At', 'Updated At'
      ])
    }),
    STAFFLINE_TIMESHEET_DETAILS: Object.freeze({
      NAME: 'Staffline Timesheet Details',
      HEADERS: Object.freeze([
        'Timesheet ID', 'Submitted Hours', 'Rate Unit', 'Rate Categories',
        'Portal Status', 'Submitted Date', 'Approved Date', 'Approved By',
        'Source', 'Source URL', 'Imported At', 'Manual Override', 'Notes'
      ])
    }),
    STAFFLINE_PAYMENT_LINES: Object.freeze({
      NAME: 'Staffline Payment Lines',
      HEADERS: Object.freeze([
        'Payment Line ID', 'Payslip ID', 'Timesheet Reference',
        'Normalized Timesheet ID', 'Work Date', 'Description', 'Units',
        'Rate', 'Amount', 'Pay Category', 'Job ID', 'Validation Status',
        'Created At'
      ])
    })
  }),

  CLASSIFICATION_STATUSES: Object.freeze(['Classified', 'Needs Review']),

  // Reconciliation status vocabulary -- Calendar <-> Staffline side.
  CALENDAR_MATCH_STATUSES: Object.freeze([
    'Match', 'Missing from Staffline', 'Extra on Staffline',
    'Hours Differ', 'Shift Time Differs', 'Job Mismatch', 'Needs Review'
  ]),

  // Reconciliation status vocabulary -- Staffline <-> Payslip side.
  PAYMENT_MATCH_STATUSES: Object.freeze([
    'Match', 'Unpaid', 'Partially Paid', 'Underpaid', 'Overpaid', 'Wrong Rate',
    'Wrong Enhancement', 'Delayed Payment', 'Duplicate Payment',
    'Unexpected Payment', 'Needs Review'
  ]),

  // Combined three-way diagnosis -- what KIND of problem, distinguishing
  // a payroll-side failure from a timesheet-side failure from a
  // simple pay-cycle lag.
  DISCREPANCY_TYPES: Object.freeze([
    'Payroll Underpayment', 'Timesheet Discrepancy', 'Delayed Payment', 'None'
  ]),

  HOURS_TOLERANCE: 0.05,
  AMOUNT_TOLERANCE: 0.02,

  // How many later payslips to search before declaring a timesheet
  // unpaid -- Staffline pay can lag by more than one cycle.
  LATER_PAYSLIP_SEARCH_COUNT: 6,

  getDefinitions: function() {
    return Object.keys(this.SHEETS).map(function(key) {
      return PayTrackerStafflineConfig.SHEETS[key];
    });
  },

  /**
   * Normalizes a Staffline timesheet reference to bare digits so the
   * Gmail-sourced ID ("621093") and the payslip-line reference
   * ("N621093") can be compared as the same key.
   *
   * @param {*} value Reference in either form.
   * @return {string} Digits only, or '' if none.
   */
  normalizeReference: function(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[^0-9]/g, '');
  }
});
