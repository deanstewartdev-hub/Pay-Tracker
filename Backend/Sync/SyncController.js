/*******************************************************
 * PAY TRACKER V3.2
 * Sync run entry point + concurrency safety.
 *
 * Deliberately does NOT hold PayTrackerUtils.withDocumentLock for
 * the whole sync run: a multi-source sync can run for tens of
 * seconds, and every other document-locked action in this app
 * (confirming a bank match, saving an Action Centre decision,
 * the existing Calendar sync trigger, etc.) would queue up behind
 * it for that whole time. Instead, a short-lived, Properties-
 * backed "active run" marker gives exactly the two guarantees the
 * v3.2 spec asks for -- one run at a time, and a duplicate
 * request detects rather than duplicates it -- without blocking
 * unrelated writes while a sync is in progress. Each underlying
 * task's own sync function still uses its own existing
 * withDocumentLock as it always has (e.g. PayTrackerCalendarService.sync).
 *******************************************************/

const PayTrackerSyncController = Object.freeze({
  /**
   * Attempts to start a sync run. If one is already active (and
   * not stale), returns {alreadyRunning:true, activeRun} instead
   * of starting a second one -- this is what makes "scheduled
   * sync running + user opens app" and "Refresh Everything
   * pressed twice" both collapse into one run.
   *
   * @param {Object} options {triggerSource, force, taskIds,
   *   budgetMilliseconds}
   */
  runSync: function(options) {
    const opts = options || {};
    const claim = PayTrackerSyncController.claimRunSlot_();
    if (!claim.claimed) {
      return { alreadyRunning: true, activeRun: claim.activeRun };
    }

    try {
      const result = PayTrackerSyncService.run(
        Object.assign({}, opts, { now: new Date() })
      );
      return Object.assign({ alreadyRunning: false }, result);
    } finally {
      PayTrackerSyncController.releaseRunSlot_(claim.runId);
    }
  },

  /**
   * Read-only check of whether a run is currently active, for the
   * frontend to poll during a long-running sync ("offer: Continue
   * with current data") without itself trying to start one.
   */
  getActiveRun: function() {
    const raw = PropertiesService.getScriptProperties()
      .getProperty(PayTrackerSyncConfig.RUN_LOCK_PROPERTY_KEY);
    if (!raw) return null;
    const parsed = PayTrackerSyncController.parseRunMarker_(raw);
    if (!parsed) return null;
    if (PayTrackerSyncController.isStale_(parsed)) return null;
    return parsed;
  },

  /**
   * Compact status the startup screen / global status pill reads:
   * per-task freshness plus a one-line overall verdict, without
   * running anything.
   */
  getSyncStatusSummary: function() {
    const now = new Date();
    const tasks = PayTrackerSyncConfig.TASKS.filter(function(task) { return task.enabled; })
      .map(function(task) {
        const record = PayTrackerSyncStateRepository.getByTaskId(task.id);
        const freshness = PayTrackerSyncService.computeFreshness(task.id, now);
        return {
          taskId: task.id,
          taskName: task.name,
          status: record ? record.status : PayTrackerSyncConfig.TASK_STATUSES.WAITING,
          lastSuccess: freshness.lastSuccess ? freshness.lastSuccess.toISOString() : null,
          ageMinutes: freshness.ageMinutes,
          fresh: freshness.fresh,
          message: record ? record.message : '',
          lastError: record ? record.lastError : ''
        };
      });

    const needsAttention = tasks.filter(function(task) {
      return task.status === PayTrackerSyncConfig.TASK_STATUSES.FAILED ||
        task.status === PayTrackerSyncConfig.TASK_STATUSES.NEEDS_ATTENTION;
    });

    return {
      generatedAt: now.toISOString(),
      tasks: tasks,
      allCurrent: needsAttention.length === 0,
      needsAttentionCount: needsAttention.length,
      activeRun: PayTrackerSyncController.getActiveRun()
    };
  },

  claimRunSlot_: function() {
    return PayTrackerUtils.withDocumentLock(function() {
      const properties = PropertiesService.getScriptProperties();
      const raw = properties.getProperty(PayTrackerSyncConfig.RUN_LOCK_PROPERTY_KEY);
      const existing = raw ? PayTrackerSyncController.parseRunMarker_(raw) : null;

      if (existing && !PayTrackerSyncController.isStale_(existing)) {
        return { claimed: false, activeRun: existing };
      }

      const runId = 'SYNCRUN-' + Utilities.getUuid().toUpperCase();
      properties.setProperty(
        PayTrackerSyncConfig.RUN_LOCK_PROPERTY_KEY,
        JSON.stringify({ runId: runId, startedAt: new Date().toISOString() })
      );
      return { claimed: true, runId: runId };
    });
  },

  releaseRunSlot_: function(runId) {
    PayTrackerUtils.withDocumentLock(function() {
      const properties = PropertiesService.getScriptProperties();
      const raw = properties.getProperty(PayTrackerSyncConfig.RUN_LOCK_PROPERTY_KEY);
      const existing = raw ? PayTrackerSyncController.parseRunMarker_(raw) : null;
      // Only clear the marker if it's still ours -- a stale-lock
      // recovery may have already let a newer run claim the slot,
      // and this run finishing late must not clobber that one.
      if (existing && existing.runId === runId) {
        properties.deleteProperty(PayTrackerSyncConfig.RUN_LOCK_PROPERTY_KEY);
      }
    });
  },

  isStale_: function(marker) {
    const startedAt = new Date(marker.startedAt);
    if (Number.isNaN(startedAt.getTime())) return true;
    return (Date.now() - startedAt.getTime()) > PayTrackerSyncConfig.RUN_LOCK_STALE_AFTER_MILLISECONDS;
  },

  parseRunMarker_: function(raw) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && parsed.runId && parsed.startedAt ? parsed : null;
    } catch (error) {
      return null;
    }
  }
});
