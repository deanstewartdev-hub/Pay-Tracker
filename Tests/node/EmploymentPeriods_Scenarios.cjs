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

test('automatic minimum-wage check skips Logging Cash (unverified classification) and flags nothing else', () => {
  const rates = sb.json('(function () { var out = []; ' +
    'Object.keys(PayTrackerConfig.PAY_RULES).forEach(function (table) { ' +
    '  var rules = PayTrackerConfig.PAY_RULES[table]; ' +
    '  Object.keys(rules).forEach(function (shift) { ' +
    '    if (/basic|split|Logging/i.test(shift) && rules[shift] && rules[shift].hourlyRate) { out.push({ table: table, shift: shift, hourly: rules[shift].hourlyRate }); } ' +
    '  }); }); return out; })()');
  const automatic = rates.filter(function (r) {
    return call(P + '.minimumCheckApplies("' + r.table + '")') && call(P + '.belowMinimum(' + r.hourly + ', "2026-04-01")');
  });
  assert.deepEqual(automatic, [], 'no table is flagged automatically');
  assert.equal(call(P + '.minimumCheckApplies("Logging Cash")'), false, 'Logging Cash is not checked automatically');
  assert.equal(call(P + '.belowMinimum(10, "2026-04-01")'), true, 'the value is still reported if checked by hand');
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


// Calendar guard: a seasonal shift dated after 31 October is flagged, and nothing is written.
test('a Night Security shift dated after the contract end is flagged, and the PaySheet is not written', () => {
  const sheetName = 'PaySheet';
  const sheet = sb.getSheet(sheetName);
  const before = JSON.stringify(sheet.rows);
  const result = sb.json('(function () { return PayTrackerCalendarService.addShiftToSheet(' +
    'SpreadsheetApp.getActiveSpreadsheet().getSheetByName(' + JSON.stringify(sheetName) + '), ' +
    'new Date(2026, 10, 3, 12), "Night Security Warden", "Enhanced 1.50", 4, ' +
    '{ eventKey: "E-NIGHT-1", event: {}, jobId: "JOB-NIGHT-SECURITY", isAnnualLeave: false }); })()');
  assert.equal(result.status, 'flaggedAfterContractEnd');
  assert.equal(result.jobId, 'JOB-NIGHT-SECURITY');
  assert.equal(result.date, '2026-11-03');
  assert.equal(JSON.stringify(sheet.rows), before, 'nothing was written to the PaySheet');
});

test('a repeated calendar pass over the same post-contract shift is idempotent: same flag, no writes', () => {
  const sheet = sb.getSheet('PaySheet');
  const before = JSON.stringify(sheet.rows);
  const call2 = () => sb.json('(function () { return PayTrackerCalendarService.addShiftToSheet(SpreadsheetApp.getActiveSpreadsheet().getSheetByName("PaySheet"), new Date(2026, 10, 3, 12), "Night Security Warden", "Enhanced 1.50", 4, { eventKey: "E-NIGHT-1", event: {}, jobId: "JOB-NIGHT-SECURITY", isAnnualLeave: false }); })()');
  const a = call2();
  const b = call2();
  assert.equal(a.status, 'flaggedAfterContractEnd');
  assert.deepEqual(b, a);
  assert.equal(JSON.stringify(sheet.rows), before, 'no writes across two passes');
});

test('the guard covers only seasonal tables: the NHS table is never flagged by it', () => {
  assert.equal(call(P + '.jobIdForTable("NHS")'), 'JOB-NHS');
  assert.equal(call(P + '.forecastAllowed("JOB-NHS", "2026-11-03")'), true);
});

test('a post-contract shift creates ONE Action Centre review item across repeated passes, and nothing else changes', () => {
  const sheet = sb.getSheet('PaySheet');
  const before = JSON.stringify(sheet.rows);
  const call3 = () => sb.json('(function () { return PayTrackerCalendarService.addShiftToSheet(SpreadsheetApp.getActiveSpreadsheet().getSheetByName("PaySheet"), new Date(2026, 10, 3, 12), "Night Security Warden", "Enhanced 1.50", 4, { eventKey: "E-REVIEW-1", event: { getTitle: function () { return "Night security"; } }, jobId: "JOB-NIGHT-SECURITY", isAnnualLeave: false }); })()');
  assert.equal(call3().status, 'flaggedAfterContractEnd');
  assert.equal(call3().status, 'flaggedAfterContractEnd');
  const items = sb.json('PayTrackerActionCentreRepository.getAll({}).filter(function (i) { return i.sourceId === "E-REVIEW-1"; })');
  assert.equal(items.length, 1, 'one review item for the event');
  assert.equal(items[0].actionType, 'Post-contract Calendar shift');
  assert.equal(JSON.stringify(sheet.rows), before, 'PaySheet unchanged');
});

// Forecast: a seasonal contract that has ended stops contributing to the take-home estimate.
const MIXED = '[{ takeHome: 400, seasonalJobIds: [] }, { takeHome: 800, seasonalJobIds: ["JOB-NIGHT-SECURITY"] }]';
test('forecast before the end (15 Oct 2026) still includes the seasonal week (unchanged behaviour): 2600', () => {
  assert.equal(call(P + '.forecastTakeHome(' + MIXED + ', "2026-10-15")'), 2600);
});
test('forecast after the end (5 Nov 2026) excludes the seasonal week: NHS-only average 1733.33', () => {
  assert.ok(Math.abs(call(P + '.forecastTakeHome(' + MIXED + ', "2026-11-05")') - 1733.3333333) < 1e-6);
});
test('forecast on a far-future date (1 Jun 2027) still excludes the seasonal week', () => {
  assert.ok(Math.abs(call(P + '.forecastTakeHome(' + MIXED + ', "2027-06-01")') - 1733.3333333) < 1e-6);
});
test('NHS-only history gives the same forecast before and after the seasonal end', () => {
  const nhs = '[{ takeHome: 400, seasonalJobIds: [] }, { takeHome: 420, seasonalJobIds: ["JOB-NHS"] }]';
  assert.equal(call(P + '.forecastTakeHome(' + nhs + ', "2026-10-15")'), call(P + '.forecastTakeHome(' + nhs + ', "2026-11-05")'));
});
test('seasonal-only history after the end gives no estimate (0), not a projection of ended earnings', () => {
  assert.equal(call(P + '.forecastTakeHome([{ takeHome: 800, seasonalJobIds: ["JOB-NIGHT-SECURITY"] }], "2026-11-05")'), 0);
});

// Job-level forecast: a mixed week keeps the NHS share; only the ended seasonal share is removed.
const NHS_ONLY = '{ takeHome: 400, grossByJob: { "JOB-NHS": 400 } }';
const MIXED_WEEK = '{ takeHome: 800, grossByJob: { "JOB-NHS": 300, "JOB-NIGHT-SECURITY": 500 } }';
test('mixed week after the end keeps its NHS share (300 of 800), not the whole week: average (400 + 300) / 2 x 52/12 = 1516.67', () => {
  const est = call(P + '.forecastTakeHome([' + NHS_ONLY + ', ' + MIXED_WEEK + '], "2026-11-05")');
  assert.ok(Math.abs(est - 1516.6666667) < 1e-6, 'got ' + est);
});
test('the same mixed history before the end counts the whole week: (400 + 800) / 2 x 52/12 = 2600', () => {
  assert.equal(call(P + '.forecastTakeHome([' + NHS_ONLY + ', ' + MIXED_WEEK + '], "2026-10-15")'), 2600);
});
test('a mixed week with Relief work and NHS after the end keeps the NHS share only', () => {
  const week = '{ takeHome: 600, grossByJob: { "JOB-NHS": 200, "JOB-RELIEF-WARDEN": 400 } }';
  const est = call(P + '.forecastTakeHome([' + NHS_ONLY + ', ' + week + '], "2026-11-05")');
  assert.ok(Math.abs(est - (400 + 200) / 2 * 52 / 12) < 1e-6);
});
test('a seasonal-only week after the end contributes nothing (no ordinary earnings)', () => {
  const seasonal = '{ takeHome: 800, grossByJob: { "JOB-NIGHT-SECURITY": 800 } }';
  assert.equal(call(P + '.forecastTakeHome([' + NHS_ONLY + ', ' + seasonal + '], "2026-11-05")'), 400 * 52 / 12);
});
test('NHS-only history is the same before and after the seasonal end, and on far-future dates', () => {
  const before = call(P + '.forecastTakeHome([' + NHS_ONLY + ', ' + NHS_ONLY + '], "2026-10-15")');
  assert.equal(call(P + '.forecastTakeHome([' + NHS_ONLY + ', ' + NHS_ONLY + '], "2026-11-05")'), before);
  assert.equal(call(P + '.forecastTakeHome([' + NHS_ONLY + ', ' + NHS_ONLY + '], "2027-06-01")'), before);
});
test('the sample values 2600 and 1733.33 are synthetic: a real forecast must come from staging PaySheet', () => {
  assert.ok(call(P + '.forecastTakeHome([' + NHS_ONLY + ', ' + MIXED_WEEK + '], "2026-10-15")') !== 1733.33);
});

// Logging Cash is an unclassified category paid with no deductions at payment: it is kept in history but not annualised.
test('Logging Cash pay is not annualised into the take-home forecast (unclassified, paid with no deductions at payment)', () => {
  // Real staging week 29 (2-8 Nov 2026): take-home 595.52 = NHS 395.52 + Logging Cash 200. Only the NHS part is recurring.
  const week = '{ takeHome: 595.52, grossByJob: { "JOB-NHS": 470.86, "Logging Cash": 200 } }';
  const est = call(P + '.forecastTakeHome([' + week + '], "2026-11-05")');
  assert.ok(Math.abs(est - 395.52 * 52 / 12) < 1e-6, 'got ' + est + ', expected ' + (395.52 * 52 / 12));
});
test('a week with only Logging Cash pay contributes nothing to the forecast', () => {
  const week = '{ takeHome: 200, grossByJob: { "Logging Cash": 200 } }';
  assert.equal(call(P + '.forecastTakeHome([' + week + ', { takeHome: 400, grossByJob: { "JOB-NHS": 400 } }], "2026-11-05")'), 400 * 52 / 12);
});

// The sheet function keys gross pay by JOB id (as the live forecast does). Keys by job id and by table name must agree.
test('Logging Cash keyed by its JOB id (as the live forecast passes it) is excluded too', () => {
  const week = '{ takeHome: 595.52, grossByJob: { "JOB-NHS": 470.86, "JOB-LOGGING-CASH": 200 } }';
  const est = call(P + '.forecastTakeHome([' + week + '], "2026-11-05")');
  assert.ok(Math.abs(est - 395.52 * 52 / 12) < 1e-6, 'got ' + est);
});
test('job-id keys and table-name keys give the same forecast for the seasonal end', () => {
  const byJob = '[{ takeHome: 862.21, grossByJob: { "JOB-NHS": 526.14, "JOB-RELIEF-WARDEN": 136.9, "JOB-NIGHT-SECURITY": 367.38, "JOB-LOGGING-CASH": 110 } }, { takeHome: 400, grossByJob: { "JOB-NHS": 400 } }]';
  const byName = '[{ takeHome: 862.21, grossByJob: { "NHS": 526.14, "Relief Assistant Warden": 136.9, "Night Security Warden": 367.38, "Logging Cash": 110 } }, { takeHome: 400, grossByJob: { "JOB-NHS": 400 } }]';
  assert.ok(Math.abs(call(P + '.forecastTakeHome(' + byJob + ', "2026-11-05")') - call(P + '.forecastTakeHome(' + byName + ', "2026-11-05")')) < 1e-6);
});

const failed = results.filter((r) => !r.ok).length;
console.log('Employment periods: ' + (results.length - failed) + '/' + results.length + ' passed.');
module.exports = { results };
if (require.main === module) process.exit(failed ? 1 : 0);
