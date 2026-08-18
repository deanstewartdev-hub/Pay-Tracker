/*******************************************************
 * PAY TRACKER V3.0 - automatic Calendar reconciliation.
 *******************************************************/

const PayTrackerCalendarAutomationService = Object.freeze({
  HANDLER: 'runAutomaticPayTrackerCalendarSync',
  INTERVAL_HOURS: 6,

  getStatus: function() {
    const triggers = ScriptApp.getProjectTriggers().filter(function(trigger) {
      return trigger.getHandlerFunction() === PayTrackerCalendarAutomationService.HANDLER;
    });
    return {
      enabled: triggers.length > 0,
      triggerCount: triggers.length,
      intervalHours: PayTrackerCalendarAutomationService.INTERVAL_HOURS
    };
  },

  enable: function() {
    const status = this.getStatus();
    if (!status.enabled) {
      ScriptApp.newTrigger(this.HANDLER)
        .timeBased()
        .everyHours(this.INTERVAL_HOURS)
        .create();
    }
    return this.getStatus();
  },

  disable: function() {
    ScriptApp.getProjectTriggers().forEach(function(trigger) {
      if (trigger.getHandlerFunction() === PayTrackerCalendarAutomationService.HANDLER) {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    return this.getStatus();
  }
});

function runAutomaticPayTrackerCalendarSync() {
  return PayTrackerUtils.withDocumentLock(function() {
    return PayTrackerCalendarService.sync();
  });
}

function enableAutomaticPayTrackerCalendarSync() {
  return PayTrackerCalendarAutomationService.enable();
}

function disableAutomaticPayTrackerCalendarSync() {
  return PayTrackerCalendarAutomationService.disable();
}
