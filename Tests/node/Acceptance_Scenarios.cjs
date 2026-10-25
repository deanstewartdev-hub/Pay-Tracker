'use strict';
/**
 * The staging acceptance self-check (runPayTrackerAcceptanceChecks) on an in-memory
 * "staging" spreadsheet: it must report correctly AND change nothing.
 */
process.env.TZ = 'Europe/London';
const assert = require('node:assert/strict');
const { createSandbox } = require('./gas-sandbox.cjs');

let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }

function staging(name) {
  const sb = createSandbox({ stubLayout: true });
  sb.run(`var __name = ${JSON.stringify(name)}; var __real = SpreadsheetApp.getActiveSpreadsheet;
    SpreadsheetApp.getActiveSpreadsheet = function () { return Object.assign({}, __real(), { getName: function () { return __name; } }); };
    PayTrackerUtils = Object.assign({}, PayTrackerUtils, { getPaySheet: function () { return __pay; } });`);
  sb.context.__pay = sb.paySheet;
  return sb;
}
const byName = (report, text) => report.checks.find(c => c.name.indexOf(text) !== -1);

test('on an empty staging copy every automated check runs, and nothing is written', () => {
  const sb = staging('Pay Tracker STAGING v3.3');
  const days = Array.from({ length: 7 }, (_, i) => sb.date(2026, 9, 5 + i));
  sb.seedWeek(days[0]);
  sb.setCalendars({ 'dean99992011@gmail.com': [sb.event('NHS Antrim 10-6', sb.date(2026, 9, 7, 10), sb.date(2026, 9, 7, 18), { id: 'a' })] });
  sb.sync();
  const before = JSON.stringify(sb.sheets) + JSON.stringify(sb.paySheet.rows);
  const report = sb.json('runPayTrackerAcceptanceChecks()');
  assert.equal(JSON.stringify(sb.sheets) + JSON.stringify(sb.paySheet.rows), before, 'read-only');
  assert.equal(byName(report, 'staging copy').status, 'PASS');
  assert.equal(byName(report, '4 shifts x 2 hospitals').status, 'PASS');
  assert.ok(report.checks.filter(c => c.area === 'Payroll' && /Night|NHS 7.5|split/.test(c.name)).every(c => c.status === 'PASS'));
  assert.equal(byName(report, '7 Oct').status, 'PASS', 'the imported 7 Oct shift is found');
  assert.equal(byName(report, '15 Oct').status, 'REVIEW', 'not imported in this fixture, so flagged for review');
  assert.equal(byName(report, 'Monzo not connected').status, 'PASS');
  assert.ok(report.checks.length >= 15);
});

test('with the Staffline sheets already set up (as on a real copy) the reconciliation is read and nothing is written', () => {
  const sb = staging('Pay Tracker STAGING v3.3');
  sb.run('PayTrackerReconciliationSetupService.setup(); PayTrackerStafflineSetupService.setup();');
  const before = JSON.stringify(sb.sheets);
  const report = sb.json('runPayTrackerAcceptanceChecks()');
  assert.equal(JSON.stringify(sb.sheets), before, 'read-only');
  const staffline = report.checks.find(c => c.area === 'Staffline');
  assert.equal(staffline.status, 'PASS', staffline.detail);
  assert.match(staffline.detail, /0 of 0 rows/);
});

test('the production spreadsheet is flagged, not passed', () => {
  const sb = staging('Pay Tracker');
  const report = sb.json('runPayTrackerAcceptanceChecks()');
  assert.equal(byName(report, 'staging copy').status, 'FAIL');
});

test('duplicate Monzo transaction IDs are reported as a failure', () => {
  const sb = staging('Pay Tracker STAGING');
  const name = sb.run('PayTrackerFinanceIntegrationConfig.SHEETS.BANK_TRANSACTIONS.NAME');
  const headers = sb.json('PayTrackerFinanceIntegrationConfig.SHEETS.BANK_TRANSACTIONS.HEADERS');
  const sheet = sb.getSheet(name);
  sheet.rows.push(headers, ['tx_1'], ['tx_2'], ['tx_1']);
  const report = sb.json('runPayTrackerAcceptanceChecks()');
  const check = byName(report, 'duplicate Monzo');
  assert.equal(check.status, 'FAIL');
  assert.match(check.detail, /tx_1/);
});

console.log(`Acceptance scenarios: ${passed}/${passed} passed.`);
