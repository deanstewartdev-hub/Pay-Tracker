/*******************************************************
 * PAY TRACKER V3.0 - safe Calendar reconciliation tests.
 *******************************************************/

function runCalendarReconciliationTests() {
  const results = [];
  function check(name, condition) {
    if (!condition) throw new Error('Failed: ' + name);
    results.push({ name: name, passed: true });
  }
  function event(title, start, end, description, allDay) {
    return {
      getTitle: function() { return title; },
      getDescription: function() { return description || ''; },
      getLocation: function() { return ''; },
      getStartTime: function() { return start; },
      getEndTime: function() { return end; },
      isAllDayEvent: function() { return allDay === true; }
    };
  }

  const day = new Date(2026, 7, 24, 9, 0, 0);
  const end = new Date(2026, 7, 24, 17, 0, 0);
  const nhsLeave = event('AL - NHS', day, end, '', true);
  const reliefLeave = event('Annual Leave', day, end, 'Relief Warden', true);
  const ambiguousLeave = event('Annual Leave', day, end, '', true);
  const securityShift = event('Night Security 8pm-12am', day, end, '', false);
  const shortSecurityShift = event('NIGHT 8pm-12pm', day, end, '', false);
  const slashLeave = event('A/L', day, end, '', true);

  check('recognises AL abbreviation', PayTrackerCalendarService.isAnnualLeaveTitle('al - nhs'));
  check('recognises A/L abbreviation', PayTrackerCalendarService.isAnnualLeaveTitle('a/l'));
  check('does not treat public holiday as booked leave', !PayTrackerCalendarService.isAnnualLeaveTitle('nhs public holiday'));
  check('NHS leave uses basic pay',
    PayTrackerCalendarService.classifyAnnualLeaveEvent(nhsLeave, day, []).shiftType === 'Basic');
  check('role can come from event description',
    PayTrackerCalendarService.classifyAnnualLeaveEvent(reliefLeave, day, []).jobId === 'JOB-RELIEF-WARDEN');
  check('role can come from same-day shift evidence',
    PayTrackerCalendarService.classifyAnnualLeaveEvent(ambiguousLeave, day, [ambiguousLeave, securityShift]).jobId === 'JOB-NIGHT-SECURITY');
  check('short NIGHT title supplies A/L role evidence',
    PayTrackerCalendarService.classifyAnnualLeaveEvent(slashLeave, day, [slashLeave, shortSecurityShift]).jobId === 'JOB-NIGHT-SECURITY');
  check('ambiguous leave is sent for review',
    PayTrackerCalendarService.classifyAnnualLeaveEvent(ambiguousLeave, day, []).needsReview === true);
  check('all-day leave does not become 24 paid hours',
    PayTrackerCalendarService.getLeaveDurationHours(nhsLeave) === null);

  // Real bug found in the v3.1.0 release closeout's Calendar<->Staffline
  // Job ID audit: classifyNhsEvent/classifyNightSecurityEvent/
  // classifyReliefEvent/classifyLoggingEvent (the classifiers for
  // ordinary work shifts, as opposed to booked leave) computed a
  // tableName for PaySheet routing but never set a jobId -- so
  // Backend/Calendar/CalendarService.js line ~175's
  // `jobId: shiftMatch.jobId || ''` always fell back to an empty
  // string for every real, non-leave shift. This silently broke the
  // Staffline reconciliation's Calendar-side job matching for every
  // real timesheet with real calendar shifts in its window (100% of
  // shifts checked across 5 real fixtures had a blank Job ID),
  // confirmed live against the real Calendar Sync Records sheet. Uses
  // the exact real event title patterns found in that audit.
  const realNhsEarly = event('NHS ANTRIM 6 - 2', new Date(2026, 7, 10, 6, 0, 0), new Date(2026, 7, 10, 14, 0, 0));
  const realNhsLate = event('NHS ANTRIM 2- 10', new Date(2026, 7, 14, 14, 0, 0), new Date(2026, 7, 14, 22, 0, 0));
  const realCaravanShift = event('Caravan site 9am - 8pm', new Date(2026, 7, 13, 9, 0, 0), new Date(2026, 7, 13, 20, 0, 0));
  const realNightSecurityShift = event('Night Security 8pm-12am', new Date(2026, 7, 11, 20, 0, 0), new Date(2026, 7, 12, 0, 0, 0));
  const realLoggingShift = event('Logging cash job', new Date(2026, 7, 15, 9, 0, 0), new Date(2026, 7, 15, 17, 0, 0));

  check('a real "NHS ANTRIM 6 - 2" morning shift resolves a real Job ID, not blank',
    PayTrackerCalendarService.classifyEvent(realNhsEarly, new Date(2026, 7, 10)).jobId === 'JOB-NHS');
  check('a real "NHS ANTRIM 2- 10" evening shift resolves a real Job ID, not blank',
    PayTrackerCalendarService.classifyEvent(realNhsLate, new Date(2026, 7, 14)).jobId === 'JOB-NHS');
  check('NHS Saturday/Sunday variants also resolve a real Job ID',
    PayTrackerCalendarService.classifyEvent(
      event('NHS ANTRIM 6 - 2', new Date(2026, 7, 15, 6, 0, 0), new Date(2026, 7, 15, 14, 0, 0)),
      new Date(2026, 7, 15) // a real Saturday
    ).jobId === 'JOB-NHS');
  check('a real "Caravan site" Relief Assistant Warden shift resolves a real Job ID, not blank',
    PayTrackerCalendarService.classifyEvent(realCaravanShift, new Date(2026, 7, 13)).jobId === 'JOB-RELIEF-WARDEN');
  check('a real Night Security shift resolves a real Job ID, not blank',
    PayTrackerCalendarService.classifyEvent(realNightSecurityShift, new Date(2026, 7, 11)).jobId === 'JOB-NIGHT-SECURITY');
  check('a Logging Cash shift resolves a real Job ID, not blank',
    PayTrackerCalendarService.classifyEvent(realLoggingShift, new Date(2026, 7, 15)).jobId === 'JOB-LOGGING-CASH');

  return { success: true, passed: results.length, results: results };
}
