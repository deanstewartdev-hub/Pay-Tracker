'use strict';
/**
 * NHS payroll accuracy (both hospitals, all four shifts) and placement-level Staffline
 * reconciliation. Runs the REAL Calendar classifier/sync, pay calculator and Staffline
 * reconciliation on in-memory sheets.
 *
 * Pay basis, all verified against real Aug 2026 payslips:
 *  - every NHS shift is 8h with a 30-minute unpaid break = 7.5 paid hours;
 *  - weekday 7.5h basic at 12.71 = 95.33 (06-14, 08-16, 10-18);
 *  - weekday 14-22 = 5.5h basic + 2h unsocial (20:00-22:00) at 17.92 = 69.91 + 35.84 = 105.75;
 *  - Saturday 7.5h at 17.92 = 134.40; Sunday 7.5h at 23.26 = 174.45.
 */
process.env.TZ = 'Europe/London';
const assert = require('node:assert/strict');
const { createSandbox } = require('./gas-sandbox.cjs');

let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }

const OWNER = 'dean99992011@gmail.com';

function fixture(mondayDay = 26, month = 10) {
  const sb = createSandbox({ stubLayout: true });
  const days = {};
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].forEach((n, i) => { days[n] = sb.date(2026, month - 1, mondayDay + i); });
  sb.seedWeek(days.mon);
  const shift = (title, day, from, to, extra) => sb.event(title, sb.date(day.getFullYear(), day.getMonth(), day.getDate(), from),
    sb.date(day.getFullYear(), day.getMonth(), day.getDate(), to), Object.assign({ id: 'evt-' + title + day.getDate() }, extra || {}));
  return { sb, days, shift };
}

function classify(sb, title, from, to, opts = {}) {
  sb.context.__e = sb.event(title, sb.date(2026, 9, opts.day || 27, from), sb.date(2026, 9, opts.day || 27, to), opts.extra || {});
  sb.context.__d = sb.date(2026, 9, opts.day || 27);
  return sb.json('PayTrackerCalendarService.classifyEvent(__e, __d, [])');
}

const WEEKDAY = {
  '6-14': ['NHS 6am-2pm Basic', '', 95.33],
  '8-16': ['Basic', '', 95.33],
  '10-18': ['Basic', '', 95.33],
  '14-22': ['NHS 2pm-10pm Split', '', 105.75]
};

for (const hospital of ['NHS Antrim', 'NHS Causeway Hospital Coleraine']) {
  test(hospital + ': all four weekday shifts import with the right type and pay', () => {
    const { sb, days, shift } = fixture();
    sb.setCalendars({ [OWNER]: [
      shift(hospital + ' 6-2', days.mon, 6, 14),
      shift(hospital + ' 8-4', days.tue, 8, 16),
      shift(hospital + ' 10-6', days.wed, 10, 18),
      shift(hospital + ' 2-10', days.thu, 14, 22)
    ] });
    const r = sb.sync();
    assert.equal(r.imported, 4);
    assert.equal(r.uncertain, 0);
    assert.deepEqual(sb.shiftOn('NHS', days.mon), WEEKDAY['6-14']);
    assert.deepEqual(sb.shiftOn('NHS', days.tue), WEEKDAY['8-16']);
    assert.deepEqual(sb.shiftOn('NHS', days.wed), WEEKDAY['10-18']);
    assert.deepEqual(sb.shiftOn('NHS', days.thu), WEEKDAY['14-22']);
    // Hospital identity is kept on the Calendar Sync Record.
    assert.ok(sb.syncRecords().every(rec => rec['Event Title'].indexOf(hospital) === 0));
  });

  test(hospital + ': weekend shifts pay the Saturday and Sunday rates for every window', () => {
    const { sb, days, shift } = fixture();
    sb.setCalendars({ [OWNER]: [shift(hospital + ' 10-6', days.sat, 10, 18), shift(hospital + ' 8-4', days.sun, 8, 16)] });
    sb.sync();
    assert.deepEqual(sb.shiftOn('NHS', days.sat), ['NHS Saturday', '', 134.4]);
    assert.deepEqual(sb.shiftOn('NHS', days.sun), ['NHS Sunday', '', 174.45]);
  });
}

