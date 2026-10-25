'use strict';
/**
 * October 2026 payroll reconciliation, reproduced with the REAL engine (Calendar sync,
 * pay calculator with effective-dated rates, payslip parser, payroll comparison engine).
 *
 * Payslip evidence supplied by the owner (original Staffline payslips):
 *   Night Security Enhanced 1.50:  w/e 04/10/2026 4.50 x 20.21 = 90.95
 *                                  w/e 11/10/2026 8.00 x 20.87 = 166.96
 *                                  w/e 18/10/2026 8.00 x 20.87 = 166.96
 *   Gross / deductions / net:      w/e 11/10 664.43 / 152.97 / 511.46
 *                                  w/e 18/10 819.67 / 216.80 / 602.87
 *   Pay Tracker's original estimates (before v3.3): w/e 11/10 563.84, w/e 18/10 719.08.
 * Only the totals and Night lines above are known; the other payslip lines are not.
 */
process.env.TZ = 'Europe/London';
const assert = require('node:assert/strict');
const { createSandbox } = require('./gas-sandbox.cjs');

let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }
const OWNER = 'dean99992011@gmail.com';

function week(mondayDay, month = 10) {
  const sb = createSandbox({ stubLayout: true });
  const days = {};
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].forEach((n, i) => { days[n] = sb.date(2026, month - 1, mondayDay + i); });
  const seeded = sb.seedWeek(days.mon);
  const timed = (title, day, from, to) => sb.event(title, sb.date(2026, day.getMonth(), day.getDate(), from), sb.date(2026, day.getMonth(), day.getDate(), to), { id: title + day.getDate() });
  const night = day => sb.event('NIGHT 8pm- 12pm', sb.date(2026, day.getMonth(), day.getDate()), sb.date(2026, day.getMonth(), day.getDate() + 1), { allDay: true, id: 'night' + day.getDate() });
  return { sb, days, seeded, timed, night };
}
const pay = (sb, table, shift, hours, y, m, d) =>
  sb.run(`PayTrackerPayCalculator.calculatePay(${JSON.stringify(table)}, ${JSON.stringify(shift)}, ${JSON.stringify(hours)}, new Date(${y}, ${m - 1}, ${d}))`);
const round = v => Math.round(v * 100) / 100;

test('Night Security x1.50: all three payslip lines reproduced exactly at their dated rates', () => {
  const { sb } = week(5);
  assert.equal(pay(sb, 'Night Security Warden', 'Enhanced 1.50', 4.5, 2026, 10, 3), 90.95, 'w/e 04/10: 4.50 x 20.21');
  assert.equal(pay(sb, 'Night Security Warden', 'Enhanced 1.50', 8, 2026, 10, 10), 166.96, 'w/e 11/10: 8.00 x 20.87');
  assert.equal(pay(sb, 'Night Security Warden', 'Enhanced 1.50', 8, 2026, 10, 17), 166.96, 'w/e 18/10: 8.00 x 20.87');
  // As two 4-hour shifts (how PaySheet records them): 2 x 83.48 = 166.96, no rounding gap.
  assert.equal(round(2 * pay(sb, 'Night Security Warden', 'Enhanced 1.50', 4, 2026, 10, 10)), 166.96);
});

test('effective date: Sun 4 Oct (w/e 04/10) keeps 20.21; Mon 5 Oct (w/e 11/10) is 20.87; no date = historical', () => {
  const { sb } = week(5);
  assert.equal(pay(sb, 'Night Security Warden', 'Enhanced 1.50', 1, 2026, 10, 4), 20.21);
  assert.equal(pay(sb, 'Night Security Warden', 'Enhanced 1.50', 1, 2026, 10, 5), 20.87);
  assert.equal(sb.run("PayTrackerPayCalculator.calculatePay('Night Security Warden', 'Enhanced 1.50', 1)"), 20.21);
  assert.equal(sb.run("PayTrackerPayCalculator.getHourlyRate('Night Security Warden', 'Enhanced 1.50', new Date(2026, 9, 20))"), 20.87);
  assert.equal(sb.run("PayTrackerPayCalculator.getHourlyRate('Night Security Warden', 'Enhanced 1.50', new Date(2026, 8, 20))"), 20.21);
});

