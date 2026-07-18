/*******************************************************
 * PAY TRACKER V2.1
 * CalendarService.gs
 *
 * Handles:
 * - Google Calendar access
 * - Work-event classification
 * - NHS shift matching
 * - Relief Assistant Warden matching
 * - Night Security Warden matching
 * - Logging Cash matching
 * - Duplicate-event protection
 * - Manual-entry protection
 * - Calendar import
 * - Calendar debugging
 *
 * This file depends on:
 * - Config.gs
 * - Utilities.gs
 * - PayCalculator.gs
 * - WeekManager.gs
 * - SummaryService.gs
 *******************************************************/

const PayTrackerCalendarService = Object.freeze({
  /**
   * Synchronises configured Google Calendars with PaySheet.
   *
   * Existing manually entered shifts are protected unless
   * OVERWRITE_EXISTING_SHIFTS is enabled in Config.gs.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet=} optionalSheet
   * @return {Object} Synchronisation results.
   */
  sync: function (
    optionalSheet
  ) {
    const sheet =
      optionalSheet ||
      PayTrackerUtils.getPaySheet();

    PayTrackerUtils.validateSheet(
      sheet
    );

    const startDate =
      PayTrackerUtils.getFirstWeekStartDate();

    const endDate =
      new Date(startDate);

    endDate.setMonth(
      endDate.getMonth() +
      PayTrackerConfig.CALENDAR
        .SYNC_MONTHS_AHEAD
    );

    const events =
      PayTrackerCalendarService
        .getAllEvents(
          startDate,
          endDate
        );

    const result = {
      imported: 0,
      skipped: 0,
      ignored: 0,
      duplicates: 0,
      totalEvents: events.length
    };

    const processedEventKeys =
      new Set();

    events
      .sort(
        function (
          firstEvent,
          secondEvent
        ) {
          return (
            firstEvent
              .getStartTime()
              .getTime() -
            secondEvent
              .getStartTime()
              .getTime()
          );
        }
      )
      .forEach(
        function (event) {
          const eventKey =
            PayTrackerCalendarService
              .createEventKey(
                event
              );

          if (
            processedEventKeys.has(
              eventKey
            )
          ) {
            result.duplicates++;
            return;
          }

          processedEventKeys.add(
            eventKey
          );

          const eventDate =
            PayTrackerUtils.stripTime(
              event.getStartTime()
            );

          const shiftMatch =
            PayTrackerCalendarService
              .classifyEvent(
                event,
                eventDate
              );

          if (!shiftMatch) {
            result.ignored++;
            return;
          }

          const imported =
            PayTrackerCalendarService
              .addShiftToSheet(
                sheet,
                eventDate,
                shiftMatch.tableName,
                shiftMatch.shiftType,
                shiftMatch.hours
              );

          if (imported) {
            result.imported++;
          } else {
            result.skipped++;
          }
        }
      );

    PayTrackerSummaryService
      .buildRunningTotals(
        sheet
      );

    PayTrackerWeekManager
      .showRelevantWeeksOnly(
        sheet
      );

    SpreadsheetApp.flush();

    return result;
  },


  /**
   * Reads all configured calendars within a date range.
   *
   * Calendars that cannot be accessed are logged and skipped.
   *
   * @param {Date} startDate
   * @param {Date} endDate
   * @return {GoogleAppsScript.Calendar.CalendarEvent[]}
   */
  getAllEvents: function (
    startDate,
    endDate
  ) {
    PayTrackerUtils.validateDate(
      startDate,
      'startDate'
    );

    PayTrackerUtils.validateDate(
      endDate,
      'endDate'
    );

    let events = [];

    PayTrackerConfig.CALENDAR.IDS
      .forEach(
        function (calendarId) {
          try {
            const calendar =
              CalendarApp.getCalendarById(
                calendarId
              );

            if (!calendar) {
              console.warn(
                'Calendar was not found or cannot be accessed: ' +
                calendarId
              );

              return;
            }

            const calendarEvents =
              calendar.getEvents(
                startDate,
                endDate
              );

            events =
              events.concat(
                calendarEvents
              );
          } catch (error) {
            PayTrackerUtils.logError(
              'Unable to read calendar ' +
              calendarId,
              error
            );
          }
        }
      );

    return events;
  },


  /**
   * Classifies one calendar event.
   *
   * Classification order is deliberate:
   * 1. Night Security
   * 2. NHS
   * 3. Relief Assistant Warden
   * 4. Logging Cash
   *
   * Night Security is checked before Relief because both may
   * contain the word "warden".
   *
   * @param {GoogleAppsScript.Calendar.CalendarEvent} event
   * @param {Date} eventDate
   * @return {Object|null}
   */
  classifyEvent: function (
    event,
    eventDate
  ) {
    if (
      !event ||
      typeof event.getTitle !== 'function'
    ) {
      return null;
    }

    PayTrackerUtils.validateDate(
      eventDate,
      'eventDate'
    );

    const cleanTitle =
      PayTrackerCalendarService
        .normaliseTitle(
          event.getTitle()
        );

    if (cleanTitle === '') {
      return null;
    }

    const dayNumber =
      eventDate.getDay();

    const isSaturday =
      dayNumber === 6;

    const isSunday =
      dayNumber === 0;

    const isWeekend =
      isSaturday || isSunday;

    const durationHours =
      PayTrackerCalendarService
        .getEventDurationHours(
          event
        );

    const timePatterns =
      PayTrackerCalendarService
        .detectTimePatterns(
          cleanTitle
        );

    const nightSecurityMatch =
      PayTrackerCalendarService
        .classifyNightSecurityEvent(
          cleanTitle,
          isWeekend,
          durationHours
        );

    if (nightSecurityMatch) {
      return nightSecurityMatch;
    }

    const nhsMatch =
      PayTrackerCalendarService
        .classifyNhsEvent(
          cleanTitle,
          isSaturday,
          isSunday,
          timePatterns
        );

    if (nhsMatch) {
      return nhsMatch;
    }

    const reliefMatch =
      PayTrackerCalendarService
        .classifyReliefEvent(
          cleanTitle,
          isWeekend,
          durationHours,
          timePatterns
        );

    if (reliefMatch) {
      return reliefMatch;
    }

    const loggingMatch =
      PayTrackerCalendarService
        .classifyLoggingEvent(
          cleanTitle,
          durationHours
        );

    if (loggingMatch) {
      return loggingMatch;
    }

    return null;
  },


  /**
   * Classifies Night Security events.
   *
   * Monday-Friday uses Enhanced 1.33.
   * Saturday-Sunday uses Enhanced 1.50.
   *
   * @param {string} cleanTitle
   * @param {boolean} isWeekend
   * @param {number|null} durationHours
   * @return {Object|null}
   */
  classifyNightSecurityEvent: function (
    cleanTitle,
    isWeekend,
    durationHours
  ) {
    const isNightSecurityEvent =
      cleanTitle.includes(
        'night security'
      ) ||
      cleanTitle.includes(
        'security warden'
      ) ||
      cleanTitle.includes(
        'nightshift security'
      ) ||
      (
        cleanTitle.includes(
          'security'
        ) &&
        !cleanTitle.includes(
          'nhs'
        )
      );

    if (!isNightSecurityEvent) {
      return null;
    }

    return {
      tableName:
        'Night Security Warden',

      shiftType:
        isWeekend
          ? 'Enhanced 1.50'
          : 'Enhanced 1.33',

      hours:
        durationHours ||
        4
    };
  },


  /**
   * Classifies NHS events.
   *
   * @param {string} cleanTitle
   * @param {boolean} isSaturday
   * @param {boolean} isSunday
   * @param {Object} timePatterns
   * @return {Object|null}
   */
  classifyNhsEvent: function (
    cleanTitle,
    isSaturday,
    isSunday,
    timePatterns
  ) {
    const isNhsEvent =
      cleanTitle.includes('nhs') ||
      cleanTitle.includes('hsc') ||
      cleanTitle.includes(
        'antrim hospital'
      );

    if (!isNhsEvent) {
      return null;
    }

    if (
      timePatterns.hasSixToTwo
    ) {
      if (isSunday) {
        return {
          tableName: 'NHS',
          shiftType: 'NHS Sunday',
          hours: ''
        };
      }

      if (isSaturday) {
        return {
          tableName: 'NHS',
          shiftType: 'NHS Saturday',
          hours: ''
        };
      }

      return {
        tableName: 'NHS',
        shiftType:
          'NHS 6am-2pm Basic',
        hours: ''
      };
    }

    if (
      timePatterns.hasTwoToTen
    ) {
      if (isSunday) {
        return {
          tableName: 'NHS',
          shiftType: 'NHS Sunday',
          hours: ''
        };
      }

      if (isSaturday) {
        return {
          tableName: 'NHS',
          shiftType: 'NHS Saturday',
          hours: ''
        };
      }

      return {
        tableName: 'NHS',
        shiftType:
          'NHS 2pm-10pm Split',
        hours: ''
      };
    }

    return null;
  },


  /**
   * Classifies Relief Assistant Warden events.
   *
   * Day shift:
   * - Weekday: Basic
   * - Weekend: Enhanced 1.50
   *
   * Evening shift:
   * - Weekday: Enhanced 1.33
   * - Weekend: Enhanced 1.50
   *
   * @param {string} cleanTitle
   * @param {boolean} isWeekend
   * @param {number|null} durationHours
   * @param {Object} timePatterns
   * @return {Object|null}
   */
  classifyReliefEvent: function (
    cleanTitle,
    isWeekend,
    durationHours,
    timePatterns
  ) {
    const isReliefEvent =
      cleanTitle.includes(
        'caravan'
      ) ||
      cleanTitle.includes(
        'relief assistant'
      ) ||
      cleanTitle.includes(
        'relief warden'
      ) ||
      cleanTitle.includes(
        'assistant warden'
      ) ||
      cleanTitle.includes(
        'caravan site'
      ) ||
      cleanTitle.includes(
        'site warden'
      );

    if (!isReliefEvent) {
      return null;
    }

    if (
      timePatterns.hasNineToEight
    ) {
      return {
        tableName:
          'Relief Assistant Warden',

        shiftType:
          isWeekend
            ? 'Enhanced 1.50'
            : 'Basic',

        hours:
          durationHours ||
          10
      };
    }

    if (
      timePatterns.hasEightToTwelve
    ) {
      return {
        tableName:
          'Relief Assistant Warden',

        shiftType:
          isWeekend
            ? 'Enhanced 1.50'
            : 'Enhanced 1.33',

        hours:
          durationHours ||
          4
      };
    }

    return null;
  },


  /**
   * Classifies Logging Cash events.
   *
   * @param {string} cleanTitle
   * @param {number|null} durationHours
   * @return {Object|null}
   */
  classifyLoggingEvent: function (
    cleanTitle,
    durationHours
  ) {
    const isLoggingEvent =
      cleanTitle.includes(
        'logging'
      ) ||
      cleanTitle.includes(
        'logs'
      ) ||
      cleanTitle.includes(
        'firewood'
      );

    if (!isLoggingEvent) {
      return null;
    }

    return {
      tableName: 'Logging Cash',
      shiftType:
        'Logging Cash £10/hr',
      hours:
        durationHours ||
        8
    };
  },


  /**
   * Adds one classified calendar shift to PaySheet.
   *
   * The Monday-Sunday row matching the event date is used.
   * The Extra row is deliberately excluded from calendar
   * imports.
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Date} eventDate
   * @param {string} tableName
   * @param {string} shiftType
   * @param {*} hours
   * @return {boolean}
   */
  addShiftToSheet: function (
    sheet,
    eventDate,
    tableName,
    shiftType,
    hours
  ) {
    PayTrackerUtils.validateSheet(
      sheet
    );

    PayTrackerUtils.validateDate(
      eventDate,
      'eventDate'
    );

    const table =
      getConfiguredPayTableByName_(
        tableName
      );

    if (!table) {
      return false;
    }

    if (
      !PayTrackerPayCalculator
        .isConfiguredShift(
          table.name,
          shiftType
        )
    ) {
      return false;
    }

    const weekNumber =
      PayTrackerUtils
        .getWeekNumberFromDate(
          eventDate
        );

    if (weekNumber < 1) {
      return false;
    }

    PayTrackerSummaryService
      .ensureCompleteWeekExists(
        sheet,
        weekNumber
      );

    const weekStartRow =
      PayTrackerUtils.getWeekStartRow(
        weekNumber
      );

    const dateColumn =
      table.startColumn;

    const dayColumn =
      table.startColumn + 1;

    const shiftColumn =
      table.startColumn + 2;

    const hoursColumn =
      table.startColumn + 3;

    const payColumn =
      table.startColumn + 4;

    const firstDataRow =
      weekStartRow +
      PayTrackerConfig.SHEET
        .WEEK_DATA_ROW_OFFSET;

    const calendarDateOnly =
      PayTrackerUtils.stripTime(
        eventDate
      );

    const dateValues = sheet
      .getRange(
        firstDataRow,
        dateColumn,
        7,
        1
      )
      .getValues();

    const shiftValues = sheet
      .getRange(
        firstDataRow,
        shiftColumn,
        7,
        1
      )
      .getDisplayValues();

    let targetRow = null;

    for (
      let rowOffset = 0;
      rowOffset < 7;
      rowOffset++
    ) {
      const sheetDate =
        dateValues[rowOffset][0];

      const existingShift =
        String(
          shiftValues[rowOffset][0] ||
          ''
        ).trim();

      if (
        !(sheetDate instanceof Date)
      ) {
        continue;
      }

      const sheetDateOnly =
        PayTrackerUtils.stripTime(
          sheetDate
        );

      if (
        sheetDateOnly.getTime() !==
        calendarDateOnly.getTime()
      ) {
        continue;
      }

      const mayWriteShift =
        existingShift === '' ||
        PayTrackerConfig.CALENDAR
          .OVERWRITE_EXISTING_SHIFTS;

      if (mayWriteShift) {
        targetRow =
          firstDataRow +
          rowOffset;

        break;
      }
    }

    if (!targetRow) {
      return false;
    }

    const normalisedHours =
      PayTrackerUtils.normaliseHours(
        hours
      );

    const pay =
      PayTrackerPayCalculator
        .calculatePay(
          table.name,
          shiftType,
          normalisedHours
        );

    sheet
      .getRange(
        targetRow,
        dateColumn,
        1,
        5
      )
      .setValues([[
        calendarDateOnly,
        PayTrackerUtils.getDayName(
          calendarDateOnly
        ),
        shiftType,
        normalisedHours,
        pay
      ]]);

    sheet
      .getRange(
        targetRow,
        dateColumn
      )
      .setNumberFormat(
        PayTrackerConfig.FORMATS.DATE
      );

    sheet
      .getRange(
        targetRow,
        hoursColumn
      )
      .setNumberFormat(
        PayTrackerConfig.FORMATS.HOURS
      );

    sheet
      .getRange(
        targetRow,
        payColumn
      )
      .setNumberFormat(
        PayTrackerConfig.FORMATS.CURRENCY
      );

    return true;
  },


  /**
   * Detects supported shift-time patterns in an event title.
   *
   * @param {string} cleanTitle
   * @return {Object}
   */
  detectTimePatterns: function (
    cleanTitle
  ) {
    return {
      hasSixToTwo:
        PayTrackerCalendarService
          .matchesAnyPattern(
            cleanTitle,
            [
              /\b6\s*(?:am)?\s*(?:-|to)\s*2\s*(?:pm)?\b/,
              /\b6am\b/,
              /\b6\s*-\s*2\b/
            ]
          ),

      hasTwoToTen:
        PayTrackerCalendarService
          .matchesAnyPattern(
            cleanTitle,
            [
              /\b2\s*(?:pm)?\s*(?:-|to)\s*10\s*(?:pm)?\b/,
              /\b2pm\b/,
              /\b2\s*-\s*10\b/
            ]
          ),

      hasEightToTwelve:
        PayTrackerCalendarService
          .matchesAnyPattern(
            cleanTitle,
            [
              /\b8\s*(?:pm)?\s*(?:-|to)\s*12\s*(?:am|midnight)?\b/,
              /\b8pm\b/,
              /\b8\s*-\s*12\b/
            ]
          ),

      hasNineToEight:
        PayTrackerCalendarService
          .matchesAnyPattern(
            cleanTitle,
            [
              /\b9\s*(?:am)?\s*(?:-|to)\s*8\s*(?:pm)?\b/,
              /\b9am\b/,
              /\b9\s*-\s*8\b/
            ]
          )
    };
  },


  /**
   * Returns true when text matches one of the supplied
   * regular expressions.
   *
   * @param {string} text
   * @param {RegExp[]} patterns
   * @return {boolean}
   */
  matchesAnyPattern: function (
    text,
    patterns
  ) {
    if (!Array.isArray(patterns)) {
      return false;
    }

    return patterns.some(
      function (pattern) {
        return pattern.test(text);
      }
    );
  },


  /**
   * Normalises a calendar title for matching.
   *
   * @param {*} title
   * @return {string}
   */
  normaliseTitle: function (
    title
  ) {
    return String(title || '')
      .toLowerCase()
      .replace(/[–—]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  },


  /**
   * Returns the event duration in decimal hours.
   *
   * Returns null when the duration cannot be determined.
   *
   * @param {GoogleAppsScript.Calendar.CalendarEvent} event
   * @return {number|null}
   */
  getEventDurationHours: function (
    event
  ) {
    if (
      !event ||
      typeof event.getStartTime !==
        'function' ||
      typeof event.getEndTime !==
        'function'
    ) {
      return null;
    }

    const startTime =
      event.getStartTime();

    const endTime =
      event.getEndTime();

    if (
      !(startTime instanceof Date) ||
      !(endTime instanceof Date)
    ) {
      return null;
    }

    const durationMilliseconds =
      endTime.getTime() -
      startTime.getTime();

    if (
      durationMilliseconds <= 0
    ) {
      return null;
    }

    const durationHours =
      durationMilliseconds /
      (
        60 *
        60 *
        1000
      );

    return PayTrackerUtils
      .roundToTwoDecimals(
        durationHours
      );
  },


  /**
   * Creates a key used to remove duplicate calendar events.
   *
   * @param {GoogleAppsScript.Calendar.CalendarEvent} event
   * @return {string}
   */
  createEventKey: function (
    event
  ) {
    let eventId = '';

    try {
      if (
        typeof event.getId ===
        'function'
      ) {
        eventId =
          event.getId() || '';
      }
    } catch (error) {
      eventId = '';
    }

    const title =
      PayTrackerCalendarService
        .normaliseTitle(
          event.getTitle()
        );

    const startTime =
      event.getStartTime();

    const endTime =
      event.getEndTime();

    /*
     * The title, start time and end time are included even
     * when an event ID exists because copied events may use
     * different IDs across calendars.
     */
    return [
      title,
      startTime.getTime(),
      endTime.getTime(),
      eventId
    ].join('|');
  },


  /**
   * Produces debug records for recent and upcoming events.
   *
   * @return {Object[]}
   */
  debugEvents: function () {
    const today =
      PayTrackerUtils.stripTime(
        new Date()
      );

    const startDate =
      PayTrackerUtils.addDays(
        today,
        -PayTrackerConfig.CALENDAR
          .DEBUG_DAYS_BEHIND
      );

    const endDate =
      PayTrackerUtils.addDays(
        today,
        PayTrackerConfig.CALENDAR
          .DEBUG_DAYS_AHEAD
      );

    const events =
      PayTrackerCalendarService
        .getAllEvents(
          startDate,
          endDate
        );

    const debugRecords = [];

    events
      .sort(
        function (
          firstEvent,
          secondEvent
        ) {
          return (
            firstEvent
              .getStartTime()
              .getTime() -
            secondEvent
              .getStartTime()
              .getTime()
          );
        }
      )
      .forEach(
        function (event) {
          const eventDate =
            PayTrackerUtils.stripTime(
              event.getStartTime()
            );

          const classification =
            PayTrackerCalendarService
              .classifyEvent(
                event,
                eventDate
              );

          const record = {
            start:
              event.getStartTime(),

            end:
              event.getEndTime(),

            title:
              event.getTitle(),

            classification:
              classification ||
              'IGNORED'
          };

          debugRecords.push(
            record
          );

          Logger.log(
            event.getStartTime() +
            ' | ' +
            event.getTitle() +
            ' | ' +
            (
              classification
                ? JSON.stringify(
                    classification
                  )
                : 'IGNORED'
            )
          );
        }
      );

    return debugRecords;
  }
});


/**
 * Temporary modular wrapper for calendar synchronisation.
 *
 * The final menu function will be connected through Main.gs.
 */
function payTrackerSyncCalendar_() {
  PayTrackerUtils.withDocumentLock(
    function () {
      const result =
        PayTrackerCalendarService
          .sync();

      PayTrackerUtils.showMessage(
        'Calendar Sync Complete',
        'Imported: ' +
        result.imported +
        '\nSkipped existing/manual rows: ' +
        result.skipped +
        '\nIgnored non-work events: ' +
        result.ignored +
        '\nDuplicate events ignored: ' +
        result.duplicates
      );
    }
  );
}


/**
 * Temporary modular wrapper for calendar debugging.
 */
function payTrackerDebugCalendar_() {
  const records =
    PayTrackerCalendarService
      .debugEvents();

  PayTrackerUtils.showMessage(
    'Calendar Debug Complete',
    records.length +
    ' events were written to the Apps Script execution log.'
  );
}