test('calendar title formats: spacing, capitals, 24-hour, am/pm, en-dash, "to", and hospital aliases', () => {
  const sb = createSandbox({ stubLayout: true });
  const cases = [
    ['NHS ANTRIM 6-2', 6, 14, 'NHS 6am-2pm Basic'], ['nhs antrim 06:00-14:00', 6, 14, 'NHS 6am-2pm Basic'],
    ['NHS Antrim 0600-1400', 6, 14, 'NHS 6am-2pm Basic'], ['NHS Coleraine 6am - 2pm', 6, 14, 'NHS 6am-2pm Basic'],
    ['NHS Antrim 8-4', 8, 16, 'Basic'], ['NHS Antrim 08:00 – 16:00', 8, 16, 'Basic'], ['NHS Coleraine 8am-4pm', 8, 16, 'Basic'],
    ['NHS Antrim 8 to 4', 8, 16, 'Basic'], ['Antrim Area Hospital 8-4', 8, 16, 'Basic'],
    ['NHS Coleraine 10-6', 10, 18, 'Basic'], ['NHS Causeway 10:00-18:00', 10, 18, 'Basic'], ['Causeway Hospital 10am-6pm', 10, 18, 'Basic'],
    ['NHS Coleraine 2-10', 14, 22, 'NHS 2pm-10pm Split'], ['NHS Antrim 14:00-22:00', 14, 22, 'NHS 2pm-10pm Split'],
    ['Coleraine NHS 2pm', 14, 22, 'NHS 2pm-10pm Split'], ['HSC Antrim Hospital 2pm-10pm', 14, 22, 'NHS 2pm-10pm Split'],
    // A date in the title must not hide the shift range after it.
    ['NHS Antrim 07-10 6-2', 6, 14, 'NHS 6am-2pm Basic'], ['NHS Coleraine 15-10 8-4', 8, 16, 'Basic']
  ];
  for (const [title, from, to, type] of cases) {
    const r = classify(sb, title, from, to);
    assert.ok(r, title + ' was not recognised');
    assert.equal(r.tableName, 'NHS', title);
    assert.equal(r.shiftType, type, title);
  }
});

test('no time in the title: a timed event uses its own times; all-day, off-pattern, conflicting or ambiguous ones are not guessed', () => {
  const sb = createSandbox({ stubLayout: true });
  assert.equal(classify(sb, 'NHS Antrim', 10, 18).shiftType, 'Basic', '10:00-18:00 from the event');
  assert.equal(classify(sb, 'NHS Coleraine', 14, 22).shiftType, 'NHS 2pm-10pm Split');
  assert.equal(classify(sb, 'NHS Antrim', 0, 0, { extra: { allDay: true } }), null, 'all-day: nothing to read');
  assert.equal(classify(sb, 'NHS Antrim', 7, 15), null, '07:00-15:00 is not an NHS shift');
  assert.equal(classify(sb, 'NHS Antrim 9am', 6, 14), null, 'title says 9am: the event times do not override it');
  assert.equal(classify(sb, 'NHS Antrim 7-3', 6, 14), null, 'title states an unsupported range');
  assert.equal(classify(sb, 'NHS Coleraine security', 6, 14), null, 'NHS plus another role stays ambiguous');
});

test('council names are not NHS: "Coleraine"/"Causeway" alone stay with their own roles', () => {
  const sb = createSandbox({ stubLayout: true });
  assert.equal(classify(sb, 'Coleraine 6-2', 6, 14), null);
  assert.equal(classify(sb, 'Causeway Coast night security 8-12', 20, 24).tableName, 'Night Security Warden');
  assert.equal(classify(sb, 'Coleraine Hospital 6-2', 6, 14), null, 'an unnamed hospital is still reported, not guessed');
});

