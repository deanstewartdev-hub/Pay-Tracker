'use strict';
/**
 * v3.3 release-candidate integration: ONE in-memory spreadsheet, the REAL modules run in
 * the order the app runs them. Calendar -> Staffline -> Monzo import -> bill matcher ->
 * Money Movements -> cash flow (2A) -> Upcoming Payments (2B) -> Savings + Monzo pots ->
 * Life Goals -> Smart Savings (3) -> Dashboard. Checks they agree with each other.
 */
process.env.TZ = 'Europe/London';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSandbox } = require('./gas-sandbox.cjs');

let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }

function seed(sb, name, headers, rows) {
  const sheet = sb.getSheet(name);
  sheet.rows.length = 0;
  sheet.rows.push(headers.slice());
  rows.forEach(r => sheet.rows.push(headers.map(h => (h in r ? r[h] : ''))));
  return sheet;
}

function at(sb, y, m, day, h = 9) {
  sb.run(`(function () { var R = Date; var fixed = new R(${y}, ${m - 1}, ${day}, ${h}).getTime();
    function D() { return arguments.length ? new (Function.prototype.bind.apply(R, [null].concat([].slice.call(arguments))))() : new R(fixed); }
    D.prototype = R.prototype; D.UTC = R.UTC; D.parse = R.parse; D.now = function () { return fixed; }; Date = D; })()`);
}

const sb = createSandbox({ stubLayout: true });
sb.run('PayTrackerFinanceDashboard = Object.assign({}, PayTrackerFinanceDashboard, { refresh: function () {} })');
sb.run(`var __cache = {}; CacheService = { getScriptCache: function () { return {
  get: function (k) { return Object.prototype.hasOwnProperty.call(__cache, k) ? __cache[k] : null; },
  put: function (k, v) { __cache[k] = v; }, remove: function (k) { delete __cache[k]; } }; } };`);
const C = expr => sb.json(expr);
const d = (m, day, h = 12) => sb.date(2026, m - 1, day, h);
const OWNER = 'dean99992011@gmail.com';

// --- Setup: the real setup services create the v3 sheets. ---
sb.run('PayTrackerReconciliationSetupService.setup()');
sb.run('PayTrackerMoneyMovementsSetupService.setup()');
sb.run('PayTrackerFinanceIntegrationSetupService.setup()');
sb.run(`[['JOB-NHS','car parking assistant'],['JOB-RELIEF-WARDEN','relief assistant warden'],['JOB-NIGHT-SECURITY','night security']]
  .forEach(function (p) { PayTrackerJobRegistryRepository.updateFields(p[0], { stafflineReferences: p[1] }); })`);
const F = C(`({ bills: [PayTrackerFinanceConfig.SHEETS.BILLS, PayTrackerFinanceConfig.BILLS.HEADERS],
  payments: [PayTrackerFinanceConfig.SHEETS.PAYMENTS, PayTrackerFinanceConfig.PAYMENTS.HEADERS],
  history: [PayTrackerFinanceConfig.SHEETS.PAYMENT_HISTORY, PayTrackerFinanceConfig.PAYMENT_HISTORY.HEADERS],
  debts: [PayTrackerFinanceConfig.SHEETS.DEBTS, PayTrackerFinanceConfig.DEBTS.HEADERS],
  pots: [PayTrackerSavingsConfig.SHEETS.POTS, PayTrackerSavingsConfig.POTS.HEADERS],
  settings: [PayTrackerSavingsConfig.SHEETS.SETTINGS, PayTrackerSavingsConfig.SETTINGS.HEADERS],
  contributions: [PayTrackerSavingsConfig.SHEETS.CONTRIBUTIONS, PayTrackerSavingsConfig.CONTRIBUTIONS.HEADERS],
  shistory: [PayTrackerSavingsConfig.SHEETS.HISTORY, PayTrackerSavingsConfig.HISTORY.HEADERS],
  goals: [PayTrackerSavingsConfig.SHEETS.GOALS, PayTrackerSavingsConfig.GOALS.HEADERS],
  subs: [PayTrackerFinanceIntegrationConfig.SHEETS.SUBSCRIPTIONS.NAME, PayTrackerFinanceIntegrationConfig.SHEETS.SUBSCRIPTIONS.HEADERS],
  bank: PayTrackerFinanceIntegrationConfig.SHEETS.BANK_TRANSACTIONS.NAME })`);

