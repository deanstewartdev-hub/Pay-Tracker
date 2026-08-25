/*******************************************************
 * PAY TRACKER V2.8
 * Backend/Web/CalendarWorkspaceService.js
 *
 * Browser-safe controller for the Calendar workspace.
 *
 * Reviews Google Calendar shift imports using the existing
 * CalendarService debug preview, and can trigger the same
 * sync already available from the spreadsheet menu.
 *******************************************************/

const PayTrackerWebCalendarWorkspaceService =
  Object.freeze({
    getData: function() {
      const spreadsheet =
        SpreadsheetApp
          .getActiveSpreadsheet();

      if (!spreadsheet) {
        throw new Error(
          'No active Pay Tracker spreadsheet is available.'
        );
      }

      return {
        success: true,
        generatedAt:
          new Date().toISOString(),
        spreadsheetUrl:
          spreadsheet.getUrl(),
        calendarCount:
          PayTrackerConfig
            .CALENDAR
            .IDS
            .length,
        debugDaysBehind:
          PayTrackerConfig
            .CALENDAR
            .DEBUG_DAYS_BEHIND,
        debugDaysAhead:
          PayTrackerConfig
            .CALENDAR
            .DEBUG_DAYS_AHEAD,
        automation:
          PayTrackerCalendarAutomationService
            .getStatus(),
        events:
          PayTrackerWebCalendarWorkspaceService
            .readEvents()
      };
    },

    readEvents: function() {
      return PayTrackerCalendarService
        .debugEvents()
        .map(function(record) {
          return {
            start:
              PayTrackerWebCalendarWorkspaceService
                .serializeDate(
                  record.start
                ),
            end:
              PayTrackerWebCalendarWorkspaceService
                .serializeDate(
                  record.end
                ),
            title:
              String(
                record.title || ''
              ),
            matched:
              Boolean(
                record.classification &&
                record.classification !==
                  'IGNORED' &&
                record.classification.needsReview !== true
              ),
            needsReview:
              Boolean(
                record.classification &&
                record.classification.needsReview === true
              ),
            isAnnualLeave:
              Boolean(
                record.classification &&
                record.classification.isAnnualLeave === true
              ),
            tableName:
              record.classification &&
              record.classification !==
                'IGNORED' &&
              record.classification.needsReview !== true
                ? record.classification.tableName
                : '',
            shiftType:
              record.classification &&
              record.classification !==
                'IGNORED' &&
              record.classification.needsReview !== true
                ? record.classification.shiftType
                : '',
            hours:
              record.classification &&
              record.classification !==
                'IGNORED' &&
              record.classification.needsReview !== true
                ? record.classification.hours
                : ''
          };
        });
    },

    runSync: function() {
      const result =
        PayTrackerUtils.withDocumentLock(
          function() {
            return PayTrackerCalendarService
              .sync();
          }
        );

      const data =
        PayTrackerWebCalendarWorkspaceService
          .getData();

      data.lastSyncResult =
        result;

      return data;
    },

    serializeDate: function(value) {
      if (!value) {
        return '';
      }

      const date =
        value instanceof Date
          ? value
          : new Date(value);

      return Number.isNaN(
        date.getTime()
      )
        ? ''
        : date.toISOString();
    }
  });

function makePayTrackerCalendarResponseBrowserSafe_(data) {
  return JSON.parse(
    JSON.stringify(
      data,
      function(key, value) {
        if (value instanceof Date) {
          return value.toISOString();
        }

        return value;
      }
    )
  );
}

function getPayTrackerCalendarWorkspace() {
  return makePayTrackerCalendarResponseBrowserSafe_(
    PayTrackerWebCalendarWorkspaceService.getData()
  );
}

function runPayTrackerCalendarSync() {
  return makePayTrackerCalendarResponseBrowserSafe_(
    PayTrackerWebCalendarWorkspaceService.runSync()
  );
}

function setPayTrackerCalendarAutomation(enabled) {
  const status = enabled === true
    ? PayTrackerCalendarAutomationService.enable()
    : PayTrackerCalendarAutomationService.disable();
  return makePayTrackerCalendarResponseBrowserSafe_({
    success: true,
    automation: status
  });
}