test('unsocial hours 20:00-22:00 are preserved in the 14-22 split', () => {
  const sb = createSandbox({});
  const pay = n => sb.run(`PayTrackerPayCalculator.calculatePay('NHS', ${JSON.stringify(n)}, '')`);
  assert.equal(pay('NHS 2pm-10pm Split'), 105.75);
  assert.equal(Math.round((5.5 * 12.71 + 2 * 17.92) * 100) / 100, 105.75, '5.5h basic + 2h unsocial');
  assert.equal(pay('HSC Unsoc: M-F 8pm-6am & Sat'), 35.84, '2h unsocial component, as on the payslip');
  assert.equal(pay('Basic'), 95.33);
  assert.equal(Math.round(7.5 * 12.71 * 100) / 100, 95.33, '30-minute unpaid break');
});

test('October: the two missing Antrim shifts now import (7 Oct 10-18, 15 Oct 8-16)', () => {
  const w1 = fixture(5, 10);
  w1.sb.setCalendars({ [OWNER]: [w1.shift('NHS Antrim 10-6', w1.days.wed, 10, 18)] });
  w1.sb.sync();
  assert.deepEqual(w1.sb.shiftOn('NHS', w1.days.wed), ['Basic', '', 95.33], '7 Oct (week ending 11 Oct)');
  const w2 = fixture(12, 10);
  w2.sb.setCalendars({ [OWNER]: [w2.shift('NHS Antrim', w2.days.thu, 8, 16)] });
  w2.sb.sync();
  assert.deepEqual(w2.sb.shiftOn('NHS', w2.days.thu), ['Basic', '', 95.33], '15 Oct (week ending 18 Oct), even with no time in the title');
});

test('a hand-corrected NHS row is never overwritten; an untouched row follows the calendar', () => {
  const { sb, days, shift } = fixture();
  sb.setCalendars({ [OWNER]: [shift('NHS Antrim 8-4', days.mon, 8, 16), shift('NHS Antrim 10-6', days.tue, 10, 18)] });
  sb.sync();
  sb.setShift('NHS', days.mon, 'HSC Overtime: M-F & Sat/Sun', 7.5, 154.95);
  const r = sb.sync();
  assert.equal(r.manualChangesPreserved, 1);
  assert.deepEqual(sb.shiftOn('NHS', days.mon), ['HSC Overtime: M-F & Sat/Sun', 7.5, 154.95]);
  assert.deepEqual(sb.shiftOn('NHS', days.tue), ['Basic', '', 95.33]);
});

test('historical pay: a Night x1.33 row written at the old 17.91 is corrected; a hand-corrected one is kept', () => {
  const { sb, days, shift } = fixture();
  sb.setCalendars({ [OWNER]: [shift('Night security', days.mon, 20, 24), shift('Night security', days.tue, 20, 24)] });
  sb.sync();
  // Make both rows and their sync records look as the pre-fix code left them (4h x 17.91).
  const recordsSheet = sb.getSheet(sb.run('PayTrackerReconciliationConfig.SHEETS.CALENDAR_SYNC_RECORDS.NAME'));
  const payCol = recordsSheet.rows[0].indexOf('Pay');
  recordsSheet.rows.slice(1).forEach(row => { row[payCol] = 71.64; });
  sb.setShift('Night Security Warden', days.mon, 'Enhanced 1.33', 4, 71.64);
  sb.setShift('Night Security Warden', days.tue, 'Enhanced 1.33', 4.5, 80.6); // owner's own correction
  const r = sb.sync();
  assert.deepEqual(sb.shiftOn('Night Security Warden', days.mon), ['Enhanced 1.33', 4, 71.68], 'calendar-owned row: 4 x 17.92');
  assert.deepEqual(sb.shiftOn('Night Security Warden', days.tue), ['Enhanced 1.33', 4.5, 80.6], 'manual correction kept');
  assert.equal(r.manualChangesPreserved, 1);
  assert.equal(sb.run(`PayTrackerPayCalculator.calculatePay('Night Security Warden', 'Enhanced 1.33', 4)`), 71.68);
  assert.equal(sb.run(`PayTrackerPayCalculator.calculatePay('Night Security Warden', 'Enhanced 1.50', 4)`), 80.84);
});

