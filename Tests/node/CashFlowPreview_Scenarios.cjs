'use strict';
/**
 * Step 2A end-to-end: PayTrackerCashFlowPreviewService.getPreview() and the browser API
 * over in-memory copies of the real sheets (Bank Transactions, Money Movements,
 * Subscription Transactions, Savings Pots, Jobs). No Google access.
 */
process.env.TZ = 'Europe/London';
const assert = require('node:assert/strict');
const { createSandbox } = require('./gas-sandbox.cjs');

let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }

const BANK_HEADERS_EXTRA = ['Pay Tracker Category', 'Category Source'];

function seed(sb, name, headers, rows) {
  const sheet = sb.getSheet(name);
  sheet.rows.length = 0;
  sheet.rows.push(headers.slice());
  rows.forEach(r => sheet.rows.push(headers.map(h => (h in r ? r[h] : ''))));
  return sheet;
}

function fixture() {
  const sb = createSandbox({});
  const names = sb.json(`({
    bank: PayTrackerFinanceIntegrationConfig.SHEETS.BANK_TRANSACTIONS.NAME,
    bankHeaders: PayTrackerFinanceIntegrationConfig.SHEETS.BANK_TRANSACTIONS.HEADERS,
    subs: PayTrackerFinanceIntegrationConfig.SHEETS.SUBSCRIPTION_TRANSACTIONS.NAME,
    subsHeaders: PayTrackerFinanceIntegrationConfig.SHEETS.SUBSCRIPTION_TRANSACTIONS.HEADERS,
    moves: PayTrackerMoneyMovementsConfig.SHEETS.MOVEMENTS.NAME,
    moveHeaders: PayTrackerMoneyMovementsConfig.SHEETS.MOVEMENTS.HEADERS,
    pots: PayTrackerSavingsConfig.SHEETS.POTS,
    potHeaders: PayTrackerSavingsConfig.POTS.HEADERS,
    jobs: PayTrackerReconciliationConfig.SHEETS.JOBS.NAME,
    jobHeaders: PayTrackerReconciliationConfig.SHEETS.JOBS.HEADERS
  })`);
  const d = (day, hour = 12) => new Date(2026, 9, day, hour);
  const bank = (id, fields) => Object.assign({
    'Transaction ID': id, 'Connection ID': 'MONZO-PERSONAL', 'Account ID': 'acc_1',
    'Created At': fields.date || d(10), 'Settled At': fields.date || d(10), 'Currency': 'GBP',
    'Debit or Credit': 'Debit', 'Pending': false, 'Declined': false, 'Match Status': 'Unmatched', 'Category': 'general'
  }, fields);
  seed(sb, names.bank, names.bankHeaders.concat(BANK_HEADERS_EXTRA), [
    bank('tx_salary', { 'Description': 'NHS BSO SALARY', 'Merchant Name': 'NHS BSO SALARY', 'Amount': 1450.22, 'Debit or Credit': 'Credit', 'Category': 'income', date: d(1) }),
    bank('tx_tesco', { 'Description': 'TESCO STORES', 'Merchant Name': 'Tesco', 'Merchant ID': 'merch_tesco', 'Amount': 42.10, 'Category': 'groceries', date: d(3) }),
    bank('tx_rent', { 'Description': 'LANDLORD', 'Amount': 650, 'Matched Finance Type': 'Bill Payment', 'Matched Finance ID': 'PAY-RENT', 'Match Status': 'Confirmed', date: d(2) }),
    bank('tx_loan', { 'Description': 'LOAN CO', 'Amount': 120, 'Matched Finance Type': 'Debt Repayment', 'Matched Finance ID': 'PAY-LOAN', 'Match Status': 'Suggested', date: d(5) }),
    bank('tx_netflix', { 'Description': 'NETFLIX.COM', 'Merchant Name': 'Netflix', 'Merchant ID': 'merch_nf', 'Amount': 10.99, 'Category': 'entertainment', date: d(6) }),
    bank('tx_pot_in', { 'Description': 'pot_0000HOUSE', 'Amount': 300, 'Category': 'savings', date: d(2, 9) }),
    bank('tx_pot_out', { 'Description': 'pot_0000HOUSE', 'Amount': 50, 'Debit or Credit': 'Credit', 'Category': 'savings', date: d(20) }),
    bank('tx_refund', { 'Description': 'AMAZON', 'Merchant Name': 'Amazon', 'Merchant ID': 'merch_amz', 'Amount': 15, 'Debit or Credit': 'Credit', 'Category': 'shopping', date: d(7) }),
    bank('tx_own', { 'Description': 'D STEWART', 'Amount': 200, 'Category': 'transfers', 'Pay Tracker Category': 'Internal Transfer', 'Category Source': 'Manual', date: d(8) }),
    bank('tx_mystery', { 'Description': 'FPS 99821', 'Amount': 35, 'Category': 'general', date: d(9) }),
    bank('tx_manual_dup', { 'Description': 'COUNCIL TAX', 'Amount': 98, 'Matched Finance Type': 'Bill Payment', 'Match Status': 'Confirmed', date: d(15) }),
    bank('tx_already', { 'Description': 'GYM', 'Merchant ID': 'merch_gym', 'Merchant Name': 'Gym', 'Amount': 25, date: d(16) }),
    bank('tx_pending', { 'Description': 'CAFE', 'Merchant ID': 'merch_cafe', 'Merchant Name': 'Cafe', 'Amount': 4.5, 'Pending': true, date: d(22) }),
    bank('tx_declined', { 'Description': 'SHOP', 'Merchant ID': 'merch_s', 'Amount': 999, 'Declined': true, date: d(22) }),
    bank('tx_tesco', { 'Description': 'TESCO STORES', 'Merchant Name': 'Tesco', 'Merchant ID': 'merch_tesco', 'Amount': 42.10, 'Category': 'groceries', date: d(3) }),
    bank('tx_interest', { 'Description': 'Interest', 'Amount': 1.23, 'Debit or Credit': 'Credit', date: d(30) }),
    bank('tx_sept', { 'Description': 'SEPT SHOP', 'Merchant ID': 'merch_x', 'Amount': 5, date: new Date(2026, 8, 30, 23, 30) })
  ]);
  seed(sb, names.subs, names.subsHeaders, [
    { 'Link ID': 'L1', 'Subscription ID': 'SUB-NETFLIX', 'Transaction ID': 'tx_netflix', 'Amount': 10.99, 'Confirmed': true }
  ]);
  seed(sb, names.moves, names.moveHeaders, [
    { 'Movement ID': 'MOVE-MANUAL', 'Date': d(14), 'Movement Type': 'Bill Payment', 'Amount': 98, 'Internal Transfer': false },
    { 'Movement ID': 'MOVE-LINKED', 'Date': d(16), 'Movement Type': 'Bill Payment', 'Amount': 25, 'Related Transaction ID': 'tx_already', 'Internal Transfer': false }
  ]);
  seed(sb, names.pots, names.potHeaders, [{ 'Pot ID': 'POT-1', 'Pot Name': 'House deposit', 'Linked Monzo Pot ID': 'pot_0000HOUSE' }]);
  seed(sb, names.jobs, names.jobHeaders, [{ 'Job ID': 'JOB-NHS', 'Employer': 'NHS', 'Employer Key': 'nhs bso', 'Active': true }]);
  return { sb, names };
}

