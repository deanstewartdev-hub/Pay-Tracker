/*******************************************************
 * PAY TRACKER V3.3 - variable expenses (fuel) and the Credit Union loan.
 * Unit and end-to-end checks on the pure modules: no sheet access.
 *******************************************************/

function runVariableExpenseTests() {
  const results = [];
  function check(name, condition) {
    if (!condition) throw new Error('Failed: ' + name);
    results.push({ name: name, passed: true });
  }
  const money = function(value) { return Math.round((Number(value) || 0) * 100) / 100; };
  const F = PayTrackerVariableExpenseForecast;
  const C = PayTrackerCashFlowClassifier;
  const CAT = PayTrackerCashFlowClassifier.CATEGORIES;
  const context ={ movements: [], subscriptionLinks: [], linkedPotIds: [], employerKeywords: [] };
  const monzo = function(id, day, description, amount, extra) {
    return Object.assign({ transactionId: id, description: description, amount: -Math.abs(amount),
      debitOrCredit: 'Debit', settledAt: new Date(2026, 9, day, 12), category: 'transfers' }, extra || {});
  };
  const proposalsOf = function(transactions) { return C.classifyAll(transactions, context); };
  // Today is Monday 26 Oct 2026; the month ends on 31 Oct.
  const baseInput = function(overrides) {
    return Object.assign({
      today: new Date(2026, 9, 26, 12), cashFlow: [], upcoming: [], pastDue: [], payments: [],
      debts: [], matchedPaymentIds: {}, pots: [], contributions: [], history: [], goals: [], settings: {}
    }, overrides || {});
  };
  const creditUnionDebt = {
    debtId: 'DEBT-CU', debtName: 'Credit Union car loan', active: 'Yes', frequency: 'Weekly',
    repaymentAmount: 77, nextPaymentDate: new Date(2026, 9, 30, 12)
  };

  // ---- Fuel: the default estimate ----
  check('fuel default rate is £75 every four days', F.dailyRate(75, 4) === 18.75);
  const estimate = F.fuelForecast({ today: '2026-10-26', to: '2026-10-31', observed: { amount: 0, count: 0, days: 0 } });
  check('fuel forecast covers only the 5 days after today', estimate.daysAhead === 5);
  check('fuel forecast for 5 days is £93.75', money(estimate.forecast) === 93.75);
  check('fuel per week is about £131.25', money(estimate.perWeek) === 131.25);
  check('fuel per 30 days is about £562.50', money(estimate.per30Days) === 562.5);
  check('fuel estimate is labelled as an estimate, not a bill', estimate.estimateOnly === true);
  check('fuel forecast never counts today (already actual)',
    F.fuelForecast({ today: '2026-10-26', to: '2026-10-26', observed: { amount: 0, count: 0, days: 0 } }).forecast === 0);

  // ---- Fuel: refined from real purchases only when there is enough history ----
  const refined = F.fuelForecast({ today: '2026-10-26', to: '2026-10-31', observed: { amount: 100, count: 3, days: 20 } });
  check('recent fuel spending refines the daily rate (£100 over 20 days = £5/day)', refined.dailyRate === 5);
  check('refined fuel forecast for 5 days is £25', refined.forecast === 25);
  check('refined fuel source says it came from actual spending', /Your fuel spending/.test(refined.source));
  const thin = F.fuelForecast({ today: '2026-10-26', to: '2026-10-31', observed: { amount: 100, count: 1, days: 20 } });
  check('one purchase is not enough to refine the estimate', thin.dailyRate === 18.75);
  const short = F.fuelForecast({ today: '2026-10-26', to: '2026-10-31', observed: { amount: 100, count: 3, days: 5 } });
  check('a few days of history is not enough to refine the estimate', short.dailyRate === 18.75);

  // ---- Fuel: observed purchases, pending and non-fuel rows ----
  const observedProposals = proposalsOf([
    monzo('f1', 20, 'BP', 40, { payTrackerCategory: 'Fuel', categorySource: 'Manual' }),
    monzo('f2', 25, 'Shell', 30, { payTrackerCategory: 'Fuel', categorySource: 'Manual', pending: true }),
    monzo('g1', 22, 'Tesco', 50, { payTrackerCategory: 'Groceries', categorySource: 'Manual' })
  ]);
  const observed = F.observeFuel(observedProposals, '2026-10-26');
  check('observed fuel counts only settled fuel purchases', observed.amount === 40 && observed.count === 1);
  check('observed history span is from the earliest transaction', observed.days === 7);

  // ---- Credit Union: classification ----
  const cu = proposalsOf([monzo('cu1', 23, 'CREDIT UNION LTD', 77)])[0];
  check('a Credit Union payment is an internal transfer, not spending', cu.category === CAT.TRANSFER && cu.internalTransfer === true);
  check('a Credit Union payment is flagged as a loan account', cu.loanAccount === true);
  check('a Credit Union payment is not confirmed as a repayment', cu.category !== CAT.DEBT);
  const cuMatched = proposalsOf([monzo('cu2', 23, 'CREDIT UNION LTD', 77,
    { matchedFinanceType: 'Debt Repayment', matchedFinanceId: 'PAY-10', matchStatus: 'Confirmed' })])[0];
  check('a matched Debt payment counts as the loan repayment', cuMatched.category === CAT.DEBT && cuMatched.loanAccount === false);
  const other = proposalsOf([monzo('o1', 23, 'Savings Account', 50)])[0];
  check('other outgoing transfers are not loan accounts', other.loanAccount === false);

  // ---- Credit Union: counted once in the disposable forecast ----
  const empty = PayTrackerSmartSavingsCalculator.calculate(baseInput({}));
  check('with no data, disposable is only the fuel estimate (-£93.75)', money(empty.disposable) === -93.75);
  check('fuel is never listed as a fixed commitment', empty.committed.items.every(function(i) { return !/fuel/i.test(i.name); }));

  const withTransfer = PayTrackerSmartSavingsCalculator.calculate(baseInput({
    cashFlow: proposalsOf([monzo('cu1', 23, 'CREDIT UNION LTD', 77)]),
    debts: [creditUnionDebt]
  }));
  check('an unmatched Credit Union transfer is not subtracted as spending',
    money(withTransfer.actual.sentToLoanAccount) === 77 && withTransfer.actual.spending === 0);
  check('the weekly £77 loan commitment is counted once for the remaining Fridays',
    money(withTransfer.committed.debts) === 77 && withTransfer.committed.items.filter(function(i) { return i.name === 'Credit Union car loan'; }).length === 1);
  // October has two Fridays in the window: 23 Oct (sent, unverified) and 30 Oct (future commitment).
  check('the 23 Oct transfer and the 30 Oct commitment are each deducted once (£154)',
    money(withTransfer.disposable) === money(empty.disposable - 154));
  check('an unmatched loan transfer is warned about, not confirmed',
    withTransfer.warnings.some(function(w) { return /sent to your loan account/.test(w) && /not confirmed as a repayment/.test(w); }));

  const matched = PayTrackerSmartSavingsCalculator.calculate(baseInput({
    cashFlow: proposalsOf([monzo('cu2', 23, 'CREDIT UNION LTD', 77,
      { matchedFinanceType: 'Debt Repayment', matchedFinanceId: 'PAY-10', matchStatus: 'Confirmed' })]),
    debts: [creditUnionDebt],
    matchedPaymentIds: { 'PAY-10': true }
  }));
  check('a confirmed repayment is an actual debt payment, not a loan transfer',
    money(matched.actual.debtRepaymentsPaid) === 77 && money(matched.actual.sentToLoanAccount) === 0);
  check('a confirmed repayment is not deducted again as a future commitment (only 30 Oct remains)',
    money(matched.committed.debts) === 77);
  check('a confirmed repayment gives the same disposable as an unmatched one (both Fridays once)',
    money(matched.disposable) === money(withTransfer.disposable));

  // ---- Fuel: actual purchases are counted once, as spending ----
  const fuelToday = PayTrackerSmartSavingsCalculator.calculate(baseInput({
    cashFlow: proposalsOf([monzo('f3', 26, 'BP', 40, { payTrackerCategory: 'Fuel', categorySource: 'Manual' })])
  }));
  check('a fuel purchase today is spending', money(fuelToday.actual.spending) === 40);
  check('the forecast does not add back today\'s fuel purchase (no double count)',
    money(fuelToday.variable.fuel.forecast) === 93.75 && money(fuelToday.disposable) === -133.75);

  // ---- A fixed bill that looks like fuel is flagged, not silently counted twice ----
  const fual = PayTrackerSmartSavingsCalculator.calculate(baseInput({
    upcoming: [{ kind: 'Bill', name: 'Fual', dueDate: '2026-10-28', amount: 120, status: 'Upcoming', daysRemaining: 2 }]
  }));
  check('a fuel-like bill is still shown as a bill', money(fual.committed.bills) === 120);
  check('a fuel-like bill raises a warning about double counting',
    fual.warnings.some(function(w) { return /"Fual" is a fixed bill that looks like fuel/.test(w); }));

  // ---- Loan transfer with no Debt row is warned about ----
  const noDebt = PayTrackerSmartSavingsCalculator.calculate(baseInput({
    cashFlow: proposalsOf([monzo('cu3', 23, 'CREDIT UNION LTD', 77)])
  }));
  check('a loan transfer with no Debt row is still deducted once, as money that left Monzo',
    money(noDebt.disposable) === money(empty.disposable - 77));
  check('a loan transfer with no Debt row is flagged for review',
    noDebt.warnings.some(function(w) { return /no active Debt commitment/.test(w); }));

  // ---- Same-day and pending transfers: the Friday is counted once, not as cash and as a commitment ----
  const fridayEmpty = PayTrackerSmartSavingsCalculator.calculate(baseInput({ today: new Date(2026, 9, 30, 12) }));
  const sameDay = PayTrackerSmartSavingsCalculator.calculate(baseInput({
    today: new Date(2026, 9, 30, 12),
    cashFlow: proposalsOf([monzo('cu4', 30, 'CREDIT UNION LTD', 77)]),
    debts: [creditUnionDebt]
  }));
  check('a transfer on the Friday covers that Friday\'s commitment (counted once)',
    money(sameDay.disposable) === money(fridayEmpty.disposable - 77) && money(sameDay.committed.debts) === 0);
  const pendingTransfer = PayTrackerSmartSavingsCalculator.calculate(baseInput({
    cashFlow: proposalsOf([monzo('cu5', 23, 'CREDIT UNION LTD', 77, { pending: true })])
  }));
  check('a pending Credit Union transfer is cash out now, not spending',
    money(pendingTransfer.actual.sentToLoanAccount) === 77 && money(pendingTransfer.disposable) === money(empty.disposable - 77));
  const partial = PayTrackerSmartSavingsCalculator.calculate(baseInput({
    today: new Date(2026, 9, 30, 12),
    cashFlow: proposalsOf([monzo('cu6', 30, 'CREDIT UNION LTD', 50)]),
    debts: [creditUnionDebt]
  }));
  check('a transfer of a different amount does not cover the £77 commitment (both deducted)',
    money(partial.disposable) === money(fridayEmpty.disposable - 50 - 77) && money(partial.committed.debts) === 77);

  // ---- Weekly commitments across months with four and five Fridays ----
  const creditUnionFrom = function(day, month) {
    return Object.assign({}, creditUnionDebt, { nextPaymentDate: new Date(2026, month - 1, day, 12) });
  };
  // September 2026 has four Fridays (4, 11, 18, 25); the 30th is a Wednesday.
  const sepEmpty = PayTrackerSmartSavingsCalculator.calculate(baseInput({ today: new Date(2026, 8, 1, 12) }));
  const sepLoan = PayTrackerSmartSavingsCalculator.calculate(baseInput({
    today: new Date(2026, 8, 1, 12), debts: [creditUnionFrom(4, 9)]
  }));
  check('a four-Friday month deducts four weekly commitments',
    sepLoan.committed.items.filter(function(i) { return i.name === 'Credit Union car loan'; }).length === 4 &&
    money(sepLoan.disposable) === money(sepEmpty.disposable - 4 * 77));
  // October 2026 has five Fridays (2, 9, 16, 23, 30).
  const octEmpty = PayTrackerSmartSavingsCalculator.calculate(baseInput({ today: new Date(2026, 9, 1, 12) }));
  const octLoan = PayTrackerSmartSavingsCalculator.calculate(baseInput({
    today: new Date(2026, 9, 1, 12), debts: [creditUnionFrom(2, 10)]
  }));
  check('a five-Friday month deducts five weekly commitments',
    octLoan.committed.items.filter(function(i) { return i.name === 'Credit Union car loan'; }).length === 5 &&
    money(octLoan.disposable) === money(octEmpty.disposable - 5 * 77));
  check('the fuel forecast in a 30-day month covers every remaining day',
    money(octEmpty.variable.fuel.forecast) === 562.5);

  // ---- One loan listed as both a Bill and a Debt is one obligation ----
  const loanName = 'Univeral Credit Loan';
  const sameLoan = PayTrackerSmartSavingsCalculator.calculate(baseInput({
    upcoming: [{ kind: 'Bill', name: loanName, dueDate: '2026-10-30', amount: 77, status: 'Upcoming', daysRemaining: 4 }],
    debts: [Object.assign({}, creditUnionDebt, { debtName: loanName })]
  }));
  check('a loan listed as a bill and a debt on the same date is counted once',
    sameLoan.committed.items.filter(function(i) { return i.name === loanName; }).length === 1 &&
    money(sameLoan.disposable) === money(empty.disposable - 77));
  check('the double listing is explained, not silently dropped',
    sameLoan.warnings.some(function(w) { return /listed as both a bill and a debt/.test(w); }));
  const duplicateRows = PayTrackerSmartSavingsCalculator.calculate(baseInput({
    upcoming: [{ kind: 'Bill', name: loanName, dueDate: '2026-10-30', amount: 77, status: 'Upcoming', daysRemaining: 4 }],
    debts: [Object.assign({}, creditUnionDebt, { debtName: loanName })],
    payments: [{ paymentId: 'PAY-A', paymentType: 'Debt Repayment', itemId: 'DEBT-CU', billOrDebtName: loanName, dueDate: new Date(2026, 9, 30, 12), amountDue: 77, paid: false },
      { paymentId: 'PAY-B', paymentType: 'Debt Repayment', itemId: 'DEBT-CU', billOrDebtName: loanName, dueDate: new Date(2026, 9, 30, 12), amountDue: 77, paid: false }]
  }));
  check('a duplicated loan row is counted once and warned about once',
    duplicateRows.warnings.filter(function(w) { return /listed as both a bill and a debt/.test(w); }).length === 1 &&
    money(duplicateRows.disposable) === money(empty.disposable - 77));
  const differentLoan = PayTrackerSmartSavingsCalculator.calculate(baseInput({
    upcoming: [{ kind: 'Bill', name: 'Phone', dueDate: '2026-10-30', amount: 77, status: 'Upcoming', daysRemaining: 4 }],
    debts: [Object.assign({}, creditUnionDebt, { debtName: loanName })]
  }));
  check('a bill with a different name is not treated as the same loan',
    money(differentLoan.disposable) === money(empty.disposable - 77 - 77));

  // ---- Payoff estimate: the existing model on the corrected weekly £77 at 8.50% APR ----
  const payoff = PayTrackerFinanceService.calculateDebtEstimate(14806.25, 8.5,
    PayTrackerFinanceService.convertToMonthly(77, 'Weekly'));
  check('payoff estimate runs on the corrected £77 weekly, 8.50% APR loan',
    Number.isFinite(payoff.monthsLeft) && payoff.monthsLeft > 0 && payoff.payoffDate instanceof Date);

  // ---- Presentation: fuel line, three separate money figures, and the incomplete-data explanation ----
  check('the fuel line states the amount and the period it covers',
    empty.presentation.fuel.amount === 93.75 && empty.presentation.fuel.daysAhead === 5 &&
    empty.presentation.fuel.from === '2026-10-27' && empty.presentation.fuel.to === '2026-10-31');
  check('with no salary this month, the result is explained as incomplete, not just negative',
    empty.presentation.incomplete !== null && /No salary has reached/.test(empty.presentation.incomplete) &&
    /This figure is incomplete/.test(empty.presentation.incomplete));
  const otherAccountPay = proposalsOf([{ transactionId: 'pay1', description: 'FROM OTHER ACCOUNT', amount: 300,
    debitOrCredit: 'Credit', settledAt: new Date(2026, 9, 20, 12), category: 'income' }]);
  const awaitingPay = PayTrackerSmartSavingsCalculator.calculate(baseInput({ cashFlow: otherAccountPay }));
  check('incoming money awaiting classification is shown separately, not as income',
    money(awaitingPay.presentation.awaiting.incoming) === 300 && awaitingPay.actual.incomeReceived === 0);
  check('awaiting incoming money is also named in the incomplete explanation',
    /awaiting classification/.test(awaitingPay.presentation.incomplete));
  const salary = proposalsOf([{ transactionId: 'sal1', description: 'PAYROLL', amount: 1000,
    debitOrCredit: 'Credit', settledAt: new Date(2026, 9, 20, 12), payTrackerCategory: 'Salary Income', categorySource: 'Manual' }]);
  const paid = PayTrackerSmartSavingsCalculator.calculate(baseInput({ cashFlow: salary }));
  check('with salary confirmed in connected Monzo, the result is not marked incomplete', paid.presentation.incomplete === null);
  check('the connected-account figure is salary less outgoings, with no fuel or loan mixed in',
    money(paid.presentation.connected.amount) === 1000 && money(paid.presentation.available.amount) === money(paid.disposable));

  // ---- Repayments: a scheduled loan Friday with no bank evidence stays owed, never confirmed ----
  const pastFriday = PayTrackerSmartSavingsCalculator.calculate(baseInput({
    today: new Date(2026, 9, 26, 12),
    payments: [{ paymentId: 'PAY-OLD', paymentType: 'Debt Repayment', itemId: 'DEBT-CU', billOrDebtName: 'Univeral Credit Loan',
      dueDate: new Date(2026, 9, 2, 12), amountDue: 77, paid: false }],
    debts: [creditUnionDebt]
  }));
  check('a past scheduled loan repayment with no bank evidence is still owed, and not marked paid',
    pastFriday.committed.items.some(function(i) { return i.name === 'Univeral Credit Loan' && i.dueDate === '2026-10-02' && i.status === 'Overdue'; }) &&
    pastFriday.committed.likelyPaid.length === 0 && money(pastFriday.actual.debtRepaymentsPaid) === 0);
  // The 18 Sept repayment is an unpaid queue row (Debt) and the same payment is a past Bill: one carried-over line.
  const earlierDuplicate = PayTrackerSmartSavingsCalculator.calculate(baseInput({
    today: new Date(2026, 9, 26, 12),
    pastDue: [{ kind: 'Bill', name: loanName, dueDate: '2026-09-18', amount: 77, status: 'Unverified', daysRemaining: -38 }],
    payments: [{ paymentId: 'PAY-SEP', paymentType: 'Debt Repayment', itemId: 'DEBT-CU', billOrDebtName: loanName,
      dueDate: new Date(2026, 8, 18, 12), amountDue: 77, paid: false }],
    debts: [creditUnionDebt]
  }));
  check('a loan listed as both a bill and a debt from an earlier month is shown once in the carried-over list',
    earlierDuplicate.committed.carriedOver.filter(function(i) { return i.name === loanName && i.dueDate === '2026-09-18'; }).length === 1);
  check('the earlier-months duplicate is not deducted; only the 30 Oct commitment is',
    money(earlierDuplicate.committed.total) === 77);
  check('a scheduled repayment is not treated as a transfer without a bank transaction',
    money(pastFriday.actual.sentToLoanAccount) === 0);

  return { success: true, passed: results.length, results: results };
}
