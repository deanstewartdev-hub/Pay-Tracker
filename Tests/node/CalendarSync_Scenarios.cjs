'use strict';
/**
 * End-to-end Calendar -> PaySheet scenarios on in-memory sheets (no Google access).
 *
 * Runs the REAL PayTrackerCalendarService.sync(), addShiftToSheet(), reconcileRemovedEvents(),
 * the Calendar Sync Records and Action Centre repositories and the pay calculator.
 * Only the spreadsheet, the calendars and the week-layout helpers are fake.
 */
const assert = require('node:assert/strict');
const { createSandbox } = require('./gas-sandbox.cjs');

let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }

const OWNER_CALENDAR = 'dean99992011@gmail.com';

// Monday 26 Oct 2026 week.
function fixture(options = {}) {
  const sb = createSandbox(Object.assign({ stubLayout: true }, options));
  const days = {};
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].forEach((n, i) => { days[n] = sb.date(2026, 9, 26 + i); });
  sb.seedWeek(days.mon);
  const shift = (name, day, from, to, extra) => sb.event(name, sb.date(day.getFullYear(), day.getMonth(), day.getDate(), from), sb.date(day.getFullYear(), day.getMonth(), day.getDate(), to), extra);
  return { sb, days, shift };
}

test('accessible calendar: NHS 6-2 and 2-10 shifts import with the right type and fixed pay', () => {
  const { sb, days, shift } = fixture();
  sb.setCalendars({ [OWNER_CALENDAR]: [shift('NHS Coleraine 6-2', days.mon, 6, 14), shift('NHS Coleraine 2-10', days.tue, 14, 22)] });
  const result = sb.sync();
  assert.equal(result.imported, 2);
  assert.deepEqual(sb.shiftOn('NHS', days.mon), ['NHS 6am-2pm Basic', '', 95.33]);
  assert.deepEqual(sb.shiftOn('NHS', days.tue), ['NHS 2pm-10pm Split', '', 105.75]);
  assert.equal(sb.syncRecords().filter(r => r.Status === 'Active').length, 2);
});

test('weekend NHS shifts pay the weekend fixed amounts', () => {
  const { sb, days, shift } = fixture();
  sb.setCalendars({ [OWNER_CALENDAR]: [shift('NHS Coleraine 6am-2pm', days.sat, 6, 14), shift('NHS Coleraine 2pm-10pm', days.sun, 14, 22)] });
  sb.sync();
  assert.deepEqual(sb.shiftOn('NHS', days.sat), ['NHS Saturday', '', 134.4]);
  assert.deepEqual(sb.shiftOn('NHS', days.sun), ['NHS Sunday', '', 174.45]);
});

test('repeat syncs create no duplicates and change nothing', () => {
  const { sb, days, shift } = fixture();
  sb.setCalendars({ [OWNER_CALENDAR]: [shift('NHS Coleraine 6-2', days.mon, 6, 14), shift('NHS Coleraine', days.wed, 0, 0, { allDay: true })] });
  sb.sync();
  const before = { sheet: sb.snapshotPaySheet(), records: sb.syncRecords().length, items: sb.actionItems().length };
  for (let i = 0; i < 3; i++) {
    const again = sb.sync();
    assert.equal(again.imported, 0, 'repeat sync ' + (i + 1) + ' imported something');
    assert.equal(again.removed, 0);
  }
  assert.equal(sb.snapshotPaySheet(), before.sheet, 'PaySheet changed on a repeat sync');
  assert.equal(sb.syncRecords().length, before.records, 'duplicate Calendar Sync Records');
  assert.equal(sb.actionItems().length, before.items, 'duplicate Action Centre items');
  assert.equal(before.items, 1, 'exactly the one uncertain event is reported');
});

test('removed event with an untouched row: the row is cleared and the record closed', () => {
  const { sb, days, shift } = fixture();
  const monday = shift('NHS Coleraine 6-2', days.mon, 6, 14);
  const tuesday = shift('NHS Coleraine 2-10', days.tue, 14, 22);
  sb.setCalendars({ [OWNER_CALENDAR]: [monday, tuesday] });
  sb.sync();
  sb.setCalendars({ [OWNER_CALENDAR]: [monday] });
  const result = sb.sync();
  assert.equal(result.removed, 1);
  assert.deepEqual(sb.shiftOn('NHS', days.tue), ['', '', ''], 'the removed event\'s row should be cleared');
  assert.deepEqual(sb.shiftOn('NHS', days.mon), ['NHS 6am-2pm Basic', '', 95.33], 'other shifts untouched');
  assert.equal(sb.syncRecords().find(r => /2-10/.test(r['Event Title'])).Status, 'Removed');
});

