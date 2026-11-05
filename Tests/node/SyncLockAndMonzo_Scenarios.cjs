'use strict';
/**
 * Sync and Monzo regression: a disconnected Monzo is reported as Manual (not Failed), an active
 * run blocks a second one, a stale run marker is recovered, and a stored balance is never labelled
 * as currently synced when Monzo is not connected.
 */
const assert = require('node:assert/strict');
const { createSandbox } = require('./gas-sandbox.cjs');

function test(name, run) {
  run();
  console.log('PASS ' + name);
}

const sb = createSandbox({});
test('a disconnected Monzo task reports Manual, not Failed', () => {
  const result = sb.json(
    '(function () { return PayTrackerSyncService.RUNNERS.MONZO_TRANSACTIONS({ id: "MONZO_TRANSACTIONS" }); })()'
  );
  assert.equal(result.status, 'Manual');
});

test('an active run blocks a second run from starting', () => {
  sb.run(
    "PropertiesService.getScriptProperties().setProperty(PayTrackerSyncConfig.RUN_LOCK_PROPERTY_KEY," +
    " JSON.stringify({ runId: 'SYNCRUN-ACTIVE', startedAt: new Date().toISOString() }));"
  );
  const second = sb.json('PayTrackerSyncController.runSync({ triggerSource: "MANUAL", force: true })');
  assert.equal(second.alreadyRunning, true);
  sb.run("PropertiesService.getScriptProperties().deleteProperty(PayTrackerSyncConfig.RUN_LOCK_PROPERTY_KEY);");
});

test('a stale run marker is recovered and does not block a new run', () => {
  const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  sb.run(
    "PropertiesService.getScriptProperties().setProperty(PayTrackerSyncConfig.RUN_LOCK_PROPERTY_KEY," +
    " JSON.stringify({ runId: 'SYNCRUN-OLD', startedAt: '" + old + "' }));"
  );
  assert.equal(sb.json('PayTrackerSyncController.getActiveRun()'), null, 'the old marker is not active');
  sb.run("PropertiesService.getScriptProperties().deleteProperty(PayTrackerSyncConfig.RUN_LOCK_PROPERTY_KEY);");
});

test('a pot is never labelled verified when Monzo is not connected', () => {
  const label = sb.json(
    '(function () { return PayTrackerMonzoPotSync.balanceState({ monzoPotId: "pot-1", lastBalanceAt: new Date().toISOString() }, ' +
    '{ connected: false, syncedAt: new Date().toISOString(), status: "Not connected" }, new Date()); })()'
  );
  assert.ok(!label.verified, 'not verified without a connected Monzo');
});

module.exports = {};
console.log('Sync and Monzo regression: 4/4 passed.');
