/*******************************************************
 * PAY TRACKER V3.2 - safe Calendar diagnostics tests.
 *
 * Pure: every calendar is a fake object passed in, nothing reads
 * Google Calendar and nothing writes to any sheet. Safe to run
 * against the live spreadsheet at any time.
 *
 * The end-to-end sync scenarios (repeat syncs, removed events,
 * manual edits, partial reads) need a sheet to write to, so they
 * live in Tests/node/CalendarSync_Scenarios.cjs and run on
 * in-memory sheets.
 *******************************************************/

function runCalendarDiagnosticsTests() {
  const results = [];
  function check(name, condition) {
    if (!condition) throw new Error('Failed: ' + name);
    results.push({ name: name, passed: true });
  }
  function event(title, start, end, description) {
    return {
      getTitle: function() { return title; },
      getDescription: function() { return description || ''; },
      getLocation: function() { return ''; },
      getStartTime: function() { return start; },
      getEndTime: function() { return end; },
      isAllDayEvent: function() { return false; }
    };
  }
  function fakeApi(map) {
    const calls = [];
    return {
      calls: calls,
      getCalendarById: function(id) {
        calls.push('getCalendarById');
        const entry = map[id];
        if (entry === 'THROWS') throw new Error('service unavailable');
        if (!entry) return null;
        return {
          getEvents: function() {
            calls.push('getEvents');
            if (entry.readThrows) throw new Error('read failed');
            return entry.events || [];
          }
        };
      }
    };
  }
  const D = PayTrackerCalendarDiagnosticsService;
  const start = new Date(2026, 9, 1);
  const end = new Date(2026, 10, 1);
  const monday = new Date(2026, 9, 26, 6, 0, 0);
  const mondayEnd = new Date(2026, 9, 26, 14, 0, 0);
  function concernFor(title) {
    return D.assessUnclassifiedEvent(event(title, monday, mondayEnd));
  }
  // An all-day event: no start/end times to read the shift from.
  function allDay(title) {
    const e = event(title, new Date(2026, 9, 26), new Date(2026, 9, 27));
    e.isAllDayEvent = function() { return true; };
    return e;
  }
  function allDayConcern(title) {
    return D.assessUnclassifiedEvent(allDay(title));
  }
  function classify(title) {
    return PayTrackerCalendarService.classifyEvent(event(title, monday, mondayEnd), new Date(2026, 9, 26), []);
  }

  // --- configuration ---
  check('a normal ID list has no problems', D.checkConfiguration(['a@gmail.com', 'b@group.calendar.google.com']).problems.length === 0);
  check('an empty list is a problem', D.checkConfiguration([]).problems[0].code === 'NO_CALENDARS_CONFIGURED');
  check('a missing list is a problem', D.checkConfiguration(undefined).problems[0].code === 'NO_CALENDARS_CONFIGURED');
  check('a duplicate ID is reported once and dropped, ignoring case',
    D.checkConfiguration(['a@gmail.com', 'A@GMAIL.COM']).problems.some(function(p) { return p.code === 'DUPLICATE_CALENDAR_ID'; }) &&
    D.checkConfiguration(['a@gmail.com', 'A@GMAIL.COM']).ids.length === 1);
  check('an ID with a space is malformed', D.checkConfiguration(['a @gmail.com']).problems[0].code === 'MALFORMED_CALENDAR_ID');
  check('an ID without @ is malformed', D.checkConfiguration(['plainname']).problems[0].code === 'MALFORMED_CALENDAR_ID');
  check('a blank ID is reported', D.checkConfiguration(['', 'a@gmail.com']).problems[0].code === 'EMPTY_CALENDAR_ID');
  check('the real configured IDs are well formed', D.checkConfiguration(PayTrackerConfig.CALENDAR.IDS).problems.length === 0);

  // --- access ---
  const ok = fakeApi({ 'a@gmail.com': { events: [{}, {}, {}] } });
  const okReport = D.diagnoseAccess({ ids: ['a@gmail.com'], calendarApi: ok, startDate: start, endDate: end });
  check('an accessible calendar is reported with its event count',
    okReport.success && okReport.calendars[0].accessible && okReport.calendars[0].eventCount === 3);
  check('an accessible calendar means a complete sync and cleanup runs', okReport.syncComplete && okReport.removalCleanupWouldRun);
  check('the access check only reads: it never calls anything but getCalendarById/getEvents',
    ok.calls.every(function(name) { return name === 'getCalendarById' || name === 'getEvents'; }));

  const missing = D.diagnoseAccess({ ids: ['a@gmail.com'], calendarApi: fakeApi({}), startDate: start, endDate: end, runningAs: 'owner@example.com' });
  check('an inaccessible calendar is reported by ID and status',
    !missing.success && missing.calendars[0].status === 'NOT_FOUND_OR_NO_ACCESS' && missing.calendars[0].calendarId === 'a@gmail.com');
  check('the message names the account that cannot see it', missing.calendars[0].message.indexOf('owner@example.com') !== -1);
  check('an inaccessible calendar means an incomplete sync with cleanup skipped', !missing.syncComplete && !missing.removalCleanupWouldRun);
  check('the report tells the owner what to do next', missing.nextSteps.length > 0 && missing.summary.indexOf('cannot be read') !== -1);

  const partial = D.diagnoseAccess({
    ids: ['a@gmail.com', 'b@gmail.com'], calendarApi: fakeApi({ 'a@gmail.com': { events: [{}] } }), startDate: start, endDate: end
  });
  check('a partial read is reported: one readable, one not', partial.accessibleCount === 1 && partial.configuredCount === 2 && !partial.syncComplete);

  const lookupError = D.diagnoseAccess({ ids: ['a@gmail.com'], calendarApi: fakeApi({ 'a@gmail.com': 'THROWS' }), startDate: start, endDate: end });
  check('a lookup error is reported, not thrown', lookupError.calendars[0].status === 'LOOKUP_ERROR' && !lookupError.syncComplete);
  const readError = D.diagnoseAccess({ ids: ['a@gmail.com'], calendarApi: fakeApi({ 'a@gmail.com': { readThrows: true } }), startDate: start, endDate: end });
  check('an events read error is reported as a read error', readError.calendars[0].status === 'READ_ERROR' && !readError.syncComplete);
  check('no configured calendars is never "complete"', !D.diagnoseAccess({ ids: [], calendarApi: fakeApi({}) }).syncComplete);
  check('configuration problems fail the report even if calendars are readable',
    !D.diagnoseAccess({ ids: ['a@gmail.com', 'a@gmail.com'], calendarApi: fakeApi({ 'a@gmail.com': { events: [] } }) }).success);

  // --- classification rules are unchanged ---
  check('NHS 6-2 still classifies as 6am-2pm basic', classify('NHS Coleraine 6-2').shiftType === 'NHS 6am-2pm Basic');
  check('NHS 2pm still classifies as the 2pm-10pm split', classify('Coleraine NHS 2pm').shiftType === 'NHS 2pm-10pm Split');
  check('NHS with no time in the title uses the event\'s own 06:00-14:00', classify('NHS Coleraine').shiftType === 'NHS 6am-2pm Basic');
  check('an all-day NHS event with no time is still NOT classified (nothing to read the shift from)',
    PayTrackerCalendarService.classifyEvent(allDay('NHS Coleraine'), new Date(2026, 9, 26), []) === null);
  check('a hospital that is not NHS/HSC/Antrim/Causeway is still NOT classified', classify('Coleraine Hospital 6-2') === null);

  // --- unrecognised shift detection ---
  check('all-day NHS with no time: missing-time concern', allDayConcern('NHS Coleraine').code === 'NHS_MISSING_TIME');
  check('all-day NHS replacement event with no time: missing-time concern', allDayConcern('NHS Coleraine (replacement)').code === 'NHS_MISSING_TIME');
  check('a timed NHS event is never a concern: it is classified from its times', concernFor('NHS Coleraine') === null);
  check('NHS with an unsupported time: unsupported-time concern', concernFor('NHS Coleraine 7-3').code === 'NHS_UNSUPPORTED_TIME');
  check('NHS with a 12-hour clock outside 6-2/2-10: unsupported-time concern', concernFor('NHS Coleraine 9am').code === 'NHS_UNSUPPORTED_TIME');
  check('an unrecognised hospital: hospital concern', concernFor('Coleraine Hospital 6-2').code === 'UNRECOGNISED_HOSPITAL');
  check('a clinic: hospital concern', concernFor('Causeway clinic cover').code === 'UNRECOGNISED_HOSPITAL');
  check('NHS plus another role and no usable time: ambiguous', concernFor('NHS Coleraine security').code === 'AMBIGUOUS_ROLE');
  check('a work-looking title nothing recognises: work-related concern', concernFor('Agency shift').code === 'WORK_RELATED_UNCLASSIFIED');
  check('a personal appointment is not reported', concernFor('Dentist 2pm') === null);
  check('an empty title is not reported', concernFor('   ') === null);
  check('annual leave is not reported (handled by its own path)', concernFor('AL - NHS') === null);
  check('every concern carries a message and a suggestion, and never a shift type',
    ['NHS Coleraine 7-3', 'Coleraine Hospital 6-2', 'NHS Coleraine security', 'Agency shift'].every(function(title) {
      const c = concernFor(title);
      return c.message && c.suggestion && c.shiftType === undefined && c.tableName === undefined && c.hours === undefined;
    }));
  check('the suggestion for a missing time shows the owner how to fix the title',
    allDayConcern('NHS Coleraine').suggestion.indexOf('6-2') !== -1);

  // --- read-only review report ---
  const report = D.reviewUnrecognisedEvents({ events: [
    event('NHS Coleraine 6-2', monday, mondayEnd),
    event('NHS Coleraine', new Date(2026, 9, 27, 7, 0, 0), new Date(2026, 9, 27, 15, 0, 0)),
    event('Coleraine Hospital 6-2', new Date(2026, 9, 28, 6, 0, 0), new Date(2026, 9, 28, 14, 0, 0)),
    event('Dentist 2pm', new Date(2026, 9, 29, 14, 0, 0), new Date(2026, 9, 29, 15, 0, 0))
  ] });
  check('the review report lists only unrecognised work-looking events, newest first',
    report.needsReview === 2 && report.eventsChecked === 4 && report.events[0].date === '2026-10-28' && report.events[1].date === '2026-10-27');
  check('the review report is marked read-only', report.readOnly === true);

  return { success: true, passed: results.length, results: results };
}