function preview(sb, from = '', to = '') {
  return sb.json(`getPayTrackerCashFlowPreview(${JSON.stringify({ from, to })})`);
}
const byId = (result, id) => result.proposals.filter(p => p.transactionId === id);

test('every transaction is classified into the expected category and status', () => {
  const { sb } = fixture();
  const result = preview(sb);
  const expect = {
    tx_salary: ['Salary Income', 'New'], tx_tesco: ['Everyday Spending', 'New'], tx_rent: ['Bill Payment', 'New'],
    tx_loan: ['Debt Payment', 'New'], tx_netflix: ['Subscription Payment', 'New'], tx_pot_in: ['Savings Transfer', 'New'],
    tx_pot_out: ['Savings Transfer', 'New'], tx_refund: ['Refund', 'New'], tx_own: ['Internal Transfer', 'New'],
    tx_mystery: ['Unrecognised', 'New'], tx_manual_dup: ['Bill Payment', 'Possible duplicate'],
    tx_already: ['Everyday Spending', 'Already recorded'], tx_pending: ['Everyday Spending', 'Pending'],
    tx_declined: ['Unrecognised', 'Excluded'], tx_interest: ['Interest', 'New']
  };
  for (const [id, [category, status]] of Object.entries(expect)) {
    const [p] = byId(result, id);
    assert.ok(p, id + ' missing');
    assert.equal(p.category, category, id + ' category');
    assert.equal(p.status, status, id + ' status');
  }
  assert.equal(byId(result, 'tx_loan')[0].confidence, 'Needs confirmation', 'a Suggested match is not confirmed');
  assert.equal(byId(result, 'tx_pot_in')[0].confidence, 'Confirmed', 'linked Savings Pot');
  assert.equal(byId(result, 'tx_mystery')[0].confidence, 'Needs confirmation');
  assert.equal(byId(result, 'tx_already')[0].existingMovementId, 'MOVE-LINKED');
  assert.deepEqual(byId(result, 'tx_manual_dup')[0].possibleDuplicateOf, ['MOVE-MANUAL']);
});

