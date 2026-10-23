'use strict';
/**
 * Step 3 end-to-end: getPayTrackerSmartSavingsPreview() over in-memory copies of every
 * sheet it reads (bank, ledger, bills, payments, subscriptions, savings, goals), and the
 * guarded confirmation that hands off to the EXISTING "mark deposited" workflow.
 */
process.env.TZ = 'Europe/London';
const assert = require('node:assert/strict');
const { createSandbox } = require('./gas-sandbox.cjs');

let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }

function seed(sb, name, headers, rows) {
  const sheet = sb.getSheet(name);
  sheet.rows.length = 0;
  sheet.rows.push(headers.slice());
  rows.forEach(r => sheet.rows.push(headers.map(h => (h in r ? r[h] : ''))));
}

function at(sb, y, m, day, h = 9) {
  sb.run(`(function () { var R = Date; var fixed = new R(${y}, ${m - 1}, ${day}, ${h}).getTime();
    function D() { return arguments.length ? new (Function.prototype.bind.apply(R, [null].concat([].slice.call(arguments))))() : new R(fixed); }
    D.prototype = R.prototype; D.UTC = R.UTC; D.parse = R.parse; D.now = function () { return fixed; }; Date = D; })()`);
}

function fixture(options = {}) {
  const sb = createSandbox({});
  const H = sb.json(`({
    bank: [PayTrackerFinanceIntegrationConfig.SHEETS.BANK_TRANSACTIONS.NAME, PayTrackerFinanceIntegrationConfig.SHEETS.BANK_TRANSACTIONS.HEADERS],
    bills: [PayTrackerFinanceConfig.SHEETS.BILLS, PayTrackerFinanceConfig.BILLS.HEADERS],
    payments: [PayTrackerFinanceConfig.SHEETS.PAYMENTS, PayTrackerFinanceConfig.PAYMENTS.HEADERS],
    settings: [PayTrackerSavingsConfig.SHEETS.SETTINGS, PayTrackerSavingsConfig.SETTINGS.HEADERS],
    pots: [PayTrackerSavingsConfig.SHEETS.POTS, PayTrackerSavingsConfig.POTS.HEADERS],
    contributions: [PayTrackerSavingsConfig.SHEETS.CONTRIBUTIONS, PayTrackerSavingsConfig.CONTRIBUTIONS.HEADERS],
    history: [PayTrackerSavingsConfig.SHEETS.HISTORY, PayTrackerSavingsConfig.HISTORY.HEADERS],
    goals: [PayTrackerSavingsConfig.SHEETS.GOALS, PayTrackerSavingsConfig.GOALS.HEADERS],
    jobs: [PayTrackerReconciliationConfig.SHEETS.JOBS.NAME, PayTrackerReconciliationConfig.SHEETS.JOBS.HEADERS]
  })`);
  const d = (m, day, h = 12) => sb.date(2026, m - 1, day, h);
  const bank = (id, f) => Object.assign({ 'Transaction ID': id, 'Settled At': f.date, 'Created At': f.date, 'Debit or Credit': 'Debit',
    'Pending': false, 'Declined': false, 'Match Status': 'Unmatched', 'Category': 'general' }, f);
  seed(sb, H.bank[0], H.bank[1].concat(['Pay Tracker Category', 'Category Source']), [
    bank('tx_pay', { 'Description': 'NHS BSO SALARY', 'Amount': 2100, 'Debit or Credit': 'Credit', 'Category': 'income', date: d(10, 1) }),
    bank('tx_food', { 'Description': 'TESCO', 'Merchant Name': 'Tesco', 'Merchant ID': 'm1', 'Amount': 180, date: d(10, 4) }),
    bank('tx_rent', { 'Description': 'LANDLORD', 'Amount': 650, 'Matched Finance Type': 'Bill Payment', 'Matched Finance ID': 'PAY-RENT-OCT', 'Match Status': 'Confirmed', date: d(10, 2) }),
    bank('tx_house', { 'Description': 'pot_HOUSE', 'Amount': 100, 'Category': 'savings', date: d(10, 5) }),
    bank('tx_mystery', { 'Description': 'FPS 1234', 'Amount': 30, date: d(10, 6) }),
    bank('tx_sept', { 'Description': 'NHS BSO SALARY', 'Amount': 2100, 'Debit or Credit': 'Credit', 'Category': 'income', date: d(9, 1) })
  ]);
  seed(sb, H.jobs[0], H.jobs[1], [{ 'Job ID': 'JOB-NHS', 'Employer': 'NHS', 'Employer Key': 'nhs bso', 'Active': true }]);
  seed(sb, H.bills[0], H.bills[1], [
    { 'Bill ID': 'BILL-ENERGY', 'Bill Name': 'Energy', 'Amount': 85, 'Frequency': 'Monthly', 'Next Due Date': d(10, 20), 'Active': 'Yes' },
    { 'Bill ID': 'BILL-RENT', 'Bill Name': 'Rent', 'Amount': 650, 'Frequency': 'Monthly', 'Next Due Date': d(11, 2), 'Active': 'Yes' }
  ]);
  seed(sb, H.payments[0], H.payments[1], [
    { 'Payment ID': 'PAY-ENERGY', 'Due Date': d(10, 20), 'Payment Type': 'Bill Payment', 'Item ID': 'BILL-ENERGY', 'Bill or Debt Name': 'Energy', 'Amount Due': 85, 'Paid?': false },
    { 'Payment ID': 'PAY-LOAN', 'Due Date': d(10, 25), 'Payment Type': 'Debt Repayment', 'Item ID': 'DEBT-1', 'Bill or Debt Name': 'Car loan', 'Amount Due': 150, 'Paid?': false }
  ]);
  seed(sb, H.settings[0], H.settings[1], [
    { 'Setting': 'Savings Mode', 'Value': options.mode || 'Percentage of Disposable Income' },
    { 'Setting': 'Disposable Income Savings %', 'Value': 0.6 },
    { 'Setting': 'Fixed Monthly Savings Amount', 'Value': 500 },
    { 'Setting': 'Maximum Monthly Savings', 'Value': 0 }
  ]);
  seed(sb, H.pots[0], H.pots[1], [
    { 'Pot ID': 'POT-HOUSE', 'Pot Name': 'House deposit', 'Current Balance': 8000, 'Goal Amount': 25000, 'Allocation %': 0.7, 'Active': 'Yes',
      'Contribution Method': 'Percentage Allocation', 'Monthly Equivalent': 420, 'Linked Goal ID': 'GOAL-MORTGAGE', 'Linked Monzo Pot ID': 'pot_HOUSE' },
    { 'Pot ID': 'POT-EMERG', 'Pot Name': 'Emergency fund', 'Current Balance': 1200, 'Goal Amount': 3000, 'Allocation %': 0.3, 'Active': 'Yes',
      'Contribution Method': 'Percentage Allocation', 'Monthly Equivalent': 180 }
  ]);
  seed(sb, H.contributions[0], H.contributions[1], [
    { 'Contribution ID': 'CON-1', 'Due Date': d(10, 5), 'Pot ID': 'POT-HOUSE', 'Pot Name': 'House deposit', 'Contribution Amount': 100, 'Deposited?': false, 'Status': 'Upcoming' },
    { 'Contribution ID': 'CON-2', 'Due Date': d(10, 28), 'Pot ID': 'POT-EMERG', 'Pot Name': 'Emergency fund', 'Contribution Amount': 180, 'Deposited?': false, 'Status': 'Upcoming' }
  ]);
  seed(sb, H.history[0], H.history[1], []);
  seed(sb, H.goals[0], H.goals[1], [
    { 'Goal ID': 'GOAL-MORTGAGE', 'Goal Name': 'Mortgage deposit', 'Category': 'House Deposit', 'Target Amount': 25000, 'Current Linked Savings': 8000, 'Active': 'Yes' }
  ]);
  at(sb, 2026, 10, 15);
  return { sb, H };
}

