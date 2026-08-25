/*******************************************************
 * PAY TRACKER V3.0 - safe Money Movements ledger unit checks.
 *******************************************************/

function runMoneyMovementsTests() {
  const results = [];
  function check(name, condition) {
    if (!condition) throw new Error('Failed: ' + name);
    results.push({ name: name, passed: true });
  }

  const definitions = PayTrackerMoneyMovementsConfig.getDefinitions();
  check('one additive Money Movements sheet definition', definitions.length === 1);

  check('every internal-transfer type is a real, valid movement type',
    PayTrackerMoneyMovementsConfig.INTERNAL_TRANSFER_TYPES.every(function(type) {
      return PayTrackerMoneyMovementsConfig.MOVEMENT_TYPES.indexOf(type) !== -1;
    })
  );
  check('income types are never also classified as internal transfers',
    PayTrackerMoneyMovementsSummaryService.INCOME_TYPES.every(function(type) {
      return PayTrackerMoneyMovementsConfig.INTERNAL_TRANSFER_TYPES.indexOf(type) === -1;
    })
  );
  check('spending types are never also classified as internal transfers',
    PayTrackerMoneyMovementsSummaryService.SPENDING_TYPES.every(function(type) {
      return PayTrackerMoneyMovementsConfig.INTERNAL_TRANSFER_TYPES.indexOf(type) === -1;
    })
  );

  PayTrackerMoneyMovementsRepository.create({ date: '2026-08-01', movementType: 'Salary Income', amount: 1000 });
  PayTrackerMoneyMovementsRepository.create({ date: '2026-08-02', movementType: 'Bill Payment', amount: 200 });
  PayTrackerMoneyMovementsRepository.create({ date: '2026-08-03', movementType: 'Savings Allocation', amount: 300 });
  const savingsRecord = PayTrackerMoneyMovementsRepository.getAll()
    .filter(function(r) { return r.movementType === 'Savings Allocation'; })[0];
  check('a Savings Allocation is auto-flagged as an internal transfer without the caller passing it',
    savingsRecord.internalTransfer === true
  );

  const summary = PayTrackerMoneyMovementsSummaryService.getSummary();
  check('income total excludes internal transfers', summary.incomeTotal === 1000);
  check('spending total excludes internal transfers', summary.spendingTotal === 200);
  check('internal transfer total is tracked separately, not folded into spending',
    summary.internalTransferTotal === 300
  );
  check('net cash flow is income minus spending only -- transfers never included',
    summary.netCashFlow === 800
  );

  return { success: true, passed: results.length, results: results };
}
