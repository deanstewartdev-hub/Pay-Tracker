/*******************************************************
 * PAY TRACKER V2.4
 * FinanceConfig.gs
 *
 * Central finance configuration.
 *
 * Features:
 * - Bills
 * - Debts and loans
 * - Upcoming payment queue
 * - Payment history
 * - Payment undo recovery
 * - Debt percentage progress
 * - Finance dashboard diagrams
 *******************************************************/

const PayTrackerFinanceConfig = Object.freeze({
  VERSION: '2.4.0',

  SHEETS: Object.freeze({
    BILLS: 'Bills',
    DEBTS: 'Debts',
    PAYMENTS: 'Finance Payments',
    PAYMENT_HISTORY: 'Payment History',
    DASHBOARD: 'Finance Dashboard'
  }),

  FIRST_DATA_ROW: 2,

  ACTIVE_VALUES: Object.freeze([
    'Yes',
    'No'
  ]),

  BILL_FREQUENCIES: Object.freeze([
    'Weekly',
    'Fortnightly',
    'Monthly',
    'Quarterly',
    'Annual',
    'One-off'
  ]),

  DEBT_FREQUENCIES: Object.freeze([
    'Weekly',
    'Fortnightly',
    'Monthly',
    'Quarterly'
  ]),

  BILL_CATEGORIES: Object.freeze([
    'Housing',
    'Vehicle',
    'Insurance',
    'Utilities',
    'Phone',
    'Internet',
    'Food',
    'Travel',
    'Subscriptions',
    'Health',
    'Entertainment',
    'Savings',
    'Other'
  ]),

  DEBT_TYPES: Object.freeze([
    'Personal Loan',
    'Car Finance',
    'Credit Card',
    'Mortgage',
    'Family Loan',
    'Overdraft',
    'Buy Now Pay Later',
    'Other'
  ]),

  PAYMENT_TYPES: Object.freeze([
    'Bill Payment',
    'Debt Repayment',
    'Extra Debt Repayment'
  ]),

  PAYMENT_STATUSES: Object.freeze({
    UPCOMING: 'Upcoming',
    PROCESSING: 'Processing',
    COMPLETED: 'Completed',
    ERROR: 'Error'
  }),

  UNDO_STATUSES: Object.freeze({
    AVAILABLE: 'Available',
    UNDONE: 'Undone'
  }),

  FORMATS: Object.freeze({
    CURRENCY: '£#,##0.00',
    APR_NUMBER: '0.00',
    PERCENTAGE: '0.00%',
    DATE: 'dd/MM/yyyy',
    DATE_TIME: 'dd/MM/yyyy HH:mm:ss',
    INTEGER: '0'
  }),

  BILLS: Object.freeze({
    HEADERS: Object.freeze([
      'Bill ID',
      'Bill Name',
      'Category',
      'Amount',
      'Frequency',
      'Next Due Date',
      'Active',
      'Weekly Cost',
      'Monthly Cost',
      'Notes'
    ]),

    COLUMNS: Object.freeze({
      ID: 1,
      NAME: 2,
      CATEGORY: 3,
      AMOUNT: 4,
      FREQUENCY: 5,
      NEXT_DUE_DATE: 6,
      ACTIVE: 7,
      WEEKLY_COST: 8,
      MONTHLY_COST: 9,
      NOTES: 10
    })
  }),

  DEBTS: Object.freeze({
    HEADERS: Object.freeze([
      'Debt ID',
      'Debt Name',
      'Debt Type',
      'Original Amount',
      'Current Balance',
      'APR %',
      'Repayment Amount',
      'Frequency',
      'Start Date',
      'Next Payment Date',
      'Active',
      'Monthly Repayment',
      'Estimated Months Left',
      'Estimated Payoff Date',
      'Estimated Interest Remaining',
      'Notes',
      'Amount Repaid',
      'Percentage Repaid',
      'Repayment Progress'
    ]),

    COLUMNS: Object.freeze({
      ID: 1,
      NAME: 2,
      TYPE: 3,
      ORIGINAL_AMOUNT: 4,
      CURRENT_BALANCE: 5,
      APR: 6,
      REPAYMENT_AMOUNT: 7,
      FREQUENCY: 8,
      START_DATE: 9,
      NEXT_PAYMENT_DATE: 10,
      ACTIVE: 11,
      MONTHLY_REPAYMENT: 12,
      MONTHS_LEFT: 13,
      PAYOFF_DATE: 14,
      INTEREST_REMAINING: 15,
      NOTES: 16,
      AMOUNT_REPAID: 17,
      PERCENTAGE_REPAID: 18,
      PROGRESS_BAR: 19
    })
  }),

  PAYMENTS: Object.freeze({
    HEADERS: Object.freeze([
      'Payment ID',
      'Due Date',
      'Payment Type',
      'Item ID',
      'Bill or Debt Name',
      'Amount Due',
      'Paid?',
      'Status',
      'Notes'
    ]),

    COLUMNS: Object.freeze({
      ID: 1,
      DUE_DATE: 2,
      TYPE: 3,
      ITEM_ID: 4,
      ITEM_NAME: 5,
      AMOUNT_DUE: 6,
      PAID: 7,
      STATUS: 8,
      NOTES: 9
    })
  }),

  PAYMENT_HISTORY: Object.freeze({
    HEADERS: Object.freeze([
      'Payment ID',
      'Original Due Date',
      'Paid Date',
      'Payment Type',
      'Item ID',
      'Bill or Debt Name',
      'Amount Paid',
      'Principal Paid',
      'Interest Paid',
      'Balance After Payment',
      'Notes',
      'Processed At',

      /*
       * Recovery information used by Undo Last Payment.
       * These columns are automatically hidden.
       */
      'Previous Due Date',
      'Previous Balance',
      'Previous Active Status',
      'Previous Next Payment Date',
      'Replacement Payment ID',
      'Undo Status'
    ]),

    COLUMNS: Object.freeze({
      ID: 1,
      ORIGINAL_DUE_DATE: 2,
      PAID_DATE: 3,
      TYPE: 4,
      ITEM_ID: 5,
      ITEM_NAME: 6,
      AMOUNT_PAID: 7,
      PRINCIPAL: 8,
      INTEREST: 9,
      BALANCE_AFTER: 10,
      NOTES: 11,
      PROCESSED_AT: 12,

      PREVIOUS_DUE_DATE: 13,
      PREVIOUS_BALANCE: 14,
      PREVIOUS_ACTIVE_STATUS: 15,
      PREVIOUS_NEXT_PAYMENT_DATE: 16,
      REPLACEMENT_PAYMENT_ID: 17,
      UNDO_STATUS: 18
    }),

    FIRST_HIDDEN_COLUMN: 13,
    HIDDEN_COLUMN_COUNT: 6
  }),

  DASHBOARD: Object.freeze({
    TITLE: 'PERSONAL FINANCE DASHBOARD',

    CHARTS: Object.freeze({
      INCOME_ALLOCATION_TITLE:
        'Monthly Income Allocation',

      DEBT_BALANCE_TITLE:
        'Remaining Balance by Debt',

      PAYMENT_HISTORY_TITLE:
        'Payments Completed by Month'
    }),

    HELPER_START_COLUMN: 10
  })
});