test('no unevidenced change: Night Basic, 1.20, 1.33, 2.00, 3.00, Overtime 1.50 and Relief rates are the same after 5 Oct', () => {
  const { sb } = week(5);
  for (const [table, shift] of [['Night Security Warden', 'Basic'], ['Night Security Warden', 'Enhanced 1.20'], ['Night Security Warden', 'Enhanced 1.33'],
    ['Night Security Warden', 'Enhanced 2.00'], ['Night Security Warden', 'Enhanced 3.00'], ['Night Security Warden', 'Overtime 1.50'],
    ['Relief Assistant Warden', 'Enhanced 1.50'], ['NHS', 'Basic']]) {
    assert.equal(pay(sb, table, shift, 4, 2026, 10, 20), pay(sb, table, shift, 4, 2026, 9, 20), table + ' ' + shift);
  }
  const entry = sb.json("PayTrackerConfig.PAY_RULE_HISTORY['Night Security Warden']['Enhanced 1.50'][0]");
  assert.equal(entry.contractConfirmed, false, 'payslip-proven, contract date still to be confirmed by Staffline');
});

test('Calendar sync, w/e 11 Oct: the two weekend nights pay 166.96 (as on the payslip) and the missing NHS shift imports', () => {
  const { sb, days, timed, night } = week(5);
  sb.setCalendars({ [OWNER]: [night(days.sat), night(days.sun), timed('NHS Antrim 10-6', days.wed, 10, 18)] });
  sb.sync();
  const sat = sb.shiftOn('Night Security Warden', days.sat);
  const sun = sb.shiftOn('Night Security Warden', days.sun);
  assert.deepEqual(sat, ['Enhanced 1.50', 4, 83.48]);
  assert.deepEqual(sun, ['Enhanced 1.50', 4, 83.48]);
  assert.equal(round(sat[2] + sun[2]), 166.96);
  assert.deepEqual(sb.shiftOn('NHS', days.wed), ['Basic', '', 95.33], '7 Oct, NHS Antrim 10:00-18:00');
});

test('Calendar sync, w/e 04 Oct keeps the old rate (no retrospective change)', () => {
  const { sb, days, night } = week(28, 9); // Mon 28 Sep - Sun 4 Oct
  sb.setCalendars({ [OWNER]: [night(days.sun)] }); // Sun 4 Oct
  sb.sync();
  assert.deepEqual(sb.shiftOn('Night Security Warden', days.sun), ['Enhanced 1.50', 4, 80.84]);
});

function reconcile(sb, originalEstimate, payslip, nhsDay, nightDays) {
  // The corrections, each priced by the engine for its own date:
  const nhsShift = sb.json(`PayTrackerCalendarService.classifyEvent(
    { getTitle: function () { return 'NHS Antrim'; }, getStartTime: function () { return new Date(2026, 9, ${nhsDay[0]}, ${nhsDay[1]}); },
      getEndTime: function () { return new Date(2026, 9, ${nhsDay[0]}, ${nhsDay[2]}); }, isAllDayEvent: function () { return false; } },
    new Date(2026, 9, ${nhsDay[0]}), [])`);
  const missingNhs = sb.run(`PayTrackerPayCalculator.calculatePay('NHS', ${JSON.stringify(nhsShift.shiftType)}, '', new Date(2026, 9, ${nhsDay[0]}))`);
  const nightNow = nightDays.reduce((s, d) => s + pay(sb, 'Night Security Warden', 'Enhanced 1.50', 4, 2026, 10, d), 0);
  const nightBefore = nightDays.reduce((s, d) => s + sb.run("PayTrackerPayCalculator.calculatePay('Night Security Warden', 'Enhanced 1.50', 4)"), 0);
  const corrected = round(originalEstimate + missingNhs + (nightNow - nightBefore));
  sb.context.__p = { payslipId: 'X', fields: payslip, timesheet: { totals: {} } };
  const comparison = sb.json(`PayTrackerPayrollComparisonEngine.compare({ payslipId: 'X', grossPay: ${corrected}, hours: {} }, __p)`);
  const gross = comparison.comparisons.find(c => c.fieldKey === 'grossPay');
  return { missingNhs, nightDelta: round(nightNow - nightBefore), corrected, gross, comparison };
}

test('w/e 11 Oct reconciles: 563.84 + 95.33 + 5.28 = 664.45 vs payslip 664.43 (-0.02)', () => {
  const { sb } = week(5);
  const r = reconcile(sb, 563.84, { grossPay: 664.43, totalDeductions: 152.97, netPay: 511.46 }, [7, 10, 18], [10, 11]);
  assert.equal(r.missingNhs, 95.33);
  assert.equal(r.nightDelta, 5.28);
  assert.equal(r.corrected, 664.45);
  assert.equal(r.gross.difference, -0.02);
  assert.equal(r.gross.status, 'MATCHED');
});

