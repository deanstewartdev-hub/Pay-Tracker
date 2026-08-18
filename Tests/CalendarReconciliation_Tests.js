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

  check('recognises AL abbreviation', PayTrackerCalendarService.isAnnualLeaveTitle('al - nhs'));
  check('does not treat public holiday as booked leave', !PayTrackerCalendarService.isAnnualLeaveTitle('nhs public holiday'));
  check('NHS leave uses basic pay',
    PayTrackerCalendarService.classifyAnnualLeaveEvent(nhsLeave, day, []).shiftType === 'Basic');
  check('role can come from event description',
    PayTrackerCalendarService.classifyAnnualLeaveEvent(reliefLeave, day, []).jobId === 'JOB-RELIEF-WARDEN');
  check('role can come from same-day shift evidence',
    PayTrackerCalendarService.classifyAnnualLeaveEvent(ambiguousLeave, day, [ambiguousLeave, securityShift]).jobId === 'JOB-NIGHT-SECURITY');
  check('ambiguous leave is sent for review',
    PayTrackerCalendarService.classifyAnnualLeaveEvent(ambiguousLeave, day, []).needsReview === true);
  check('all-day leave does not become 24 paid hours',
    PayTrackerCalendarService.getLeaveDurationHours(nhsLeave) === null);

  return { success: true, passed: results.length, results: results };
}