test('the duplicated tx_tesco row is shown once as New and once Excluded, and counted once', () => {
  const { sb } = fixture();
  const result = preview(sb);
  assert.deepEqual(byId(result, 'tx_tesco').map(p => p.status).sort(), ['Excluded', 'New']);
});

test('October totals: income, spending, refunds, transfers and net are exact', () => {
  const { sb } = fixture();
  const s = preview(sb, '2026-10-01', '2026-10-31').summary;
  const c = s.totals.confirmed;
  assert.equal(c.income, 1451.45, 'salary 1450.22 + interest 1.23');
  assert.equal(c.spending, 703.09, 'tesco 42.10 + rent 650 + netflix 10.99 (loan, duplicate, linked, pending, declined excluded)');
  assert.equal(c.refunds, 15);
  assert.equal(c.netSpending, 688.09);
  assert.equal(c.internalTransfers, 550, 'pot in 300 + pot out 50 + own account 200 - never income or spending');
  assert.equal(c.netCashFlow, 763.36);
  assert.equal(s.totals.needsConfirmation.spending, 120, 'suggested loan match');
  assert.equal(s.totals.needsConfirmation.unrecognisedOut, 35);
  assert.equal(s.needsConfirmationCount, 3, 'loan, mystery, possible duplicate');
});

test('the date range is inclusive and uses Europe/London days', () => {
  const { sb } = fixture();
  const oct = preview(sb, '2026-10-01', '2026-10-31');
  assert.equal(byId(oct, 'tx_sept').length, 0, '23:30 on 30 Sep (London) is not in October');
  assert.equal(byId(oct, 'tx_interest').length, 1, '31 Oct... 30 Oct is inside');
  const sept = preview(sb, '2026-09-30', '2026-09-30');
  assert.deepEqual(sept.proposals.map(p => p.transactionId), ['tx_sept']);
  assert.throws(() => preview(sb, '01/10/2026', ''), /yyyy-mm-dd/);
});

test('the preview is strictly read-only: no cell changes and no sheet is created', () => {
  const { sb } = fixture();
  const before = JSON.stringify(sb.sheets);
  const sheetNames = Object.keys(sb.sheets).sort();
  preview(sb); preview(sb, '2026-10-01', '2026-10-31');
  assert.equal(JSON.stringify(sb.sheets), before);
  assert.deepEqual(Object.keys(sb.sheets).sort(), sheetNames);
});

test('with no bank data at all it returns an empty preview and creates nothing', () => {
  const sb = createSandbox({});
  const result = preview(sb);
  assert.equal(result.summary.transactionCount, 0);
  assert.equal(Object.keys(sb.sheets).length, 0, 'no sheet may be created by a preview');
});

test('repeat previews give identical results (idempotent)', () => {
  const { sb } = fixture();
  const strip = r => JSON.stringify({ s: r.summary, p: r.proposals });
  assert.equal(strip(preview(sb)), strip(preview(sb)));
});

test('the existing Money Movements summary still separates the new spending types correctly', () => {
  const { sb } = fixture();
  const summary = sb.json('PayTrackerMoneyMovementsSummaryService.getSummary()');
  assert.equal(summary.spendingTotal, 123, 'the two seeded Bill Payment rows');
  assert.equal(summary.movementCount, 2);
});

console.log(`Cash flow preview scenarios: ${passed}/${passed} passed.`);