test('removed event whose PaySheet row was edited by hand is PRESERVED and flagged', () => {
  const { sb, days, shift } = fixture();
  const monday = shift('NHS Coleraine 6-2', days.mon, 6, 14);
  sb.setCalendars({ [OWNER_CALENDAR]: [monday] });
  sb.sync();
  sb.setShift('NHS', days.mon, 'NHS 6am-2pm Basic', 8, 110);
  sb.setCalendars({ [OWNER_CALENDAR]: [] });
  const result = sb.sync();
  assert.equal(result.removed, 0);
  assert.equal(result.manualChangesPreserved, 1);
  assert.deepEqual(sb.shiftOn('NHS', days.mon), ['NHS 6am-2pm Basic', 8, 110], 'manual hours/pay must survive');
  assert.equal(sb.syncRecords()[0].Status, 'Manual Override');
  assert.ok(sb.actionItems().some(i => i['Action Type'] === 'Calendar Shift Changed Manually'));
});

test('a manual PaySheet entry is never overwritten by a calendar event on the same day', () => {
  const { sb, days, shift } = fixture();
  sb.setShift('NHS', days.wed, 'Basic', 9, 120);
  sb.setCalendars({ [OWNER_CALENDAR]: [shift('NHS Coleraine 6-2', days.wed, 6, 14)] });
  const result = sb.sync();
  assert.equal(result.imported, 0);
  assert.deepEqual(sb.shiftOn('NHS', days.wed), ['Basic', 9, 120]);
  assert.equal(sb.syncRecords().length, 0, 'no ownership claimed over a manual row');
});

test('an unreadable calendar makes the sync incomplete: removed-event cleanup is SKIPPED and nothing is cleared', () => {
  const { sb, days, shift } = fixture();
  sb.setCalendars({ [OWNER_CALENDAR]: [shift('NHS Coleraine 6-2', days.mon, 6, 14)] });
  sb.sync();
  const before = sb.snapshotPaySheet();
  sb.setCalendars({}); // the calendar is no longer visible to the account
  const result = sb.sync();
  assert.equal(result.removalReconciliationSkipped, true);
  assert.equal(result.removed, 0);
  assert.equal(sb.snapshotPaySheet(), before, 'an unreadable calendar must never wipe PaySheet');
  assert.equal(sb.syncRecords()[0].Status, 'Active');
});

test('partial read (two calendars, one unreadable): readable events import, cleanup is skipped', () => {
  const { sb, days, shift } = fixture({ calendarIds: [OWNER_CALENDAR, 'other@example.invalid'] });
  sb.setCalendars({ [OWNER_CALENDAR]: [shift('NHS Coleraine 6-2', days.mon, 6, 14)], 'other@example.invalid': null });
  const first = sb.sync();
  assert.equal(first.imported, 1);
  assert.equal(first.removalReconciliationSkipped, true);
  // The unreadable calendar once held a shift that is now "missing": it must be kept.
  sb.setCalendars({ [OWNER_CALENDAR]: [], 'other@example.invalid': 'THROWS' });
  const second = sb.sync();
  assert.equal(second.removed, 0);
  assert.deepEqual(sb.shiftOn('NHS', days.mon), ['NHS 6am-2pm Basic', '', 95.33]);
});

test('a calendar whose events cannot be read counts as incomplete, not as "no events"', () => {
  const { sb, days, shift } = fixture();
  sb.setCalendars({ [OWNER_CALENDAR]: [shift('NHS Coleraine 6-2', days.mon, 6, 14)] });
  sb.sync();
  sb.setCalendars({ [OWNER_CALENDAR]: { readThrows: true, events: [] } });
  const result = sb.sync();
  assert.equal(result.removalReconciliationSkipped, true);
  assert.equal(result.removed, 0);
});

test('the sync summary line tells the owner when events were unrecognised or cleanup was skipped', () => {
  const { sb, days, shift } = fixture();
  sb.setCalendars({ [OWNER_CALENDAR]: [shift('NHS Coleraine', days.mon, 0, 0, { allDay: true })] });
  const result = sb.sync();
  const text = sb.json('PayTrackerSyncService.mapCalendarResult_(' + JSON.stringify(result) + ').message');
  assert.match(text, /1 of those look like shifts and need checking/);
  sb.setCalendars({});
  const skipped = sb.sync();
  assert.match(sb.json('PayTrackerSyncService.mapCalendarResult_(' + JSON.stringify(skipped) + ').message'), /diagnoseCalendarAccess/);
});