at(sb, 2026, 10, 28);
sb.seedWeek(d(10, 26));

test('Calendar: NHS and Relief shifts sync to PaySheet with the right pay', () => {
  const e = (t, day, a, b) => sb.event(t, sb.date(2026, 9, day, a), sb.date(2026, 9, day, b), { id: 'evt-' + t + day });
  sb.setCalendars({ [OWNER]: [e('NHS Coleraine 6-2', 26, 6, 14), e('Caravan site 9-8', 27, 9, 19)] });
  const r = sb.sync();
  assert.equal(r.imported, 2);
  assert.deepEqual(sb.shiftOn('NHS', d(10, 26)), ['NHS 6am-2pm Basic', '', 95.33]);
  assert.deepEqual(sb.shiftOn('Relief Assistant Warden', d(10, 27)), ['Basic', 10, 136.9]);
});

test('Staffline: the offline-safe reconciliation checks pass on the same spreadsheet', () => {
  const src = fs.readFileSync(path.join(sb.ROOT, 'Tests/Staffline_Tests.js'), 'utf8')
    .replace("if (!condition) throw new Error('Failed: ' + name);", 'if (!condition) { __failed.push(name); return; }')
    .replace('function runStafflineReconciliationTests()', 'function __stafflineCounted()');
  sb.run('var __failed = [];'); sb.run(src);
  const r = C('__stafflineCounted()');
  const failed = C('__failed');
  // The only checks that cannot pass offline read the owner's real imported portal data.
  assert.ok(failed.every(n => /^real Staffline detail is imported for Timesheet/.test(n)), failed.join('; '));
  assert.ok(r.passed >= 50, r.passed + ' passed');
});

// Finance seed: bills, the payment queue, a weekly debt, a subscription, savings.
seed(sb, F.bills[0], F.bills[1], [
  { 'Bill ID': 'BILL-ENERGY', 'Bill Name': 'Energy', 'Amount': 85, 'Frequency': 'Monthly', 'Next Due Date': d(10, 20), 'Active': 'Yes' },
  { 'Bill ID': 'BILL-RENT', 'Bill Name': 'Rent', 'Amount': 650, 'Frequency': 'Monthly', 'Next Due Date': d(11, 1), 'Active': 'Yes' }
]);
seed(sb, F.payments[0], F.payments[1], [
  { 'Payment ID': 'PAY-ENERGY', 'Due Date': d(10, 20), 'Payment Type': 'Bill Payment', 'Item ID': 'BILL-ENERGY', 'Bill or Debt Name': 'Energy', 'Amount Due': 85, 'Paid?': false, 'Status': 'Upcoming' },
  { 'Payment ID': 'PAY-RENT', 'Due Date': d(11, 1), 'Payment Type': 'Bill Payment', 'Item ID': 'BILL-RENT', 'Bill or Debt Name': 'Rent', 'Amount Due': 650, 'Paid?': false, 'Status': 'Upcoming' },
  { 'Payment ID': 'PAY-PHONE', 'Due Date': d(10, 29), 'Payment Type': 'Debt Repayment', 'Item ID': 'DEBT-PHONE', 'Bill or Debt Name': 'Phone loan', 'Amount Due': 20, 'Paid?': false, 'Status': 'Upcoming' }
]);
seed(sb, F.history[0], F.history[1], []);
seed(sb, F.debts[0], F.debts[1], [
  { 'Debt ID': 'DEBT-PHONE', 'Debt Name': 'Phone loan', 'Repayment Amount': 20, 'Frequency': 'Weekly', 'Next Payment Date': d(10, 29), 'Active': 'Yes' }
]);
seed(sb, F.subs[0], F.subs[1], [
  { 'Subscription ID': 'SUB-NETFLIX', 'Subscription Name': 'Netflix', 'Frequency': 'Monthly', 'Latest Amount': 10.99, 'Next Expected Date': d(10, 24), 'Review Status': 'Confirmed', 'Subscription Status': 'Active' }
]);
seed(sb, F.settings[0], F.settings[1], [
  { 'Setting': 'Savings Mode', 'Value': 'Percentage of Disposable Income' }, { 'Setting': 'Disposable Income Savings %', 'Value': 0.5 },
  { 'Setting': 'Fixed Monthly Savings Amount', 'Value': 0 }, { 'Setting': 'Maximum Monthly Savings', 'Value': 0 }
]);
seed(sb, F.pots[0], F.pots[1], [
  { 'Pot ID': 'POT-HOUSE', 'Pot Name': 'House deposit', 'Current Balance': 8000, 'Goal Amount': 25000, 'Allocation %': 1, 'Active': 'Yes',
    'Contribution Method': 'Percentage Allocation', 'Contribution Frequency': 'Monthly', 'Monthly Equivalent': 400, 'Linked Goal ID': 'GOAL-MORTGAGE', 'Linked Monzo Pot ID': 'pot_HOUSE' }
]);
seed(sb, F.contributions[0], F.contributions[1], [
  { 'Contribution ID': 'CON-HOUSE', 'Due Date': d(10, 27), 'Pot ID': 'POT-HOUSE', 'Pot Name': 'House deposit', 'Contribution Amount': 200, 'Deposited?': false,
    'Status': 'Upcoming', 'Contribution Method': 'Percentage Allocation', 'Contribution Frequency': 'Monthly' }
]);
seed(sb, F.shistory[0], F.shistory[1], []);
seed(sb, F.goals[0], F.goals[1], [
  { 'Goal ID': 'GOAL-MORTGAGE', 'Goal Name': 'Mortgage deposit', 'Category': 'House Deposit', 'Target Amount': 25000, 'Current Linked Savings': 8000, 'Active': 'Yes' }
]);

