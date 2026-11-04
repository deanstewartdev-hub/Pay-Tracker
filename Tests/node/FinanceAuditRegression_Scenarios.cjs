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

test('an old successful sync is out of date: UNAVAILABLE, never verified current', () => {
  const s = monzo({ hasToken: true, storedStatus: 'Connected', lastSuccess: OLD, error: '' });
  assert.equal(s.state, 'UNAVAILABLE');
  assert.equal(s.usable, false);
  assert.match(s.detail, /out of date/);
});

test('token present but never synced: UNAVAILABLE, no successful sync yet', () => {
  const s = monzo({ hasToken: true, storedStatus: 'Connected', lastSuccess: '', error: '' });
  assert.equal(s.state, 'UNAVAILABLE');
  assert.equal(s.lastSuccess, '');
});

test('no token and no successful sync ever: NEVER', () => {
  const s = monzo({ hasToken: false, storedStatus: 'Not Connected', lastSuccess: '', error: '' });
  assert.equal(s.state, 'NEVER');
  assert.equal(s.status, 'Not connected');
});

test('a sync time in the future is not trusted as current', () => {
  const s = monzo({ hasToken: true, storedStatus: 'Connected', lastSuccess: '2026-11-05T09:00:00.000Z', error: '' });
  assert.equal(s.usable, false);
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

const failed = results.filter((r) => !r.ok).length;
console.log('Finance audit regressions: ' + (results.length - failed) + '/' + results.length + ' passed.');
module.exports = { results };
if (require.main === module) process.exit(failed ? 1 : 0);
