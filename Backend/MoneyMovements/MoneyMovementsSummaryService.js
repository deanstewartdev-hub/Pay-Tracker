/*******************************************************
 * PAY TRACKER V3.0
 * Money Movements summary -- income/spending/transfers correctly
 * separated (roadmap Phase 7 definition of done).
 *******************************************************/

const PayTrackerMoneyMovementsSummaryService = Object.freeze({
  INCOME_TYPES: Object.freeze(['Salary Income', 'Other Income', 'Refund', 'Interest']),
  SPENDING_TYPES: Object.freeze(['Bill Payment', 'Debt Payment']),

  getSummary: function() {
    const all = PayTrackerMoneyMovementsRepository.getAll();
    const self = this;

    const totals = all.reduce(function(sum, record) {
      const amount = Math.abs(Number(record.amount) || 0);
      const isInternal = record.internalTransfer === true;

      if (isInternal) {
        sum.internalTransferTotal += amount;
      } else if (self.INCOME_TYPES.indexOf(record.movementType) !== -1) {
        sum.incomeTotal += amount;
      } else if (self.SPENDING_TYPES.indexOf(record.movementType) !== -1) {
        sum.spendingTotal += amount;
      } else {
        sum.otherTotal += amount;
      }
      return sum;
    }, { incomeTotal: 0, spendingTotal: 0, internalTransferTotal: 0, otherTotal: 0 });

    return Object.assign({
      movementCount: all.length,
      netCashFlow: this.round(totals.incomeTotal - totals.spendingTotal)
    }, {
      incomeTotal: this.round(totals.incomeTotal),
      spendingTotal: this.round(totals.spendingTotal),
      internalTransferTotal: this.round(totals.internalTransferTotal),
      otherTotal: this.round(totals.otherTotal)
    });
  },

  round: function(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }
});
