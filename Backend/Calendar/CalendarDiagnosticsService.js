/*******************************************************
 * PAY TRACKER V3.2 - Calendar diagnostics.
 *
 * Read-only helpers that explain WHY the Calendar sync did or did
 * not do something:
 *
 * 1. diagnoseAccess(): can each configured calendar actually be read?
 *    CalendarApp.getCalendarById returns null for a calendar the
 *    script's account is not subscribed to. One unreadable ID marks
 *    every sync incomplete, which skips removed-event cleanup (see
 *    PayTrackerCalendarService.sync), so this is the first thing to
 *    check when deleted or moved events linger in PaySheet.
 *
 * 2. assessUnclassifiedEvent(): an event that looks like work but the
 *    classifier did not recognise. Classification is deliberately
 *    unchanged and strict (a wrong shift type means wrong pay); this
 *    only makes the miss visible instead of silently counting it as
 *    "ignored". It NEVER guesses a shift type and NEVER writes to
 *    PaySheet.
 *
 * Nothing here changes a calendar event, a PaySheet cell or a Calendar
 * Sync Record. The only write anywhere in this file is the optional
 * Action Centre review item raised by recordUncertainEvents().
 *******************************************************/

const PayTrackerCalendarDiagnosticsService = Object.freeze({
  ACTION_TYPE: 'Calendar Event Needs Review',

  // Review items raised per sync. Open items are de-duplicated by event key
  // (PayTrackerActionCentreRepository.create), so repeat syncs never pile up.
  MAX_REVIEW_ITEMS_PER_SYNC: 25,
  MAX_REPORTED_EVENTS: 25,

  REASONS: Object.freeze({
    NHS_MISSING_TIME: 'NHS_MISSING_TIME',
    NHS_UNSUPPORTED_TIME: 'NHS_UNSUPPORTED_TIME',
    AMBIGUOUS_ROLE: 'AMBIGUOUS_ROLE',
    UNRECOGNISED_HOSPITAL: 'UNRECOGNISED_HOSPITAL',
    WORK_RELATED_UNCLASSIFIED: 'WORK_RELATED_UNCLASSIFIED'
  }),

  /**
   * Pure check of a configured calendar ID list.
   *
   * @param {*} ids
   * @return {{ids: string[], problems: Object[]}}
   */
  checkConfiguration: function(ids) {
    const problems = [];
    const list = Array.isArray(ids) ? ids : [];

    if (!Array.isArray(ids) || list.length === 0) {
      problems.push({
        code: 'NO_CALENDARS_CONFIGURED',
        message: 'PayTrackerConfig.CALENDAR.IDS is empty, so no shifts can be imported.'
      });
    }

    const seen = {};
    const clean = [];
    list.forEach(function(raw, index) {
      const id = typeof raw === 'string' ? raw : '';
      if (!id.trim()) {
        problems.push({
          code: 'EMPTY_CALENDAR_ID',
          calendarId: String(raw),
          message: 'Calendar ID number ' + (index + 1) + ' is blank or not text.'
        });
        return;
      }
      if (id !== id.trim() || /\s/.test(id)) {
        problems.push({
          code: 'MALFORMED_CALENDAR_ID',
          calendarId: id,
          message: 'Calendar ID "' + id + '" contains spaces. Calendar IDs never do; remove them.'
        });
      } else if (id.indexOf('@') === -1) {
        problems.push({
          code: 'MALFORMED_CALENDAR_ID',
          calendarId: id,
          message: 'Calendar ID "' + id + '" has no @. Use the calendar\'s email-style ID ' +
            '(an address, or xxxx@group.calendar.google.com).'
        });
      }
      const key = id.trim().toLowerCase();
      if (seen[key]) {
        problems.push({
          code: 'DUPLICATE_CALENDAR_ID',
          calendarId: id,
          message: 'Calendar ID "' + id + '" is listed more than once.'
        });
        return;
      }
      seen[key] = true;
      clean.push(id);
    });

    return { ids: clean, problems: problems };
  },

  /**
   * Checks that every configured calendar can be read, using only
   * getCalendarById and getEvents (both read-only).
   *
   * @param {Object=} options {ids, calendarApi, startDate, endDate, runningAs}
   * @return {Object} report
   */
  diagnoseAccess: function(options) {
    const opts = options || {};
    const ids = opts.ids !== undefined ? opts.ids : PayTrackerConfig.CALENDAR.IDS;
    const calendarApi = opts.calendarApi || CalendarApp;
    const config = PayTrackerCalendarDiagnosticsService.checkConfiguration(ids);

    const calendars = config.ids.map(function(id) {
      return PayTrackerCalendarDiagnosticsService.checkOneCalendar_(
        id, calendarApi, opts.startDate, opts.endDate, opts.runningAs
      );
    });

    const unreadable = calendars.filter(function(item) { return !item.accessible; });
    const syncComplete = config.ids.length > 0 && unreadable.length === 0;
    const configProblems = config.problems;

    const nextSteps = [];
    if (unreadable.length) {
      nextSteps.push('Fix or remove the unreadable calendar(s) listed above. Until then every sync is ' +
        'incomplete and removed-event cleanup is skipped, so deleted or moved events stay in PaySheet.');
    }
    if (configProblems.length) {
      nextSteps.push('Correct the configuration problem(s) in PayTrackerConfig.CALENDAR.IDS.');
    }

    return {
      success: syncComplete && configProblems.length === 0,
      readOnly: true,
      generatedAt: new Date().toISOString(),
      runningAs: opts.runningAs || '',
      configuredCount: Array.isArray(ids) ? ids.length : 0,
      accessibleCount: calendars.length - unreadable.length,
      syncComplete: syncComplete,
      removalCleanupWouldRun: syncComplete,
      configProblems: configProblems,
      calendars: calendars,
      summary: PayTrackerCalendarDiagnosticsService.describeAccess_(calendars, configProblems, syncComplete),
      nextSteps: nextSteps
    };
  },

  checkOneCalendar_: function(id, calendarApi, startDate, endDate, runningAs) {
    const result = { calendarId: id, accessible: false, status: '', eventCount: null, message: '' };
    let calendar = null;
    try {
      calendar = calendarApi.getCalendarById(id);
    } catch (error) {
      result.status = 'LOOKUP_ERROR';
      result.message = 'Looking up the calendar failed: ' + String(error && error.message || error) +
        '. Check the ID is spelled exactly as it appears in Google Calendar settings.';
      return result;
    }
    if (!calendar) {
      result.status = 'NOT_FOUND_OR_NO_ACCESS';
      result.message = 'Not visible to ' + (runningAs || 'the account running the script') +
        '. Google returns nothing for a calendar that account is not subscribed to or that has not ' +
        'been shared with it. Subscribe/share it, or remove this ID from the configuration.';
      return result;
    }
    if (startDate && endDate) {
      try {
        result.eventCount = calendar.getEvents(startDate, endDate).length;
      } catch (error) {
        result.status = 'READ_ERROR';
        result.message = 'The calendar was found but its events could not be read: ' +
          String(error && error.message || error) + '. A sync would be incomplete.';
        return result;
      }
    }
    result.accessible = true;
    result.status = 'ACCESSIBLE';
    result.message = result.eventCount === null
      ? 'Accessible.'
      : 'Accessible; ' + result.eventCount + ' event(s) in the sync window.';
    return result;
  },

  describeAccess_: function(calendars, configProblems, syncComplete) {
    if (!calendars.length) return 'No usable calendar IDs are configured.';
    const bad = calendars.filter(function(item) { return !item.accessible; });
    if (!bad.length && !configProblems.length) {
      return 'All ' + calendars.length + ' configured calendar(s) are readable. Syncs are complete ' +
        'and removed-event cleanup runs.';
    }
    if (bad.length) {
      return bad.length + ' of ' + calendars.length + ' configured calendar(s) cannot be read. ' +
        'Every sync is incomplete and removed-event cleanup is skipped.';
    }
    return 'Calendars are readable, but the configuration has ' + configProblems.length + ' problem(s).';
  },

  /**
   * Explains why a title the classifier rejected might still be a shift.
   * Returns null when there is nothing worth the owner's attention.
   * Never guesses a shift type.
   *
   * @param {{getTitle: Function, getDescription: (Function|undefined)}} event
   * @return {{code: string, message: string, suggestion: string}|null}
   */
  assessUnclassifiedEvent: function(event) {
    if (!event || typeof event.getTitle !== 'function') return null;
    const service = PayTrackerCalendarService;
    const title = service.normaliseTitle(event.getTitle());
    if (!title) return null;
    if (service.isAnnualLeaveTitle(title)) return null;

    const time = service.detectTimePatterns(title);
    const reasons = PayTrackerCalendarDiagnosticsService.REASONS;
    // Same test classifyNhsEvent uses, so "looks like NHS" means exactly "the NHS classifier looked at it".
    const mentionsNhs = service.isNhsTitle(title);
    const otherRole = /\b(?:security|warden|relief|logging|cash)\b|\bnight\b/.test(title);
    const anyTimeRange = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:-|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/.test(title) ||
      /\b\d{1,2}\s*(?:am|pm)\b/.test(title);
    const supportedNhsTime = Boolean(service.findNhsShiftWindow(title, time, event));

    if (mentionsNhs && otherRole) {
      return {
        code: reasons.AMBIGUOUS_ROLE,
        message: 'The title mentions NHS and another role, so the role cannot be chosen safely.',
        suggestion: 'Rename the event to one role with its time (for example "NHS Coleraine 6-2"), ' +
          'or add the shift to PaySheet by hand.'
      };
    }
    if (mentionsNhs && !supportedNhsTime) {
      if (anyTimeRange || time.hasEightToTwelve || time.hasNineToEight) {
        return {
          code: reasons.NHS_UNSUPPORTED_TIME,
          message: 'It looks like an NHS shift, but its time is not one Pay Tracker pays NHS shifts for ' +
            '(06:00-14:00, 08:00-16:00, 10:00-18:00 and 14:00-22:00 are recognised).',
          suggestion: 'If this is a 6-2, 8-4, 10-6 or 2-10 shift, put that in the title or the event times. Otherwise add the shift to ' +
            'PaySheet by hand.'
        };
      }
      return {
        code: reasons.NHS_MISSING_TIME,
        message: 'It looks like an NHS shift but the title has no time. NHS pay depends on the shift ' +
          'type, which Pay Tracker reads from the time in the title or, for a timed event, its start and end.',
        suggestion: 'Add the time to the title (for example "' + String(event.getTitle()).trim().slice(0, 60) +
          ' 6-2" or "... 2-10"), or add the shift to PaySheet by hand.'
      };
    }
    if (!mentionsNhs && /\b(?:hospital|ward|clinic|healthcare)\b|\bhealth centre\b/.test(title)) {
      return {
        code: reasons.UNRECOGNISED_HOSPITAL,
        message: 'The title mentions a hospital or clinic that is not NHS, HSC or Antrim Hospital, so ' +
          'it is not treated as an NHS shift.',
        suggestion: 'If this is an NHS shift, include "NHS" and a 6-2 or 2-10 time in the title. ' +
          'Otherwise no action is needed.'
      };
    }
    if (!mentionsNhs && /\b(?:shift|overtime|on[- ]?call|staffline|agency|rota|security|warden)\b/.test(title)) {
      return {
        code: reasons.WORK_RELATED_UNCLASSIFIED,
        message: 'The title looks work-related but matches none of the supported shift patterns.',
        suggestion: 'Check the title and time. Add the shift to PaySheet by hand if it should be paid.'
      };
    }
    return null;
  },

  /**
   * Raises one Action Centre review item per uncertain event (de-duplicated by event
   * key while the item is open) and summarises them on the sync result. Never touches
   * PaySheet and never throws: diagnostics must not be able to break a sync.
   *
   * @param {Object[]} items {event, eventKey, eventDate, concern}
   * @param {Object} result the sync result object (mutated)
   */
  recordUncertainEvents: function(items, result) {
    const list = Array.isArray(items) ? items : [];
    result.uncertain = list.length;
    result.uncertainEvents = [];
    if (!list.length) return;

    // Most recent first, so a long history cannot hide this week's problem.
    const ordered = list.slice().sort(function(a, b) {
      return b.eventDate.getTime() - a.eventDate.getTime();
    });

    ordered.slice(0, PayTrackerCalendarDiagnosticsService.MAX_REPORTED_EVENTS).forEach(function(item) {
      result.uncertainEvents.push({
        title: String(item.event.getTitle() || '').slice(0, 120),
        date: PayTrackerCalendarDiagnosticsService.isoDate_(item.eventDate),
        code: item.concern.code
      });
    });

    try {
      ordered.slice(0, PayTrackerCalendarDiagnosticsService.MAX_REVIEW_ITEMS_PER_SYNC).forEach(function(item) {
        PayTrackerActionCentreRepository.create({
          actionType: PayTrackerCalendarDiagnosticsService.ACTION_TYPE,
          title: 'Check an unrecognised Calendar event',
          description: 'Calendar event "' + String(item.event.getTitle() || '').slice(0, 120) + '" on ' +
            PayTrackerCalendarDiagnosticsService.isoDate_(item.eventDate) + ' was NOT added to PaySheet. ' +
            item.concern.message,
          priority: 'Normal',
          sourceType: 'Google Calendar',
          sourceId: item.eventKey,
          confidence: 'Low',
          suggestedResolution: item.concern.suggestion
        });
      });
    } catch (error) {
      result.uncertainError = String(error && error.message || error);
    }
  },

  /**
   * Read-only report of every event in a window that the classifier ignored but that
   * may still be a shift. Injectable for tests.
   *
   * @param {Object} options {events, eventDateOf}
   * @return {Object}
   */
  reviewUnrecognisedEvents: function(options) {
    const opts = options || {};
    const events = Array.isArray(opts.events) ? opts.events : [];
    const found = [];
    events.forEach(function(event) {
      const eventDate = PayTrackerUtils.stripTime(event.getStartTime());
      if (PayTrackerCalendarService.classifyEvent(event, eventDate, events)) return;
      const concern = PayTrackerCalendarDiagnosticsService.assessUnclassifiedEvent(event);
      if (!concern) return;
      found.push({
        title: String(event.getTitle() || ''),
        date: PayTrackerCalendarDiagnosticsService.isoDate_(eventDate),
        code: concern.code,
        message: concern.message,
        suggestion: concern.suggestion
      });
    });
    found.sort(function(a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
    return {
      success: true,
      readOnly: true,
      generatedAt: new Date().toISOString(),
      eventsChecked: events.length,
      needsReview: found.length,
      events: found
    };
  },

  isoDate_: function(date) {
    return [
      date.getFullYear(),
      ('0' + (date.getMonth() + 1)).slice(-2),
      ('0' + date.getDate()).slice(-2)
    ].join('-');
  }
});

/**
 * Run from the Apps Script editor. Read-only: reports whether every configured
 * calendar can be read, and what a sync would therefore do. Changes nothing.
 */
function diagnoseCalendarAccess() {
  const startDate = PayTrackerUtils.getFirstWeekStartDate();
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + PayTrackerConfig.CALENDAR.SYNC_MONTHS_AHEAD);
  let runningAs = '';
  try { runningAs = Session.getEffectiveUser().getEmail(); } catch (ignored) {}

  const report = PayTrackerCalendarDiagnosticsService.diagnoseAccess({
    startDate: startDate, endDate: endDate, runningAs: runningAs
  });

  Logger.log('Calendar access (read-only) - running as ' + (runningAs || 'unknown'));
  Logger.log(report.summary);
  report.configProblems.forEach(function(problem) { Logger.log('CONFIG: ' + problem.message); });
  report.calendars.forEach(function(item) {
    Logger.log((item.accessible ? 'OK    ' : 'FAIL  ') + item.calendarId + ' - ' + item.message);
  });
  report.nextSteps.forEach(function(step) { Logger.log('NEXT: ' + step); });
  return report;
}

/**
 * Run from the Apps Script editor. Read-only: lists calendar events that look like
 * shifts but were not recognised, with the reason and what to change. Changes nothing
 * and raises no Action Centre items.
 */
function reviewUnrecognisedCalendarEvents() {
  const startDate = PayTrackerUtils.getFirstWeekStartDate();
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + PayTrackerConfig.CALENDAR.SYNC_MONTHS_AHEAD);
  const events = PayTrackerCalendarService.getAllEvents(startDate, endDate);
  const report = PayTrackerCalendarDiagnosticsService.reviewUnrecognisedEvents({ events: events });
  report.calendarReadComplete = events.syncComplete !== false;
  Logger.log(report.needsReview + ' of ' + report.eventsChecked + ' event(s) look like shifts but were not recognised.');
  report.events.slice(0, 50).forEach(function(item) {
    Logger.log(item.date + '  "' + item.title + '"  [' + item.code + '] ' + item.message);
  });
  return report;
}