test('Monzo import (real storeTransactions): one batched write, no duplicates on a repeat import', () => {
  const tx = (id, desc, pence, created, extra) => Object.assign({ id, created, settled: created, description: desc, amount: pence, currency: 'GBP', category: 'general' }, extra || {});
  sb.context.__txs = [
    tx('tx_pay', 'NHS BSO SALARY', 210000, '2026-10-01T08:00:00Z', { category: 'income' }),
    tx('tx_energy', 'ENERGY CO', -8500, '2026-10-21T08:00:00Z', { category: 'bills' }),
    tx('tx_food', 'TESCO', -12000, '2026-10-05T12:00:00Z', { merchant: { id: 'm1', name: 'Tesco' }, category: 'groceries' }),
    tx('tx_netflix', 'NETFLIX.COM', -1099, '2026-10-24T03:00:00Z', { merchant: { id: 'm2', name: 'Netflix' }, category: 'entertainment' }),
    tx('tx_house', 'pot_HOUSE', -20000, '2026-10-27T09:00:00Z', { category: 'savings' })
  ];
  assert.equal(sb.run('PayTrackerMonzoService.storeTransactions({ id: "acc_1" }, __txs)'), 5);
  assert.equal(sb.run('PayTrackerMonzoService.storeTransactions({ id: "acc_1" }, __txs)'), 0);
  assert.equal(sb.getSheet(F.bank).rows.length, 6);
});

test('Bill matcher (real) suggests the Energy payment; nothing is auto-confirmed', () => {
  sb.run('PayTrackerTransactionMatchingService.matchTransactions()');
  const rows = sb.getSheet(F.bank).rows;
  const headers = rows[0];
  const energy = rows.find(r => r[0] === 'tx_energy');
  assert.equal(energy[headers.indexOf('Matched Finance ID')], 'PAY-ENERGY');
  assert.equal(energy[headers.indexOf('Match Status')], 'Suggested');
});

test('Money Movements + cash flow (2A): a manual entry for the same salary is flagged, not double counted', () => {
  sb.run(`PayTrackerMoneyMovementsRepository.create({ date: new Date(2026, 9, 1), movementType: 'Salary Income', amount: 2100 })`);
  const p = C('getPayTrackerCashFlowPreview({ from: "2026-10-01", to: "2026-10-31" })');
  const by = id => p.proposals.find(x => x.transactionId === id);
  assert.equal(by('tx_pay').status, 'Possible duplicate');
  assert.equal(by('tx_energy').category, 'Bill Payment');
  assert.equal(by('tx_energy').confidence, 'Needs confirmation', 'Suggested match is not confirmed');
  assert.equal(by('tx_house').category, 'Savings Transfer');
  assert.equal(p.summary.totals.confirmed.income, 0, 'the salary is not counted twice (ledger + bank)');
});