test('NHS title variations: recognised ones import, unrecognised ones are reported and NOT guessed', () => {
  const { sb, days, shift } = fixture();
  const events = [
    shift('NHS Coleraine', days.mon, 0, 0, { allDay: true }),
    shift('NHS Coleraine 6-2', days.tue, 6, 14),
    shift('Coleraine NHS 2pm', days.wed, 14, 22),
    shift('NHS Coleraine 7-3', days.thu, 7, 15),
    shift('Coleraine Hospital 6-2', days.fri, 6, 14),
    shift('NHS Coleraine security', days.sat, 6, 14),
    shift('Dentist 2pm', days.sun, 14, 15)
  ];
  sb.setCalendars({ [OWNER_CALENDAR]: events });
  const result = sb.sync();
  const byDate = Object.fromEntries(result.uncertainEvents.map(e => [e.date, e.code]));
  assert.equal(byDate['2026-10-26'], 'NHS_MISSING_TIME');
  assert.equal(byDate['2026-10-29'], 'NHS_UNSUPPORTED_TIME');
  assert.equal(byDate['2026-10-30'], 'UNRECOGNISED_HOSPITAL');
  assert.equal(byDate['2026-10-31'], 'AMBIGUOUS_ROLE');
  assert.equal(byDate['2026-11-01'], undefined, 'a personal appointment is not reported');
  assert.equal(result.imported, 2, 'only the two recognised titles import');
  assert.deepEqual(sb.shiftOn('NHS', days.tue), ['NHS 6am-2pm Basic', '', 95.33]);
  assert.deepEqual(sb.shiftOn('NHS', days.wed), ['NHS 2pm-10pm Split', '', 105.75]);
  for (const day of ['mon', 'thu', 'fri', 'sat', 'sun']) {
    assert.deepEqual(sb.shiftOn('NHS', days[day]), ['', '', ''], day + ' must stay blank: no guessing');
  }
  assert.equal(sb.actionItems().filter(i => i['Action Type'] === 'Calendar Event Needs Review').length, 4);
});

test('existing rule preserved: a title with NHS, another role word AND a 6-2 time still classifies as NHS', () => {
  const { sb, days, shift } = fixture();
  sb.setCalendars({ [OWNER_CALENDAR]: [shift('NHS Coleraine security 6-2', days.mon, 6, 14)] });
  const result = sb.sync();
  assert.equal(result.imported, 1);
  assert.equal(result.uncertain, 0, 'classified events are never reported as uncertain');
  assert.deepEqual(sb.shiftOn('NHS', days.mon), ['NHS 6am-2pm Basic', '', 95.33]);
});

test('a diagnostics failure can never stop the sync or change what it imports', () => {
  const { sb, days, shift } = fixture();
  sb.run('PayTrackerActionCentreRepository = Object.assign({}, PayTrackerActionCentreRepository, { create: function () { throw new Error("Action Centre unavailable"); } })');
  sb.setCalendars({ [OWNER_CALENDAR]: [shift('NHS Coleraine 6-2', days.mon, 6, 14), shift('NHS Coleraine', days.tue, 0, 0, { allDay: true })] });
  const result = sb.sync();
  assert.equal(result.imported, 1);
  assert.match(result.uncertainError, /Action Centre unavailable/);
  assert.deepEqual(sb.shiftOn('NHS', days.mon), ['NHS 6am-2pm Basic', '', 95.33]);
});

test('review items are capped per sync and the most recent events come first', () => {
  const { sb, days } = fixture();
  const events = [];
  for (let i = 0; i < 30; i++) {
    const day = sb.date(2026, 9, 1 + i);
    events.push(sb.event('NHS ward cover', day, sb.date(2026, 9, 1 + i, 14), {}));
  }
  sb.setCalendars({ [OWNER_CALENDAR]: events });
  const result = sb.sync();
  assert.equal(result.uncertain, 30);
  assert.equal(result.uncertainEvents.length, 25);
  assert.equal(result.uncertainEvents[0].date, '2026-10-30', 'newest first');
  assert.equal(sb.actionItems().length, 25);
});

