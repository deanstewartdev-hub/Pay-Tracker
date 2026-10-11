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
    PayTrackerCalendarService.getShiftDurationHours(nhsLeave) === null);

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

  // Real bug: the live calendar's night shifts are ALL-DAY events titled
  // "NIGHT 8pm- 12pm" (confirmed across every such event in the sync
  // window). Google Calendar reports an all-day event's duration as
  // midnight-to-midnight, i.e. 24 hours, and the ordinary-shift
  // classifiers trusted it (`durationHours || 4` only falls back to 4
  // when the duration is missing, not when it's wrong) -- so every night
  // shift was written to PaySheet as 24 hours instead of 4. Annual-leave
  // events already guarded against this; ordinary shifts did not.
  const allDayNightWeekday = event('NIGHT 8pm- 12pm', new Date(2026, 6, 8, 0, 0, 0), new Date(2026, 6, 9, 0, 0, 0), '', true);
  const allDayNightSaturday = event('NIGHT 8pm- 12pm', new Date(2026, 4, 9, 0, 0, 0), new Date(2026, 4, 10, 0, 0, 0), '', true);
  const weekdayMatch = PayTrackerCalendarService.classifyEvent(allDayNightWeekday, new Date(2026, 6, 8));
  const saturdayMatch = PayTrackerCalendarService.classifyEvent(allDayNightSaturday, new Date(2026, 4, 9));

  check('raw all-day duration really is 24h (the premise of the bug)',
    PayTrackerCalendarService.getRawEventDurationHours_(allDayNightWeekday) === 24);
  check('an all-day NIGHT 8pm- 12pm weekday shift is 4 hours, not 24',
    weekdayMatch.jobId === 'JOB-NIGHT-SECURITY' && weekdayMatch.hours === 4 &&
    weekdayMatch.shiftType === 'Enhanced 1.33');
  check('an all-day NIGHT 8pm- 12pm Saturday shift is 4 hours at the weekend rate, not 24',
    saturdayMatch.hours === 4 && saturdayMatch.shiftType === 'Enhanced 1.50');
  check('all-day events have no trustworthy shift duration',
    PayTrackerCalendarService.getShiftDurationHours(allDayNightWeekday) === null);
  check('a timed event still uses its real duration (the fix only distrusts all-day events)',
    PayTrackerCalendarService.getShiftDurationHours(
      event('Night Security 8pm-12am', new Date(2026, 6, 8, 20, 0, 0), new Date(2026, 6, 8, 23, 0, 0), '', false)
    ) === 3);
  check('an all-day Caravan site shift falls back to its standard 10 hours, not 24',
    PayTrackerCalendarService.classifyEvent(
      event('Caravan site 9am - 8pm', new Date(2026, 7, 13, 0, 0, 0), new Date(2026, 7, 14, 0, 0, 0), '', true),
      new Date(2026, 7, 13)
    ).hours === 10);
  check('an all-day Logging Cash event falls back to its standard 8 hours, not 24',
    PayTrackerCalendarService.classifyEvent(
      event('Logging cash job', new Date(2026, 7, 15, 0, 0, 0), new Date(2026, 7, 16, 0, 0, 0), '', true),
      new Date(2026, 7, 15)
    ).hours === 8);

  // Hardening from the PR #42 review. A timed shift must still use its
  // REAL duration end to end through classifyEvent (the 8pm-12am fixture
  // above is exactly the 4h default, so it can't tell "duration used"
  // from "default used"), but a duration over MAX_PLAUSIBLE_SHIFT_HOURS
  // is a calendar artefact, not a shift.
  const timedNight = function(startHour, endHour, endDayOffset) {
    return event('Night Security 8pm-12am', new Date(2026, 6, 8, startHour, 0, 0), new Date(2026, 6, 8 + (endDayOffset || 0), endHour, 0, 0), '', false);
  };
  check('a timed night shift of 6h (20:00-02:00) is recorded as 6 hours, not the 4h default',
    PayTrackerCalendarService.classifyEvent(timedNight(20, 2, 1), new Date(2026, 6, 8)).hours === 6);
  check('a timed night shift of 12h (20:00-08:00) is still a plausible length and is trusted',
    PayTrackerCalendarService.classifyEvent(timedNight(20, 8, 1), new Date(2026, 6, 8)).hours === 12);
  check('a timed event over the 16h limit (17h) is treated as an artefact and falls back to 4h',
    PayTrackerCalendarService.classifyEvent(timedNight(20, 13, 1), new Date(2026, 6, 8)).hours === 4);
  check('a timed event left running for 24h falls back to 4h, not 24',
    PayTrackerCalendarService.classifyEvent(timedNight(20, 20, 1), new Date(2026, 6, 8)).hours === 4);
  check('an event whose all-day flag cannot be read is not trusted and falls back to 4h',
    PayTrackerCalendarService.classifyEvent((function() {
      const broken = timedNight(20, 2, 1);
      broken.isAllDayEvent = function() { throw new Error('flag unavailable'); };
      return broken;
    })(), new Date(2026, 6, 8)).hours === 4);

  // Leave shares the same duration rule (getLeaveDurationHours was folded
  // into getShiftDurationHours): a real timed leave slot keeps its length,
  // an implausible one falls back to the role default.
  const timedLeave = function(startHour, endHour, endDayOffset) {
    return event('Annual Leave', new Date(2026, 7, 24, startHour, 0, 0), new Date(2026, 7, 24 + (endDayOffset || 0), endHour, 0, 0), 'Relief Warden', false);
  };
  check('timed Annual Leave of 6h keeps its real length',
    PayTrackerCalendarService.classifyAnnualLeaveEvent(timedLeave(9, 15), new Date(2026, 7, 24), []).hours === 6);
  check('timed Annual Leave over 16h falls back to the Relief default of 10h',
    PayTrackerCalendarService.classifyAnnualLeaveEvent(timedLeave(9, 9, 1), new Date(2026, 7, 24), []).hours === 10);

  // The same leave rules, but through classifyEvent -- the real entry
  // point sync() and the Pay workspace call -- so the order of its
  // leave branch relative to the duration step is covered too.
  check('through classifyEvent: all-day Relief leave is flagged as leave and gets the 10h default, not 24h',
    (function() {
      const match = PayTrackerCalendarService.classifyEvent(
        event('Annual Leave', new Date(2026, 7, 24, 0, 0, 0), new Date(2026, 7, 25, 0, 0, 0), 'Relief Warden', true),
        new Date(2026, 7, 24)
      );
      return match.isAnnualLeave === true && match.jobId === 'JOB-RELIEF-WARDEN' && match.hours === 10;
    })());
  check('through classifyEvent: timed Relief leave of 6h keeps its real length',
    PayTrackerCalendarService.classifyEvent(timedLeave(9, 15), new Date(2026, 7, 24)).hours === 6);

  return { success: true, passed: results.length, results: results };
}
