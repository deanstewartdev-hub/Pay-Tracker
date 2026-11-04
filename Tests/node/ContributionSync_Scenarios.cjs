'use strict';
/**
 * Contribution queue sync: the page-load path must not repeat the write work when nothing it
 * depends on has changed, and must run in full again as soon as a pot changes.
 */
const assert = require('node:assert/strict');
const { createSandbox } = require('./gas-sandbox.cjs');

function test(name, run) {
  run();
  console.log('PASS ' + name);
}

const sb = createSandbox({});
const potsName = sb.json('PayTrackerSavingsConfig.SHEETS.POTS');
const queueName = sb.json('PayTrackerSavingsConfig.SHEETS.CONTRIBUTIONS');
const potCols = sb.json('PayTrackerSavingsConfig.POTS.COLUMNS');
const potHeaders = sb.json('PayTrackerSavingsConfig.POTS.HEADERS');
const queueHeaders = sb.json('PayTrackerSavingsConfig.CONTRIBUTIONS.HEADERS');

const pots = sb.getSheet(potsName);
pots.rows.length = 0;
pots.rows.push(potHeaders.slice());
const dueDate = sb.date(2026, 10, 10, 12);
const potRow = new Array(potHeaders.length).fill('');
potRow[potCols.ID - 1] = 'POT-1';
potRow[potCols.NAME - 1] = 'Holiday';
potRow[potCols.ACTIVE - 1] = 'Yes';
potRow[potCols.NEXT_DEPOSIT_DATE - 1] = dueDate;
potRow[potCols.CONTRIBUTION_AMOUNT - 1] = 40;
potRow[potCols.CONTRIBUTION_METHOD - 1] = 'Percentage Allocation';
potRow[potCols.CONTRIBUTION_FREQUENCY - 1] = 'Weekly';
pots.rows.push(potRow);

const queue = sb.getSheet(queueName);
queue.rows.length = 0;
queue.rows.push(queueHeaders.slice());

const sync = () => sb.json('PayTrackerSavingsContributionService.syncUpcomingContributions()');

let first;
let second;
let changed;
let queueRowsAfterFirst;

test('the first sync creates the queue row', () => {
  first = sync();
  queueRowsAfterFirst = queue.rows.length;
  assert.equal(first.created, 1);
  assert.equal(queue.rows.length, 2);
});

test('an identical second sync skips the write work', () => {
  second = sync();
  assert.equal(second.unchanged, true);
  assert.equal(queue.rows.length, queueRowsAfterFirst, 'no rows are added or rewritten');
});

test('a changed pot amount runs the full sync again', () => {
  pots.rows[1][potCols.CONTRIBUTION_AMOUNT - 1] = 55;
  changed = sync();
  assert.equal(changed.unchanged, undefined, 'the sync ran in full');
  assert.equal(changed.updated, 1, 'the existing queue row is refreshed, not duplicated');
  assert.equal(queue.rows.length, queueRowsAfterFirst, 'still one row per pot and due date');
});

test('after that run, the same inputs skip again', () => {
  assert.equal(sync().unchanged, true);
});

module.exports = {};
console.log('Contribution sync: 4/4 passed.');
