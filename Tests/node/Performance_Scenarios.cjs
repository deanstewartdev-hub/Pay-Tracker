'use strict';
/**
 * Pins the v3.3 responsiveness rules (structural, not timings: real Apps Script timings
 * can only be measured on a deployment).
 *  - "Check Monzo now" runs only the Monzo transactions task.
 *  - Cached Upcoming Payments open no sheet; a rebuild opens each source sheet once.
 *  - The browser never waits for the startup sync to show Upcoming Payments.
 *  - Startup backgrounds a slow sync, and a failed background sync is shown to the user.
 *  - Revisiting a page does not reload it unless forced.
 */
process.env.TZ = 'Europe/London';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSandbox, ROOT } = require('./gas-sandbox.cjs');

let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }
const source = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

function withRecordingRunners() {
  const sb = createSandbox({ stubLayout: true });
  sb.run(`var __ran = []; var __r = {}; Object.keys(PayTrackerSyncService.RUNNERS).forEach(function (id) {
    __r[id] = function () { __ran.push(id); return { status: 'Updated', created: 0, updated: 0, skipped: 0, message: 'stub' }; }; });
    PayTrackerSyncService = Object.assign({}, PayTrackerSyncService, { RUNNERS: __r });`);
  return sb;
}

test('"Check Monzo now" runs only MONZO_TRANSACTIONS; a page load runs no costly task; a manual full pass runs every task', () => {
  const sb = withRecordingRunners();
  sb.json('runPayTrackerSync({ triggerSource: "MANUAL", taskIds: ["MONZO_TRANSACTIONS"], force: true })');
  assert.deepEqual(sb.json('__ran'), ['MONZO_TRANSACTIONS']);
  sb.run('__ran.length = 0');
  sb.json('runPayTrackerSync({ triggerSource: "STARTUP", force: true })');
  assert.deepEqual(sb.json('__ran'), ['RECONCILIATION']);
  sb.run('__ran.length = 0');
  sb.json('runPayTrackerSync({ triggerSource: "MANUAL", force: true })');
  assert.ok(sb.json('__ran').length >= 7);
  const ui = source('Frontend/Services/UpcomingPaymentsService.html');
  assert.match(ui, /taskIds: \['MONZO_TRANSACTIONS'\]/, 'the button asks for the Monzo task only');
});

test('Upcoming Payments: a cached read opens no sheet; a rebuild opens each source once', () => {
  const sb = createSandbox({});
  sb.run(`var __cache = {}; var __opens = 0; CacheService = { getScriptCache: function () { return {
      get: function (k) { return Object.prototype.hasOwnProperty.call(__cache, k) ? __cache[k] : null; },
      put: function (k, v) { __cache[k] = v; }, remove: function (k) { delete __cache[k]; } }; } };
    var __real = SpreadsheetApp.getActiveSpreadsheet; SpreadsheetApp.getActiveSpreadsheet = function () { var s = __real();
      return Object.assign({}, s, { getSheetByName: function (n) { __opens++; return s.getSheetByName(n); } }); };`);
  sb.json('getPayTrackerUpcomingPayments({})');
  assert.equal(sb.json('__opens'), 7);
  sb.json('getPayTrackerUpcomingPayments({})');
  sb.json('getPayTrackerUpcomingPayments({ kind: "Bill" })');
  assert.equal(sb.json('__opens'), 7, 'two cached reads opened nothing');
});

test('the browser shows Upcoming Payments without waiting for the startup sync', () => {
  const ui = source('Frontend/Services/UpcomingPaymentsService.html');
  assert.doesNotMatch(ui, /getStartupSyncPromise/);
  assert.match(ui, /service\.load\(false\)\.then\(function\(\) \{ return service\.load\(true\); \}\)/, 'cached first, then a background rebuild');
  const smart = source('Frontend/Services/SmartSavingsService.html');
  assert.doesNotMatch(smart, /getStartupSyncPromise/);
});

test('startup backgrounds a slow sync, and background results and failures reach the user', () => {
  const app = source('Frontend/App/AppController.html');
  assert.match(app, /'STARTUP',[\s\S]{0,200}autoContinueAfterMs: 4000/);
  assert.match(app, /'Background sync did not finish: '/);
  assert.match(app, /failed \? 'warning' : 'info'/);
  assert.match(app, /new CustomEvent\('paytracker:syncfinished'/);
});

test('revisiting a page does not reload it unless forced', () => {
  for (const file of ['Frontend/Services/FinanceWorkspaceService.html', 'Frontend/Services/SavingsWorkspaceService.html']) {
    assert.match(source(file), /state\.loaded &&\s*force !== true/, file);
  }
  assert.match(source('Frontend/Services/DashboardService.html'), /route === 'dashboard' &&\s*!PayTrackerDashboardService\s*\.state\s*\.loaded/);
  assert.match(source('Frontend/Services/SmartSavingsService.html'), /route === 'savings' && !service\.loaded/);
});

console.log(`Performance scenarios: ${passed}/${passed} passed.`);