const preview = sb => sb.json('getPayTrackerSmartSavingsPreview()');

test('end to end: actuals, commitments, disposable, suggestion and pot split for October', () => {
  const { sb } = fixture();
  const r = preview(sb);
  assert.equal(r.success, true);
  assert.deepEqual([r.period.from, r.period.to], ['2026-10-01', '2026-10-31']);
  assert.equal(r.actual.incomeReceived, 2100, 'September salary is not this month');
  assert.equal(r.actual.spending, 180);
  assert.equal(r.actual.billsPaid, 650);
  assert.equal(r.actual.unconfirmedOutgoing, 30);
  assert.equal(r.savedThisMonth, 100, 'Monzo pot deposit');
  assert.equal(r.committed.bills, 85);
  assert.equal(r.committed.debts, 150);
  assert.equal(r.committed.total, 235, 'Rent (Nov) is next month; Energy and the car loan are this month');
  assert.equal(r.disposable, 2100 - 180 - 650 - 30 - 235 - 100);
  assert.equal(r.suggestion.amount, Math.floor(r.disposable * 0.6 * 100) / 100);
  const house = r.distribution.find(p => p.potId === 'POT-HOUSE');
  const emerg = r.distribution.find(p => p.potId === 'POT-EMERG');
  assert.equal(house.savedThisMonth, 100);
  assert.equal(house.suggested, Math.floor(r.suggestion.amount * 0.7 * 100) / 100);
  assert.equal(emerg.suggested, Math.floor(r.suggestion.amount * 0.3 * 100) / 100);
  assert.equal(r.planned.total, 600, 'existing planned Monthly Equivalents, unchanged');
  assert.equal(r.goals[0].name, 'Mortgage deposit');
  assert.equal(r.goals[0].suggestedThisMonth, house.suggested);
});

