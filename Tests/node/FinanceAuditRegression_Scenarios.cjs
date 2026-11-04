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

const debtRow = (paymentId, dueDate, amountDue = 77, paid = false) => ({
  paymentId, itemId: 'DEBT-2', billOrDebtName: 'Credit Union', paymentType: 'Debt Repayment',
  dueDate, amountDue, paid
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

// Monzo connection state: mocked inputs only. No token value, no Monzo request, no sheet access.
const NOW = '2026-11-04T12:00:00.000Z';
const monzo = (input) => sb.json('PayTrackerMonzoConnectionState.derive(' + JSON.stringify({ now: NOW, ...input }) + ')');
const RECENT = '2026-11-04T09:00:00.000Z';
const OLD = '2026-10-23T09:00:00.000Z';

test('token present, recent successful sync, no error: CONNECTED and usable', () => {
  const s = monzo({ hasToken: true, storedStatus: 'Connected', lastSuccess: RECENT, error: '' });
  assert.equal(s.state, 'CONNECTED');
  assert.equal(s.usable, true);
});

test('Bank Connections still says Connected but no token: DISCONNECTED, not usable', () => {
  const s = monzo({ hasToken: false, storedStatus: 'Connected', lastSuccess: RECENT, error: '' });
  assert.equal(s.state, 'DISCONNECTED');
  assert.equal(s.usable, false);
});

test('a stored Disconnected status is not usable, even with a recent sync time', () => {
  const s = monzo({ hasToken: true, storedStatus: 'Disconnected', lastSuccess: RECENT, error: '' });
  assert.equal(s.usable, false);
  assert.equal(s.state, 'DISCONNECTED');
});

test('last sync errored: UNAVAILABLE (previously connected, currently unavailable)', () => {
  const s = monzo({ hasToken: true, storedStatus: 'Error', lastSuccess: RECENT, error: 'Monzo returned 500' });
  assert.equal(s.state, 'UNAVAILABLE');
  assert.match(s.detail, /last sync failed/);
});

test('reauthorisation required: UNAVAILABLE with the reason', () => {
  const s = monzo({ hasToken: true, storedStatus: 'Reauthorisation Required', lastSuccess: RECENT, error: '' });
  assert.equal(s.state, 'UNAVAILABLE');
  assert.match(s.detail, /reauthorisation is needed/);
});

test('an old successful sync: still CONNECTED (credentials usable), but freshness STALE', () => {
  const s = monzo({ hasToken: true, storedStatus: 'Connected', lastSuccess: OLD, error: '' });
  assert.equal(s.state, 'CONNECTED');
  assert.equal(s.usable, true);
  assert.equal(s.freshness, 'STALE');
  assert.equal(s.status, 'Connected · data out of date');
  assert.match(s.detail, /out of date/);
});

test('token present, never synced: CONNECTED with freshness NONE, no sync time', () => {
  const s = monzo({ hasToken: true, storedStatus: 'Connected', lastSuccess: '', error: '' });
  assert.equal(s.state, 'CONNECTED');
  assert.equal(s.freshness, 'NONE');
  assert.equal(s.lastSuccess, '');
});

test('no token and no successful sync ever: NEVER, "Never connected"', () => {
  const s = monzo({ hasToken: false, storedStatus: 'Not Connected', lastSuccess: '', error: '' });
  assert.equal(s.state, 'NEVER');
  assert.equal(s.status, 'Never connected');
});

test('a sync time in the future is not trusted as fresh (STALE), connection still usable', () => {
  const s = monzo({ hasToken: true, storedStatus: 'Connected', lastSuccess: '2026-11-05T09:00:00.000Z', error: '' });
  assert.equal(s.freshness, 'STALE');
  assert.equal(s.usable, true);
});

test('a stale connection never verifies a pot balance, even when the connection is usable', () => {
  const bank = { status: 'Connected', lastSuccess: OLD, message: '' };
  const sync = sb.json('PayTrackerSavingsDashboardService.monzoSyncFromBank(' + JSON.stringify(bank) + ', true, new Date("' + NOW + '"))');
  const state = sb.json('PayTrackerMonzoPotSync.balanceState({ monzoPotId: "pot_linked" }, ' + JSON.stringify(sync) + ', new Date("' + NOW + '"))');
  assert.equal(sync.connected, true);
  assert.equal(state.verified, false);
});

test('the Savings pot sync treats every non-CONNECTED state as stale, never verified', () => {
  const bank = { status: 'Error', lastSuccess: RECENT, message: 'Monzo returned 500' };
  const sync = sb.json('PayTrackerSavingsDashboardService.monzoSyncFromBank(' + JSON.stringify(bank) + ', true, new Date("' + NOW + '"))');
  const pot = { monzoPotId: 'pot_linked' };
  const state = sb.json('PayTrackerMonzoPotSync.balanceState(' + JSON.stringify(pot) + ', ' + JSON.stringify(sync) + ', new Date("' + NOW + '"))');
  assert.equal(state.verified, false);
  assert.equal(state.label, 'Stored balance — not currently synced');
});

test('the Savings pot sync shows a verified balance only for a CONNECTED state', () => {
  const bank = { status: 'Connected', lastSuccess: RECENT, message: '' };
  const sync = sb.json('PayTrackerSavingsDashboardService.monzoSyncFromBank(' + JSON.stringify(bank) + ', true, new Date("' + NOW + '"))');
  const state = sb.json('PayTrackerMonzoPotSync.balanceState({ monzoPotId: "pot_linked" }, ' + JSON.stringify(sync) + ', new Date("' + NOW + '"))');
  assert.equal(state.verified, true);
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

test('a future duplicate pair in this month is counted once', () => {
  const r = calculate({ ...base, debts: [], payments: [debtRow('P11', '2026-11-27'), debtRow('P12', '2026-11-27')] });
  assert.equal(r.committed.debts, 77);
});

test('a Debts-sheet step on the same date as a payment row is counted once', () => {
  const r = calculate({ ...base, debts: creditUnionDebt,
    payments: [debtRow('P11', '2026-10-30'), debtRow('P12', '2026-10-30'), debtRow('P13', '2026-11-13')] });
  const days = r.committed.items.filter((i) => i.name === 'Credit Union').map((i) => i.dueDate);
  assert.deepEqual(days, ['2026-11-06', '2026-11-13', '2026-11-20', '2026-11-27']);
  assert.equal(r.committed.debts, 308);
});

test('a paid duplicate is ignored and the unpaid row is counted once', () => {
  const paidCopy = { ...debtRow('P12', '2026-11-10'), paid: true };
  const r = calculate({ ...base, debts: [], payments: [debtRow('P11', '2026-11-10'), paidCopy] });
  assert.equal(r.committed.debts, 77);
});

test('same debt and date with different amounts is not merged, and is flagged', () => {
  const r = calculate({ ...base, debts: [], payments: [debtRow('P11', '2026-11-10', 77), debtRow('P12', '2026-11-10', 40)] });
  assert.equal(r.committed.debts, 117, 'both amounts kept: not provably the same obligation');
  assert.ok(r.warnings.some((w) => /Credit Union.*different amounts/.test(w)), 'warning present');
});

// Finance Bank Connections: a stored "Connected" label is not trusted without a token and a recent sync.
// The placeholder token is a fixture value used only to test presence; it is never shown or sent.
const bankSheetName = sb.json('PayTrackerFinanceIntegrationConfig.SHEETS.BANK_CONNECTIONS.NAME');
const bankHeaders = sb.json('PayTrackerFinanceIntegrationConfig.SHEETS.BANK_CONNECTIONS.HEADERS');
const tokenProperty = sb.json('PayTrackerMonzoService.ACCESS_TOKEN_PROPERTY');
function setBankRow(values) {
  const sheet = sb.getSheet(bankSheetName);
  sheet.rows.length = 0;
  sheet.rows.push(bankHeaders.slice());
  const row = new Array(bankHeaders.length).fill('');
  Object.entries(values).forEach(([index, value]) => { row[Number(index)] = value; });
  sheet.rows.push(row);
}
function bankStatus(hasToken) {
  sb.run('PropertiesService.getUserProperties().deleteProperty(PayTrackerMonzoService.ACCESS_TOKEN_PROPERTY)');
  if (hasToken) sb.run('PropertiesService.getUserProperties().setProperty(PayTrackerMonzoService.ACCESS_TOKEN_PROPERTY, "fixture")');
  return sb.json('PayTrackerWebFinanceWorkspaceService.getBankStatus(SpreadsheetApp.getActiveSpreadsheet())');
}
const recentIso = new Date().toISOString();
test('Bank Connections: stored Connected with no token is shown as Disconnected, not connected', () => {
  setBankRow({ 1: 'Monzo', 3: 'Current', 6: 'Connected', 8: recentIso, 10: '' });
  const s = bankStatus(false);
  assert.equal(s.connected, false);
  assert.equal(s.status, 'Disconnected');
  assert.equal(s.storedStatus, 'Connected');
});

test('Bank Connections: token present and a recent successful sync is Connected', () => {
  setBankRow({ 1: 'Monzo', 3: 'Current', 6: 'Connected', 8: recentIso, 10: '' });
  const s = bankStatus(true);
  assert.equal(s.connected, true);
  assert.equal(s.status, 'Connected');
});

test('Bank Connections: token present but last sync errored is Unavailable, not connected', () => {
  setBankRow({ 1: 'Monzo', 3: 'Current', 6: 'Error', 8: recentIso, 10: 'Monzo returned 500' });
  const s = bankStatus(true);
  assert.equal(s.connected, false);
  assert.equal(s.status, 'Unavailable');
});

// History cap: only settled history is capped. An old unpaid bill must not be dropped
// (the Road Tax 540 due 17 Jul was lost once 40 newer paid items filled the cap).
function timelineWithSettledHistory(count) {
  const sources = {
    bills: [
      { billId: 'B-ROAD', billName: 'Road Tax', amount: 640, frequency: 'Annual', nextDueDate: '2026-07-17', active: 'Yes' },
      { billId: 'B-BD', billName: 'Birthday Draw', amount: 1, frequency: 'Weekly', nextDueDate: '2026-08-17', active: 'Yes' }
    ],
    payments: [{ paymentId: 'P-ROAD', itemId: 'B-ROAD', billOrDebtName: 'Road Tax', paymentType: 'Bill Payment',
      dueDate: '2026-07-17', amountDue: 540, paid: false, status: 'Upcoming' }],
    paymentHistory: [], bankTransactions: [], subscriptions: [], subscriptionLinks: []
  };
  for (let i = 0; i < count; i++) {
    const day = new Date(Date.UTC(2026, 6, 20 + i)).toISOString().slice(0, 10);
    sources.paymentHistory.push({ paymentId: 'H' + i, itemId: 'B-BD', billOrDebtName: 'Birthday Draw', paymentType: 'Bill Payment',
      originalDueDate: day, paidDate: day, amountPaid: 1, undoStatus: '' });
  }
  return sb.json('(function () { var m = PayTrackerPaymentTimeline.buildSeries(' + JSON.stringify(sources) + '); ' +
    'return PayTrackerPaymentTimeline.present(m, "2026-11-04", {}); })()');
}

test('an unpaid bill from 17 July is kept in history even when 45 newer paid items exist', () => {
  const view = timelineWithSettledHistory(45);
  const road = view.history.filter((i) => i.name === 'Road Tax' && i.settled === false);
  assert.equal(road.length, 1, 'the unsettled Road Tax occurrence is still listed');
  assert.equal(road[0].dueDate, '2026-07-17');
});

test('settled history is still capped at 40 per kind', () => {
  const view = timelineWithSettledHistory(60);
  const settled = view.history.filter((i) => i.kind === 'Bill' && i.settled === true);
  assert.ok(settled.length <= 40, 'settled bill history is capped (got ' + settled.length + ')');
});

// Recorded vs projected liabilities: shown separately, and the maximum-exposure total is deducted once.
test('recorded and projected liabilities are subtotalled separately and deducted once in the maximum-exposure figure', () => {
  const r = calculate({
    ...base,
    debts: [],
    payments: [],
    pastDue: [
      { kind: 'Bill', name: 'Recorded bill', dueDate: '2026-10-02', amount: 77, status: 'Unverified', daysRemaining: -33, recordedRow: true },
      { kind: 'Bill', name: 'Projected bill', dueDate: '2026-10-09', amount: 20, status: 'Unverified', daysRemaining: -26, recordedRow: false }
    ]
  });
  assert.equal(r.potentialLiabilities.recordedTotal, 77, 'recorded subtotal');
  assert.equal(r.potentialLiabilities.projectedTotal, 20, 'projection subtotal');
  assert.equal(r.potentialLiabilities.total, 97, 'total is the sum, counted once');
  assert.equal(r.conservativeDisposable, r.disposable - 97, 'maximum exposure deducts the total once');
  assert.ok(r.warnings.some((w) => /maximum-exposure scenario, unverified assumptions/.test(w)), 'labelled as a maximum-exposure scenario');
});

// Past-due planned contributions are not "this month" and never change available savings.
test('a planned contribution from before this month is listed as overdue, not as this month\'s plan', () => {
  const contribution = { contributionId: 'C1', potId: 'POT-HD', potName: 'House Deposit', dueDate: '2026-06-17',
    contributionAmount: 354.91, deposited: false, status: 'Pending' };
  const withOld = calculate({ ...base, debts: [], payments: [], contributions: [contribution] });
  const without = calculate({ ...base, debts: [], payments: [], contributions: [] });
  assert.equal(withOld.confirmations.length, 0, 'not in this month\'s planned contributions');
  assert.equal(withOld.overdueContributions.length, 1, 'listed as overdue');
  assert.equal(withOld.disposable, without.disposable, 'available money unchanged');
  assert.equal(withOld.savedTowardsTarget, without.savedTowardsTarget, 'not counted as saved');
  assert.ok(withOld.warnings.some((w) => /due before this month/.test(w)), 'warning present');
});

// Action Centre: a debt row for a repayment already listed as a bill occurrence is one line, not two.
test('a debt row duplicating a bill occurrence is not listed as a separate debt', () => {
  const sources = {
    bills: [{ billId: 'B-UCL', billName: 'Univeral Credit Loan', amount: 77, frequency: 'Weekly', nextDueDate: '2026-10-30', active: 'Yes' }],
    payments: [
      { paymentId: 'P-BILL', itemId: 'B-UCL', billOrDebtName: 'Univeral Credit Loan', paymentType: 'Bill Payment', dueDate: '2026-10-30', amountDue: 77, paid: false, status: 'Upcoming' },
      { paymentId: 'P-DEBT', itemId: 'D-UCL', billOrDebtName: 'Univeral Credit Loan', paymentType: 'Debt Repayment', dueDate: '2026-10-30', amountDue: 77, paid: false, status: 'Upcoming' }
    ],
    paymentHistory: [], bankTransactions: [], subscriptions: [], subscriptionLinks: []
  };
  const view = sb.json('(function () { var m = PayTrackerPaymentTimeline.buildSeries(' + JSON.stringify(sources) + '); ' +
    'return PayTrackerPaymentTimeline.present(m, "2026-11-04", {}); })()');
  const lines = view.risks.filter((risk) => /Univeral/.test(risk.name));
  assert.equal(lines.length, 1, 'one Action Centre line for the repayment');
  assert.equal(lines.reduce((s, risk) => s + risk.count, 0), 1, 'counted once');
});

// Recorded flag: an occurrence is "recorded" only when a Finance Payments row exists for its due date.
test('an occurrence is marked recorded only when a Finance Payments row exists for its due date', () => {
  const sources = {
    bills: [{ billId: 'B-PH', billName: 'Phone Bill', amount: 10, frequency: 'Monthly', nextDueDate: '2026-09-01', active: 'Yes' }],
    payments: [{ paymentId: 'P-PH', itemId: 'B-PH', billOrDebtName: 'Phone Bill', paymentType: 'Bill Payment', dueDate: '2026-09-01', amountDue: 10, paid: false, status: 'Upcoming' }],
    paymentHistory: [], bankTransactions: [], subscriptions: [], subscriptionLinks: []
  };
  const view = sb.json('(function () { var m = PayTrackerPaymentTimeline.buildSeries(' + JSON.stringify(sources) + '); ' +
    'return PayTrackerPaymentTimeline.present(m, "2026-11-04", {}); })()');
  const phone = view.history.filter((i) => i.name === 'Phone Bill' && i.settled === false);
  assert.equal(phone.find((i) => i.dueDate === '2026-09-01').recordedRow, true, 'the row-backed occurrence is recorded');
  assert.equal(phone.find((i) => i.dueDate === '2026-10-01').recordedRow, false, 'the projected occurrence is not');
});

// Every unsettled past occurrence is listed in the Action Centre, however old (no list limit by age).
test('every unsettled past occurrence is listed, however old', () => {
  const sources = {
    bills: [{ billId: 'B-OLD', billName: 'Old Subscription Bill', amount: 5, frequency: 'Monthly', nextDueDate: '2026-01-01', active: 'Yes' }],
    payments: [], paymentHistory: [], bankTransactions: [], subscriptions: [], subscriptionLinks: []
  };
  const view = sb.json('(function () { var m = PayTrackerPaymentTimeline.buildSeries(' + JSON.stringify(sources) + '); ' +
    'return PayTrackerPaymentTimeline.present(m, "2026-11-04", {}); })()');
  const risk = view.risks.filter((r) => r.name === 'Old Subscription Bill')[0];
  // Jan to Oct 2026 are ten monthly occurrences before today; all unsettled, all listed.
  assert.equal(risk.count, 10, 'all ten unsettled occurrences are listed');
});

const failed = results.filter((r) => !r.ok).length;
console.log('Finance audit regressions: ' + (results.length - failed) + '/' + results.length + ' passed.');
module.exports = { results };
if (require.main === module) process.exit(failed ? 1 : 0);
