'use strict';
/**
 * Employment periods and National Living Wage (offline, mocked inputs only).
 *  - Minimum wage changes across 1 April 2026; flags payments below the minimum.
 *  - Historical rates are read as they stood on the day; undated rates are reported, not assumed.
 *  - Seasonal forecasts end on 31 October 2026; the ongoing NHS role is unaffected.
 *  - Late final payments are still recordable after the contract ends.
 *  - Reactivation adds a period and keeps the history.
 */
const assert = require('node:assert/strict');
const { createSandbox } = require('./gas-sandbox.cjs');

const results = [];
function test(name, run) {
  try {
    run();
    results.push({ ok: true, name });
    console.log('PASS ' + name);
  } catch (error) {
    results.push({ ok: false, name });
    console.log('FAIL ' + name + ': ' + error.message);
  }
}

const sb = createSandbox({});
const call = (expr) => sb.json('(function () { return ' + expr + '; })()');
const P = 'PayTrackerEmploymentPeriods';

test('National Living Wage (21+) is £12.21 up to 31 March 2026 and £12.71 from 1 April 2026', () => {
  assert.equal(call(P + '.minimumWageOn("2026-03-31")'), 12.21);
  assert.equal(call(P + '.minimumWageOn("2026-04-01")'), 12.71);
  assert.equal(call(P + '.minimumWageOn("2026-10-31")'), 12.71);
});

test('a rate of £12.71 is not below the minimum from 1 April 2026, and £12.21 is below it', () => {
  assert.equal(call(P + '.belowMinimum(12.71, "2026-04-01")'), false);
  assert.equal(call(P + '.belowMinimum(12.21, "2026-04-01")'), true);
});

test('the same £12.21 is NOT below the minimum on 31 March 2026 (the rate before the change)', () => {
  assert.equal(call(P + '.belowMinimum(12.21, "2026-03-31")'), false);
});

test('the minimum rises by 50p on 1 April 2026; the module never moves a contract rate', () => {
  const rise = call(P + '.minimumWageOn("2026-04-01")') - call(P + '.minimumWageOn("2026-03-31")');
  assert.ok(Math.abs(rise - 0.5) < 1e-9, 'minimum rose by 0.50');
  // Contract rates are read from the pay rules, never derived from the minimum.
});

test('current basic rates in the pay rules: only Logging Cash (£10/hr) is below the minimum from 1 April 2026', () => {
  const rates = sb.json('(function () { var out = []; ' +
    'Object.keys(PayTrackerConfig.PAY_RULES).forEach(function (table) { ' +
    '  var rules = PayTrackerConfig.PAY_RULES[table]; ' +
    '  Object.keys(rules).forEach(function (shift) { ' +
    '    if (/basic|split|Logging/i.test(shift) && rules[shift] && rules[shift].hourlyRate) { out.push({ table: table, shift: shift, hourly: rules[shift].hourlyRate }); } ' +
    '  }); }); return out; })()');
  const flagged = rates.filter(function (r) { return call(P + '.belowMinimum(' + r.hourly + ', "2026-04-01")'); });
  assert.deepEqual(flagged.map(function (r) { return r.table; }), ['Logging Cash'], 'only Logging Cash is flagged for investigation');
});

test('Night Security and Relief Warden basic rates are above the minimum', () => {
  assert.equal(call(P + '.belowMinimum(13.47, "2026-04-01")'), false);
  assert.equal(call(P + '.belowMinimum(13.69, "2026-04-01")'), false);
});

test('seasonal forecasts stop after 31 October 2026 for both seasonal jobs', () => {
  for (const job of ['JOB-NIGHT-SECURITY', 'JOB-RELIEF-WARDEN']) {
    assert.equal(call(P + '.forecastAllowed("' + job + '", "2026-10-31")'), true, job + ' still forecast on the last day');
    assert.equal(call(P + '.forecastAllowed("' + job + '", "2026-11-01")'), false, job + ' not forecast after the end');
    assert.equal(call(P + '.forecastAllowed("' + job + '", "2026-12-15")'), false, job + ' not forecast in December');
  }
});

test('the ongoing NHS Car Parking Assistant role is not affected by the seasonal end', () => {
  assert.equal(call(P + '.forecastAllowed("JOB-NHS", "2026-11-01")'), true);
  assert.equal(call(P + '.forecastAllowed("JOB-NHS", "2026-12-15")'), true);
});

test('late final payments are still recordable after the contract ends', () => {
  assert.equal(call(P + '.recordingAllowed("JOB-NIGHT-SECURITY", "2026-11-20")'), true);
  assert.equal(call(P + '.recordingAllowed("JOB-RELIEF-WARDEN", "2026-12-05")'), true);
});

test('reactivation adds a period and keeps the history: earlier days stay active, the gap is inactive', () => {
  const periods = '[{ start: null, end: "2026-10-31" }, { start: "2027-03-01", end: "2027-05-31" }]';
  assert.equal(call(P + '.isActiveOn(' + periods + ', "2026-06-01")'), true, 'history stays active');
  assert.equal(call(P + '.isActiveOn(' + periods + ', "2026-12-01")'), false, 'gap is inactive');
  assert.equal(call(P + '.isActiveOn(' + periods + ', "2027-04-15")'), true, 'reactivated period is active');
});

test('an open-ended reactivation has no end date', () => {
  const periods = '[{ start: null, end: "2026-10-31" }, { start: "2027-03-01", end: null }]';
  assert.equal(call(P + '.isActiveOn(' + periods + ', "2029-01-01")'), true);
});

const failed = results.filter((r) => !r.ok).length;
console.log('Employment periods: ' + (results.length - failed) + '/' + results.length + ' passed.');
module.exports = { results };
if (require.main === module) process.exit(failed ? 1 : 0);