/**
 * Run from the Apps Script editor BEFORE the first sync on v3.3. Read-only.
 *
 * From v3.3, a Calendar-owned PaySheet row whose values no longer match what
 * the sync last wrote is treated as a manual correction: the next sync keeps
 * it, marks its Calendar Sync Record "Manual Override" (Calendar stops
 * managing that row) and raises one Action Centre item. This lists exactly
 * which rows that first sync would treat that way, so they can be checked
 * first (e.g. rows changed during the old 24-hour night-shift problem).
 * Reads only; changes nothing.
 */
function previewCalendarManualOverrides(paySheet) {
  const sheet = paySheet || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PayTrackerConfig.SHEET.NAME);
  const report = { checked: 0, wouldBePreserved: [], detached: 0 };
  if (!sheet) return report;
  PayTrackerCalendarSyncRepository.getActive().forEach(function(record) {
    const table = getConfiguredPayTableByName_(record.tableName);
    const row = Number(record.sheetRow);
    if (!table || !Number.isInteger(row) || row < 1) { report.detached++; return; }
    report.checked++;
    const current = sheet.getRange(row, table.startColumn + 2, 1, 3).getValues()[0];
    if (!PayTrackerCalendarService.rowMatchesRecord(current, record)) {
      report.wouldBePreserved.push({
        table: record.tableName,
        date: PayTrackerPaymentTimeline.dayKey(record.sheetDate),
        eventTitle: record.eventTitle,
        calendarWrote: [record.shiftType, record.hours, record.pay],
        rowNow: current
      });
    }
  });
  Logger.log(report.wouldBePreserved.length + ' of ' + report.checked +
    ' Calendar-owned row(s) differ from what the sync last wrote and would be kept as manual corrections.');
  report.wouldBePreserved.slice(0, 100).forEach(function(item) {
    Logger.log(item.date + '  ' + item.table + '  "' + item.eventTitle + '"  calendar wrote ' +
      JSON.stringify(item.calendarWrote) + ', row now ' + JSON.stringify(item.rowNow));
  });
  return report;
}
