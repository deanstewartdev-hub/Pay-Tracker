/*******************************************************
 * PAY TRACKER V3.3 - Step 3 Smart Savings calculator checks.
 *
 * Pure: PayTrackerSmartSavingsCalculator on plain objects. Reads
 * and writes no sheet, so it is safe on the live spreadsheet.
 *******************************************************/

function runSmartSavingsTests() {
  const results = [];
  function check(name, condition) {
    if (!condition) throw new Error('Failed: ' + name);
    results.push({ name: name, passed: true });
  }
  const Calc = PayTrackerSmartSavingsCalculator;
  const C = PayTrackerCashFlowClassifier.CATEGORIES;
  const d = function(day, month) { return new Date(2026, (month || 10) - 1, day, 12); };
  const TODAY = d(15);
  function p(category, amount, fields) {
    return Object.assign({ transactionId: 'tx' + Math.random(), date: d(5), description: '', amount: amount,
      direction: 'Debit', category: category, internalTransfer: category === C.SAVINGS || category === C.TRANSFER,
      confidence: 'Likely', status: 'New' }, fields || {});
  }
  const credit = function(category, amount, fields) { return p(category, amount, Object.assign({ direction: 'Credit' }, fields || {})); };
  function pot(id, fields) {
    return Object.assign({ potId: id, potName: id, active: 'Yes', contributionMethod: 'Percentage Allocation', allocation: 0,
      monthlyEquivalent: 0, currentBalance: 0, goalAmount: 0, linkedMonzoPotId: '' }, fields || {});
  }
  const settings = { mode: 'Percentage of Disposable Income', percentage: 0.5, fixedAmount: 0, maximumAmount: 0 };
  function run(input) {
    return Calc.calculate(Object.assign({ today: TODAY, cashFlow: [], upcoming: [], payments: [], pots: [], contributions: [],
      history: [], goals: [], settings: settings }, input));
  }

  // 1-7: the inputs.
  const base = run({
    cashFlow: [
      credit(C.SALARY, 2000), credit(C.INTEREST, 3), credit(C.REFUND, 20),
      p(C.SPENDING, 300), p(C.BILL, 650), p(C.SUBSCRIPTION, 12), p(C.DEBT, 100),
      p(C.SAVINGS, 200, { description: 'pot_HOUSE' }), credit(C.SAVINGS, 50, { description: 'pot_HOUSE' })
    ],
    upcoming: [{ kind: 'Bill', name: 'Energy', dueDate: '2026-10-20', amount: 85, daysRemaining: 5, status: 'Upcoming' },
      { kind: 'Subscription', name: 'Netflix', dueDate: '2026-10-30', amount: 13, daysRemaining: 15, status: 'Upcoming' },
      { kind: 'Bill', name: 'Rent', dueDate: '2026-11-01', amount: 650, daysRemaining: 17, status: 'Upcoming' }],
    payments: [{ paymentId: 'PAY-L', paymentType: 'Debt Repayment', billOrDebtName: 'Loan', amountDue: 120, dueDate: d(25), paid: false }]
  });
  check('actual income received (salary + interest, refunds separate)', base.actual.incomeReceived === 2003 && base.actual.refunds === 20);
  check('actual spending', base.actual.spending === 300);
  check('bills already paid include bills, subscriptions and debts', base.actual.billsPaid === 762 && base.actual.debtRepaymentsPaid === 100);
  check('upcoming bills and subscriptions only until month end', base.committed.bills === 85 && base.committed.subscriptions === 13);
  check('outstanding debt commitments', base.committed.debts === 120 && base.committed.total === 218);
  check('existing savings contributions: pot deposits less withdrawals', base.savedThisMonth === 150);
  check('disposable income = received - spent + refunds - paid - still due - already saved',
    base.disposable === Math.round((2003 - 300 + 20 - 762 - 218 - 150) * 100) / 100);
  check('suggested = savings % of disposable', base.suggestion.amount === Calc.floorPennies(base.disposable * 0.5));

  // Conservative treatment.
  const careful = run({ cashFlow: [
    credit(C.SALARY, 1000), credit(C.OTHER_INCOME, 500, { confidence: 'Needs confirmation' }),
    p(C.UNRECOGNISED, 40, { confidence: 'Needs confirmation' }), p(C.SPENDING, 25, { status: 'Pending' }),
    credit(C.SALARY, 900, { status: 'Pending' }), p(C.TRANSFER, 60, { confidence: 'Needs confirmation' }),
    p(C.TRANSFER, 300, { confidence: 'Confirmed' })
  ] });
  check('unconfirmed income is not counted', careful.actual.incomeReceived === 1000 && careful.actual.unconfirmedIncoming === 500);
  check('unconfirmed and pending outgoings are subtracted', careful.actual.unconfirmedOutgoing === 100 && careful.actual.pendingOutgoing === 25);
  check('pending income is not counted', careful.disposable === 1000 - 100 - 25);
  check('a confirmed transfer to your own account is neither spending nor subtracted, but is flagged',
    careful.actual.movedToOwnAccounts === 300 && careful.actual.spending === 0 &&
    careful.warnings.some(function(w) { return w.indexOf('own other accounts') !== -1; }));
  check('declined/excluded and other months are ignored', run({ cashFlow: [
    credit(C.SALARY, 1000), credit(C.SALARY, 999, { status: 'Excluded' }), credit(C.SALARY, 777, { date: d(30, 9) }), p(C.SPENDING, 5, { date: d(1, 11) })
  ] }).actual.incomeReceived === 1000);
  check('no income yet: nothing suggested and a clear warning', (function() {
    const r = run({ cashFlow: [p(C.SPENDING, 10)] });
    return r.suggestion.amount === 0 && r.warnings.some(function(w) { return w.indexOf('No confirmed income') === 0; });
  })());
  check('overspent month suggests nothing and says by how much', (function() {
    const r = run({ cashFlow: [credit(C.SALARY, 100), p(C.SPENDING, 150)] });
    return r.disposable === -50 && r.suggestion.amount === 0 && r.warnings.some(function(w) { return w.indexOf('£50.00') !== -1; });
  })());

  // No double counting between actuals and commitments.
  check('a bill already paid by a counted bank transaction is not also "still due"', run({
    cashFlow: [credit(C.SALARY, 1000), p(C.BILL, 85, { transactionId: 'txE', confidence: 'Needs confirmation' })],
    upcoming: [{ kind: 'Bill', name: 'Energy', dueDate: '2026-10-12', amount: 85, daysRemaining: -3, status: 'Needs review', evidenceTransactionId: 'txE' }]
  }).committed.total === 0);
  check('a debt repayment already matched to a bank transaction is not also "still due"', run({
    payments: [{ paymentId: 'PAY-L', paymentType: 'Debt Repayment', amountDue: 120, dueDate: d(10), paid: false }],
    matchedPaymentIds: { 'PAY-L': true }
  }).committed.debts === 0);
  check('ticked (paid) debt rows and bill payment rows are not debts', run({
    payments: [{ paymentId: 'A', paymentType: 'Debt Repayment', amountDue: 50, dueDate: d(20), paid: true },
      { paymentId: 'B', paymentType: 'Bill Payment', amountDue: 70, dueDate: d(20), paid: false }]
  }).committed.total === 0);
  check('past-due unconfirmed payments are still owed, with a warning', (function() {
    const r = run({ upcoming: [{ kind: 'Bill', name: 'Water', dueDate: '2026-10-02', amount: 30, daysRemaining: -13, status: 'Overdue' }] });
    return r.committed.bills === 30 && r.warnings.some(function(w) { return w.indexOf('past-due') !== -1; });
  })());
  check('an unknown amount is flagged, not guessed', (function() {
    const r = run({ upcoming: [{ kind: 'Bill', name: 'Water', dueDate: '2026-10-20', amount: null, daysRemaining: 5, status: 'Upcoming' }] });
    return r.committed.total === 0 && r.warnings.some(function(w) { return w.indexOf('no known amount') !== -1; });
  })());

  // Settings: fixed mode and the cap.
  check('fixed mode: fixed amount less already saved, never more than is available', (function() {
    const fixed = { mode: 'Fixed Monthly Amount', fixedAmount: 400, percentage: 0, maximumAmount: 0 };
    const plenty = run({ settings: fixed, cashFlow: [credit(C.SALARY, 2000), p(C.SAVINGS, 100, { description: 'pot_X' })] });
    const tight = run({ settings: fixed, cashFlow: [credit(C.SALARY, 250)] });
    return plenty.suggestion.amount === 300 && tight.suggestion.amount === 250;
  })());
  check('Maximum Monthly Savings caps the total including what was already saved', (function() {
    const r = run({ settings: { mode: 'Percentage of Disposable Income', percentage: 1, maximumAmount: 500 },
      cashFlow: [credit(C.SALARY, 3000), p(C.SAVINGS, 200, { description: 'pot_X' })] });
    return r.suggestion.amount === 300 && r.suggestion.cappedBy !== '';
  })());

  // Distribution into existing pots.
  const split = run({
    settings: { mode: 'Percentage of Disposable Income', percentage: 1, maximumAmount: 0 },
    cashFlow: [credit(C.SALARY, 1000)],
    pots: [
      pot('FIXED', { contributionMethod: 'Fixed Amount', monthlyEquivalent: 100 }),
      pot('HOUSE', { allocation: 0.6, goalAmount: 20000, currentBalance: 5000, linkedGoalId: 'G1' }),
      pot('HOLS', { allocation: 0.3 }),
      pot('DONE', { allocation: 0.1, goalAmount: 500, currentBalance: 500 }),
      pot('OFF', { allocation: 0.5, active: 'No' })
    ],
    goals: [{ goalId: 'G1', goalName: 'Mortgage deposit', targetAmount: 20000, currentLinkedSavings: 5000, active: 'Yes' }]
  });
  const byPot = {};
  split.distribution.forEach(function(entry) { byPot[entry.potId] = entry; });
  check('fixed-amount pots are funded first', byPot.FIXED.suggested === 100);
  check('the rest is split by Allocation %', byPot.HOUSE.suggested === 540 && byPot.HOLS.suggested === 270);
  check('a pot that reached its goal and an inactive pot get nothing; their share stays unallocated',
    byPot.DONE.suggested === 0 && byPot.DONE.note === 'Goal reached' && byPot.OFF.suggested === 0 && split.unallocated === 90);
  check('suggestions never exceed the suggested total', split.distribution.reduce(function(s, e) { return s + e.suggested; }, 0) + split.unallocated === split.suggestion.amount);
  check('goal progress after the suggestion (mortgage deposit kept intact)', (function() {
    const g = split.goals[0];
    return g.name === 'Mortgage deposit' && g.target === 20000 && g.current === 5000 && g.suggestedThisMonth === 540 &&
      g.progress === 0.25 && Math.abs(g.progressAfter - 5540 / 20000) < 1e-9 && g.remainingAfter === 14460;
  })());
  check('a pot already saved into this month (via its Monzo pot) needs less', (function() {
    const r = run({ settings: { mode: 'Percentage of Disposable Income', percentage: 1 },
      cashFlow: [credit(C.SALARY, 1000), p(C.SAVINGS, 60, { description: 'pot_F' })],
      pots: [pot('F', { contributionMethod: 'Fixed Amount', monthlyEquivalent: 100, linkedMonzoPotId: 'pot_F' })] });
    return r.distribution[0].savedThisMonth === 60 && r.distribution[0].suggested === 40;
  })());
  check('unlinked pots read this month\'s deposits from Savings History (undone excluded)', (function() {
    const r = run({ pots: [pot('P')], history: [
      { potId: 'P', amountDeposited: 25, depositedDate: d(3) }, { potId: 'P', amountDeposited: 99, depositedDate: d(4), undoStatus: 'Undone' },
      { potId: 'P', amountDeposited: 70, depositedDate: d(3, 9) }] });
    return r.distribution[0].savedThisMonth === 25 && r.distribution[0].savedSource === 'Savings History';
  })());
  check('allocations over 100% are scaled, with a warning', (function() {
    const r = run({ settings: { mode: 'Percentage of Disposable Income', percentage: 1 }, cashFlow: [credit(C.SALARY, 100)],
      pots: [pot('A', { allocation: 0.8 }), pot('B', { allocation: 0.7 })] });
    // 100 x 0.8/1.5 = 53.33 and 100 x 0.7/1.5 = 46.66 (rounded down); the penny left is unallocated.
    return r.distribution[0].suggested === 53.33 && r.distribution[1].suggested === 46.66 && r.unallocated === 0.01 &&
      r.warnings.some(function(w) { return w.indexOf('150%') !== -1; });
  })());
  check('the planned figure is the existing module\'s, unchanged', split.planned.total === 100);

  // Confirmations.
  const confirm = run({
    cashFlow: [p(C.SAVINGS, 50, { transactionId: 'txP', description: 'pot_H', date: d(9) })],
    pots: [pot('H', { linkedMonzoPotId: 'pot_H' })],
    contributions: [
      { contributionId: 'C1', potId: 'H', potName: 'House', dueDate: d(10), contributionAmount: 50, deposited: false, status: 'Upcoming' },
      { contributionId: 'C2', potId: 'H', potName: 'House', dueDate: d(10), contributionAmount: 50, deposited: false, status: 'Upcoming' },
      { contributionId: 'C3', potId: 'H', potName: 'House', dueDate: d(12), contributionAmount: 50, deposited: true, status: 'Completed' },
      { contributionId: 'C4', potId: 'H', potName: 'House', dueDate: d(5, 11), contributionAmount: 50, deposited: false, status: 'Upcoming' }
    ]
  });
  check('queued contributions due this month are listed for confirmation; deposited and next month are not',
    confirm.confirmations.map(function(c) { return c.contributionId; }).join() === 'C1,C2');
  check('a matching Monzo pot deposit is shown as evidence, and supports only one contribution',
    confirm.confirmations[0].bankEvidence && confirm.confirmations[0].bankEvidence.transactionId === 'txP' &&
    confirm.confirmations[1].bankEvidence === null);
  check('a deposit of a different amount is not evidence', run({
    cashFlow: [p(C.SAVINGS, 45, { description: 'pot_H', date: d(10) })], pots: [pot('H', { linkedMonzoPotId: 'pot_H' })],
    contributions: [{ contributionId: 'C1', potId: 'H', dueDate: d(10), contributionAmount: 50 }]
  }).confirmations[0].bankEvidence === null);
  check('the period is the London calendar month', base.period.from === '2026-10-01' && base.period.to === '2026-10-31' && base.period.daysLeft === 17);

  return { success: true, passed: results.length, results: results };
}
