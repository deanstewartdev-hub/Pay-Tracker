'use strict';
/**
 * Page loads are read-only. Opening the Dashboard, Finance or Savings page (and the startup sync that
 * runs with it) must not change any sheet or script property. Writes happen only through an explicit,
 * authorised operation: an edit, a menu action, or the explicit contribution sync.
 * Offline: in-memory sheets only.
 */
const assert = require('node:assert/strict');
const { createSandbox } = require('./gas-sandbox.cjs');

const results = [];
function test(name, run) {
  try {
    run();
    results.push({ ok: true });
    console.log('PASS ' + name);
  } catch (error) {
    results.push({ ok: false });
    console.log('FAIL ' + name + ': ' + error.message.split('\n')[0]);
  }
}

const sb = createSandbox({});

// Seed a Savings pot whose next deposit is due, so a contribution sync WOULD write a queue row.
const potsName = sb.json('PayTrackerSavingsConfig.SHEETS.POTS');
const queueName = sb.json('PayTrackerSavingsConfig.SHEETS.CONTRIBUTIONS');
const potCols = sb.json('PayTrackerSavingsConfig.POTS.COLUMNS');
const potHeaders = sb.json('PayTrackerSavingsConfig.POTS.HEADERS');
const queueHeaders = sb.json('PayTrackerSavingsConfig.CONTRIBUTIONS.HEADERS');
const pots = sb.getSheet(potsName);
pots.rows.length = 0;
pots.rows.push(potHeaders.slice());
const potRow = new Array(potHeaders.length).fill('');
potRow[potCols.ID - 1] = 'POT-1';
potRow[potCols.NAME - 1] = 'Holiday';
potRow[potCols.ACTIVE - 1] = 'Yes';
potRow[potCols.NEXT_DEPOSIT_DATE - 1] = sb.date(2026, 10, 20, 12);
potRow[potCols.CONTRIBUTION_AMOUNT - 1] = 40;
potRow[potCols.CONTRIBUTION_METHOD - 1] = 'Percentage Allocation';
potRow[potCols.CONTRIBUTION_FREQUENCY - 1] = 'Weekly';
pots.rows.push(potRow);
const queue = sb.getSheet(queueName);
queue.rows.length = 0;
queue.rows.push(queueHeaders.slice());

// Snapshot of every sheet's cells and every script property, to detect any write.
// Sync Status is the operational run log (not financial): it is excluded from the financial snapshot
// and checked separately, so a page load may record that it ran but never change money-related data.
const OPERATIONAL_SHEETS = ['Sync Status'];
const snapshot = (includeOperational) => JSON.stringify({
  sheets: Object.fromEntries(Object.entries(sb.sheets)
    .filter(([name]) => includeOperational || OPERATIONAL_SHEETS.indexOf(name) === -1)
    .map(([name, sheet]) => [name, sheet.rows])),
  props: sb.json('PropertiesService.getScriptProperties().getProperties()')
});
const callJson = (expr) => sb.json('(function () { try { return ' + expr + '; } catch (e) { return { error: String(e && e.message || e) }; } })()');

// First-run warm-up: the first load creates any missing sheets (one-time setup, not a per-visit write).
// Every assertion below is taken against the steady state that follows it.
callJson('getPayTrackerSavingsWorkspace()');
callJson('getPayTrackerWebDashboardData()');
callJson('getPayTrackerFinanceWorkspace()');
callJson('PayTrackerSyncService.run({ triggerSource: "STARTUP" })');

test('opening the Savings page (its workspace load) does not write the contribution queue or any property', () => {
  const before = snapshot(true);
  callJson('getPayTrackerSavingsWorkspace()');
  assert.equal(snapshot(true), before, 'the Savings page load changed sheets or properties');
});

test('explicit contribution sync (an authorised write) still creates the queue row', () => {
  const before = queue.rows.length;
  sb.run('PayTrackerSavingsContributionService.syncUpcomingContributions()');
  assert.ok(queue.rows.length > before, 'the explicit sync creates the queued contribution');
});

test('opening the Dashboard does not change any sheet or property', () => {
  const before = snapshot(true);
  callJson('getPayTrackerWebDashboardData()');
  assert.equal(snapshot(true), before, 'the Dashboard load changed sheets or properties');
});

test('opening Finance does not change any sheet or property', () => {
  const before = snapshot(true);
  callJson('getPayTrackerFinanceWorkspace()');
  assert.equal(snapshot(true), before, 'the Finance load changed sheets or properties');
});

test('the startup sync (page load) changes no financial sheet or property; only the operational Sync Status log may change', () => {
  const before = snapshot(false);
  callJson('PayTrackerSyncService.run({ triggerSource: "STARTUP" })');
  assert.equal(snapshot(false), before, 'the startup sync changed a financial sheet or property');
});

test('repeated navigation to Savings does not accumulate writes', () => {
  callJson('getPayTrackerSavingsWorkspace()');
  const before = snapshot(true);
  callJson('getPayTrackerSavingsWorkspace()');
  callJson('getPayTrackerSavingsWorkspace()');
  assert.equal(snapshot(true), before, 'repeated loads changed sheets or properties');
});

test('the explicit Refresh writes the queue, and a page load afterwards is read-only again', () => {
  queue.rows.length = 1; // header only: the next explicit refresh should queue the due contribution
  callJson('refreshPayTrackerSavingsContributions()');
  assert.ok(queue.rows.length > 1, 'the explicit refresh creates the queued contribution');
  const before = snapshot(true);
  callJson('getPayTrackerSavingsWorkspace()');
  assert.equal(snapshot(true), before, 'a page load after the refresh changes nothing');
});

test('historical PaySheet values are unchanged by any page load', () => {
  const pay = sb.getSheet('PaySheet');
  pay.rows.length = 0;
  pay.rows.push(['historic', 'row', 123.45]);
  const before = JSON.stringify(pay.rows);
  callJson('getPayTrackerWebDashboardData()');
  callJson('getPayTrackerFinanceWorkspace()');
  callJson('getPayTrackerSavingsWorkspace()');
  assert.equal(JSON.stringify(pay.rows), before, 'a page load altered the PaySheet');
});

const failed = results.filter((r) => !r.ok).length;
console.log('Page loads read-only: ' + (results.length - failed) + '/' + results.length + ' passed.');
module.exports = { results };
if (require.main === module) process.exit(failed ? 1 : 0);
