'use strict';
/**
 * Overdue contributions: a queued contribution counts as overdue only while it is still unresolved
 * (Upcoming or Error) and its due date has passed. A Completed or Processing row is not overdue.
 * Offline: in-memory queue. Today is the real clock, and every fixture date is in the past or future.
 */
const assert = require('node:assert/strict');
const { createSandbox } = require('./gas-sandbox.cjs');

const results = [];
function test(name, run) {
  try { run(); results.push({ ok: true }); console.log('PASS ' + name); }
  catch (error) { results.push({ ok: false }); console.log('FAIL ' + name + ': ' + error.message.split('\n')[0]); }
}

const sb = createSandbox({});
const queueName = sb.json('PayTrackerSavingsConfig.SHEETS.CONTRIBUTIONS');
const cols = sb.json('PayTrackerSavingsConfig.CONTRIBUTIONS.COLUMNS');
const headers = sb.json('PayTrackerSavingsConfig.CONTRIBUTIONS.HEADERS');
const statuses = sb.json('PayTrackerSavingsConfig.CONTRIBUTION_STATUSES');
const queue = sb.getSheet(queueName);
queue.rows.length = 0;
queue.rows.push(headers.slice());

const addRow = (id, due, status) => {
  const row = new Array(headers.length).fill('');
  row[cols.ID - 1] = id;
  row[cols.DUE_DATE - 1] = due;
  row[cols.STATUS - 1] = status;
  queue.rows.push(row);
};
const pastA = sb.date(2026, 9, 1, 12);    // 1 Oct 2026 (month is zero-based): past
const pastB = sb.date(2026, 9, 15, 12);   // 15 Oct 2026: past
const future = sb.date(2026, 11, 1, 12);   // 1 Dec 2026: future

addRow('C-COMPLETED-PAST', pastA, statuses.COMPLETED);
addRow('C-UNRESOLVED-PAST', pastB, statuses.UPCOMING);
addRow('C-FUTURE', future, statuses.UPCOMING);

const callJson = (expr) => sb.json('(function () { try { return ' + expr + '; } catch (e) { return { error: String(e && e.message || e) }; } })()');
const figures = () => callJson('getPayTrackerSavingsWorkspace()').dashboard;

test('a Completed past contribution is not overdue; only the unresolved past one is', () => {
  assert.equal(figures().overdueContributions, 1, 'overdue counts unresolved past rows only');
});

test('opening Savings leaves the queue and the overdue figure unchanged', () => {
  const before = JSON.stringify(queue.rows);
  const count = figures().overdueContributions;
  assert.equal(JSON.stringify(queue.rows), before, 'a page load changed the queue');
  assert.equal(figures().overdueContributions, count, 'the figure changed between loads');
});

test('an explicit Refresh does not reschedule or re-status a past unresolved row', () => {
  const before = JSON.stringify(queue.rows);
  callJson('refreshPayTrackerSavingsContributions()');
  const pastRows = queue.rows.filter((r) => r[cols.ID - 1] === 'C-UNRESOLVED-PAST');
  assert.equal(pastRows.length, 1, 'the overdue row is not duplicated');
  assert.equal(pastRows[0][cols.STATUS - 1], statuses.UPCOMING, 'its status is unchanged');
  assert.equal(JSON.stringify(queue.rows), before, 'refresh did not change an existing row');
});

const failed = results.filter((r) => !r.ok).length;
console.log('Savings overdue: ' + (results.length - failed) + '/' + results.length + ' passed.');
module.exports = { results };
if (require.main === module) process.exit(failed ? 1 : 0);
