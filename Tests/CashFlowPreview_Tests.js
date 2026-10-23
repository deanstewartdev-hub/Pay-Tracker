/*******************************************************
 * PAY TRACKER V3.3 - Step 2A cash-flow classification checks.
 *
 * Pure: runs PayTrackerCashFlowClassifier and the summary on plain
 * objects only, so it is safe to run against the live spreadsheet
 * (it reads and writes no sheet).
 *******************************************************/

function runCashFlowPreviewTests() {
  const results = [];
  function check(name, condition) {
    if (!condition) throw new Error('Failed: ' + name);
    results.push({ name: name, passed: true });
  }
  const C = PayTrackerCashFlowClassifier.CATEGORIES;
  const K = PayTrackerCashFlowClassifier.CONFIDENCE;
  const S = PayTrackerCashFlowClassifier.STATUSES;
  function tx(id, fields) {
    return Object.assign({
      transactionId: id, settledAt: new Date(2026, 9, 10, 12), description: '', merchantName: '',
      merchantId: '', category: 'general', amount: 10, debitOrCredit: 'Debit', pending: false, declined: false,
      matchedFinanceType: '', matchedFinanceId: '', matchStatus: 'Unmatched', payTrackerCategory: '', categorySource: ''
    }, fields || {});
  }
  function one(transaction, context) {
    return PayTrackerCashFlowClassifier.classifyAll([transaction], context || {})[0];
  }

  // Every category the roadmap asks for.
  check('salary from a known employer', one(tx('t1', { debitOrCredit: 'Credit', description: 'STAFFLINE RECRUITMENT', category: 'income' }),
    { employerKeywords: ['Staffline'] }).category === C.SALARY);
  check('employer names match whole words only ("nhs" is not "JOHNSON")',
    one(tx('t1b', { debitOrCredit: 'Credit', description: 'JOHNSON M', category: 'transfers' }),
      { employerKeywords: ['NHS'] }).category !== C.SALARY);
  check('income Monzo flags but no employer matches needs confirmation', (function() {
    const p = one(tx('t2', { debitOrCredit: 'Credit', description: 'HMRC', category: 'income' }));
    return p.category === C.OTHER_INCOME && p.confidence === K.NEEDS_CONFIRMATION;
  })());
  check('card payment at a merchant is everyday spending',
    one(tx('t3', { merchantId: 'merch_1', merchantName: 'Tesco', category: 'groceries' })).category === C.SPENDING);
  check('a confirmed bill match is a confirmed Bill Payment', (function() {
    const p = one(tx('t4', { matchedFinanceType: 'Bill Payment', matchedFinanceId: 'PAY-1', matchStatus: 'Confirmed' }));
    return p.category === C.BILL && p.confidence === K.CONFIRMED;
  })());
  check('a debt match is a Debt Payment', one(tx('t5', { matchedFinanceType: 'Debt Repayment', matchStatus: 'Automatic' })).category === C.DEBT);
  check('a suggested (unconfirmed) bill match needs confirmation',
    one(tx('t6', { matchedFinanceType: 'Bill Payment', matchStatus: 'Suggested' })).confidence === K.NEEDS_CONFIRMATION);
  check('a rejected match is ignored', one(tx('t7', { matchedFinanceType: 'Bill Payment', matchStatus: 'Rejected', merchantId: 'm' })).category === C.SPENDING);
  check('a subscription link is a Subscription Payment',
    one(tx('t8', { merchantId: 'm' }), { subscriptionLinks: [{ transactionId: 't8', subscriptionId: 'SUB-1', confirmed: true }] }).category === C.SUBSCRIPTION);
  check('merchant credit is a refund', one(tx('t9', { debitOrCredit: 'Credit', merchantId: 'm', merchantName: 'Amazon' })).category === C.REFUND);
  check('pot deposit is a savings transfer, internal', (function() {
    const p = one(tx('t10', { description: 'pot_0000ABC', category: 'savings' }));
    return p.category === C.SAVINGS && p.internalTransfer === true && p.movementType === 'Pot Deposit';
  })());
  check('pot withdrawal is a savings transfer, internal', one(tx('t11', { debitOrCredit: 'Credit', description: 'pot_0000ABC' })).movementType === 'Pot Withdrawal');
  check('a linked Savings Pot makes the pot transfer confirmed',
    one(tx('t12', { description: 'pot_0000ABC' }), { linkedPotIds: ['pot_0000ABC'] }).confidence === K.CONFIRMED);
  check('a bank transfer needs confirmation and is internal', (function() {
    const p = one(tx('t13', { category: 'transfers', description: 'D STEWART' }));
    return p.category === C.TRANSFER && p.internalTransfer && p.confidence === K.NEEDS_CONFIRMATION;
  })());
  check('interest credit', one(tx('t14', { debitOrCredit: 'Credit', description: 'Interest' })).category === C.INTEREST);
  check('nothing to go on is Unrecognised and needs confirmation', (function() {
    const p = one(tx('t15', { description: 'XYZ' }));
    return p.category === C.UNRECOGNISED && p.confidence === K.NEEDS_CONFIRMATION;
  })());

  // Categories the owner (or a rule) set.
  check('a manual category is confirmed', (function() {
    const p = one(tx('t16', { payTrackerCategory: 'Own account', categorySource: 'Manual', category: 'transfers' }));
    return p.category === C.TRANSFER && p.confidence === K.CONFIRMED;
  })());
  check('an unknown custom category on a debit is spending',
    one(tx('t17', { payTrackerCategory: 'Fuel', categorySource: 'Rule' })).category === C.SPENDING);
  check('a confirmed bill match outranks a rule category',
    one(tx('t18', { payTrackerCategory: 'Fuel', matchedFinanceType: 'Bill Payment', matchStatus: 'Confirmed' })).category === C.BILL);

  // No duplicates, no double counting.
  check('a bill that is also a subscription is one Bill Payment, counted once', (function() {
    const all = PayTrackerCashFlowClassifier.classifyAll(
      [tx('t19', { amount: 9.99, matchedFinanceType: 'Bill Payment', matchStatus: 'Confirmed' })],
      { subscriptionLinks: [{ transactionId: 't19', subscriptionId: 'SUB-9', confirmed: true }] });
    const summary = PayTrackerCashFlowPreviewService.summarise(all);
    return all.length === 1 && all[0].category === C.BILL && summary.totals.confirmed.spending === 9.99;
  })());
  check('a repeated transaction ID is excluded the second time', (function() {
    const all = PayTrackerCashFlowClassifier.classifyAll([tx('t20', { merchantId: 'm' }), tx('t20', { merchantId: 'm' })], {});
    return all[0].status === S.NEW && all[1].status === S.EXCLUDED &&
      PayTrackerCashFlowPreviewService.summarise(all).totals.confirmed.spending === 10;
  })());
  check('a transaction already linked in Money Movements is not counted again', (function() {
    const p = one(tx('t21', { merchantId: 'm' }), { movements: [{ movementId: 'MOVE-1', relatedTransactionId: 't21', amount: 10 }] });
    return p.status === S.ALREADY_RECORDED && p.existingMovementId === 'MOVE-1' &&
      PayTrackerCashFlowPreviewService.summarise([p]).totals.confirmed.spending === 0;
  })());
  check('a manual ledger entry with the same amount within 3 days is a possible duplicate', (function() {
    const p = one(tx('t22', { matchedFinanceType: 'Bill Payment', matchStatus: 'Confirmed', amount: 45 }),
      { movements: [{ movementId: 'MOVE-2', movementType: 'Bill Payment', amount: 45, date: new Date(2026, 9, 8), internalTransfer: false }] });
    return p.status === S.POSSIBLE_DUPLICATE && p.confidence === K.NEEDS_CONFIRMATION && p.possibleDuplicateOf[0] === 'MOVE-2';
  })());
  check('the same amount 10 days away is not a duplicate', one(tx('t23', { merchantId: 'm', amount: 45 }),
    { movements: [{ movementId: 'MOVE-3', movementType: 'Bill Payment', amount: 45, date: new Date(2026, 8, 30) }] }).status === S.NEW);
  check('a manual income entry never matches a debit of the same amount', one(tx('t24', { merchantId: 'm', amount: 45 }),
    { movements: [{ movementId: 'MOVE-4', movementType: 'Salary Income', amount: 45, date: new Date(2026, 9, 10) }] }).status === S.NEW);
  check('declined transactions are excluded', one(tx('t25', { declined: true, merchantId: 'm' })).status === S.EXCLUDED);
  check('pending transactions are shown but not counted', (function() {
    const p = one(tx('t26', { pending: true, merchantId: 'm' }));
    return p.status === S.PENDING && PayTrackerCashFlowPreviewService.summarise([p]).totals.confirmed.spending === 0;
  })());

  // Totals.
  check('transfers and pot moves never count as income or spending; refunds reduce spending', (function() {
    const all = PayTrackerCashFlowClassifier.classifyAll([
      tx('a', { debitOrCredit: 'Credit', amount: 1200, description: 'NHS PAYROLL' }),
      tx('b', { amount: 300, description: 'pot_1' }),
      tx('c', { amount: 50, merchantId: 'm' }),
      tx('d', { amount: 20, debitOrCredit: 'Credit', merchantId: 'm' }),
      tx('e', { amount: 500, category: 'transfers', payTrackerCategory: 'Internal Transfer', categorySource: 'Manual' })
    ], { employerKeywords: ['nhs'] });
    const t = PayTrackerCashFlowPreviewService.summarise(all).totals.confirmed;
    return t.income === 1200 && t.spending === 50 && t.refunds === 20 && t.netSpending === 30 &&
      t.internalTransfers === 800 && t.netCashFlow === 1170;
  })());
  check('uncertain amounts are kept out of the confirmed totals', (function() {
    const all = PayTrackerCashFlowClassifier.classifyAll([tx('f', { amount: 70, description: '???' })], {});
    const totals = PayTrackerCashFlowPreviewService.summarise(all).totals;
    return totals.confirmed.netCashFlow === 0 && totals.needsConfirmation.unrecognisedOut === 70;
  })());
  check('every proposed movement type is a valid ledger type', Object.keys(C).every(function(key) {
    const type = PayTrackerCashFlowClassifier.movementTypeFor(C[key], 'Debit');
    return type === '' || PayTrackerMoneyMovementsConfig.MOVEMENT_TYPES.indexOf(type) !== -1;
  }));
  check('new spending types are spending, never internal',
    ['Everyday Spending', 'Subscription Payment'].every(function(type) {
      return PayTrackerMoneyMovementsSummaryService.SPENDING_TYPES.indexOf(type) !== -1 &&
        PayTrackerMoneyMovementsConfig.INTERNAL_TRANSFER_TYPES.indexOf(type) === -1;
    }));

  return { success: true, passed: results.length, results: results };
}