// --- Staffline: separate placements, combined payslip ---
function stafflineWeek() {
  const sb = createSandbox({});
  const R = sb.context.PayTrackerStafflineReconciliationService;
  const D = sb.run('Date');
  const nhs = (title, day, extra) => Object.assign({ jobId: 'JOB-NHS', tableName: 'NHS', hours: '', eventTitle: title,
    eventStart: new D(2026, 9, day, 8), eventKey: title + day }, extra || {});
  const shifts = [
    nhs('NHS Antrim 8-4', 5), nhs('NHS Antrim 10-6', 6), nhs('NHS Antrim 8-4', 7), nhs('NHS Antrim 6-2', 8), // 4 x 7.5 = 30h
    nhs('NHS Coleraine 2-10', 9), nhs('NHS Causeway Hospital 10-6', 10)                                   // 2 x 7.5 = 15h
  ];
  const ts = (id, address) => ({ timesheetId: id, jobId: 'JOB-NHS', classificationStatus: 'Classified', placementDescription: 'Car Parking Assistant',
    clientName: 'Northern Health & Social Care Trust', workAddress: address, timesheetStart: new D(2026, 9, 5), timesheetEnd: new D(2026, 9, 11) });
  const antrim = ts('N700001', 'Antrim Area Hospital, Bush Road, Antrim');
  const causeway = ts('N700002', 'Causeway Hospital, Newbridge Road, Coleraine');
  const line = (id, desc, units, rate) => ({ normalizedTimesheetId: id, description: desc, units, rate, amount: Math.round(units * rate * 100) / 100 });
  const lines = [line('700001', 'Basic', 30, 12.71), line('700002', 'Basic', 15, 12.71)];
  return { R, D, shifts, antrim, causeway, lines };
}

test('Staffline: each NHS placement is reconciled against its own hospital\'s shifts (30h and 15h, never 45h)', () => {
  const { R, D, shifts, antrim, causeway, lines } = stafflineWeek();
  const today = new D(2026, 9, 24);
  const a = R.reconcileTimesheet_(antrim, { submittedHours: 30 }, shifts, lines, today);
  const c = R.reconcileTimesheet_(causeway, { submittedHours: 15 }, shifts, lines, today);
  assert.equal(a.calendarExpectedHours, 30);
  assert.equal(c.calendarExpectedHours, 15);
  assert.equal(a.calendarStatus, 'Match');
  assert.equal(c.calendarStatus, 'Match');
  assert.equal(a.calendarEventKeys.length, 4);
  assert.equal(c.calendarEventKeys.length, 2);
});

test('Staffline: no combined-placement overtime; the payslip total still includes both placements', () => {
  const { R, D, shifts, antrim, causeway, lines } = stafflineWeek();
  const today = new D(2026, 9, 24);
  const rows = [R.reconcileTimesheet_(antrim, { submittedHours: 30 }, shifts, lines, today),
    R.reconcileTimesheet_(causeway, { submittedHours: 15 }, shifts, lines, today)];
  assert.deepEqual(rows.map(r => r.payslipPaidHours), [30, 15], 'paid hours stay per placement');
  assert.ok(lines.every(l => !/overtime/i.test(l.description)), '45h across two placements creates no overtime line');
  assert.equal(Math.round(rows.reduce((s, r) => s + r.payslipPaidAmount, 0) * 100) / 100, Math.round(45 * 12.71 * 100) / 100,
    'combined payslip income = both placements');
  assert.equal(R.sumHours_(shifts), 45, 'the combined calendar total is still available for income reporting');
});

test('Staffline: Causeway shifts are reported missing when only an Antrim timesheet exists', () => {
  const { R, shifts, antrim } = stafflineWeek();
  const missing = R.findMissingFromStaffline_(shifts, [antrim], [{ jobId: 'JOB-NHS' }]);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].calendarExpectedHours, 15);
  assert.equal(missing[0].calendarEventKeys.length, 2);
});

test('Staffline: a timesheet or shift that names no hospital still matches (nothing hidden)', () => {
  const { R, D, shifts, antrim, lines } = stafflineWeek();
  const unnamed = Object.assign({}, antrim, { workAddress: '', placementDescription: 'Car Parking Assistant', clientName: 'Northern Health & Social Care Trust' });
  assert.equal(R.reconcileTimesheet_(unnamed, { submittedHours: 45 }, shifts, lines, new D(2026, 9, 24)).calendarExpectedHours, 45);
});

console.log(`NHS payroll scenarios: ${passed}/${passed} passed.`);
