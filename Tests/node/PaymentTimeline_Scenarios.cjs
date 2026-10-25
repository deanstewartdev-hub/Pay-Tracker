'use strict';
/**
 * Date-driven payment timeline (owner correction after staging, 25 Oct 2026):
 * past occurrences move to History automatically without being marked paid,
 * recurring items generate their next occurrence, totals count only what is
 * genuinely scheduled, and savings stay conservative.
 *
 * The fixture mirrors the staging Finance page, where July/August bills were
 * the main cards in October.
 */
process.env.TZ = 'Europe/London';
const assert = require('node:assert/strict');
const { createSandbox } = require('./gas-sandbox.cjs');

let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }

const sb = createSandbox({});
const bill = (id, name, amount, frequency, nextDueDate) => ({ billId: id, billName: name, amount, frequency, nextDueDate, active: 'Yes' });
const SOURCES = {
  bills: [
    bill('B-ROADTAX', 'Road Tax', 540, 'Annual', '2026-07-17'),
    bill('B-FUEL', 'Fual', 120, 'Monthly', '2026-08-03'),
    bill('B-DRAW', 'Birthday Draw', 1, 'Monthly', '2026-08-17'),
    bill('B-PHONE', 'Phone Bill', 10, 'Monthly', '2026-09-01'),
    bill('B-STARLINK', 'Star link', 80, 'Monthly', '2026-09-17'),
    bill('B-GYM', 'Gym', 7, 'Weekly', '2026-10-02'),
    bill('B-TODAY', 'Water', 30, 'Monthly', '2026-10-25'),
    bill('B-MOT', 'MOT', 55, 'One-off', '2026-09-01'),
    bill('B-TYRES', 'Tyres', 200, 'One-off', '2026-11-05'),
    bill('B-VARIES', 'Electric', '', 'Monthly', '2026-11-02'),
    bill('B-BAD', 'Broken date', 15, 'Monthly', 'not a date')
  ],
  payments: [
    { paymentId: 'PAY-ROADTAX', dueDate: '2026-07-17', paymentType: 'Bill Payment', itemId: 'B-ROADTAX', billOrDebtName: 'Road Tax', amountDue: 540, paid: false },
    { paymentId: 'PAY-UC', dueDate: '2026-08-17', paymentType: 'Debt Repayment', itemId: 'D-UC', billOrDebtName: 'Universal Credit Loan', amountDue: 300, paid: false }
  ],
  paymentHistory: [
    { paymentId: 'H-PHONE-OCT', paymentType: 'Bill Payment', itemId: 'B-PHONE', billOrDebtName: 'Phone Bill', originalDueDate: '2026-10-01', paidDate: '2026-10-01', amountPaid: 10 }
  ],
  subscriptions: [
    { subscriptionId: 'S-GPT', subscriptionName: 'ChatGPT', frequency: 'Monthly', latestAmount: 20, nextExpectedDate: '2026-08-10', reviewStatus: 'Confirmed', subscriptionStatus: 'Active' }
  ],
  subscriptionLinks: [
    { linkId: 'L1', subscriptionId: 'S-GPT', transactionId: 'tx_gpt_sep', paymentDate: '2026-09-10', amount: 20, confirmed: true },
    { linkId: 'L2', subscriptionId: 'S-GPT', transactionId: 'tx_gpt_oct', paymentDate: '2026-10-11', amount: 20, confirmed: true }
  ],
  bankTransactions: [
    { transactionId: 'tx_starlink', settledAt: '2026-10-17', amount: -80, debitOrCredit: 'Debit', description: 'STARLINK INTERNET', merchantName: 'Star link', matchStatus: 'Unmatched' }
  ]
};

const timeline = (today, options) => sb.json(`(function () {
  var model = JSON.parse(JSON.stringify(PayTrackerPaymentTimeline.buildSeries(${JSON.stringify(SOURCES)})));
  return PayTrackerPaymentTimeline.present(model, ${JSON.stringify(today)}, ${JSON.stringify(options || {})});
})()`);
const oct25 = timeline('2026-10-25');
const next = (r, name) => r.upcoming.filter(i => i.name === name)[0];
const past = (r, name) => r.history.filter(i => i.name === name).map(i => i.dueDate + ':' + i.status).sort();

