/*******************************************************
 * PAY TRACKER V3.0
 * Money Movements ledger data definitions.
 *
 * A single, typed ledger of money entering, leaving, and moving
 * within the user's accounts and Monzo/Savings pots -- distinct
 * from Bank Transactions (raw imported Monzo activity) and Finance
 * Payments (bills/debts) which already exist. Internal transfers
 * are flagged so they're never double-counted as spending.
 *******************************************************/

const PayTrackerMoneyMovementsConfig = Object.freeze({
  VERSION: '3.1.1',

  SHEETS: Object.freeze({
    MOVEMENTS: Object.freeze({
      NAME: 'Money Movements',
      HEADERS: Object.freeze([
        'Movement ID', 'Date', 'Movement Type', 'Source Account', 'Source Pot',
        'Destination Account', 'Destination Pot', 'Amount',
        'Related Transaction ID', 'Related Payslip ID',
        'Related Savings Contribution ID', 'Internal Transfer', 'Notes',
        'Created At'
      ])
    })
  }),

  MOVEMENT_TYPES: Object.freeze([
    'Salary Income', 'Other Income', 'Savings Allocation', 'Pot Deposit',
    'Pot Withdrawal', 'Bill Payment', 'Debt Payment', 'Refund', 'Transfer',
    'Interest', 'Manual Adjustment'
  ]),

  // Movement types that represent money moving between the user's own
  // accounts/pots rather than genuine income or spending -- excluded
  // from any spending/income total by default (roadmap Section 9:
  // "Internal transfers must not be counted as spending").
  INTERNAL_TRANSFER_TYPES: Object.freeze([
    'Savings Allocation', 'Pot Deposit', 'Pot Withdrawal', 'Transfer'
  ]),

  getDefinitions: function() {
    return Object.keys(this.SHEETS).map(function(key) {
      return PayTrackerMoneyMovementsConfig.SHEETS[key];
    });
  }
});
