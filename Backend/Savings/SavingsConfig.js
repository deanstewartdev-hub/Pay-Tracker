/*******************************************************
 * PAY TRACKER V2.6
 * SavingsConfig.gs
 *
 * Configuration for:
 * - Savings settings
 * - Savings pots
 * - Flexible contribution schedules
 * - Savings contribution queue
 * - Savings history and undo
 * - Life goals
 * - Months-to-goal forecasting
 *******************************************************/

const PayTrackerSavingsConfig = Object.freeze({
  VERSION: '2.6.0',

    SHEETS: Object.freeze({
    SETTINGS: 'Savings Settings',
    POTS: 'Savings Pots',
    CONTRIBUTIONS: 'Savings Contributions',
    HISTORY: 'Savings History',
    GOALS: 'Life Goals'
  }),

  FIRST_DATA_ROW: 2,

  ACTIVE_VALUES: Object.freeze([
    'Yes',
    'No'
  ]),

  SAVINGS_MODES: Object.freeze([
    'Percentage of Disposable Income',
    'Fixed Monthly Amount'
  ]),

  CONTRIBUTION_METHODS: Object.freeze([
    'Percentage Allocation',
    'Fixed Amount'
  ]),

  CONTRIBUTION_FREQUENCIES: Object.freeze([
    'Weekly',
    'Fortnightly',
    'Monthly',
    'Quarterly',
    'Annual',
    'One-off'
  ]),

  ACCOUNT_TYPES: Object.freeze([
    'Instant Access',
    'Limited Access',
    'Regular Saver',
    'Cash ISA',
    'Stocks & Shares ISA',
    'Investment Account',
    'Current Account Pot',
    'Other'
  ]),

  GOAL_CATEGORIES: Object.freeze([
    'House Deposit',
    'Emergency Fund',
    'Holiday',
    'Vehicle',
    'Wedding',
    'Education',
    'Home Improvement',
    'Technology',
    'Christmas',
    'Gifts',
    'Investment',
    'Other'
  ]),

  PRIORITIES: Object.freeze([
    'High',
    'Medium',
    'Low'
  ]),

  TARGET_STATUSES: Object.freeze([
    'Complete',
    'Ahead of Target',
    'On Track',
    'Behind Target',
    'No Target Date',
    'No Contribution',
    'No Goal Amount'
  ]),

  CONTRIBUTION_STATUSES: Object.freeze({
    UPCOMING: 'Upcoming',
    PROCESSING: 'Processing',
    COMPLETED: 'Completed',
    ERROR: 'Error'
  }),

  UNDO_STATUSES: Object.freeze({
    AVAILABLE: 'Available',
    UNDONE: 'Undone'
  }),

  SETTINGS: Object.freeze({
    HEADERS: Object.freeze([
      'Setting',
      'Value',
      'Description'
    ]),

    KEYS: Object.freeze({
      MODE: 'Savings Mode',
      PERCENTAGE: 'Disposable Income Savings %',
      FIXED_AMOUNT: 'Fixed Monthly Savings Amount',
      MAXIMUM_AMOUNT: 'Maximum Monthly Savings',
      DEFAULT_DEPOSIT_DAY: 'Default Deposit Day',
      LAST_RECALCULATED: 'Last Recalculated'
    }),

    DEFAULT_ROWS: Object.freeze([
      [
        'Savings Mode',
        'Percentage of Disposable Income',
        'Choose whether savings are based on disposable income or a fixed monthly amount.'
      ],
      [
        'Disposable Income Savings %',
        0.60,
        'Percentage of disposable income available for savings. Enter 60% as 60%.'
      ],
      [
        'Fixed Monthly Savings Amount',
        0,
        'Used only when Savings Mode is Fixed Monthly Amount.'
      ],
      [
        'Maximum Monthly Savings',
        0,
        'Optional savings cap. Enter 0 for no maximum.'
      ],
      [
        'Default Deposit Day',
        1,
        'Default day of the month used when a savings pot has no next deposit date.'
      ],
      [
        'Last Recalculated',
        '',
        'Automatically updated whenever the savings module is recalculated.'
      ]
    ])
  }),

  POTS: Object.freeze({
    /*
     * Existing v2.5 columns remain in positions 1–20.
     *
     * v2.6 contribution and forecasting columns are appended
     * in positions 21–26, and v2.8 Monzo Pot linking columns
     * in positions 27–28, to preserve existing data.
     */
    HEADERS: Object.freeze([
      'Pot ID',
      'Pot Name',
      'Provider',
      'Account Type',
      'Current Balance',
      'Goal Amount',
      'Allocation %',
      'Interest Rate AER %',
      'Active',
      'Target Date',
      'Next Deposit Date',
      'Suggested Monthly Deposit',
      'Amount Remaining',
      'Progress %',
      'Estimated Monthly Interest',
      'Estimated Annual Interest',
      'Estimated Completion Date',
      'Progress Bar',
      'Linked Goal ID',
      'Notes',

      'Contribution Method',
      'Contribution Frequency',
      'Contribution Amount',
      'Monthly Equivalent',
      'Estimated Months to Goal',
      'Target Status',

      'Linked Monzo Pot ID',
      'Linked Monzo Pot Name'
    ]),

    COLUMNS: Object.freeze({
      ID: 1,
      NAME: 2,
      PROVIDER: 3,
      ACCOUNT_TYPE: 4,
      CURRENT_BALANCE: 5,
      GOAL_AMOUNT: 6,
      ALLOCATION: 7,
      INTEREST_RATE: 8,
      ACTIVE: 9,
      TARGET_DATE: 10,
      NEXT_DEPOSIT_DATE: 11,
      SUGGESTED_DEPOSIT: 12,
      AMOUNT_REMAINING: 13,
      PROGRESS: 14,
      MONTHLY_INTEREST: 15,
      ANNUAL_INTEREST: 16,
      COMPLETION_DATE: 17,
      PROGRESS_BAR: 18,
      LINKED_GOAL_ID: 19,
      NOTES: 20,

      CONTRIBUTION_METHOD: 21,
      CONTRIBUTION_FREQUENCY: 22,
      CONTRIBUTION_AMOUNT: 23,
      MONTHLY_EQUIVALENT: 24,
      MONTHS_TO_GOAL: 25,
      TARGET_STATUS: 26,

      MONZO_POT_ID: 27,
      MONZO_POT_NAME: 28
    })
  }),

  CONTRIBUTIONS: Object.freeze({
    /*
     * Contribution Method and Frequency are stored in the
     * queue so completed deposits retain their original plan.
     */
    HEADERS: Object.freeze([
      'Contribution ID',
      'Due Date',
      'Pot ID',
      'Pot Name',
      'Contribution Amount',
      'Deposited?',
      'Status',
      'Notes',
      'Contribution Method',
      'Contribution Frequency'
    ]),

    COLUMNS: Object.freeze({
      ID: 1,
      DUE_DATE: 2,
      POT_ID: 3,
      POT_NAME: 4,
      AMOUNT: 5,
      DEPOSITED: 6,
      STATUS: 7,
      NOTES: 8,
      METHOD: 9,
      FREQUENCY: 10
    })
  }),

  HISTORY: Object.freeze({
    /*
     * Frequency and Method are appended so existing history
     * rows remain compatible.
     */
    HEADERS: Object.freeze([
      'Contribution ID',
      'Original Due Date',
      'Deposited Date',
      'Pot ID',
      'Pot Name',
      'Amount Deposited',
      'Previous Balance',
      'Balance After Deposit',
      'Processed At',
      'Undo Status',
      'Notes',

      'Contribution Method',
      'Contribution Frequency'
    ]),

    COLUMNS: Object.freeze({
      ID: 1,
      ORIGINAL_DUE_DATE: 2,
      DEPOSITED_DATE: 3,
      POT_ID: 4,
      POT_NAME: 5,
      AMOUNT: 6,
      PREVIOUS_BALANCE: 7,
      BALANCE_AFTER: 8,
      PROCESSED_AT: 9,
      UNDO_STATUS: 10,
      NOTES: 11,

      METHOD: 12,
      FREQUENCY: 13
    })
  }),

  GOALS: Object.freeze({
  /*
   * Existing v2.5 columns remain in positions 1–13.
   * Forecasting columns are appended in positions 14–15.
   */
  HEADERS: Object.freeze([
    'Goal ID',
    'Goal Name',
    'Category',
    'Target Amount',
    'Current Linked Savings',
    'Target Date',
    'Priority',
    'Active',
    'Amount Remaining',
    'Progress %',
    'Estimated Completion Date',
    'Progress Bar',
    'Notes',
    'Estimated Months Remaining',
    'Target Status'
  ]),

  COLUMNS: Object.freeze({
    ID: 1,
    NAME: 2,
    CATEGORY: 3,
    TARGET_AMOUNT: 4,
    CURRENT_SAVINGS: 5,
    TARGET_DATE: 6,
    PRIORITY: 7,
    ACTIVE: 8,
    AMOUNT_REMAINING: 9,
    PROGRESS: 10,
    COMPLETION_DATE: 11,
    PROGRESS_BAR: 12,
    NOTES: 13,
    MONTHS_REMAINING: 14,
    TARGET_STATUS: 15
  })
}),

  FORMATS: Object.freeze({
    CURRENCY: '£#,##0.00',
    PERCENTAGE: '0.00%',
    RATE_NUMBER: '0.00',
    DATE: 'dd/MM/yyyy',
    DATE_TIME: 'dd/MM/yyyy HH:mm:ss',
    INTEGER: '0'
  })
});