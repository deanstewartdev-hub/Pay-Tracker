/*******************************************************
 * PAY TRACKER V3.3 - Step 2B upcoming payments timeline checks.
 *
 * Pure: PaymentTimeline on plain objects. Reads and writes no
 * sheet, so it is safe to run against the live spreadsheet.
 *******************************************************/

function runPaymentTimelineTests() {
  const results = [];
  function check(name, condition) {
    if (!condition) throw new Error('Failed: ' + name);
    results.push({ name: name, passed: true });
  }
  const T = PayTrackerPaymentTimeline;
  const S = T.STATUSES;
  const d = function(y, m, day, h) { return new Date(y, m - 1, day, h === undefined ? 12 : h); };
  const TODAY = d(2026, 10, 23, 9);
  function bill(id, name, amount, frequency, due, extra) {
    return Object.assign({ billId: id, billName: name, amount: amount, frequency: frequency, nextDueDate: due, active: 'Yes', category: 'Utilities' }, extra || {});
  }
  function sub(id, name, amount, frequency, due, extra) {
    return Object.assign({ subscriptionId: id, subscriptionName: name, latestAmount: amount, frequency: frequency, nextExpectedDate: due, reviewStatus: 'Confirmed', subscriptionStatus: 'Active' }, extra || {});
  }
  function view(sources, options, today) {
    // Round-trip through JSON exactly as the cache does.
    const model = JSON.parse(JSON.stringify(T.buildSeries(sources)));
    return T.present(model, today || TODAY, options);
  }
  function find(result, name) {
    return result.upcoming.filter(function(item) { return item.name === name; });
  }

  // Calendar-day maths.
  check('dayKey uses the local (London) calendar day', T.dayKey(d(2026, 3, 29, 0, 30)) === '2026-03-29');
  check('daysBetween is DST-safe across the October clock change', T.daysBetween('2026-10-24', '2026-10-26') === 2);
  check('daysBetween is DST-safe across the March clock change', T.daysBetween('2026-03-28', '2026-03-30') === 2);
  check('monthly from 31 Jan clamps to 28 Feb', T.stepKey('2026-01-31', 'Monthly', 1) === '2026-02-28');
  check('monthly from 31 Jan returns to 31 Mar (no drift to the 28th)', T.stepKey('2026-01-31', 'Monthly', 2) === '2026-03-31');
  check('30th in a leap February clamps to 29 Feb', T.stepKey('2028-01-30', 'Monthly', 1) === '2028-02-29');
  check('annual from 29 Feb clamps to 28 Feb', T.stepKey('2028-02-29', 'Annual', 1) === '2029-02-28');
  check('weekly, fortnightly, four-weekly and quarterly steps',
    T.stepKey('2026-10-23', 'Weekly', 2) === '2026-11-06' && T.stepKey('2026-10-23', 'Fortnightly', 1) === '2026-11-06' &&
    T.stepKey('2026-10-23', 'Four Weekly', 1) === '2026-11-20' && T.stepKey('2026-11-30', 'Quarterly', 1) === '2027-02-28');
  check('irregular frequencies are never projected', T.stepKey('2026-10-23', 'Irregular', 1) === '');
  check('existing advanceDateByFrequency no longer skips February',
    T.dayKey(PayTrackerPaymentService.advanceDateByFrequency(d(2026, 1, 31), 'Monthly')) === '2026-02-28' &&
    T.dayKey(PayTrackerPaymentService.advanceDateByFrequency(d(2026, 10, 23), 'Weekly')) === '2026-10-30');

  // Statuses and countdown.
  const statuses = view({ bills: [
    bill('B1', 'Tomorrow', 10, 'Monthly', d(2026, 10, 24)),
    bill('B2', 'Today', 10, 'Monthly', d(2026, 10, 23)),
    bill('B3', 'Two days late', 10, 'Monthly', d(2026, 10, 21)),
    bill('B4', 'Ten days late', 10, 'Monthly', d(2026, 10, 13))
  ] });
  check('upcoming / due today / awaiting / overdue',
    find(statuses, 'Tomorrow')[0].status === S.UPCOMING && find(statuses, 'Today')[0].status === S.DUE_TODAY &&
    find(statuses, 'Two days late')[0].status === S.AWAITING && find(statuses, 'Ten days late')[0].status === S.OVERDUE);
  check('countdown text and days remaining',
    find(statuses, 'Tomorrow')[0].countdown === 'Tomorrow' && find(statuses, 'Today')[0].daysRemaining === 0 &&
    find(statuses, 'Ten days late')[0].countdown === '10 days ago');
  check('an overdue payment is never dropped or marked paid by date alone',
    find(statuses, 'Ten days late')[0].dueDate === '2026-10-13' && statuses.history.length === 0);
  check('sorted by due date, earliest first', statuses.upcoming.map(function(i) { return i.dueDate; }).join() ===
    statuses.upcoming.map(function(i) { return i.dueDate; }).slice().sort().join() && statuses.upcoming[0].name === 'Ten days late');
  check('the list reorders itself as the date advances', (function() {
    const sources = { bills: [bill('A', 'Rent', 600, 'Monthly', d(2026, 11, 1)), bill('B', 'Phone', 20, 'Monthly', d(2026, 10, 25))] };
    const now = view(sources);
    const later = view(sources, {}, d(2026, 10, 27));
    return now.upcoming[0].name === 'Phone' && later.upcoming[0].name === 'Phone' && later.upcoming[0].status === S.AWAITING &&
      later.upcoming[1].name === 'Rent' && later.upcoming[1].daysRemaining === 5;
  })());

  // Confirmation evidence.
  const queue = function(id, item, due, extra) {
    return Object.assign({ paymentId: id, dueDate: due, paymentType: 'Bill Payment', itemId: item, amountDue: 50, paid: false, status: 'Upcoming' }, extra || {});
  };
  check('a Confirmed bank match marks the bill paid, moves it to history and shows the next one', (function() {
    const r = view({
      bills: [bill('B1', 'Energy', 50, 'Monthly', d(2026, 10, 20))],
      payments: [queue('PAY-1', 'B1', d(2026, 10, 20))],
      bankTransactions: [{ transactionId: 'tx1', matchedFinanceId: 'PAY-1', matchStatus: 'Confirmed', settledAt: d(2026, 10, 20) }]
    });
    return r.history.length === 1 && r.history[0].transactionId === 'tx1' && r.history[0].name === 'Energy' &&
      find(r, 'Energy')[0].dueDate === '2026-11-20' && find(r, 'Energy')[0].status === S.UPCOMING;
  })());
  check('a Suggested bank match needs review and is NOT paid', (function() {
    const r = view({
      bills: [bill('B1', 'Energy', 50, 'Monthly', d(2026, 10, 20))],
      payments: [queue('PAY-1', 'B1', d(2026, 10, 20))],
      bankTransactions: [{ transactionId: 'tx1', matchedFinanceId: 'PAY-1', matchStatus: 'Suggested' }]
    });
    return find(r, 'Energy')[0].status === S.NEEDS_REVIEW && r.history.length === 0;
  })());
  check('a Rejected bank match is ignored', view({
    bills: [bill('B1', 'Energy', 50, 'Monthly', d(2026, 10, 20))], payments: [queue('PAY-1', 'B1', d(2026, 10, 20))],
    bankTransactions: [{ transactionId: 'tx1', matchedFinanceId: 'PAY-1', matchStatus: 'Rejected' }]
  }).upcoming[0].status === S.AWAITING);
  check('Paid? ticked counts as paid; a processing Error needs review', (function() {
    const ticked = view({ bills: [bill('B1', 'Energy', 50, 'Monthly', d(2026, 10, 20))], payments: [queue('PAY-1', 'B1', d(2026, 10, 20), { paid: true })] });
    const failed = view({ bills: [bill('B1', 'Energy', 50, 'Monthly', d(2026, 10, 20))], payments: [queue('PAY-1', 'B1', d(2026, 10, 20), { status: 'Error' })] });
    return ticked.history.length === 1 && failed.upcoming[0].status === S.NEEDS_REVIEW;
  })());
  check('the Finance Payments due date (and amount) wins over the bill row', (function() {
    const r = view({ bills: [bill('B1', 'Energy', 50, 'Monthly', d(2026, 11, 20))], payments: [queue('PAY-1', 'B1', d(2026, 10, 30), { amountDue: 61.5 })] });
    return r.upcoming[0].dueDate === '2026-10-30' && r.upcoming[0].amount === 61.5 && r.upcoming[0].paymentId === 'PAY-1';
  })());
  check('a subscription payment linked within the window confirms it', (function() {
    const r = view({
      subscriptions: [sub('S1', 'Netflix', 10.99, 'Monthly', d(2026, 10, 20))],
      subscriptionLinks: [{ subscriptionId: 'S1', transactionId: 'tx9', paymentDate: d(2026, 10, 21), amount: 10.99, confirmed: true }]
    });
    return r.history.length === 1 && find(r, 'Netflix')[0].dueDate === '2026-11-20';
  })());
  check('an unconfirmed subscription link needs review', view({
    subscriptions: [sub('S1', 'Netflix', 10.99, 'Monthly', d(2026, 10, 20))],
    subscriptionLinks: [{ subscriptionId: 'S1', transactionId: 'tx9', paymentDate: d(2026, 10, 21), confirmed: false }]
  }).upcoming[0].status === S.NEEDS_REVIEW);
  check('last month\'s payment does not confirm this month', view({
    subscriptions: [sub('S1', 'Netflix', 10.99, 'Monthly', d(2026, 10, 20))],
    subscriptionLinks: [{ subscriptionId: 'S1', transactionId: 'tx8', paymentDate: d(2026, 9, 20), confirmed: true }]
  }).upcoming[0].status === S.AWAITING);

  // No double counting.
  check('a subscription linked to an active bill is shown once, as the bill', (function() {
    const r = view({
      bills: [bill('B7', 'Spotify', 11.99, 'Monthly', d(2026, 10, 28))],
      subscriptions: [sub('S7', 'Spotify Premium', 11.99, 'Monthly', d(2026, 10, 28), { linkedBillId: 'B7' })]
    });
    return r.upcoming.length === 1 && r.upcoming[0].kind === 'Bill' && r.totals.next7Days.amount === 11.99 && r.notes.length === 1;
  })());
  check('an unlinked subscription with the same name and amount as a bill is shown once', view({
    bills: [bill('B7', 'Spotify', 11.99, 'Monthly', d(2026, 10, 28))],
    subscriptions: [sub('S7', 'SPOTIFY', 11.99, 'Monthly', d(2026, 10, 28))]
  }).upcoming.length === 1);
  check('one bank transaction confirms at most one payment', (function() {
    const r = view({
      bills: [bill('B1', 'Gym', 30, 'Monthly', d(2026, 10, 20))],
      payments: [queue('PAY-1', 'B1', d(2026, 10, 20), { amountDue: 30 })],
      subscriptions: [sub('S1', 'Gym App', 30, 'Monthly', d(2026, 10, 20))],
      subscriptionLinks: [{ subscriptionId: 'S1', transactionId: 'tx1', paymentDate: d(2026, 10, 20), confirmed: true }],
      bankTransactions: [{ transactionId: 'tx1', matchedFinanceId: 'PAY-1', matchStatus: 'Confirmed' }]
    });
    return r.history.length === 1 && find(r, 'Gym App')[0].status === S.AWAITING;
  })());
  check('a confirmed payment appears in history once, not again from its link', (function() {
    const r = view({
      subscriptions: [sub('S1', 'Netflix', 10.99, 'Monthly', d(2026, 10, 20))],
      subscriptionLinks: [
        { subscriptionId: 'S1', transactionId: 'tx9', paymentDate: d(2026, 10, 21), amount: 10.99, confirmed: true },
        { subscriptionId: 'S1', transactionId: 'tx8', paymentDate: d(2026, 9, 20), amount: 10.99, confirmed: true }
      ]
    });
    return r.history.length === 2 && r.history[0].transactionId === 'tx9' && r.history[1].transactionId === 'tx8';
  })());

  // History.
  check('Payment History rows are kept, undone ones excluded, newest first', (function() {
    const r = view({ paymentHistory: [
      { paymentType: 'Bill Payment', itemId: 'B1', billOrDebtName: 'Energy', amountPaid: 50, paidDate: d(2026, 9, 20), originalDueDate: d(2026, 9, 20) },
      { paymentType: 'Bill Payment', itemId: 'B1', billOrDebtName: 'Energy', amountPaid: 48, paidDate: d(2026, 8, 20), originalDueDate: d(2026, 8, 20) },
      { paymentType: 'Bill Payment', itemId: 'B1', billOrDebtName: 'Energy', amountPaid: 50, paidDate: d(2026, 10, 1), undoStatus: 'Undone' },
      { paymentType: 'Debt Repayment', itemId: 'D1', billOrDebtName: 'Loan', amountPaid: 100, paidDate: d(2026, 9, 1) }
    ] });
    return r.history.length === 2 && r.history[0].paidDate === '2026-09-20' && r.history[1].amount === 48;
  })());

  // Recurrence inside the 30-day horizon, totals and filters.
  check('a weekly subscription appears for every week in the next 30 days', find(view({
    subscriptions: [sub('S2', 'Paper', 3, 'Weekly', d(2026, 10, 24))]
  }), 'Paper').length === 5);
  check('a long-overdue series shows the open payment but no past projections', (function() {
    const items = find(view({ subscriptions: [sub('S3', 'Old', 5, 'Monthly', d(2026, 7, 1))] }), 'Old');
    return items[0].dueDate === '2026-07-01' && items[0].status === S.OVERDUE &&
      items.slice(1).every(function(i) { return i.dueDate >= '2026-10-23'; });
  })());
  check('7- and 30-day totals include outstanding payments and flag unknown amounts', (function() {
    const r = view({ bills: [
      bill('B1', 'Late', 20, 'Monthly', d(2026, 10, 21)),
      bill('B2', 'Soon', 30, 'Monthly', d(2026, 10, 27)),
      bill('B3', 'Later', 40, 'Monthly', d(2026, 11, 10)),
      bill('B4', 'Variable', 0, 'Monthly', d(2026, 10, 25))
    ] });
    return r.totals.next7Days.amount === 50 && r.totals.next7Days.outstandingCount === 1 &&
      // 30 days: 20 + 30 + 40, plus Late's next monthly payment on 21 Nov (day 29).
      r.totals.next7Days.unknownAmountCount === 1 && r.totals.next30Days.amount === 110 &&
      find(r, 'Variable')[0].amount === null;
  })());
  check('kind filter and limit (Overview shows the next five)', (function() {
    const sources = {
      bills: [1, 2, 3, 4].map(function(n) { return bill('B' + n, 'Bill ' + n, 10, 'Monthly', d(2026, 10, 23 + n)); }),
      subscriptions: [1, 2, 3].map(function(n) { return sub('S' + n, 'Sub ' + n, 5, 'Monthly', d(2026, 10, 24 + n)); })
    };
    const overview = view(sources, { limit: 5 });
    return overview.upcoming.length === 5 && overview.totals.next30Days.count === 7 &&
      view(sources, { kind: 'Bill' }).upcoming.every(function(i) { return i.kind === 'Bill'; }) &&
      view(sources, { kind: 'Subscription' }).upcoming.length === 3;
  })());
  check('inactive bills, cancelled/paused, rejected and unreviewed subscriptions are not shown', (function() {
    const r = view({
      bills: [bill('B1', 'Old bill', 10, 'Monthly', d(2026, 10, 25), { active: 'No' })],
      subscriptions: [
        sub('S1', 'Cancelled', 5, 'Monthly', d(2026, 10, 25), { subscriptionStatus: 'Cancelled' }),
        sub('S2', 'Paused', 5, 'Monthly', d(2026, 10, 25), { subscriptionStatus: 'Paused' }),
        sub('S3', 'Rejected', 5, 'Monthly', d(2026, 10, 25), { reviewStatus: 'Rejected' }),
        sub('S4', 'Suggested', 5, 'Monthly', d(2026, 10, 25), { reviewStatus: 'Needs Review' })
      ]
    });
    return r.upcoming.length === 0 && r.notes.length === 1;
  })());
  check('a price change is carried to the card', view({
    subscriptions: [sub('S1', 'Netflix', 12.99, 'Monthly', d(2026, 10, 30), { priceChangeAmount: 2 })]
  }).upcoming[0].priceChange === 2);
  check('the cached model survives JSON and gives the same view', (function() {
    const sources = { bills: [bill('B1', 'Energy', 50, 'Monthly', d(2026, 10, 30))] };
    return JSON.stringify(T.present(T.buildSeries(sources), TODAY)) === JSON.stringify(view(sources));
  })());

  return { success: true, passed: results.length, results: results };
}
