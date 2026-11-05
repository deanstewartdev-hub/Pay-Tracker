'use strict';
/**
 * Smart Savings payment classification: each obligation is counted once, earlier-month items
 * without bank evidence are carried over (not deducted), and this month's unconfirmed past-due
 * items stay outstanding. Uses PayTrackerSmartSavingsCalculator.commitments directly.
 */
const assert = require('node:assert/strict');
const { createSandbox } = require('./gas-sandbox.cjs');

function test(name, run) {
  run();
  console.log('PASS ' + name);
}

const sb = createSandbox({});
const commitments = (input, actual) => sb.json(
  '(function () { var w = []; var r = PayTrackerSmartSavingsCalculator.commitments(' +
  JSON.stringify(input) + ', ' + JSON.stringify(PERIOD) + ', ' + JSON.stringify(actual) + ', w); return { total: r.total, items: r.items.length, carriedOver: r.carriedOver.length, likelyPaid: r.likelyPaid.length, warnings: w }; })()'
);

const PERIOD = { from: '2026-11-01', to: '2026-11-30', today: '2026-11-15' };
const noActual = { transactionIds: {}, debits: [], loanTransfers: [], potDeposits: [] };

test('an unconfirmed bill from an earlier month is carried over and not deducted', () => {
  const r = commitments({
    pastDue: [{ kind: 'Bill', name: 'Road Tax', dueDate: '2026-07-17', amount: 540, status: 'Unverified', daysRemaining: -120 }],
    upcoming: []
  }, noActual);
  assert.equal(r.total, 0);
  assert.equal(r.carriedOver, 1);
});

test('an unconfirmed bill due this month and past due stays outstanding and is deducted', () => {
  const r = commitments({
    pastDue: [{ kind: 'Bill', name: 'Phone Bill', dueDate: '2026-11-01', amount: 10, status: 'Unverified', daysRemaining: -14 }],
    upcoming: []
  }, noActual);
  assert.equal(r.total, 10);
  assert.equal(r.items, 1);
});

test('a bill whose bank transaction is already in this month actuals is not deducted twice', () => {
  const r = commitments({
    pastDue: [],
    upcoming: [{ kind: 'Bill', name: 'Star link', dueDate: '2026-11-17', amount: 80, status: 'Upcoming', daysRemaining: 2, evidenceTransactionId: 'TX-1' }]
  }, { transactionIds: { 'TX-1': true }, debits: [], loanTransfers: [], potDeposits: [] });
  assert.equal(r.total, 0);
  assert.equal(r.items, 0);
});

test('a bill and a debt for the same obligation are counted once, with a warning', () => {
  const r = commitments({
    pastDue: [],
    upcoming: [{ kind: 'Bill', name: 'Univeral Credit Loan', dueDate: '2026-11-20', amount: 77, status: 'Upcoming', daysRemaining: 5 }],
    payments: [{ paymentType: 'Debt', billOrDebtName: 'Univeral Credit Loan', dueDate: '2026-11-20', amountDue: 77, paid: false, paymentId: 'P-1' }]
  }, noActual);
  assert.equal(r.total, 77);
  assert.ok(r.warnings.some((w) => /counted once/i.test(w)), 'a duplicate warning is shown');
});

module.exports = {};
console.log('Payment classification: 4/4 passed.');
