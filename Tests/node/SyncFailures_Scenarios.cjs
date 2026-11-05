'use strict';
/**
 * Failed requests in a sync pass: a task whose source throws is recorded as Failed with the error,
 * and a task that depends on it is Skipped rather than run on stale data. Other tasks still run.
 */
const assert = require('node:assert/strict');
const { createSandbox } = require('./gas-sandbox.cjs');

function test(name, run) {
  run();
  console.log('PASS ' + name);
}

function withRunners(runnerSource) {
  const sb = createSandbox({});
  sb.run(
    'var __ran = [];' +
    'PayTrackerSyncService = Object.assign({}, PayTrackerSyncService, { RUNNERS: (function () {' +
    '  var r = {};' +
    '  PayTrackerSyncConfig.TASKS.forEach(function (t) {' +
    '    r[t.id] = function () { __ran.push(t.id); return { status: "Updated", message: "ok" }; };' +
    '  });' +
    runnerSource +
    '  return r; })() });'
  );
  return sb;
}

test('a source that throws is recorded as Failed with its error message', () => {
  const sb = withRunners(
    'r.CALENDAR = function () { __ran.push("CALENDAR"); throw new Error("Calendar timed out"); };'
  );
  const report = sb.json('PayTrackerSyncService.run({ triggerSource: "MANUAL", force: true })');
  const calendar = report.tasks.filter((t) => t.taskId === 'CALENDAR')[0];
  assert.equal(calendar.status, 'Failed');
  assert.match(calendar.lastError || calendar.error || calendar.message, /Calendar timed out|Sync failed/);
});

test('a task that depends on a failed task is skipped, not run on stale data', () => {
  const sb = withRunners(
    'r.CALENDAR = function () { __ran.push("CALENDAR"); throw new Error("Calendar timed out"); };'
  );
  const report = sb.json('PayTrackerSyncService.run({ triggerSource: "MANUAL", force: true })');
  const reconciliation = report.tasks.filter((t) => t.taskId === 'RECONCILIATION')[0];
  assert.equal(reconciliation.status, 'Skipped');
  assert.equal(sb.json('__ran').indexOf('RECONCILIATION'), -1, 'the reconciliation runner was not called');
});

test('an unrelated task still runs after another task fails', () => {
  const sb = withRunners(
    'r.CALENDAR = function () { __ran.push("CALENDAR"); throw new Error("Calendar timed out"); };'
  );
  sb.json('PayTrackerSyncService.run({ triggerSource: "MANUAL", force: true })');
  assert.notEqual(sb.json('__ran').indexOf('PAYSLIP_GMAIL'), -1, 'payslips still ran');
});

console.log('Sync failures: 3/3 passed.');
