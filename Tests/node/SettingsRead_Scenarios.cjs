'use strict';
/**
 * Settings read equivalence: getSettingValue (one read of the settings block per execution)
 * must return exactly what the original lookup returned, and a write must be visible to the next read.
 */
const assert = require('node:assert/strict');
const { createSandbox } = require('./gas-sandbox.cjs');

function test(name, run) {
  run();
  console.log('PASS ' + name);
}

const sb = createSandbox({});
const settingsName = sb.json('PayTrackerSavingsConfig.SHEETS.SETTINGS');
const settingsHeaders = sb.json('PayTrackerSavingsConfig.SETTINGS.HEADERS');
const keys = sb.json('Object.values(PayTrackerSavingsConfig.SETTINGS.KEYS)');
const sheet = sb.getSheet(settingsName);

sheet.rows.length = 0;
sheet.rows.push(settingsHeaders.slice());
keys.forEach((key, index) => {
  sheet.rows.push([key, 'value-' + index, '']);
});
sheet.rows.push(['  Padded Name  ', 'padded', '']);

const original = (name) => sb.json(
  '(function () { var r = PayTrackerSavingsService.findSettingRow(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(' +
  JSON.stringify(settingsName) + '), ' + JSON.stringify(name) + '); if (!r) return null; return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(' +
  JSON.stringify(settingsName) + ').getRange(r, 2).getValue(); })()'
);
const cached = (name) => sb.json('PayTrackerSavingsService.getSettingValue(' + JSON.stringify(name) + ')');

test('every setting key reads the same value as the original lookup', () => {
  keys.forEach((key) => {
    assert.equal(cached(key), original(key), 'key ' + key);
  });
});

test('a padded name matches as before and an unknown name returns null', () => {
  assert.equal(cached('Padded Name'), original('Padded Name'));
  assert.equal(cached('No Such Setting'), null);
});

test('a write is visible to the next read in the same execution', () => {
  const key = keys[0];
  sb.json('PayTrackerSavingsService.setSettingValue(' + JSON.stringify(key) + ', "changed")');
  assert.equal(cached(key), 'changed');
  assert.equal(cached(key), original(key));
});

console.log('Settings read equivalence: 3/3 passed.');
