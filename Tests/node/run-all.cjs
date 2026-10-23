'use strict';
/**
 * Runs every offline-safe Pay Tracker test locally, with no Google access:
 *   1. each Apps Script suite (run<Domain>Tests) inside the in-memory sandbox, and
 *   2. the Node scenario files in this folder (*_Scenarios.cjs).
 *
 *   node Tests/node/run-all.cjs
 *
 * Exits non-zero if anything fails. Used by CI (.github/workflows/validate.yml).
 *
 * Not included: runStafflineReconciliationTests. It reads the real Jobs sheet's seeded
 * "Staffline References", so it can only run in the live spreadsheet (runAllPayTrackerTests).
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createSandbox } = require('./gas-sandbox.cjs');

const SUITES = [
  'runReconciliationFoundationTests',
  'runCalendarReconciliationTests',
  'runCalendarDiagnosticsTests',
  'runAnnualLeaveEngineTests',
  'runPayAdjustmentsTests',
  'runMoneyMovementsTests',
  'runTransactionRulesTests',
  'runAnalyticsTests',
  'runUnifiedSyncTests'
];

// Suites added by later work are discovered from Tests/*.js by their exported function name.
const discovered = fs.readdirSync(path.join(__dirname, '..'))
  .filter(name => /_Tests\.js$/.test(name))
  .map(name => (fs.readFileSync(path.join(__dirname, '..', name), 'utf8').match(/^function (run\w+Tests)\(/m) || [])[1])
  .filter(Boolean)
  .filter(name => name !== 'runStafflineReconciliationTests' && !SUITES.includes(name));

let failed = 0;
let checks = 0;
for (const suite of SUITES.concat(discovered)) {
  try {
    const sandbox = createSandbox({ stubLayout: true });
    const result = sandbox.json(suite + '()');
    checks += result.passed || 0;
    console.log('PASS ' + suite + ' (' + (result.passed || 0) + ' checks)');
  } catch (error) {
    failed++;
    console.log('FAIL ' + suite + ' :: ' + String(error && error.message || error).split('\n')[0]);
  }
}

for (const file of fs.readdirSync(__dirname).filter(name => /_Scenarios\.cjs$/.test(name)).sort()) {
  const run = spawnSync(process.execPath, [path.join(__dirname, file)], { encoding: 'utf8' });
  const lines = (run.stdout || '').trim().split('\n');
  console.log((run.status === 0 ? 'PASS ' : 'FAIL ') + file + ' :: ' + lines[lines.length - 1]);
  if (run.status !== 0) { failed++; console.log((run.stderr || '').split('\n').slice(0, 12).join('\n')); }
}

console.log(failed ? `\n${failed} FAILED` : `\nALL PASSED (${checks} suite checks plus scenario files)`);
process.exit(failed ? 1 : 0);