test('read-only diagnostics change nothing and raise no Action Centre items', () => {
  const { sb, days, shift } = fixture();
  sb.setCalendars({ [OWNER_CALENDAR]: [shift('NHS Coleraine', days.mon, 0, 0, { allDay: true }), shift('NHS Coleraine 6-2', days.tue, 6, 14)] });
  const before = { sheet: sb.snapshotPaySheet(), items: sb.actionItems().length, records: sb.syncRecords().length };
  const access = sb.json('diagnoseCalendarAccess()');
  const review = sb.json('reviewUnrecognisedCalendarEvents()');
  assert.equal(access.success, true);
  assert.equal(access.calendars[0].accessible, true);
  assert.equal(review.needsReview, 1);
  assert.equal(sb.snapshotPaySheet(), before.sheet);
  assert.equal(sb.actionItems().length, before.items);
  assert.equal(sb.syncRecords().length, before.records);
  assert.ok(sb.calendarCalls.every(c => c[0] === 'getCalendarById' || c[0] === 'getEvents'), 'only read calls were made');
});

test('diagnoseCalendarAccess names the unreadable calendar (the failure PR #45 fixed)', () => {
  const { sb } = fixture({ calendarIds: [OWNER_CALENDAR, 'unshared@example.invalid'] });
  sb.setCalendars({ [OWNER_CALENDAR]: [] });
  const report = sb.json('diagnoseCalendarAccess()');
  assert.equal(report.success, false);
  assert.equal(report.syncComplete, false);
  assert.equal(report.removalCleanupWouldRun, false);
  assert.equal(report.calendars.find(c => c.calendarId === 'unshared@example.invalid').status, 'NOT_FOUND_OR_NO_ACCESS');
  assert.ok(sb.logs.some(line => /FAIL\s+unshared@example.invalid/.test(line)));
});

test('pay calculations are unchanged: every NHS shift type keeps its fixed amount and hourly rate', () => {
  const { sb } = fixture();
  const expected = {
    'Basic': [95.33, 12.71], 'NHS 6am-2pm Basic': [95.33, 12.71], 'NHS 2pm-10pm Split': [105.75, null],
    'NHS Saturday': [134.4, 17.92], 'NHS Sunday': [174.45, 23.26],
    'HSC Unsoc: M-F 8pm-6am & Sat': [35.84, 17.92], 'HSC Unsoc: Sunday & Pub Hol': [174.45, 23.26],
    'HSC Overtime: M-F & Sat/Sun': [154.95, 20.66], 'HSC Overtime: Bank/Pub Hol': [198.45, 26.46]
  };
  for (const [shift, [fixed, rate]] of Object.entries(expected)) {
    assert.equal(sb.run(`PayTrackerPayCalculator.calculatePay('NHS', ${JSON.stringify(shift)}, '')`), fixed, shift + ' fixed');
    const withHours = sb.run(`PayTrackerPayCalculator.calculatePay('NHS', ${JSON.stringify(shift)}, 8)`);
    assert.equal(withHours, rate === null ? fixed : Math.round(8 * rate * 100) / 100, shift + ' with 8 hours');
  }
});

test('Relief Warden, Night Security and Logging shifts import with the right type, hours and pay', () => {
  const { sb, days, shift } = fixture();
  sb.setCalendars({ [OWNER_CALENDAR]: [
    shift('Caravan site 9-8', days.mon, 9, 19),
    shift('Relief warden 8-12', days.tue, 20, 23),
    shift('Caravan 9-8', days.sat, 9, 19),
    shift('Night security', days.wed, 20, 23),
    // All-day events report 24h; the role's standard 4h must be used instead (PR #42).
    shift('NIGHT 8pm- 12pm', days.thu, 0, 0, { allDay: true }),
    shift('Night security', days.sun, 20, 24),
    shift('Logging', days.fri, 9, 15)
  ] });
  const result = sb.sync();
  assert.equal(result.imported, 7);
  assert.equal(result.uncertain, 0);
  assert.deepEqual(sb.shiftOn('Relief Assistant Warden', days.mon), ['Basic', 10, 136.9]);
  assert.deepEqual(sb.shiftOn('Relief Assistant Warden', days.tue), ['Enhanced 1.33', 3, 54.63]);
  assert.deepEqual(sb.shiftOn('Relief Assistant Warden', days.sat), ['Enhanced 1.50', 10, 205.4]);
  // x1.33 = GBP 17.92, as on the real Aug 2026 payslip (N621105/N624148), not 17.91.
  assert.deepEqual(sb.shiftOn('Night Security Warden', days.wed), ['Enhanced 1.33', 3, 53.76]);
  assert.deepEqual(sb.shiftOn('Night Security Warden', days.thu), ['Enhanced 1.33', 4, 71.68]);
  // 1 Nov 2026 is after the payslip-proven x1.50 rate change (from w/e 11 Oct): 4 x 20.87.
  assert.deepEqual(sb.shiftOn('Night Security Warden', days.sun), ['Enhanced 1.50', 4, 83.48]);
  assert.deepEqual(sb.shiftOn('Logging Cash', days.fri), ['Logging Cash £10/hr', 6, 60]);
  assert.deepEqual(sb.shiftOn('NHS', days.mon), ['', '', ''], 'non-NHS shifts must not land in the NHS table');
});