test('Upcoming Payments (2B): Energy needs review, unlinked Netflix stays visible (never paid by date), cache works', () => {
  const r = C('getPayTrackerUpcomingPayments({ refresh: true })');
  const energy = r.upcoming.find(i => i.name === 'Energy');
  assert.equal(energy.status, 'Needs review');
  assert.equal(energy.evidenceTransactionId, 'tx_energy');
  const netflix = r.upcoming.find(i => i.name === 'Netflix');
  assert.equal(netflix.dueDate, '2026-10-24');
  assert.equal(netflix.status, 'Overdue', 'no subscription link, so not marked paid by the timeline');
  assert.equal(C('getPayTrackerUpcomingPayments({})').source, 'cache');
});

test('Savings (real process + Monzo pot sync): a linked pot is not double counted', () => {
  const sheet = sb.getSheet(F.contributions[0]);
  sb.context.__row = 2;
  sb.run(`PayTrackerSavingsContributionService.processContributionRow(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(${JSON.stringify(F.contributions[0])}), __row)`);
  const pots = sb.getSheet(F.pots[0]).rows;
  const balanceCol = F.pots[1].indexOf('Current Balance');
  assert.equal(pots[1][balanceCol], 8000, 'recording does not add to a Monzo-linked pot');
  sb.context.__pots = [{ id: 'pot_HOUSE', balance: 8200, name: 'House deposit' }];
  sb.run('PayTrackerSavingsService.applyMonzoPotBalances(__pots)');
  assert.equal(pots[1][balanceCol], 8200, 'Monzo sets the real balance once');
  assert.ok(sheet.rows.length >= 1);
});

test('Life Goals (real recalc) reflects the Monzo balance, not a double-counted one', () => {
  sb.run('PayTrackerLifeGoalsService.recalculateAllGoals()');
  const goals = sb.getSheet(F.goals[0]).rows;
  assert.equal(goals[1][F.goals[1].indexOf('Current Linked Savings')], 8200);
});

test('Smart Savings (3) agrees with 2A and 2B: each payment deducted once, savings from the bank', () => {
  const r = C('getPayTrackerSmartSavingsPreview()');
  assert.equal(r.actual.incomeReceived, 2100, 'bank salary counts once (the ledger duplicate does not add)');
  // Tesco 120 + Netflix 10.99 (no subscription link, so 2A calls it everyday spending).
  assert.equal(r.actual.spending, 130.99);
  assert.deepEqual(r.committed.likelyPaid.map(x => x.transactionId), ['tx_netflix'], 'so it is not ALSO deducted as still to pay');
  assert.equal(r.actual.unconfirmedOutgoing, 85, 'Energy: suggested match, conservatively subtracted once');
  assert.ok(!r.committed.items.some(i => i.name === 'Energy'), 'Energy not also "still to pay"');
  assert.ok(!r.committed.items.some(i => i.name === 'Netflix'), 'Netflix paid on its due date: not also "still to pay"');
  assert.deepEqual(r.committed.items.filter(i => i.kind === 'Debt').map(i => i.dueDate), ['2026-10-29'], 'weekly phone loan, rest of October');
  assert.equal(r.savedThisMonth, 200, 'from the Monzo pot transfer');
  // 2100 in; out: spending 130.99, Energy 85 (unconfirmed), phone loan 20 (still due), 200 saved. Netflix once.
  assert.equal(r.disposable, Math.round((2100 - 130.99 - 85 - 20 - 200) * 100) / 100);
  assert.equal(r.goals[0].current, 8200);
  // Planned = whatever the existing module holds (it recalculated the pot when the contribution was recorded).
  const monthlyEquivalent = sb.getSheet(F.pots[0]).rows[1][F.pots[1].indexOf('Monthly Equivalent')];
  assert.equal(r.planned.total, Number(monthlyEquivalent) || 0, 'planned figure is the existing module\'s');
});

test('All three previews together are strictly read-only on the shared spreadsheet', () => {
  const before = JSON.stringify(sb.sheets);
  C('getPayTrackerCashFlowPreview({})');
  C('getPayTrackerUpcomingPayments({ refresh: true })');
  C('getPayTrackerSmartSavingsPreview()');
  assert.equal(JSON.stringify(sb.sheets), before);
});

test('Dashboard (real) loads on the merged data', () => {
  const r = C('getPayTrackerWebDashboardData()');
  assert.equal(r.success, true, r.error || '');
});

console.log(`Integration scenarios: ${passed}/${passed} passed.`);