test('confirmations: the Monzo pot deposit supports CON-1; CON-2 has no bank evidence yet', () => {
  const { sb } = fixture();
  const c = preview(sb).confirmations;
  assert.deepEqual(c.map(x => x.contributionId), ['CON-1', 'CON-2']);
  assert.equal(c[0].bankEvidence.transactionId, 'tx_house');
  assert.equal(c[1].bankEvidence, null);
});

test('fixed mode uses the existing Fixed Monthly Savings Amount setting', () => {
  const { sb } = fixture({ mode: 'Fixed Monthly Amount' });
  assert.equal(preview(sb).suggestion.amount, 400, '£500 fixed less £100 already saved');
});

test('the preview is strictly read-only: no cell changes and no sheet created', () => {
  const { sb } = fixture();
  const before = JSON.stringify(sb.sheets);
  preview(sb); preview(sb);
  assert.equal(JSON.stringify(sb.sheets), before);
  const empty = createSandbox({});
  const r = empty.json('getPayTrackerSmartSavingsPreview()');
  assert.equal(r.suggestion.amount, 0);
  assert.equal(Object.keys(empty.sheets).length, 0, 'nothing created on an empty spreadsheet');
});

test('confirm: hands a still-due, unchanged contribution to the EXISTING mark-deposited workflow', () => {
  const { sb } = fixture();
  sb.run(`var __marked = []; PayTrackerWebSavingsWorkspaceService = Object.assign({}, PayTrackerWebSavingsWorkspaceService,
    { markContributionDeposited: function (id) { __marked.push(id); return {}; } });`);
  sb.json('confirmPayTrackerSmartSavingsContribution("CON-1", 100)');
  assert.deepEqual(sb.json('__marked'), ['CON-1']);
});

test('confirm refuses a changed amount, an unknown id and an already-deposited contribution', () => {
  const { sb, H } = fixture();
  sb.run(`var __marked = []; PayTrackerWebSavingsWorkspaceService = Object.assign({}, PayTrackerWebSavingsWorkspaceService,
    { markContributionDeposited: function (id) { __marked.push(id); return {}; } });`);
  assert.throws(() => sb.run('confirmPayTrackerSmartSavingsContribution("CON-1", 120)'), /changed to £100.00/);
  assert.throws(() => sb.run('confirmPayTrackerSmartSavingsContribution("CON-9", 100)'), /not found/);
  const sheet = sb.getSheet(H.contributions[0]);
  sheet.rows[1][H.contributions[1].indexOf('Deposited?')] = true;
  assert.throws(() => sb.run('confirmPayTrackerSmartSavingsContribution("CON-1", 100)'), /already marked/);
  assert.deepEqual(sb.json('__marked'), [], 'nothing was recorded');
});

test('nothing in Smart Savings can move money: no Monzo or UrlFetch call is reachable from the preview', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = ['SmartSavingsService.js', 'SmartSavingsCalculator.js']
    .map(name => fs.readFileSync(path.join(__dirname, '../../Backend/Savings', name), 'utf8')).join('\n');
  assert.doesNotMatch(source, /UrlFetchApp|PayTrackerMonzoService\.|request\(|\/pots|\/transactions/);
});

console.log(`Smart savings scenarios: ${passed}/${passed} passed.`);
