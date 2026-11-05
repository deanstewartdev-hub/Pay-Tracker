'use strict';
/**
 * The forecast must price the PaySheet "Extra" row (the eighth data row of each week). That row is
 * part of the weekly table total, so the weekly take-home includes its pay. A per-job split that
 * ignores it would drop genuine earnings from the share.
 * Fixture: week 1 mixes ended seasonal work (Night Security, 50 gross) with an NHS shift that sits
 * only on the Extra row (150 gross). Take-home 180. Expected NHS share 150/200 of 180 = 135 a week,
 * so the monthly estimate is 135 x 52 / 12 = 585.00. Today is after 31 Oct 2026, so Night is ended.
 */
const assert = require('node:assert/strict');
const { createSandbox } = require('./gas-sandbox.cjs');

const results = [];
function test(name, run) {
  try { run(); results.push({ ok: true }); console.log('PASS ' + name); }
  catch (error) { results.push({ ok: false }); console.log('FAIL ' + name + ': ' + error.message.split('\n')[0]); }
}

const sb = createSandbox({});
const tables = sb.json('getConfiguredPayTables_().map(function (t) { return { name: t.name, startColumn: t.startColumn }; })');
const table = (name) => tables.find((t) => t.name === name);
const weekRow = sb.json('PayTrackerUtils.getWeekStartRow(1)');
const dataOffset = sb.json('PayTrackerConfig.SHEET.WEEK_DATA_ROW_OFFSET');
const dataCount = sb.json('PayTrackerConfig.SHEET.WEEK_DATA_ROW_COUNT');
const summaryCol = sb.json('PayTrackerConfig.SHEET.WEEKLY_SUMMARY_VALUE_COLUMN');
const lastRow = weekRow + dataOffset + dataCount + 2;
const lastCol = Math.max(summaryCol, ...tables.map((t) => t.startColumn + 4)) + 1;

const pay = sb.getSheet('PaySheet');
pay.rows.length = 0;
for (let r = 1; r <= lastRow; r++) pay.rows[r - 1] = new Array(lastCol).fill('');
const put = (row, col, value) => { pay.rows[row - 1][col - 1] = value; };

// Night Security (seasonal, ended): one ordinary shift on the first data row, pay 50.
const night = table('Night Security Warden');
put(weekRow + dataOffset, night.startColumn + 2, 'Enhanced 1.33');
put(weekRow + dataOffset, night.startColumn + 3, 4);
put(weekRow + dataOffset, night.startColumn + 4, 50);
// NHS: a shift on the Extra row only (the eighth data row), pay 150.
const nhs = table('NHS');
put(weekRow + dataOffset + 7, nhs.startColumn + 2, 'Day');
put(weekRow + dataOffset + 7, nhs.startColumn + 3, 10);
put(weekRow + dataOffset + 7, nhs.startColumn + 4, 150);
// Week label in column A: getExistingWeekCount counts weeks from these labels.
put(weekRow, 1, 'Week 1');
// Weekly summary take-home.
put(weekRow + 5, summaryCol, 180);

const estimate = sb.json('PayTrackerFinanceDashboard.calculateEstimatedMonthlyTakeHome()');

test('the Extra row is part of the per-job split: NHS share of the week counts its 150', () => {
  assert.equal(Math.round(estimate * 100) / 100, 585);
});

const failed = results.filter((r) => !r.ok).length;
console.log('Extra-row forecast: ' + (results.length - failed) + '/' + results.length + ' passed.');
module.exports = { results };
if (require.main === module) process.exit(failed ? 1 : 0);
