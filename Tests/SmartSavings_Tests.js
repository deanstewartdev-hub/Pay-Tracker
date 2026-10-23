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
  check('income that is a "Possible duplicate" of a manual ledger entry still counts (once): the doubt is about the ledger', (function() {
    const r = run({ cashFlow: [credit(C.SALARY, 2100, { status: 'Possible duplicate', confidence: 'Needs confirmation', categoryConfidence: 'Likely' })] });
    return r.actual.incomeReceived === 2100 && r.actual.unconfirmedIncoming === 0;
  })());
  check('a possible duplicate whose category is itself unsure stays unconfirmed', run({
    cashFlow: [credit(C.OTHER_INCOME, 50, { status: 'Possible duplicate', confidence: 'Needs confirmation', categoryConfidence: 'Needs confirmation' })]
  }).actual.unconfirmedIncoming === 50);
  check('pending income is not counted', careful.disposable === 1000 - 100 - 25 - 300);
  check('a confirmed transfer to your own other account is not spending, but is no longer available in Monzo',
    careful.actual.movedToOwnAccounts === 300 && careful.actual.spending === 0 &&
    careful.warnings.some(function(w) { return w.indexOf('no longer in Monzo') !== -1; }));
  check('a confirmed transfer IN from your own account is not income, but is available', (function() {
    const r = run({ cashFlow: [credit(C.SALARY, 1000), credit(C.TRANSFER, 200, { confidence: 'Confirmed' })] });
    return r.actual.incomeReceived === 1000 && r.actual.receivedFromOwnAccounts === 200 && r.disposable === 1200;
  })());
  check('a pending move into a pot has already left the spendable balance', run({
    cashFlow: [credit(C.SALARY, 1000), p(C.SAVINGS, 100, { description: 'pot_X', status: 'Pending' })]
  }).disposable === 900);

  // Audit: a past-due payment already paid without a link is not deducted twice.
  check('a past-due subscription paid this month (no link) is not also "still to pay"', (function() {
    const r = run({
      cashFlow: [credit(C.SALARY, 1000), p(C.SPENDING, 10.99, { transactionId: 'nf', description: 'NETFLIX.COM', date: d(12) })],
      upcoming: [{ kind: 'Subscription', name: 'Netflix', dueDate: '2026-10-11', amount: 10.99, daysRemaining: -4, status: 'Overdue' }]
    });
    return r.committed.total === 0 && r.committed.likelyPaid.length === 1 && r.committed.likelyPaid[0].transactionId === 'nf' &&
      r.disposable === Math.round((1000 - 10.99) * 100) / 100 && r.warnings.some(function(w) { return w.indexOf('looks paid') !== -1; });
  })());
  check('one payment never covers two past-due occurrences', (function() {
    const r = run({
      cashFlow: [p(C.SPENDING, 5, { transactionId: 'x', description: 'TIMES DIGITAL', date: d(10) })],
      upcoming: [{ kind: 'Subscription', name: 'Times Digital', dueDate: '2026-10-09', amount: 5, daysRemaining: -6, status: 'Overdue' },
        { kind: 'Subscription', name: 'Times Digital', dueDate: '2026-10-14', amount: 5, daysRemaining: -1, status: 'Awaiting confirmation' }]
    });
    return r.committed.likelyPaid.length === 1 && r.committed.subscriptions === 5;
  })());
  check('a different payee or amount is not taken as the payment', run({
    cashFlow: [p(C.SPENDING, 10.99, { description: 'SPOTIFY', date: d(12) }), p(C.SPENDING, 25, { description: 'NETFLIX', date: d(12) })],
    upcoming: [{ kind: 'Subscription', name: 'Netflix', dueDate: '2026-10-11', amount: 10.99, daysRemaining: -4, status: 'Overdue' }]
  }).committed.subscriptions === 10.99);
  check('a future payment is never assumed paid early', run({
    // Inside the matching window (4 days early), so only the "not due yet" rule keeps it.
    cashFlow: [p(C.SPENDING, 10.99, { description: 'NETFLIX', date: d(16) })],
    upcoming: [{ kind: 'Subscription', name: 'Netflix', dueDate: '2026-10-20', amount: 10.99, daysRemaining: 5, status: 'Upcoming' }]
  }).committed.subscriptions === 10.99);

  // Audit: weekly debts, withdrawals and recorded-elsewhere contributions.
  check('a weekly debt contributes every remaining repayment this month, not just the queued one', (function() {
    const r = run({
      payments: [{ paymentId: 'W1', paymentType: 'Debt Repayment', itemId: 'D1', billOrDebtName: 'Phone loan', amountDue: 20, dueDate: d(16), paid: false }],
      debts: [{ debtId: 'D1', debtName: 'Phone loan', repaymentAmount: 20, frequency: 'Weekly', nextPaymentDate: d(16), active: 'Yes' }]
    });
    return r.committed.debts === 60 && r.committed.items.map(function(i) { return i.dueDate; }).join() === '2026-10-16,2026-10-23,2026-10-30';
  })());
  check('a ticked (paid) queued repayment is not re-added from the Debts sheet', run({
    payments: [{ paymentId: 'M1', paymentType: 'Debt Repayment', itemId: 'D2', amountDue: 99, dueDate: d(20), paid: true }],
    debts: [{ debtId: 'D2', debtName: 'Card', repaymentAmount: 99, frequency: 'Monthly', nextPaymentDate: d(20), active: 'Yes' }]
  }).committed.debts === 0);
  check('a debt with no queued row uses its next payment date; inactive debts are ignored', run({
    debts: [{ debtId: 'D3', debtName: 'Loan', repaymentAmount: 40, frequency: 'Monthly', nextPaymentDate: d(28), active: 'Yes' },
      { debtId: 'D4', debtName: 'Old', repaymentAmount: 70, frequency: 'Weekly', nextPaymentDate: d(18), active: 'No' }]
  }).committed.debts === 40);
  check('a pot withdrawal does not raise the cap or the fixed amount still to save', (function() {
    const capped = run({ settings: { mode: 'Percentage of Disposable Income', percentage: 1, maximumAmount: 300 },
      cashFlow: [credit(C.SALARY, 2000), credit(C.SAVINGS, 500, { description: 'pot_X' })] });
    const fixed = run({ settings: { mode: 'Fixed Monthly Amount', fixedAmount: 200 },
      cashFlow: [credit(C.SALARY, 2000), credit(C.SAVINGS, 500, { description: 'pot_X' })] });
    return capped.savedThisMonth === -500 && capped.suggestion.amount === 300 && fixed.suggestion.amount === 200;
  })());
  check('contributions recorded for pots Monzo cannot see count towards the monthly cap', run({
    settings: { mode: 'Percentage of Disposable Income', percentage: 1, maximumAmount: 300 },
    cashFlow: [credit(C.SALARY, 2000)], pots: [pot('ISA')],
    history: [{ potId: 'ISA', amountDeposited: 250, depositedDate: d(3) }]
  }).suggestion.amount === 50);
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
  check('confirmations say whether the pot is Monzo-linked', confirm.confirmations[0].monzoLinked === true &&
    run({ pots: [pot('M')], contributions: [{ contributionId: 'X', potId: 'M', dueDate: d(10), contributionAmount: 5 }] }).confirmations[0].monzoLinked === false);
  check('recorded contributions for linked pots with no Monzo deposit are listed, and never counted as saved', (function() {
    const r = run({
      pots: [pot('H', { linkedMonzoPotId: 'pot_H' }), pot('M')],
      history: [{ contributionId: 'C9', potId: 'H', amountDeposited: 75, depositedDate: d(8), originalDueDate: d(8) },
        { contributionId: 'C8', potId: 'M', amountDeposited: 40, depositedDate: d(8) }]
    });
    return r.unverifiedRecords.length === 1 && r.unverifiedRecords[0].contributionId === 'C9' &&
      r.unverifiedRecords[0].daysSinceRecorded === 7 && r.savedThisMonth === 0 && r.distribution[0].savedThisMonth === 0 &&
      r.warnings.some(function(w) { return w.indexOf('not in Monzo yet') !== -1; });
  })());
  check('a recorded contribution that Monzo does show is not listed', run({
    cashFlow: [p(C.SAVINGS, 75, { description: 'pot_H', date: d(9) })],
    pots: [pot('H', { linkedMonzoPotId: 'pot_H' })],
    history: [{ contributionId: 'C9', potId: 'H', amountDeposited: 75, depositedDate: d(8) }]
  }).unverifiedRecords.length === 0);
  check('one Monzo deposit cannot both support a queued contribution and verify a recorded one', run({
    cashFlow: [p(C.SAVINGS, 75, { transactionId: 'tx1', description: 'pot_H', date: d(9) })],
    pots: [pot('H', { linkedMonzoPotId: 'pot_H' })],
    contributions: [{ contributionId: 'Q', potId: 'H', dueDate: d(9), contributionAmount: 75 }],
    history: [{ contributionId: 'C9', potId: 'H', amountDeposited: 75, depositedDate: d(8) }]
  }).unverifiedRecords.length === 1);
  check('the period is the London calendar month', base.period.from === '2026-10-01' && base.period.to === '2026-10-31' && base.period.daysLeft === 17);

  return { success: true, passed: results.length, results: results };
}
