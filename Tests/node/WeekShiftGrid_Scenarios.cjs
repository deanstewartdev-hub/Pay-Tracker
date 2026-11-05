'use strict';
/**
 * Equivalence: PayTrackerWeekManager.weekHasShiftDataFromGrid (one read, in memory) must give
 * the same answer as weekHasShiftData (one read per pay table, per week) for every week.
 * This feeds the take-home estimate used by the Savings workspace.
 */
const assert = require('node:assert/strict');
const { createSandbox } = require('./gas-sandbox.cjs');

const SHEET = 'Equivalence PaySheet';
const WEEKS = 8;
const sb = createSandbox({});
const sheet = sb.getSheet(SHEET);

const shiftColumn = sb.json('getConfiguredPayTables_()[0].startColumn + 2');
const summaryColumn = sb.json('PayTrackerConfig.SHEET.WEEKLY_SUMMARY_VALUE_COLUMN');
const weekRow = (w) => sb.json('PayTrackerUtils.getWeekStartRow(' + w + ')');
const dataOffset = sb.json('PayTrackerConfig.SHEET.WEEK_DATA_ROW_OFFSET');
const dataCount = sb.json('PayTrackerConfig.SHEET.WEEK_DATA_ROW_COUNT');
const lastRow = weekRow(WEEKS) + dataOffset + dataCount;
const lastColumn = Math.max(shiftColumn, summaryColumn) + 1;

// Fixture: rows are 1-based in the sheet; rows.push index = row - 1.
for (let r = 1; r <= lastRow; r++) {
  sheet.rows[r - 1] = new Array(lastColumn).fill('');
}
const withShift = [1, 3, 4, 7];
for (let w = 1; w <= WEEKS; w++) {
  const firstDataRow = weekRow(w) + dataOffset;
  // Whitespace-only cells must count as empty; a real entry counts as a shift.
  sheet.rows[firstDataRow - 1][shiftColumn - 1] = withShift.indexOf(w) !== -1 ? '08:00' : '   ';
}

const grid = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
const sheetExpr = "SpreadsheetApp.getActiveSpreadsheet().getSheetByName('" + SHEET + "')";

const answers = [];
for (let w = 1; w <= WEEKS; w++) {
  const row = weekRow(w);
  const perCell = sb.json('PayTrackerWeekManager.weekHasShiftData(' + sheetExpr + ', ' + row + ')');
  const inMemory = sb.json('PayTrackerWeekManager.weekHasShiftDataFromGrid(' + JSON.stringify(grid) + ', ' + row + ')');
  answers.push({ week: w, perCell: perCell, inMemory: inMemory });
}

const mismatches = answers.filter((a) => a.perCell !== a.inMemory);

test('the grid check matches the per-cell check for every week', () => {
  assert.deepEqual(mismatches, []);
});

test('the fixture covers weeks with and without shifts', () => {
  assert.ok(answers.some((a) => a.inMemory === true), 'some week has a shift');
  assert.ok(answers.some((a) => a.inMemory === false), 'some week is empty');
});

function test(name, run) {
  run();
  console.log('PASS ' + name);
}

console.log('Week shift grid equivalence: 2/2 passed.');
