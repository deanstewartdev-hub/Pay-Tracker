'use strict';
/**
 * Step 2B end-to-end: getPayTrackerUpcomingPayments() over in-memory copies of the real
 * Bills, Finance Payments, Payment History, Subscriptions, Subscription Transactions,
 * Bank Transactions and Sync Status sheets, with a working in-memory CacheService.
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

function fixture(options = {}) {
  const sb = createSandbox({});
  // A real (in-memory) script cache and a counter of every sheet the service opens.
  sb.run(`var __cache = {}; var __sheetOpens = [];
    CacheService = { getScriptCache: function () { return {
      get: function (k) { return Object.prototype.hasOwnProperty.call(__cache, k) ? __cache[k] : null; },
      put: function (k, v) { __cache[k] = v; }, remove: function (k) { delete __cache[k]; } }; } };
    var __realSpreadsheet = SpreadsheetApp.getActiveSpreadsheet;
    SpreadsheetApp.getActiveSpreadsheet = function () {
      var s = __realSpreadsheet();
      return Object.assign({}, s, { getSheetByName: function (n) { __sheetOpens.push(n); return s.getSheetByName(n); } });
    };`);
  const n = sb.json(`({
    bills: PayTrackerFinanceConfig.SHEETS.BILLS, billHeaders: PayTrackerFinanceConfig.BILLS.HEADERS,
    payments: PayTrackerFinanceConfig.SHEETS.PAYMENTS, paymentHeaders: PayTrackerFinanceConfig.PAYMENTS.HEADERS,
    history: PayTrackerFinanceConfig.SHEETS.PAYMENT_HISTORY, historyHeaders: PayTrackerFinanceConfig.PAYMENT_HISTORY.HEADERS,
    subs: PayTrackerFinanceIntegrationConfig.SHEETS.SUBSCRIPTIONS.NAME, subHeaders: PayTrackerFinanceIntegrationConfig.SHEETS.SUBSCRIPTIONS.HEADERS,
    links: PayTrackerFinanceIntegrationConfig.SHEETS.SUBSCRIPTION_TRANSACTIONS.NAME, linkHeaders: PayTrackerFinanceIntegrationConfig.SHEETS.SUBSCRIPTION_TRANSACTIONS.HEADERS,
    bank: PayTrackerFinanceIntegrationConfig.SHEETS.BANK_TRANSACTIONS.NAME, bankHeaders: PayTrackerFinanceIntegrationConfig.SHEETS.BANK_TRANSACTIONS.HEADERS,
    sync: PayTrackerSyncConfig.SHEET.NAME, syncHeaders: PayTrackerSyncConfig.SHEET.HEADERS
  })`);
  const d = (m, day) => sb.date(2026, m - 1, day);
  seed(sb, n.bills, n.billHeaders, [
    { 'Bill ID': 'BILL-RENT', 'Bill Name': 'Rent', 'Category': 'Housing', 'Amount': 650, 'Frequency': 'Monthly', 'Next Due Date': d(11, 1), 'Active': 'Yes' },
    { 'Bill ID': 'BILL-ENERGY', 'Bill Name': 'Energy', 'Category': 'Utilities', 'Amount': 85, 'Frequency': 'Monthly', 'Next Due Date': d(10, 20), 'Active': 'Yes' },
    { 'Bill ID': 'BILL-SPOTIFY', 'Bill Name': 'Spotify', 'Category': 'Subscriptions', 'Amount': 11.99, 'Frequency': 'Monthly', 'Next Due Date': d(10, 28), 'Active': 'Yes' },
    { 'Bill ID': 'BILL-OLD', 'Bill Name': 'Old phone', 'Amount': 20, 'Frequency': 'Monthly', 'Next Due Date': d(10, 25), 'Active': 'No' }
  ]);
  seed(sb, n.payments, n.paymentHeaders, [
    { 'Payment ID': 'PAY-RENT', 'Due Date': d(11, 1), 'Payment Type': 'Bill Payment', 'Item ID': 'BILL-RENT', 'Bill or Debt Name': 'Rent', 'Amount Due': 650, 'Paid?': false, 'Status': 'Upcoming' },
    { 'Payment ID': 'PAY-ENERGY', 'Due Date': d(10, 20), 'Payment Type': 'Bill Payment', 'Item ID': 'BILL-ENERGY', 'Bill or Debt Name': 'Energy', 'Amount Due': 85, 'Paid?': false, 'Status': 'Upcoming' },
    { 'Payment ID': 'PAY-SPOTIFY', 'Due Date': d(10, 28), 'Payment Type': 'Bill Payment', 'Item ID': 'BILL-SPOTIFY', 'Bill or Debt Name': 'Spotify', 'Amount Due': 11.99, 'Paid?': options.spotifyTicked === true, 'Status': 'Upcoming' },
    { 'Payment ID': 'PAY-LOAN', 'Due Date': d(10, 26), 'Payment Type': 'Debt Repayment', 'Item ID': 'DEBT-1', 'Bill or Debt Name': 'Loan', 'Amount Due': 120, 'Paid?': false }
  ]);
  seed(sb, n.history, n.historyHeaders, [
    { 'Payment ID': 'H1', 'Original Due Date': d(9, 20), 'Paid Date': d(9, 21), 'Payment Type': 'Bill Payment', 'Item ID': 'BILL-ENERGY', 'Bill or Debt Name': 'Energy', 'Amount Paid': 82 }
  ]);
  seed(sb, n.subs, n.subHeaders, [
    { 'Subscription ID': 'SUB-NETFLIX', 'Subscription Name': 'Netflix', 'Frequency': 'Monthly', 'Latest Amount': 12.99, 'Next Expected Date': d(10, 30), 'Review Status': 'Confirmed', 'Subscription Status': 'Active', 'Price Change Amount': 2 },
    { 'Subscription ID': 'SUB-SPOTIFY', 'Subscription Name': 'Spotify', 'Frequency': 'Monthly', 'Latest Amount': 11.99, 'Next Expected Date': d(10, 28), 'Linked Bill ID': 'BILL-SPOTIFY', 'Review Status': 'Confirmed', 'Subscription Status': 'Active' },
    { 'Subscription ID': 'SUB-ICLOUD', 'Subscription Name': 'iCloud', 'Frequency': 'Monthly', 'Latest Amount': 2.99, 'Next Expected Date': d(10, 22), 'Review Status': 'Confirmed', 'Subscription Status': 'Active' },
    { 'Subscription ID': 'SUB-NEW', 'Subscription Name': 'Mystery', 'Frequency': 'Monthly', 'Latest Amount': 4, 'Next Expected Date': d(10, 29), 'Review Status': 'Needs Review', 'Subscription Status': 'Active' }
  ]);
  seed(sb, n.links, n.linkHeaders, [
    { 'Link ID': 'L1', 'Subscription ID': 'SUB-ICLOUD', 'Transaction ID': 'tx_icloud', 'Payment Date': d(10, 22), 'Amount': 2.99, 'Confirmed': true },
    { 'Link ID': 'L0', 'Subscription ID': 'SUB-NETFLIX', 'Transaction ID': 'tx_nf_sep', 'Payment Date': d(9, 30), 'Amount': 10.99, 'Confirmed': true }
  ]);
  seed(sb, n.bank, n.bankHeaders, [
    { 'Transaction ID': 'tx_energy', 'Settled At': d(10, 21), 'Amount': 85, 'Debit or Credit': 'Debit', 'Matched Finance Type': 'Bill Payment', 'Matched Finance ID': 'PAY-ENERGY', 'Match Status': options.energyMatch || 'Confirmed' }
  ]);
  if (options.syncRow !== false) {
    seed(sb, n.sync, n.syncHeaders, [{ 'Task ID': 'MONZO_TRANSACTIONS', 'Last Success': sb.date(2026, 9, 23, 8, 15), 'Status': options.monzoStatus || 'Updated', 'Message': options.monzoMessage || '3 new transactions' }]);
  }
  return { sb, n };
}

// Freeze "today" at 23 Oct 2026 09:00 inside the sandbox.
function at(sb, y, m, day, h = 9) {
  sb.run(`(function () { var R = Date; var fixed = new R(${y}, ${m - 1}, ${day}, ${h}).getTime();
    function D() { return arguments.length ? new (Function.prototype.bind.apply(R, [null].concat([].slice.call(arguments))))() : new R(fixed); }
    D.prototype = R.prototype; D.UTC = R.UTC; D.parse = R.parse; D.now = function () { return fixed; }; Date = D; })()`);
}
const call = (sb, input) => sb.json(`getPayTrackerUpcomingPayments(${JSON.stringify(input || {})})`);
const names = r => r.upcoming.map(i => i.name + '@' + i.dueDate);

test('Overview: next five bills and subscriptions, ordered by date, with statuses', () => {
  const { sb } = fixture(); at(sb, 2026, 10, 23);
  const r = call(sb, { limit: 5 });
  assert.equal(r.success, true);
  assert.deepEqual(names(r), ['Spotify@2026-10-28', 'Netflix@2026-10-30', 'Rent@2026-11-01', 'iCloud@2026-11-22', 'Energy@2026-11-20'].sort((a, b) => a.split('@')[1].localeCompare(b.split('@')[1])));
  assert.equal(r.upcoming[0].kind, 'Bill', 'Spotify is the bill, not also a subscription');
  assert.equal(r.upcoming[0].countdown, 'In 5 days');
  assert.ok(!names(call(sb)).some(x => x.startsWith('Loan')), 'debts are not bills or subscriptions');
  assert.ok(!names(call(sb)).some(x => x.startsWith('Old phone') || x.startsWith('Mystery')));
});

test('confirmed by bank: Energy (Confirmed match) and iCloud (confirmed link) are in history, next ones upcoming', () => {
  const { sb } = fixture(); at(sb, 2026, 10, 23);
  const r = call(sb);
  assert.deepEqual(r.history.map(h => h.name + ':' + h.paidDate), ['iCloud:2026-10-22', 'Energy:2026-10-21', 'Netflix:2026-09-30', 'Energy:2026-09-21']);
  assert.equal(r.upcoming.filter(i => i.name === 'Energy')[0].dueDate, '2026-11-20');
  assert.equal(r.upcoming.filter(i => i.name === 'iCloud')[0].dueDate, '2026-11-22');
});

test('a Suggested (unconfirmed) bank match keeps Energy visible as Needs review, not paid', () => {
  const { sb } = fixture({ energyMatch: 'Suggested' }); at(sb, 2026, 10, 23);
  const energy = call(sb).upcoming.filter(i => i.name === 'Energy');
  assert.equal(energy[0].dueDate, '2026-10-20');
  assert.equal(energy[0].status, 'Needs review');
  assert.equal(energy[0].paymentId, 'PAY-ENERGY');
});

test('no bank match: Energy is Awaiting confirmation, then Overdue - never silently paid', () => {
  const { sb } = fixture({ energyMatch: 'Unmatched' }); at(sb, 2026, 10, 23);
  assert.equal(call(sb).upcoming[0].status, 'Awaiting confirmation');
  const later = fixture({ energyMatch: 'Unmatched' }); at(later.sb, 2026, 10, 27);
  assert.equal(call(later.sb).upcoming[0].status, 'Overdue');
});

test('the Paid? tick on the Finance Payments row is honoured', () => {
  const { sb } = fixture({ spotifyTicked: true }); at(sb, 2026, 10, 23);
  const r = call(sb);
  assert.ok(r.history.some(h => h.name === 'Spotify'));
  assert.equal(r.upcoming.filter(i => i.name === 'Spotify')[0].dueDate, '2026-11-28');
});

test('7 and 30 day totals', () => {
  const { sb } = fixture(); at(sb, 2026, 10, 23);
  const t = call(sb).totals;
  // "Next 7 days" = today plus the following 6 (23-29 Oct): Netflix on the 30th is day 8.
  assert.deepEqual(t.next7Days, { amount: 11.99, count: 1, outstandingCount: 0, unknownAmountCount: 0 }, 'Spotify only');
  // 30 days = 23 Oct - 21 Nov: Spotify, Netflix, Rent, Energy (20 Nov); iCloud on 22 Nov is day 31.
  assert.equal(t.next30Days.amount, 759.98);
  assert.equal(t.next30Days.count, 4);
});

test('Bills and Subscriptions pages use the same timeline, filtered, never overlapping', () => {
  const { sb } = fixture(); at(sb, 2026, 10, 23);
  const bills = call(sb, { kind: 'Bill' });
  const subs = call(sb, { kind: 'Subscription' });
  assert.ok(bills.upcoming.every(i => i.kind === 'Bill') && subs.upcoming.every(i => i.kind === 'Subscription'));
  assert.deepEqual(subs.upcoming.map(i => i.name).sort(), ['Netflix', 'iCloud']);
  assert.equal(bills.upcoming.length + subs.upcoming.length, call(sb).upcoming.length);
  assert.ok(subs.history.every(h => h.kind === 'Subscription'));
  assert.equal(subs.upcoming.filter(i => i.name === 'Netflix')[0].priceChange, 2);
});

test('cache: the second call reads no sheet; dates still advance; a refresh rebuilds', () => {
  const { sb } = fixture(); at(sb, 2026, 10, 23);
  const first = call(sb);
  assert.equal(first.source, 'live');
  const opensAfterBuild = sb.json('__sheetOpens.length');
  assert.equal(opensAfterBuild, 7, 'one read per source sheet');
  at(sb, 2026, 10, 29);
  const second = call(sb);
  assert.equal(second.source, 'cache');
  assert.equal(sb.json('__sheetOpens.length'), opensAfterBuild, 'a cached read opens no sheet');
  assert.equal(second.today, '2026-10-29');
  assert.equal(second.upcoming[0].name, 'Spotify');
  assert.equal(second.upcoming[0].status, 'Awaiting confirmation', 'status recomputed for the new day');
  assert.equal(call(sb, { refresh: true }).source, 'live');
});

test('a Finance workspace action or Monzo sync invalidates the cache', () => {
  const { sb } = fixture(); at(sb, 2026, 10, 23);
  call(sb);
  assert.equal(call(sb).source, 'cache');
  sb.run('PayTrackerUpcomingPaymentsService.invalidate()');
  assert.equal(call(sb).source, 'live');
  const sources = require('node:fs').readFileSync(require('node:path').join(sb.ROOT, 'Backend/Web/FinanceWorkspaceService.js'), 'utf8');
  assert.match(sources, /function makePayTrackerFinanceResponseBrowserSafe\(data\) \{[\s\S]{0,400}PayTrackerUpcomingPaymentsService\.invalidate\(\)/);
  const sync = require('node:fs').readFileSync(require('node:path').join(sb.ROOT, 'Backend/Sync/SyncService.js'), 'utf8');
  assert.match(sync, /PayTrackerMonzoService\.sync\(\);[\s\S]{0,200}PayTrackerUpcomingPaymentsService\.invalidate\(\)/);
});

test('strictly read-only: no cell changes and no sheet created', () => {
  const { sb } = fixture(); at(sb, 2026, 10, 23);
  const before = JSON.stringify(sb.sheets);
  call(sb); call(sb, { refresh: true }); call(sb, { kind: 'Bill' });
  assert.equal(JSON.stringify(sb.sheets), before);
  const empty = createSandbox({});
  const r = empty.json('getPayTrackerUpcomingPayments({})');
  assert.equal(r.upcoming.length, 0);
  assert.equal(Object.keys(empty.sheets).length, 0, 'nothing created on an empty spreadsheet');
});

test('Monzo freshness and a disconnected Monzo are reported, not hidden', () => {
  const { sb } = fixture(); at(sb, 2026, 10, 23);
  const ok = call(sb).bank;
  assert.equal(ok.status, 'Updated');
  assert.equal(ok.lastSuccess, new Date(2026, 9, 23, 8, 15).toISOString());
  const off = fixture({ monzoStatus: 'Manual', monzoMessage: 'Monzo is not connected.' }); at(off.sb, 2026, 10, 23);
  assert.deepEqual(call(off.sb).bank.status, 'Manual');
  const never = fixture({ syncRow: false }); at(never.sb, 2026, 10, 23);
  assert.equal(call(never.sb).bank.status, 'Unknown');
});

test('the cached payload stays far below the 100KB CacheService limit for a realistic sheet', () => {
  const { sb, n } = fixture(); at(sb, 2026, 10, 23);
  const many = [];
  for (let i = 0; i < 150; i++) many.push({ 'Bill ID': 'B' + i, 'Bill Name': 'Bill number ' + i, 'Amount': 10 + i, 'Frequency': 'Monthly', 'Next Due Date': sb.date(2026, 10, 1 + (i % 28)), 'Active': 'Yes' });
  seed(sb, n.bills, n.billHeaders, many);
  call(sb, { refresh: true });
  const size = sb.json('JSON.stringify(PayTrackerUpcomingPaymentsService.readCache()).length');
  assert.ok(size < 60000, 'cached model is ' + size + ' bytes');
});

console.log(`Upcoming payments scenarios: ${passed}/${passed} passed.`);
