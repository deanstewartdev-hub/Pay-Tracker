/*******************************************************
 * PAY TRACKER V3.0 - safe Money Movements ledger unit checks.
 *******************************************************/

function PayTrackerMoneyMovementsTestsRound_(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

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

  // getSummary() has no scoping parameter -- it deliberately sums
  // every real row in the ledger, which is exactly right for the
  // real Reports/Analytics use it serves. Since this is a shared,
  // permanent, audit-trail ledger (create() never dedupes or
  // upserts, by design -- see README), asserting an absolute total
  // here would falsely fail after this test suite has run more than
  // once against the same live spreadsheet. Snapshotting before and
  // asserting the delta after proves the same thing without that
  // assumption.
  const before = PayTrackerMoneyMovementsSummaryService.getSummary();

  PayTrackerMoneyMovementsRepository.create({ date: '2026-08-01', movementType: 'Salary Income', amount: 1000 });
  PayTrackerMoneyMovementsRepository.create({ date: '2026-08-02', movementType: 'Bill Payment', amount: 200 });
  PayTrackerMoneyMovementsRepository.create({ date: '2026-08-03', movementType: 'Savings Allocation', amount: 300 });
  const savingsRecord = PayTrackerMoneyMovementsRepository.getAll()
    .filter(function(r) { return r.movementType === 'Savings Allocation'; })
    .pop();
  check('a Savings Allocation is auto-flagged as an internal transfer without the caller passing it',
    savingsRecord.internalTransfer === true
  );

  const after = PayTrackerMoneyMovementsSummaryService.getSummary();
  check('income total increased by exactly the new income, excluding internal transfers',
    PayTrackerMoneyMovementsTestsRound_(after.incomeTotal - before.incomeTotal) === 1000
  );
  check('spending total increased by exactly the new spending, excluding internal transfers',
    PayTrackerMoneyMovementsTestsRound_(after.spendingTotal - before.spendingTotal) === 200
  );
  check('internal transfer total increased by exactly the new transfer, not folded into spending',
    PayTrackerMoneyMovementsTestsRound_(after.internalTransferTotal - before.internalTransferTotal) === 300
  );
  check('net cash flow increased by income minus spending only -- the transfer never included',
    PayTrackerMoneyMovementsTestsRound_(after.netCashFlow - before.netCashFlow) === 800
  );

  return { success: true, passed: results.length, results: results };
}