test('July/August bills are no longer the cards in October: Upcoming holds only today and later, by date', () => {
  assert.ok(oct25.upcoming.every(i => i.dueDate >= '2026-10-25'), JSON.stringify(oct25.upcoming.map(i => i.name + '@' + i.dueDate)));
  const dates = oct25.upcoming.map(i => i.dueDate);
  assert.deepEqual(dates, dates.slice().sort());
  assert.deepEqual(oct25.upcoming.slice(0, 5).map(i => i.name + '@' + i.dueDate),
    ['Water@2026-10-25', 'Gym@2026-10-30', 'Phone Bill@2026-11-01', 'Electric@2026-11-02', 'Fual@2026-11-03'],
    'the Overview shows the actual next five scheduled payments');
});

test('each recurring bill advances to its next scheduled occurrence', () => {
  assert.equal(next(oct25, 'Fual').dueDate, '2026-11-03', 'monthly from 3 Aug');
  assert.equal(next(oct25, 'Birthday Draw').dueDate, '2026-11-17', 'monthly from 17 Aug');
  assert.equal(next(oct25, 'Phone Bill').dueDate, '2026-11-01');
  assert.equal(next(oct25, 'Star link').dueDate, '2026-11-17');
  assert.equal(next(oct25, 'ChatGPT').dueDate, '2026-11-10', 'subscription from 10 Aug');
  assert.equal(next(oct25, 'Road Tax').dueDate, '2027-07-17', 'annual: next year, shown even beyond 30 days');
  assert.deepEqual(oct25.upcoming.filter(i => i.name === 'Gym').map(i => i.dueDate), ['2026-10-30', '2026-11-06', '2026-11-13', '2026-11-20'], 'weekly inside 30 days');
});

test('past occurrences move to History by date, with evidence-based statuses and never assumed paid', () => {
  assert.deepEqual(past(oct25, 'Fual'), ['2026-08-03:Unverified', '2026-09-03:Unverified', '2026-10-03:Unverified']);
  assert.deepEqual(past(oct25, 'ChatGPT'), ['2026-08-10:Unverified', '2026-09-10:Paid', '2026-10-10:Paid'], 'confirmed Monzo links');
  assert.deepEqual(past(oct25, 'Phone Bill'), ['2026-09-01:Unverified', '2026-10-01:Paid'], 'Payment History record');
  assert.deepEqual(past(oct25, 'Star link'), ['2026-09-17:Unverified', '2026-10-17:Needs review'], 'a likely Monzo debit enriches, never pays');
  assert.deepEqual(past(oct25, 'Road Tax'), ['2026-07-17:Unverified']);
  assert.ok(oct25.history.every(i => i.settled === (i.status === 'Paid')));
  const october = oct25.history.filter(i => i.name === 'ChatGPT' && i.dueDate === '2026-10-10')[0];
  assert.equal(october.paidDate, '2026-10-11');
});

test('genuine outstanding risks are listed once per item, including the unpaid debt repayment', () => {
  const byName = {};
  oct25.risks.forEach(r => { byName[r.name] = r; });
  assert.equal(byName['Road Tax'].count, 1);
  assert.equal(byName['Road Tax'].amount, 540);
  assert.equal(byName['Fual'].count, 3);
  assert.equal(byName['Fual'].amount, 360);
  assert.equal(byName['Universal Credit Loan'].kind, 'Debt', 'debt obligations are never erased');
  assert.equal(byName['Universal Credit Loan'].amount, 300);
  assert.ok(!byName['ChatGPT'] || byName['ChatGPT'].count === 1, 'only the unconfirmed August payment');
  assert.ok(!oct25.risks.some(r => r.name === 'Water' || r.name === 'Tyres'), 'nothing due today or later is a risk');
});

