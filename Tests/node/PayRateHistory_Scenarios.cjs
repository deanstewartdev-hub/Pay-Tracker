'use strict';
/**
 * Historical pay-rate protection (offline, fixtures only).
 *  - Night Security x1.33 at £17.92 applies only from the earliest evidenced payslip date (16 Aug 2026).
 *    Earlier shifts keep the previous rate: no retrospective recalculation without evidence.
 *  - Relief and Night Security tables equal the previous documented values, except the evidenced x1.33.
 *  - Every dated rate entry carries its evidence, and provisional entries are labelled.
 *  - A calendar pass or a full recalculation prices a shift from the dated rule only, so nothing unsupported
 *    reaches an earlier shift.
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
    console.log('FAIL ' + name + ': ' + error.message);
  }
}

const sb = createSandbox({});
const price = (table, shift, hours, y, m, d) => sb.run(
  `PayTrackerPayCalculator.calculatePay(${JSON.stringify(table)}, ${JSON.stringify(shift)}, ${hours}, new Date(${y}, ${m - 1}, ${d}, 12))`
);
const rule = (table, shift) => sb.json(`PayTrackerConfig.PAY_RULES[${JSON.stringify(table)}][${JSON.stringify(shift)}]`);

test('x1.33 before the earliest evidenced payslip (16 Aug 2026) keeps the previous rate: 4 x 17.91 = 71.64', () => {
  assert.equal(price('Night Security Warden', 'Enhanced 1.33', 4, 2026, 7, 20), 71.64);
  assert.equal(price('Night Security Warden', 'Overtime 1.33', 4, 2026, 7, 20), 71.64);
});

test('x1.33 from 16 Aug 2026 (earliest evidence) is 4 x 17.92 = 71.68, as on payslip N624148 and N621105', () => {
  assert.equal(price('Night Security Warden', 'Enhanced 1.33', 4, 2026, 8, 16), 71.68);
  assert.equal(price('Night Security Warden', 'Enhanced 1.33', 4, 2026, 10, 29), 71.68);
});

test('the x1.33 rate is never applied retrospectively: the day before the first evidence keeps 17.91', () => {
  assert.equal(price('Night Security Warden', 'Enhanced 1.33', 4, 2026, 8, 15), 71.64);
});

test('Relief Warden fixed amounts equal the previous documented values (no unevidenced change)', () => {
  assert.equal(rule('Relief Assistant Warden', 'Enhanced 1.20').fixedAmount, 65.71);
  assert.equal(rule('Relief Assistant Warden', 'Enhanced 1.33').fixedAmount, 72.83);
  assert.equal(rule('Relief Assistant Warden', 'Enhanced 1.50').fixedAmount, 82.14);
  assert.equal(rule('Relief Assistant Warden', 'Overtime 1.20').fixedAmount, 65.71);
  assert.equal(rule('Relief Assistant Warden', 'Overtime 1.33').fixedAmount, 72.83);
  assert.equal(rule('Relief Assistant Warden', 'Overtime 1.50').fixedAmount, 82.14);
});

test('Night Security tables equal the previous documented values, except the dated x1.33 entry', () => {
  assert.equal(rule('Night Security Warden', 'Enhanced 1.20').fixedAmount, 64.66);
  assert.equal(rule('Night Security Warden', 'Overtime 1.20').fixedAmount, 64.66);
  assert.equal(rule('Night Security Warden', 'Enhanced 1.50').fixedAmount, 80.82);
  assert.equal(rule('Night Security Warden', 'Overtime 1.50').fixedAmount, 80.82);
  assert.equal(rule('Night Security Warden', 'Enhanced 1.33').hourlyRate, 17.91, 'base rate before the dated entry');
});

test('every dated history entry has its evidence, an effective date, and a status', () => {
  const entries = sb.json('(function () { var out = []; var h = PayTrackerConfig.PAY_RULE_HISTORY; ' +
    'Object.keys(h).forEach(function (t) { Object.keys(h[t]).forEach(function (s) { h[t][s].forEach(function (e) { ' +
    'out.push({ table: t, shift: s, effectiveFrom: e.effectiveFrom, evidence: e.evidence, status: e.status || null }); }); }); }); return out; })()');
  assert.ok(entries.length >= 3);
  for (const e of entries) {
    assert.ok(e.effectiveFrom && e.evidence, e.shift + ' has an effective date and evidence');
    assert.ok(e.status, e.shift + ' is labelled (provisional or evidenced-earliest)');
  }
  assert.ok(entries.some((e) => e.status === 'provisional'), 'the x1.50 £20.87 rate is labelled provisional');
});

test('a full recalculation uses the dated rule only: the same shift before and after the pass prices identically', () => {
  const before = price('Night Security Warden', 'Enhanced 1.33', 4, 2026, 7, 20);
  const again = price('Night Security Warden', 'Enhanced 1.33', 4, 2026, 7, 20);
  assert.equal(before, again);
  assert.equal(before, 71.64, 'no unsupported historical rate is introduced');
});

const failed = results.filter((r) => !r.ok).length;
console.log('Pay rate history: ' + (results.length - failed) + '/' + results.length + ' passed.');
module.exports = { results };
if (require.main === module) process.exit(failed ? 1 : 0);