test('w/e 18 Oct reconciles: 719.08 + 95.33 + 5.28 = 819.69 vs payslip 819.67 (-0.02)', () => {
  const { sb } = week(12);
  const r = reconcile(sb, 719.08, { grossPay: 819.67, totalDeductions: 216.80, netPay: 602.87 }, [15, 8, 16], [17, 18]);
  assert.equal(r.missingNhs, 95.33, '15 Oct, NHS Antrim 08:00-16:00');
  assert.equal(r.nightDelta, 5.28);
  assert.equal(r.corrected, 819.69);
  assert.equal(r.gross.difference, -0.02);
});

test('the 2p is rounding: NHS pay is rounded per shift in PaySheet but per line on the payslip', () => {
  const { sb } = week(5);
  const perShift = sb.run("PayTrackerPayCalculator.calculatePay('NHS', 'Basic', '')");
  assert.equal(perShift, 95.33, '7.5 x 12.71 = 95.325, rounded up per shift');
  assert.equal(round(4 * perShift), 381.32, 'four shifts as PaySheet adds them');
  assert.equal(round(30 * 12.71), 381.30, 'the same 30 hours as one payslip line');
  // So four 7.5h NHS basic shifts in a week explain exactly 2p; each such shift adds at most 0.5p.
  assert.equal(round(4 * perShift - 30 * 12.71), 0.02);
  const split = sb.run("PayTrackerPayCalculator.calculatePay('NHS', 'NHS 2pm-10pm Split', '')");
  assert.equal(split, 105.75, '5.5 x 12.71 + 2 x 17.92 = 105.745, rounded up per shift');
});

test('the reconciliation shows actual gross, deductions and net from the payslip, and never invents tax/NI/pension', () => {
  const { sb } = week(5);
  sb.context.__t = ['PAY ADVICE', 'Clock No. N1566677PA', 'PAYMENTS DEDUCTIONS', 'Wk Ending Timesheet Description Units Rate Amount Deduction Amount',
    '11/10/2026 N700003 Enhanced 1.50 8.00 20.87 166.96',
    'Taxable Pay Non-Taxable Pay Total Pay Total Deductions NET PAY 664.43 0.00 664.43 152.97 511.46'].join(' ');
  const parsed = sb.json('PayTrackerPayrollPayslipParser.parse(__t)');
  assert.equal(parsed.parserType, 'STAFFLINE');
  assert.deepEqual([parsed.fields.grossPay, parsed.fields.totalDeductions, parsed.fields.netPay], [664.43, 152.97, 511.46]);
  const r = reconcile(sb, 563.84, parsed.fields, [7, 10, 18], [10, 11]);
  const field = k => r.comparison.comparisons.find(c => c.fieldKey === k);
  assert.equal(field('grossPay').difference, -0.02, 'calculated gross difference');
  assert.equal(field('netPay').actual, 511.46);
  assert.equal(field('totalDeductions').actual, 152.97);
  for (const k of ['netPay', 'totalDeductions', 'incomeTax', 'nationalInsurance', 'pension', 'studentLoan']) {
    assert.equal(field(k).status, 'NOT_AVAILABLE', k + ': no prediction is invented');
  }
});

test('recalculating a week uses each row\'s own date; a hand-corrected Night row is kept by the sync', () => {
  const { sb, days, seeded, night } = week(5);
  sb.setCalendars({ [OWNER]: [night(days.sat), night(days.sun)] });
  sb.sync();
  sb.setShift('Night Security Warden', days.sun, 'Enhanced 1.50', 4.5, 93.92); // owner's correction (4.5 x 20.87)
  const again = sb.sync();
  assert.equal(again.manualChangesPreserved, 1);
  assert.deepEqual(sb.shiftOn('Night Security Warden', days.sun), ['Enhanced 1.50', 4.5, 93.92]);
  // The manual "recalculate" tool prices every row at the rate in force on its own date.
  sb.setShift('Night Security Warden', days.sat, 'Enhanced 1.50', 4, 0);
  sb.context.__s = sb.paySheet;
  sb.context.__start = sb.run(`PayTrackerUtils.getWeekStartRow(${seeded.week})`);
  sb.run("PayTrackerPayCalculator.recalculateWeeklyTable(__s, 'Night Security Warden', __start)");
  assert.deepEqual(sb.shiftOn('Night Security Warden', days.sat), ['Enhanced 1.50', 4, 83.48]);
  // Editing hours by hand re-prices that one row at its own date's rate.
  sb.setShift('Night Security Warden', days.sat, 'Enhanced 1.50', 5, 0);
  sb.context.__row = sb.weekFirstRow + 5;
  sb.run("PayTrackerPayCalculator.updatePayForRow(__s, 'Night Security Warden', __row)");
  assert.deepEqual(sb.shiftOn('Night Security Warden', days.sat), ['Enhanced 1.50', 5, 104.35], '5 x 20.87');
});

console.log(`October payroll scenarios: ${passed}/${passed} passed.`);