test('7- and 30-day totals count only scheduled occurrences from today, once each', () => {
  // 25-31 Oct: Water 30 (today) + Gym 7 (30 Oct).
  assert.deepEqual(oct25.totals.next7Days, { amount: 37, count: 2, unknownAmountCount: 0 });
  const in30 = oct25.upcoming.filter(i => i.daysRemaining < 30);
  const ids = in30.map(i => i.occurrenceId);
  assert.equal(new Set(ids).size, ids.length, 'no occurrence counted twice');
  assert.equal(oct25.totals.next30Days.count, in30.length);
  assert.equal(oct25.totals.next30Days.unknownAmountCount, 1, 'Electric has no amount: counted, not guessed');
  assert.equal(oct25.totals.next30Days.amount, Math.round(in30.reduce((s, i) => s + (i.amount || 0), 0) * 100) / 100);
  assert.ok(!in30.some(i => i.dueDate < '2026-10-25'), 'no historic overdue item in the totals');
});

test('due today stays visible all day (Europe/London) and moves to History after midnight', () => {
  const lateEvening = timeline(new Date(2026, 9, 25, 23, 59).toISOString());
  assert.equal(next(lateEvening, 'Water').status, 'Due today');
  const afterMidnight = timeline('2026-10-26');
  assert.equal(next(afterMidnight, 'Water').dueDate, '2026-11-25');
  assert.deepEqual(past(afterMidnight, 'Water'), ['2026-10-25:Unverified']);
});

test('one-off payments, invalid dates and missing amounts', () => {
  assert.equal(next(oct25, 'MOT'), undefined, 'a past one-off is not regenerated');
  assert.deepEqual(past(oct25, 'MOT'), ['2026-09-01:Unverified']);
  assert.deepEqual(oct25.upcoming.filter(i => i.name === 'Tyres').map(i => i.dueDate), ['2026-11-05'], 'a future one-off appears once');
  assert.equal(next(oct25, 'Electric').amount, null);
  assert.ok(oct25.notes.some(n => /Broken date/.test(n) && /no valid due date/.test(n)));
  assert.ok(!oct25.upcoming.concat(oct25.history).some(i => i.name === 'Broken date'));
});

test('Bills and Subscriptions views are filtered from the same timeline', () => {
  const bills = timeline('2026-10-25', { kind: 'Bill' });
  const subs = timeline('2026-10-25', { kind: 'Subscription' });
  assert.ok(bills.upcoming.every(i => i.kind === 'Bill') && bills.history.every(i => i.kind === 'Bill'));
  assert.deepEqual(subs.upcoming.map(i => i.name), ['ChatGPT']);
  assert.ok(!subs.risks.some(r => r.kind !== 'Subscription'));
});

test('Smart Savings stays conservative: unsettled October occurrences are still to pay, earlier ones carried over', () => {
  const pastDue = oct25.history.filter(i => i.settled === false && i.dueDate);
  const result = sb.json(`(function () {
    var warnings = [];
    var committed = PayTrackerSmartSavingsCalculator.commitments(
      { upcoming: ${JSON.stringify(timeline('2026-10-25', { horizonDays: 32 }).upcoming)}, pastDue: ${JSON.stringify(pastDue)}, payments: [], debts: [] },
      { from: '2026-10-01', to: '2026-10-31', today: '2026-10-25' }, { transactionIds: {}, debits: [] }, warnings);
    return { items: committed.items.map(function (i) { return i.name + '@' + i.dueDate; }), carried: committed.carriedOver.length, warnings: warnings };
  })()`);
  assert.ok(result.items.includes('Fual@2026-10-03'), 'Unverified 3 Oct fuel is still money to pay');
  assert.ok(result.items.includes('Star link@2026-10-17'), 'a Needs review match is not settled');
  assert.ok(!result.items.includes('ChatGPT@2026-10-10'), 'Paid is settled');
  assert.ok(result.items.includes('Water@2026-10-25') && result.items.includes('Gym@2026-10-30'));
  assert.ok(!result.items.some(i => i.endsWith('-11-03') || i.includes('@2026-07') || i.includes('@2026-08')));
  assert.ok(result.carried > 0 && result.warnings.some(w => /due before this month/.test(w)));
});

console.log(`Payment timeline scenarios: ${passed}/${passed} passed.`);
