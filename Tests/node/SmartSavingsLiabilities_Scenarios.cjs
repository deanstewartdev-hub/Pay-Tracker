'use strict';
/**
 * Historical unresolved commitments: never deducted from the normal figure, always shown as a
 * potential liability, and reflected in a conservative scenario. Uses the road-tax example:
 * an earlier-month bill with no bank evidence.
 */
const assert = require('node:assert/strict');
const { createSandbox } = require('./gas-sandbox.cjs');

function test(name, run) {
  run();
  console.log('PASS ' + name);
}

const sb = createSandbox({});
const calculate = (input) => sb.json(
  '(function () { return PayTrackerSmartSavingsCalculator.calculate(' + JSON.stringify(input) + '); })()'
);

// Today is 15 November 2026. The road tax was due 17 July 2026 and has no bank confirmation.
const roadTaxInput = {
  today: '2026-11-15T12:00:00',
  settings: {},
  pots: [],
  history: [],
  cashFlow: [],
  payments: [],
  pastDue: [{ kind: 'Bill', name: 'Road Tax', dueDate: '2026-07-17', amount: 540, status: 'Unverified', daysRemaining: -121 }],
  upcoming: []
};

test('the road-tax example is a potential liability and is not deducted from the normal figure', () => {
  const r = calculate(roadTaxInput);
  assert.equal(r.potentialLiabilities.total, 540);
  assert.equal(r.committed.total, 0, 'the normal calculation does not deduct it');
});

test('the conservative scenario subtracts the unresolved commitments', () => {
  const r = calculate(roadTaxInput);
  assert.equal(r.conservativeDisposable, r.disposable - 540);
});

test('a warning states both figures and that a mark-paid needs evidence', () => {
  const r = calculate(roadTaxInput);
  assert.ok(r.warnings.some((w) => /Potential liability \(maximum-exposure scenario.*unresolved earlier-month/.test(w)), 'liability warning present');
  assert.ok(r.warnings.some((w) => /if they were all still owed/.test(w)), 'conservative figure explained');
});

test('with no unresolved commitments the liability is zero and no warning is added', () => {
  const r = calculate({ ...roadTaxInput, pastDue: [] });
  assert.equal(r.potentialLiabilities.total, 0);
  assert.equal(r.conservativeDisposable, r.disposable);
  assert.ok(!r.warnings.some((w) => /Potential liability/.test(w)));
});

module.exports = {};
console.log('Smart Savings liabilities: 4/4 passed.');
