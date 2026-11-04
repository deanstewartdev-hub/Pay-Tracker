'use strict';
/**
 * Regression tests from the staging financial-records audit (v3.3):
 *  1. Two identical debt repayment rows for one debt (same due date and amount) are one obligation,
 *     not two deductions (Credit Union: Finance Payments rows 11 and 12, both £77 on 30 Oct).
 *  2. Monzo sync state reported as "Disconnected" is not "connected", even with an old successful sync.
 *  3. An inactive bill (Fual, £120 weekly, Bills row 6) is not deducted, even when a payment row exists.
 */
const assert = require('node:assert/strict');
const { createSandbox } = require('./gas-sandbox.cjs');

const results = [];
function test(name, run) {
  try {
    run();
    results.push({ ok: true, name });
    console.log('PASS ' + name);
  } catch (error) {
    results.push({ ok: false, name, error });
    console.log('FAIL ' + name + ': ' + error.message);
  }
}

const sb = createSandbox({});
const calculate = (input) => sb.json(
  '(function () { return PayTrackerSmartSavingsCalculator.calculate(' + JSON.stringify(input) + '); })()'
);

const debtRow = (paymentId, dueDate) => ({
  paymentId, itemId: 'DEBT-2', billOrDebtName: 'Credit Union', paymentType: 'Debt Repayment',
  dueDate, amountDue: 77, paid: false
});
const creditUnionDebt = [{
  debtId: 'DEBT-2', debtName: 'Credit Union', active: 'Yes', repaymentAmount: 77,
  frequency: 'Weekly', nextPaymentDate: '2026-11-06'
}];
const base = { today: '2026-11-04T12:00:00', settings: {}, pots: [], history: [], cashFlow: [], upcoming: [], pastDue: [], debts: [] };

test('two identical debt rows on one date count once in this month\'s commitments', () => {
  const r = calculate({ ...base, debts: creditUnionDebt, payments: [debtRow('P11', '2026-11-04'), debtRow('P12', '2026-11-04')] });
  const onDay = r.committed.items.filter((i) => i.name === 'Credit Union' && i.dueDate === '2026-11-04');
  assert.equal(onDay.length, 1, 'one obligation on 4 Nov');
  assert.equal(r.committed.debts, 77 + 77 + 77 + 77, '4 Nov once plus 6, 13, 20, 27 Nov from the Debts sheet');
});

test('two identical debt rows on one earlier date count once in the potential liability', () => {
  const r = calculate({ ...base, debts: [], payments: [debtRow('P11', '2026-10-30'), debtRow('P12', '2026-10-30')] });
  assert.equal(r.potentialLiabilities.total, 77, 'the 30 Oct £77 is listed once');
});

test('duplicate debt rows are reported, not silently merged', () => {
  const r = calculate({ ...base, debts: [], payments: [debtRow('P11', '2026-10-30'), debtRow('P12', '2026-10-30')] });
  assert.ok(r.warnings.some((w) => /Credit Union.*more than one repayment.*Counted once/.test(w)), 'duplicate warning present');
});

test("Monzo status Disconnected is not connected, even with an old successful sync", () => {
  const state = sb.json('PayTrackerSavingsDashboardService.monzoSyncFromBank({ lastSuccess: "2026-10-23T09:00:00.000Z", status: "Disconnected", message: "" })');
  assert.equal(state.connected, false);
  assert.equal(state.status, "Disconnected");
});

test("Monzo status Connected with a recent sync is connected", () => {
  const state = sb.json('PayTrackerSavingsDashboardService.monzoSyncFromBank({ lastSuccess: "2026-11-04T09:00:00.000Z", status: "Connected", message: "" })');
  assert.equal(state.connected, true);
});

test('an inactive bill with an unpaid payment row is not deducted this month', () => {
  const r = calculate({
    ...base,
    debts: [],
    payments: [{ paymentId: 'PB6', itemId: 'B-FUEL', billOrDebtName: 'Fual', paymentType: 'Bill Payment',
      dueDate: '2026-11-03', amountDue: 120, paid: false }]
  });
  assert.ok(!r.committed.items.some((i) => i.name === 'Fual'), 'Fual is not a commitment');
  assert.equal(r.potentialLiabilities.total, 0, 'Fual is not a liability either');
});

const failed = results.filter((r) => !r.ok).length;
console.log('Finance audit regressions: ' + (results.length - failed) + '/' + results.length + ' passed.');
module.exports = { results };
if (require.main === module) process.exit(failed ? 1 : 0);
