/*******************************************************
 * PAY TRACKER V3.2
 * Background schedule for the Unified Sync Engine.
 *
 * Mirrors PayTrackerCalendarAutomationService's shape exactly --
 * the only precedent for time-driven triggers in this codebase
 * (docs/v3.2-unified-sync-audit.md, finding #3): status is always
 * derived live from ScriptApp.getProjectTriggers() rather than
 * cached in PropertiesService, enable() guards against duplicate
 * triggers, disable() removes every matching trigger, and each
 * handler is a bare top-level function since Apps Script triggers
 * cannot call an object method directly.
 *
 * The Apps Script project's timezone is already Europe/London
 * (confirmed in appsscript.json by the audit), so this doesn't
 * need to change it -- but every trigger still sets
 * .inTimezone('Europe/London') explicitly, per the v3.2 spec's own
 * instruction to use a trigger-specific timezone rather than rely
 * on the project default silently matching. Apps Script's own
 * time-based triggers are approximate (the platform documents
 * they fire within roughly +/-15 minutes of the requested time,
 * not to the second) -- documented here rather than assumed away.
 *
 * 12:00 runs a deliberately lighter subset: the Gmail-based
 * sources (Staffline/Payslip/Annual Leave) all use a 6-hour
 * freshness TTL, so a 06:00 full run already covers them and they
 * are very likely still fresh by midday -- forcing a 3rd full pass
 * three times a day when no real runtime evidence justifies it
 * would be exactly the kind of waste the spec warns against.
 * Calendar, Monzo and Reconciliation keep their own shorter TTLs
 * and are still worth checking at midday.
 *******************************************************/

const PayTrackerSyncAutomationService = Object.freeze({
  TIMEZONE: 'Europe/London',

  SCHEDULES: Object.freeze([
    Object.freeze({ key: 'morning', handler: 'runScheduledPayTrackerSyncMorning', hour: 6, taskIds: null }),
    Object.freeze({ key: 'midday', handler: 'runScheduledPayTrackerSyncMidday', hour: 12, taskIds: Object.freeze(['CALENDAR', 'MONZO_TRANSACTIONS', 'MONZO_POTS', 'RECONCILIATION']) }),
    Object.freeze({ key: 'evening', handler: 'runScheduledPayTrackerSyncEvening', hour: 18, taskIds: null })
  ]),

  getStatus: function() {
    const triggers = ScriptApp.getProjectTriggers();
    const handlerNames = PayTrackerSyncAutomationService.SCHEDULES.map(function(s) { return s.handler; });

    const schedules = PayTrackerSyncAutomationService.SCHEDULES.map(function(schedule) {
      const matches = triggers.filter(function(trigger) {
        return trigger.getHandlerFunction() === schedule.handler;
      });
      return {
        key: schedule.key, handler: schedule.handler, hour: schedule.hour,
        taskIds: schedule.taskIds, enabled: matches.length > 0, triggerCount: matches.length
      };
    });

    const relevant = triggers.filter(function(trigger) {
      return handlerNames.indexOf(trigger.getHandlerFunction()) !== -1;
    });

    return {
      enabled: schedules.every(function(s) { return s.enabled; }),
      partiallyEnabled: schedules.some(function(s) { return s.enabled; }) && !schedules.every(function(s) { return s.enabled; }),
      triggerCount: relevant.length,
      timezone: PayTrackerSyncAutomationService.TIMEZONE,
      schedules: schedules
    };
  },

  enable: function() {
    const status = PayTrackerSyncAutomationService.getStatus();
    status.schedules.forEach(function(scheduleStatus) {
      if (scheduleStatus.enabled) return;
      ScriptApp.newTrigger(scheduleStatus.handler)
        .timeBased()
        .atHour(scheduleStatus.hour)
        .everyDays(1)
        .inTimezone(PayTrackerSyncAutomationService.TIMEZONE)
        .create();
    });
    return PayTrackerSyncAutomationService.getStatus();
  },

  disable: function() {
    const handlerNames = PayTrackerSyncAutomationService.SCHEDULES.map(function(s) { return s.handler; });
    ScriptApp.getProjectTriggers().forEach(function(trigger) {
      if (handlerNames.indexOf(trigger.getHandlerFunction()) !== -1) {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    return PayTrackerSyncAutomationService.getStatus();
  },

  runScheduled_: function(scheduleKey) {
    const schedule = PayTrackerSyncAutomationService.SCHEDULES.filter(function(s) { return s.key === scheduleKey; })[0];
    const options = {
      triggerSource: PayTrackerSyncConfig.TRIGGER_SOURCES.SCHEDULED,
      budgetMilliseconds: PayTrackerSyncConfig.SCHEDULED_RUN_BUDGET_MILLISECONDS
    };
    if (schedule && schedule.taskIds) options.taskIds = schedule.taskIds;
    return PayTrackerSyncController.runSync(options);
  }
});

function runScheduledPayTrackerSyncMorning() {
  return PayTrackerSyncAutomationService.runScheduled_('morning');
}

function runScheduledPayTrackerSyncMidday() {
  return PayTrackerSyncAutomationService.runScheduled_('midday');
}

function runScheduledPayTrackerSyncEvening() {
  return PayTrackerSyncAutomationService.runScheduled_('evening');
}

function setupPayTrackerSyncTriggers() {
  return PayTrackerSyncAutomationService.enable();
}

function removePayTrackerSyncTriggers() {
  return PayTrackerSyncAutomationService.disable();
}

function getPayTrackerSyncTriggerStatus() {
  return PayTrackerSyncAutomationService.getStatus();
}