test('previewCalendarManualOverrides lists exactly the rows the next sync would keep as manual, and changes nothing', () => {
  const { sb, days, shift } = fixture();
  sb.setCalendars({ [OWNER_CALENDAR]: [shift('NIGHT 8pm- 12pm', days.mon, 0, 0, { allDay: true }), shift('Caravan site 9-8', days.tue, 9, 19)] });
  sb.sync();
  // As in the old 24-hour episode: the sync record and the row disagree.
  sb.setShift('Night Security Warden', days.mon, 'Enhanced 1.33', 24, 429.84);
  const before = sb.snapshotPaySheet();
  const records = JSON.stringify(sb.syncRecords());
  sb.context.__paySheet = sb.paySheet;
  const report = sb.json('previewCalendarManualOverrides(__paySheet)');
  assert.equal(report.checked, 2);
  assert.equal(report.wouldBePreserved.length, 1);
  assert.equal(report.wouldBePreserved[0].table, 'Night Security Warden');
  assert.deepEqual(report.wouldBePreserved[0].rowNow, ['Enhanced 1.33', 24, 429.84]);
  assert.equal(sb.snapshotPaySheet(), before, 'PaySheet unchanged');
  assert.equal(JSON.stringify(sb.syncRecords()), records, 'sync records unchanged');
  assert.equal(sb.actionItems().length, 0, 'no Action Centre items raised');
});

test('a hand-edited Relief Warden row is never overwritten by a later sync', () => {
  const { sb, days, shift } = fixture();
  sb.setCalendars({ [OWNER_CALENDAR]: [shift('Caravan site 9-8', days.mon, 9, 19)] });
  sb.sync();
  sb.setShift('Relief Assistant Warden', days.mon, 'Basic', 11, 150.59);
  const again = sb.sync();
  assert.equal(again.imported, 0);
  assert.equal(again.manualChangesPreserved, 1);
  assert.deepEqual(sb.shiftOn('Relief Assistant Warden', days.mon), ['Basic', 11, 150.59]);
  assert.equal(sb.syncRecords()[0].Status, 'Manual Override');
  assert.equal(sb.actionItems().filter(i => i['Action Type'] === 'Calendar Shift Changed Manually').length, 1);
  // Later syncs leave the row alone and raise nothing new.
  const snapshot = sb.snapshotPaySheet();
  sb.sync(); sb.sync();
  assert.equal(sb.snapshotPaySheet(), snapshot);
  assert.equal(sb.actionItems().length, 1);
});

test('a calendar-owned row the owner CLEARED by hand is not re-filled by the next sync', () => {
  const { sb, days, shift } = fixture();
  sb.setCalendars({ [OWNER_CALENDAR]: [shift('NHS Coleraine 6-2', days.mon, 6, 14)] });
  sb.sync();
  sb.setShift('NHS', days.mon, '', '', '');
  const again = sb.sync();
  assert.equal(again.manualChangesPreserved, 1);
  assert.deepEqual(sb.shiftOn('NHS', days.mon), ['', '', '']);
});

test('an untouched calendar-owned row still follows a changed event (no false manual-edit flags)', () => {
  const { sb, days, shift } = fixture();
  sb.setCalendars({ [OWNER_CALENDAR]: [shift('Caravan site 9-8', days.mon, 9, 19)] });
  sb.sync();
  sb.setCalendars({ [OWNER_CALENDAR]: [shift('Caravan site 9-8', days.mon, 9, 17)] });
  const result = sb.sync();
  assert.equal(result.manualChangesPreserved, 0);
  assert.deepEqual(sb.shiftOn('Relief Assistant Warden', days.mon), ['Basic', 8, 109.52]);
  assert.equal(sb.actionItems().length, 0);
});

console.log(`Calendar sync scenarios: ${passed}/${passed} passed.`);
