/*******************************************************
 * PAY TRACKER V3.0
 * Transaction Matching Rules data definitions.
 *
 * A separate, additive concern from the existing
 * TransactionMatchingService.js (which matches transactions against
 * upcoming Bills/Debts by date and amount, and never auto-confirms).
 * This system is about CATEGORISATION -- turning a raw Monzo
 * merchant/description into a Pay Tracker category the user
 * configures, so it never touches that existing matching/payment
 * write path.
 *******************************************************/

const PayTrackerTransactionRulesConfig = Object.freeze({
  VERSION: '3.0.9',

  SHEETS: Object.freeze({
    RULES: Object.freeze({
      NAME: 'Transaction Matching Rules',
      HEADERS: Object.freeze([
        'Rule ID', 'Rule Name', 'Merchant Contains', 'Description Contains',
        'Monzo Category', 'Amount Minimum', 'Amount Maximum', 'Direction',
        'Pay Tracker Category', 'Finance Type', 'Finance ID', 'Job ID',
        'Auto Confirm', 'Priority', 'Active', 'Notes', 'Created At', 'Updated At'
      ])
    })
  }),

  DIRECTIONS: Object.freeze(['Debit', 'Credit']),

  // Additive columns appended to the end of the existing Bank
  // Transactions sheet (never inserted mid-sheet, and the existing
  // FinanceIntegrationConfig.js COLUMNS map for that sheet is never
  // touched) -- see TransactionCategoryService.js.
  CATEGORY_COLUMNS: Object.freeze(['Pay Tracker Category', 'Category Source']),

  CATEGORY_SOURCES: Object.freeze({
    RULE: 'Rule', MANUAL: 'Manual'
  }),

  getDefinitions: function() {
    return Object.keys(this.SHEETS).map(function(key) {
      return PayTrackerTransactionRulesConfig.SHEETS[key];
    });
  }
});
