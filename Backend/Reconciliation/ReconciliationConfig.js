/*******************************************************
 * PAY TRACKER V3.0
 * Unified reconciliation data definitions.
 *******************************************************/

const PayTrackerReconciliationConfig = Object.freeze({
  VERSION: '3.0.1',

  SHEETS: Object.freeze({
    JOBS: Object.freeze({
      NAME: 'Jobs',
      HEADERS: Object.freeze([
        'Job ID', 'Job Name', 'Employer', 'Employer Key',
        'Payroll Group ID', 'Staffline References',
        'Calendar Matching Rules', 'Basic Hourly Rate',
        'Enhancement Rules', 'Taxable', 'Annual Leave Enabled',
        'Annual Leave Accrual Method', 'Annual Leave Year Start',
        'Annual Leave Year End', 'Active', 'Manual Override',
        'Notes', 'Created At', 'Updated At'
      ])
    }),
    ACTION_ITEMS: Object.freeze({
      NAME: 'Action Centre',
      HEADERS: Object.freeze([
        'Action ID', 'Action Type', 'Title', 'Description',
        'Priority', 'Status', 'Job ID', 'Source Type',
        'Source ID', 'Source Sheet', 'Source Row', 'Confidence',
        'Suggested Resolution', 'Manual Decision', 'Decision Notes',
        'Assigned To', 'Due Date', 'Created At', 'Updated At',
        'Resolved At', 'Resolved By'
      ])
    }),
    ACTION_HISTORY: Object.freeze({
      NAME: 'Action Centre History',
      HEADERS: Object.freeze([
        'History ID', 'Action ID', 'Previous Status', 'New Status',
        'Previous Decision', 'New Decision', 'Notes', 'Changed By',
        'Changed At'
      ])
    }),
    CALENDAR_SYNC_RECORDS: Object.freeze({
      NAME: 'Calendar Sync Records',
      HEADERS: Object.freeze([
        'Sync Record ID', 'Event Key', 'Event ID', 'Event Title',
        'Calendar ID', 'Event Start', 'Event End', 'Job ID',
        'Table Name', 'Sheet Date', 'Sheet Row', 'Shift Type',
        'Hours', 'Pay', 'Status', 'Last Seen At', 'Created At',
        'Updated At'
      ])
    })
  }),

  ACTION_STATUSES: Object.freeze([
    'Open', 'In Review', 'Resolved', 'Dismissed'
  ]),
  ACTION_PRIORITIES: Object.freeze([
    'Low', 'Normal', 'High', 'Urgent'
  ]),

  DEFAULT_JOBS: Object.freeze([
    Object.freeze({
      jobId: 'JOB-NHS', jobName: 'NHS', employer: 'NHS',
      employerKey: 'nhs', payrollGroupId: 'PAYROLL-GROUP-COMBINED-001',
      stafflineReferences: '', calendarMatchingRules: 'nhs',
      basicHourlyRate: 12.71, enhancementRules: 'PayTrackerConfig.PAY_RULES.NHS',
      taxable: true, annualLeaveEnabled: true
    }),
    Object.freeze({
      jobId: 'JOB-RELIEF-WARDEN', jobName: 'Relief Warden',
      employer: 'Relief Assistant Warden', employerKey: 'relief',
      payrollGroupId: 'PAYROLL-GROUP-COMBINED-001',
      stafflineReferences: '', calendarMatchingRules: 'relief|warden',
      basicHourlyRate: 13.69, enhancementRules: 'PayTrackerConfig.PAY_RULES[Relief Assistant Warden]',
      taxable: true, annualLeaveEnabled: true
    }),
    Object.freeze({
      jobId: 'JOB-NIGHT-SECURITY', jobName: 'Night Security',
      employer: 'Night Security Warden', employerKey: 'security',
      payrollGroupId: 'PAYROLL-GROUP-COMBINED-001',
      stafflineReferences: '', calendarMatchingRules: 'security|night',
      basicHourlyRate: 13.47, enhancementRules: 'PayTrackerConfig.PAY_RULES[Night Security Warden]',
      taxable: true, annualLeaveEnabled: true
    }),
    Object.freeze({
      jobId: 'JOB-LOGGING-CASH', jobName: 'Logging Cash',
      employer: 'Logging Cash', employerKey: 'logging', payrollGroupId: '',
      stafflineReferences: '', calendarMatchingRules: 'logging',
      basicHourlyRate: 10, enhancementRules: 'PayTrackerConfig.PAY_RULES[Logging Cash]',
      taxable: false, annualLeaveEnabled: false
    })
  ]),

  getDefinitions: function() {
    return Object.keys(this.SHEETS).map(function(key) {
      return PayTrackerReconciliationConfig.SHEETS[key];
    });
  }
});
